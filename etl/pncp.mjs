// Public contracts from PNCP (Portal Nacional de Contratações Públicas), all spheres of government.
//
//   node etl/pncp.mjs --days 5                    # the 5 most recent complete days (yesterday backwards)
//   node etl/pncp.mjs --from 2021-01-01 [--to D]  # backfill a range (newest day first, resumable)
//   node etl/pncp.mjs --incremental [--days 7]    # re-read recent updates (/v1/contratos/atualizacao)
//   node etl/pncp.mjs --stage                     # only rebuild data/staging/pncp from the local copy
//   options: --rate 3000 (ms between requests), --force (refetch days already stored), --no-stage
//
// The consulta API has no supplier filter, so Prumo keeps a local copy and joins on niFornecedor:
//   data/pncp/contratos/YYYY/MM/DD.ndjson.gz    contracts PUBLISHED that day   (/v1/contratos)
//   data/pncp/atualizacao/YYYY/MM/DD.ndjson.gz  contracts UPDATED that day     (/v1/contratos/atualizacao)
//   data/pncp/state.json                        completed days (pages, records, fetch time)
// Records are compact (only the fields public_contract needs) and only for company suppliers
// (14-digit CNPJ): individuals (CPF) are never stored, and CPFs typed into texts are masked. A day
// file is written atomically once all its pages were read, so an interrupted run resumes at the
// first missing day.
// Politeness: one request every --rate ms (default 3 s), exponential backoff on 429/5xx/network
// errors, and an honest User-Agent.
// Staging (read by etl/sql/12_contracts.sql): data/staging/pncp/{contracts,coverage}.parquet,
// filtered to Prumo's companies and deduplicated by numeroControlePNCP (latest update wins).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { DuckDBInstance } from '@duckdb/node-api';
import { DATA_DIR, DB_PATH, STAGING_DIR } from './config.mjs';
import { maskCpf, maskValidCpf } from './mask.mjs';

const API = 'https://pncp.gov.br/api/consulta/v1';
const UA = 'Prumo/0.1 (transparencia eleitoral; contato: <none>)';
const PAGE_SIZE = 500; // API maximum
const START = '2021-01-01'; // first contracts on PNCP are from late 2021
const PNCP_DIR = path.join(DATA_DIR, 'pncp');
const TREES = { contratos: path.join(PNCP_DIR, 'contratos'), atualizacao: path.join(PNCP_DIR, 'atualizacao') };
const ENDPOINT = { contratos: '/contratos', atualizacao: '/contratos/atualizacao' };
const STATE = path.join(PNCP_DIR, 'state.json');
const STAGE = path.join(STAGING_DIR, 'pncp');
const MAX_RETRIES = 8;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (s) => `'${String(s).replaceAll("'", "''")}'`;

/* ---------- Dates (YYYY-MM-DD, Brasília time) ---------- */

export const todayBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
export const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dayFile = (kind, d) => path.join(TREES[kind], d.slice(0, 4), d.slice(5, 7), `${d.slice(8, 10)}.ndjson.gz`);

function dayRange(from, to) {
  const out = [];
  for (let d = to; d >= from; d = addDays(d, -1)) out.push(d); // newest first
  return out;
}

/* ---------- State ---------- */

export function readState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    return { contratos: s.contratos ?? {}, atualizacao: s.atualizacao ?? {} };
  } catch {
    return { contratos: {}, atualizacao: {} };
  }
}

/** Records one completed day (re-reading the file, so entries written meanwhile are kept). */
function saveDay(kind, day, entry) {
  fs.mkdirSync(PNCP_DIR, { recursive: true });
  const state = readState();
  state[kind][day] = entry;
  const tmp = `${STATE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 1));
  fs.renameSync(tmp, STATE);
}

/** One fetcher at a time (politeness: two processes would double the request rate). */
function acquireLock() {
  const lock = path.join(PNCP_DIR, '.lock');
  fs.mkdirSync(PNCP_DIR, { recursive: true });
  for (let i = 0; i < 2; i++) {
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
      const onSignal = () => process.exit(130); // 'exit' handler below removes the lock
      const release = () => {
        process.off('exit', release);
        process.off('SIGINT', onSignal);
        process.off('SIGTERM', onSignal);
        try {
          if (fs.readFileSync(lock, 'utf8') === String(process.pid)) fs.rmSync(lock);
        } catch {}
      };
      process.on('exit', release);
      process.on('SIGINT', onSignal);
      process.on('SIGTERM', onSignal);
      return release;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const pid = Number(fs.readFileSync(lock, 'utf8'));
      try {
        process.kill(pid, 0);
        throw new Error(`pncp: another fetch is running (pid ${pid}); try again when it finishes`);
      } catch (err) {
        if (err.code !== 'ESRCH') throw err;
        fs.rmSync(lock, { force: true }); // stale lock from a process that died
      }
    }
  }
  throw new Error('pncp: could not acquire data/pncp/.lock');
}

/* ---------- HTTP ---------- */

class Throttle {
  constructor(ms) {
    this.ms = ms;
    this.next = 0;
  }
  async wait() {
    const now = Date.now();
    const at = Math.max(now, this.next);
    this.next = at + this.ms;
    if (at > now) await sleep(at - now);
  }
}

const stats = { requests: 0, retries: 0, waitedMs: 0 };

/** GET JSON with throttling and exponential backoff. Returns null for 204 (no records). */
async function getJson(url, throttle) {
  for (let attempt = 0; ; attempt++) {
    await throttle.wait();
    stats.requests++;
    let res;
    let err;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(180_000) });
      if (res.status === 204) return null;
      if (res.ok) return await res.json(); // a truncated body throws and is retried
    } catch (e) {
      err = e;
    }
    const status = res?.status;
    if (!err && status !== 429 && status < 500) {
      throw new Error(`GET ${url} -> ${status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    }
    await res?.body?.cancel().catch(() => {});
    if (attempt >= MAX_RETRIES) throw new Error(`GET ${url} failed after ${attempt + 1} attempts: ${err?.message ?? status}`);
    const retryAfter = Number(res?.headers.get('retry-after')) * 1000 || 0;
    const wait = Math.max(retryAfter, Math.min(throttle.ms * 2 ** (attempt + 1), 600_000)) + Math.round(Math.random() * 1000);
    console.warn(`  ${err ? err.cause?.code ?? err.message : `HTTP ${status}`} — retrying in ${(wait / 1000).toFixed(0)}s (${attempt + 1}/${MAX_RETRIES})`);
    stats.retries++;
    stats.waitedMs += wait;
    await sleep(wait);
    throttle.next = Math.max(throttle.next, Date.now());
  }
}

/* ---------- Records ---------- */

/**
 * Compact record: only the fields public_contract needs; null for non-company suppliers. CPF-shaped
 * numbers in the supplier name and object are masked, and valid CPFs in the process/contract numbers.
 */
export function compact(c, retrievedAt) {
  const ni = String(c.niFornecedor ?? '').replace(/\D/g, '');
  if (ni.length !== 14 || (c.tipoPessoa && c.tipoPessoa !== 'PJ')) return null;
  const o = c.orgaoEntidade ?? {};
  const u = c.unidadeOrgao ?? {};
  return {
    numeroControlePNCP: c.numeroControlePNCP,
    numeroControlePncpCompra: c.numeroControlePncpCompra ?? null,
    niFornecedor: ni,
    nomeRazaoSocialFornecedor: maskCpf(c.nomeRazaoSocialFornecedor ?? null),
    orgaoCnpj: o.cnpj ?? null,
    orgaoRazaoSocial: o.razaoSocial ?? null,
    esferaId: o.esferaId ?? null,
    poderId: o.poderId ?? null,
    nomeUnidade: u.nomeUnidade ?? null,
    ufSigla: u.ufSigla ?? null,
    municipioNome: u.municipioNome ?? null,
    codigoIbge: u.codigoIbge ?? null,
    numeroContratoEmpenho: maskValidCpf(c.numeroContratoEmpenho ?? null),
    anoContrato: c.anoContrato ?? null,
    sequencialContrato: c.sequencialContrato ?? null,
    processo: maskValidCpf(c.processo ?? null),
    objetoContrato: maskCpf(c.objetoContrato ?? null),
    tipoContrato: c.tipoContrato?.nome ?? null,
    categoriaProcesso: c.categoriaProcesso?.nome ?? null,
    valorInicial: c.valorInicial ?? null,
    valorGlobal: c.valorGlobal ?? null,
    dataAssinatura: c.dataAssinatura ?? null,
    dataVigenciaInicio: c.dataVigenciaInicio ?? null,
    dataVigenciaFim: c.dataVigenciaFim ?? null,
    dataPublicacaoPncp: c.dataPublicacaoPncp ?? null,
    dataAtualizacao: c.dataAtualizacao ?? null,
    dataAtualizacaoGlobal: c.dataAtualizacaoGlobal ?? null,
    retrievedAt,
  };
}

/** Reads every page of one day and writes its file atomically. */
async function fetchDay(kind, day, throttle) {
  const t0 = Date.now();
  const ymd = day.replaceAll('-', '');
  const retrievedAt = new Date().toISOString();
  const byId = new Map();
  let page = 1;
  let pages = 0;
  let total = 0;
  let seen = 0;
  do {
    const body = await getJson(`${API}${ENDPOINT[kind]}?dataInicial=${ymd}&dataFinal=${ymd}&pagina=${page}&tamanhoPagina=${PAGE_SIZE}`, throttle);
    if (!body) break; // 204: nothing on this day
    pages = body.totalPaginas ?? 0;
    total = body.totalRegistros ?? 0;
    for (const c of body.data ?? []) {
      seen++;
      const r = compact(c, retrievedAt);
      if (r?.numeroControlePNCP) byId.set(r.numeroControlePNCP, r);
    }
    page++;
  } while (page <= pages);

  const file = dayFile(kind, day);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = [...byId.values()].map((r) => JSON.stringify(r)).join('\n');
  fs.writeFileSync(`${file}.part`, zlib.gzipSync(text ? `${text}\n` : '', { level: 9 }));
  fs.renameSync(`${file}.part`, file);
  if (seen !== total) console.warn(`  ${kind} ${day}: API announced ${total} records, read ${seen} (records moved while paging?)`);
  return { total, seen, kept: byId.size, pages, fetchedAt: retrievedAt, ms: Date.now() - t0 };
}

/* ---------- Fetch ---------- */

export async function fetchPncp({ days, from, to, incremental = false, rate = 3000, force = false } = {}) {
  const state = readState();
  const yesterday = addDays(todayBR(), -1);
  const throttle = new Throttle(rate);
  let kind = 'contratos';
  let list;

  if (incremental) {
    kind = 'atualizacao';
    const n = days ?? 7;
    let start = addDays(yesterday, -(n - 1));
    // Close a gap if the last run was longer ago than the window (capped at 60 days).
    const known = [...Object.keys(state.contratos), ...Object.keys(state.atualizacao)].sort();
    const last = known.at(-1);
    if (last && addDays(last, 1) < start) {
      const capped = addDays(yesterday, -59);
      start = addDays(last, 1) < capped ? capped : addDays(last, 1);
      if (start === capped) console.warn(`pncp: last stored day is ${last}; reading updates since ${start} only — backfill the gap with --from/--to`);
    }
    list = dayRange(start, yesterday); // always re-read: updates for these days are still arriving
    force = true;
  } else if (days) {
    list = dayRange(addDays(yesterday, -(days - 1)), yesterday);
  } else if (from) {
    const end = to && to < yesterday ? to : yesterday;
    list = dayRange(from < START ? START : from, end);
  } else {
    throw new Error('pncp: pass --days N, --from YYYY-MM-DD [--to YYYY-MM-DD] or --incremental');
  }

  const todo = list.filter((d) => force || !(state[kind][d] && fs.existsSync(dayFile(kind, d))));
  console.log(`pncp ${kind}: ${todo.length} dia(s) a buscar de ${list.length} (${list.at(-1)} … ${list[0]}), 1 requisição a cada ${(rate / 1000).toFixed(1)}s`);

  const release = acquireLock();
  const t0 = Date.now();
  let changed = false;
  let failures = 0;
  let records = 0;
  try {
    for (const [i, day] of todo.entries()) {
      try {
        const r = await fetchDay(kind, day, throttle);
        saveDay(kind, day, { total: r.total, seen: r.seen, kept: r.kept, pages: r.pages, fetchedAt: r.fetchedAt });
        changed = true;
        failures = 0;
        records += r.kept;
        const eta = ((Date.now() - t0) / (i + 1)) * (todo.length - i - 1);
        console.log(
          `  ${kind} ${day}: ${r.total} contratos, ${r.kept} com fornecedor PJ, ${r.pages} página(s), ${(r.ms / 1000).toFixed(0)}s` +
            (todo.length > 1 ? ` [${i + 1}/${todo.length}, faltam ~${(eta / 60000).toFixed(0)} min]` : ''),
        );
      } catch (e) {
        console.error(`  ${kind} ${day}: ${e.message}`);
        if (++failures >= 3) throw new Error('pncp: 3 consecutive days failed; stopping (run again to resume)');
      }
    }
  } finally {
    release();
  }
  const secs = (Date.now() - t0) / 1000;
  console.log(
    `pncp ${kind}: ${todo.length} dia(s), ${records} registros, ${stats.requests} requisições em ${secs.toFixed(0)}s` +
      (stats.requests ? ` (${(secs / stats.requests).toFixed(2)} s/req, ${stats.retries} retentativas)` : ''),
  );
  return { changed, days: todo.length, requests: stats.requests, seconds: secs };
}

/* ---------- Staging ---------- */

const COLUMNS = {
  numeroControlePNCP: 'VARCHAR',
  numeroControlePncpCompra: 'VARCHAR',
  niFornecedor: 'VARCHAR',
  nomeRazaoSocialFornecedor: 'VARCHAR',
  orgaoCnpj: 'VARCHAR',
  orgaoRazaoSocial: 'VARCHAR',
  esferaId: 'VARCHAR',
  poderId: 'VARCHAR',
  nomeUnidade: 'VARCHAR',
  ufSigla: 'VARCHAR',
  municipioNome: 'VARCHAR',
  codigoIbge: 'VARCHAR',
  numeroContratoEmpenho: 'VARCHAR',
  anoContrato: 'INTEGER',
  sequencialContrato: 'INTEGER',
  processo: 'VARCHAR',
  objetoContrato: 'VARCHAR',
  tipoContrato: 'VARCHAR',
  categoriaProcesso: 'VARCHAR',
  valorInicial: 'DOUBLE',
  valorGlobal: 'DOUBLE',
  dataAssinatura: 'VARCHAR',
  dataVigenciaInicio: 'VARCHAR',
  dataVigenciaFim: 'VARCHAR',
  dataPublicacaoPncp: 'VARCHAR',
  dataAtualizacao: 'VARCHAR',
  dataAtualizacaoGlobal: 'VARCHAR',
  retrievedAt: 'VARCHAR',
};
const COLUMNS_SQL = `{${Object.entries(COLUMNS)
  .map(([k, t]) => `${k}: '${t}'`)
  .join(', ')}}`;
const COVERAGE_SQL = `dataset VARCHAR, label VARCHAR, url VARCHAR, published VARCHAR, coverage_from DATE, coverage_to DATE, days INTEGER, retrieved_at TIMESTAMP, rows BIGINT`;

async function copyTo(con, select, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await con.run(`COPY (${select}) TO ${q(`${file}.tmp`)} (FORMAT parquet, COMPRESSION zstd)`);
  fs.renameSync(`${file}.tmp`, file);
}

/** Company scope: CNPJs in TSE records (entity 'j' keys) plus rf_company, wherever available. */
async function loadScope(con) {
  await con.run(`CREATE OR REPLACE TABLE scope (cnpj_basico VARCHAR)`);
  const sources = [];
  if (fs.existsSync(DB_PATH)) {
    await con.run(`ATTACH ${q(DB_PATH)} AS prumo (READ_ONLY)`);
    const tables = (await con.runAndReadAll(`SELECT table_name FROM duckdb_tables() WHERE database_name = 'prumo'`)).getRowObjectsJson().map((r) => r.table_name);
    if (tables.includes('entity')) {
      await con.run(`INSERT INTO scope SELECT DISTINCT substr(key, 2, 8) FROM prumo.entity WHERE key LIKE 'j%' AND length(key) = 15`);
      sources.push('entity');
    }
    if (tables.includes('rf_company')) {
      await con.run(`INSERT INTO scope SELECT cnpj_basico FROM prumo.rf_company`);
      sources.push('rf_company');
    }
    await con.run(`DETACH prumo`);
  }
  // Companies staged by etl/cnpj.mjs (rf_company's source) but not yet built into the database.
  const empresas = path.join(STAGING_DIR, 'cnpj', 'empresas.parquet');
  if (fs.existsSync(empresas)) {
    await con.run(`INSERT INTO scope SELECT cnpj_basico FROM read_parquet(${q(empresas)}) WHERE regexp_full_match(cnpj_basico, '[0-9]{8}')`);
    sources.push('staging/cnpj/empresas.parquet');
  }
  await con.run(`CREATE OR REPLACE TABLE scope AS SELECT DISTINCT cnpj_basico FROM scope WHERE cnpj_basico IS NOT NULL`);
  const n = (await con.runAndReadAll(`SELECT count(*)::INT AS n FROM scope`)).getRowObjectsJson()[0].n;
  return { n, sources };
}

export async function buildPncpStaging() {
  const t0 = Date.now();
  const state = readState();
  const inst = await DuckDBInstance.create(':memory:');
  const con = await inst.connect();
  const scope = await loadScope(con);

  const globs = Object.entries(TREES)
    .filter(([kind]) => Object.keys(state[kind]).some((d) => fs.existsSync(dayFile(kind, d))))
    .map(([, dir]) => path.join(dir, '*', '*', '*.ndjson.gz'));
  const contractsFile = path.join(STAGE, 'contracts.parquet');
  const coverageFile = path.join(STAGE, 'coverage.parquet');

  if (globs.length) {
    await con.run(`
      CREATE TABLE c AS
      SELECT * FROM read_json([${globs.map(q).join(', ')}], format = 'newline_delimited', compression = 'gzip', columns = ${COLUMNS_SQL})
      WHERE substr(niFornecedor, 1, 8) IN (SELECT cnpj_basico FROM scope)
      QUALIFY row_number() OVER (PARTITION BY numeroControlePNCP
        ORDER BY dataAtualizacaoGlobal DESC NULLS LAST, dataAtualizacao DESC NULLS LAST, retrievedAt DESC) = 1`);
  } else {
    await con.run(`CREATE TABLE c (${Object.entries(COLUMNS).map(([k, t]) => `${k} ${t}`).join(', ')})`);
  }
  await copyTo(con, `SELECT * FROM c ORDER BY niFornecedor, dataPublicacaoPncp`, contractsFile);
  const rows = (await con.runAndReadAll(`SELECT count(*)::INT AS n FROM c`)).getRowObjectsJson()[0].n;

  // Coverage: every day stored, by publication (contratos) or by update (atualizacao).
  const stored = Object.entries(state).flatMap(([kind, ds]) =>
    Object.entries(ds)
      .filter(([d]) => fs.existsSync(dayFile(kind, d)))
      .map(([d, s]) => ({ d, at: s.fetchedAt })),
  );
  const daySet = [...new Set(stored.map((s) => s.d))].sort();
  await con.run(`CREATE TABLE coverage (${COVERAGE_SQL})`);
  if (daySet.length) {
    const from = daySet[0];
    const to = daySet.at(-1);
    const span = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
    const published = `contratos publicados ou atualizados de ${from} a ${to} (${daySet.length === span ? `${span} dias` : `${daySet.length} de ${span} dias`})`;
    const retrieved = stored.map((s) => s.at).sort().at(-1);
    await con.run(
      `INSERT INTO coverage VALUES ('pncp_contratos', 'PNCP — Contratos (API de consulta)', ${q(`${API}/contratos`)}, ${q(published)}, ${q(from)}, ${q(to)}, ${daySet.length}, ${q(retrieved)}, ${rows})`,
    );
  }
  await copyTo(con, `SELECT * FROM coverage`, coverageFile);
  con.closeSync();
  inst.closeSync();
  console.log(
    `pncp staging: ${rows} contratos de ${scope.n} empresas no escopo (${scope.sources.join(' + ') || 'sem escopo'}), ${daySet.length} dia(s) — ${((Date.now() - t0) / 1000).toFixed(0)}s`,
  );
  return { rows, days: daySet.length };
}

/** Empty staging files, so the database builds even before PNCP was fetched. */
export async function ensurePncpStaging() {
  const contractsFile = path.join(STAGE, 'contracts.parquet');
  const coverageFile = path.join(STAGE, 'coverage.parquet');
  if (fs.existsSync(contractsFile) && fs.existsSync(coverageFile)) return;
  const inst = await DuckDBInstance.create(':memory:');
  const con = await inst.connect();
  if (!fs.existsSync(contractsFile)) {
    await con.run(`CREATE TABLE c (${Object.entries(COLUMNS).map(([k, t]) => `${k} ${t}`).join(', ')})`);
    await copyTo(con, 'SELECT * FROM c', contractsFile);
  }
  if (!fs.existsSync(coverageFile)) {
    await con.run(`CREATE TABLE coverage (${COVERAGE_SQL})`);
    await copyTo(con, 'SELECT * FROM coverage', coverageFile);
  }
  con.closeSync();
  inst.closeSync();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name) => {
    const i = process.argv.indexOf(`--${name}`);
    if (i >= 0) return process.argv[i + 1];
    return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  };
  const has = (name) => process.argv.includes(`--${name}`);
  const opts = {
    days: arg('days') ? Number(arg('days')) : undefined,
    from: arg('from'),
    to: arg('to'),
    incremental: has('incremental'),
    rate: arg('rate') ? Number(arg('rate')) : 3000,
    force: has('force'),
  };
  const t0 = Date.now();
  (async () => {
    if (!has('stage')) await fetchPncp(opts);
    if (!has('no-stage')) await buildPncpStaging();
  })()
    .then(() => console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
