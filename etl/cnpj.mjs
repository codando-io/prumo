// Receita Federal — Dados Abertos CNPJ (company register, establishments, partners, Simples).
//
//   node etl/cnpj.mjs                  # latest month: download changed files, filter, write staging
//   node etl/cnpj.mjs --download-only  # only fetch the zips
//   node etl/cnpj.mjs --force          # re-filter even if month, files and scope are unchanged
//
// The Receita publishes one folder per month on a public Nextcloud share (WebDAV). Its zips are
// ~7.8 GB in total; they are kept in data/raw/cnpj/<YYYY-MM>/ (manifest-based, resumable) and
// never extracted: each one is streamed through `unzip -p | iconv` into DuckDB, which keeps only
// the rows in scope (see docs/ENRICHMENT.md → Scope):
//   1. Socios: partners of every company whose CNPJ appears in the TSE records, then the other
//      companies of those same partners (extended scope, in_tse = false) and their partners;
//   2. Empresas for every company in scope;
//   3. Estabelecimentos whose CNPJ appears in the TSE records, plus every company's head office;
//   4. Simples for every company in scope.
// Phones, e-mails, street addresses and the legal representative's CPF are never loaded.
// Staging output (read by etl/sql/10_cnpj.sql): data/staging/cnpj/*.parquet.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { DuckDBInstance } from '@duckdb/node-api';
import { DB_PATH, RAW_DIR, STAGING_DIR } from './config.mjs';
import { downloadFile, readManifest } from './download.mjs';

export const CNPJ_SHARE = 'https://arquivos.receitafederal.gov.br/public.php/dav/files/YggdBLfdninEJX9/';
const RAW = path.join(RAW_DIR, 'cnpj');
const STAGE = path.join(STAGING_DIR, 'cnpj');
const MANIFEST = path.join(RAW_DIR, 'manifest.json');
// The share's firewall cuts every connection (and then refuses new ones for minutes) when one
// client opens several at once; one stream at a time runs at ~3.6 MB/s without trouble.
const PARALLEL_DOWNLOADS = Number(process.env.PRUMO_CNPJ_PARALLEL ?? 1);
const PARALLEL_STREAMS = Math.max(1, Math.min(4, Math.floor(os.cpus().length / 3)));
const WANTED = /^(Empresas\d|Estabelecimentos\d|Socios\d|Simples|Cnaes|Motivos|Municipios|Naturezas|Qualificacoes|Paises)\.zip$/;

/* ---------- Official layouts (no header in the files) ---------- */

const LAYOUT = {
  empresas: ['cnpj_basico', 'razao_social', 'natureza_juridica', 'qualificacao_responsavel', 'capital_social', 'porte', 'ente_federativo'],
  estabelecimentos: [
    'cnpj_basico', 'cnpj_ordem', 'cnpj_dv', 'matriz_filial', 'nome_fantasia', 'situacao_cadastral', 'data_situacao_cadastral',
    'motivo_situacao_cadastral', 'nome_cidade_exterior', 'pais', 'data_inicio_atividade', 'cnae_fiscal_principal',
    'cnae_fiscal_secundaria', 'tipo_logradouro', 'logradouro', 'numero', 'complemento', 'bairro', 'cep', 'uf', 'municipio',
    'ddd_1', 'telefone_1', 'ddd_2', 'telefone_2', 'ddd_fax', 'fax', 'correio_eletronico', 'situacao_especial', 'data_situacao_especial',
  ],
  socios: [
    'cnpj_basico', 'identificador_socio', 'nome_socio', 'cnpj_cpf_socio', 'qualificacao_socio', 'data_entrada_sociedade', 'pais',
    'representante_legal', 'nome_representante', 'qualificacao_representante', 'faixa_etaria',
  ],
  simples: ['cnpj_basico', 'opcao_simples', 'data_opcao_simples', 'data_exclusao_simples', 'opcao_mei', 'data_opcao_mei', 'data_exclusao_mei'],
  lookup: ['code', 'description'],
};

/* ---------- Small helpers ---------- */

const sqlStr = (s) => `'${String(s).replaceAll("'", "''")}'`;
const shq = (s) => `'${String(s).replaceAll("'", "'\\''")}'`;
const secs = (t0) => `${((Date.now() - t0) / 1000).toFixed(0)}s`;

async function pool(items, n, fn) {
  let i = 0;
  const out = [];
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k], k);
    }
  });
  await Promise.all(workers);
  return out;
}

// Other fetchers may update the shared manifest while a long download runs: merge, don't overwrite.
function saveManifest(entries) {
  const m = readManifest();
  for (const [url, e] of Object.entries(entries)) {
    if (e === null) delete m[url];
    else m[url] = e;
  }
  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.writeFileSync(`${MANIFEST}.tmp`, JSON.stringify(m, null, 2));
  fs.renameSync(`${MANIFEST}.tmp`, MANIFEST);
}

/* ---------- WebDAV listing ---------- */

async function propfind(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { method: 'PROPFIND', headers: { Depth: '1' } });
      if (res.status !== 207) throw new Error(`PROPFIND ${url} -> ${res.status}`);
      const xml = await res.text();
      return [...xml.matchAll(/<d:response>([\s\S]*?)<\/d:response>/g)].map(([, r]) => {
        const href = decodeURIComponent(r.match(/<d:href>([^<]*)<\/d:href>/)?.[1] ?? '');
        return {
          href,
          name: href.replace(/\/$/, '').split('/').pop(),
          dir: /<d:collection\s*\/>/.test(r),
          lastModified: r.match(/<d:getlastmodified>([^<]*)</)?.[1] ?? null,
          contentLength: Number(r.match(/<d:getcontentlength>([^<]*)</)?.[1] ?? 0),
        };
      });
    } catch (e) {
      if (attempt >= 6) throw e;
      await new Promise((r) => setTimeout(r, 15000 * attempt));
    }
  }
}

export async function latestCnpjRelease() {
  const months = (await propfind(CNPJ_SHARE)).filter((e) => e.dir && /^\d{4}-\d{2}$/.test(e.name)).map((e) => e.name).sort();
  if (!months.length) throw new Error('no month folders found on the Receita share');
  const month = months.at(-1);
  const files = (await propfind(`${CNPJ_SHARE}${month}/`)).filter((e) => !e.dir && WANTED.test(e.name));
  for (const req of ['Empresas0', 'Estabelecimentos0', 'Socios0', 'Simples', 'Municipios']) {
    if (!files.some((f) => f.name === `${req}.zip`)) throw new Error(`${month}: ${req}.zip missing (release incomplete?)`);
  }
  return { month, url: `${CNPJ_SHARE}${month}/`, files };
}

/* ---------- Download ---------- */

async function downloadRelease(rel) {
  const dir = path.join(RAW, rel.month);
  fs.mkdirSync(dir, { recursive: true });
  // Small files first, then the big ones; Estabelecimentos0 (~2.2 GB) starts early so it doesn't run alone at the end.
  const order = (n) => (/^(Cnaes|Motivos|Municipios|Naturezas|Qualificacoes|Paises)/.test(n) ? 0 : n === 'Estabelecimentos0.zip' ? 1 : /^Socios/.test(n) ? 2 : /^Empresas/.test(n) ? 3 : 4);
  const files = [...rel.files].sort((a, b) => order(a.name) - order(b.name) || a.name.localeCompare(b.name));
  const total = files.reduce((s, f) => s + f.contentLength, 0);
  console.log(`cnpj ${rel.month}: ${files.length} arquivos, ${(total / 1e9).toFixed(2)} GB`);
  const t0 = Date.now();
  const results = await pool(files, PARALLEL_DOWNLOADS, async (f) => {
    const url = `${rel.url}${f.name}`;
    const dest = path.join(dir, f.name);
    for (let attempt = 1; ; attempt++) {
      const manifest = readManifest();
      try {
        // The listing already has each file's date and size: no HEAD requests (the share's firewall
        // blocks clients that send bursts of requests).
        const r = await downloadFile(url, dest, { manifest, resume: true, meta: { lastModified: f.lastModified, contentLength: f.contentLength } });
        if (r.changed) {
          saveManifest({ [url]: manifest[url] });
          console.log(`  ↓ ${f.name} ${(f.contentLength / 1e6).toFixed(0)} MB (${secs(t0)})`);
        }
        return { ...r, name: f.name, dest };
      } catch (e) {
        // The server drops connections now and then; back off and resume from the .part file.
        if (attempt >= 10) throw e;
        console.warn(`  ${f.name}: ${e.message} — retrying (${attempt})`);
        await new Promise((r) => setTimeout(r, 15000 * attempt));
      }
    }
  });
  console.log(`cnpj ${rel.month}: downloads ok in ${secs(t0)}`);
  return results;
}

/* ---------- Streaming filter: zip -> unzip -p | iconv -> FIFO -> DuckDB -> Parquet ---------- */

// Quotes inside values are mostly doubled (""L""), sometimes not ("BAR "X" Y"): RFC escaping plus
// the lenient parser reads both into the right columns. The parallel reader can't handle such lines
// on a pipe, and a pipe is read by one thread anyway.
const csvSource = (fifo, cols) =>
  `read_csv(${sqlStr(fifo)}, delim = ';', quote = '"', escape = '"', header = false, auto_detect = false, strict_mode = false, parallel = false, ` +
  `columns = {${cols.map((c) => `'${c}': 'VARCHAR'`).join(', ')}})`;

/** Streams every member of `zip` (Latin-1 CSV) into `query(src)` and writes the result to `out` (Parquet). */
async function streamZip(con, zip, cols, query, out, workDir) {
  const fifo = path.join(workDir, `${path.basename(zip, '.zip')}.${crypto.randomBytes(4).toString('hex')}.fifo`);
  await new Promise((resolve, reject) => spawn('mkfifo', [fifo]).on('close', (c) => (c === 0 ? resolve() : reject(new Error('mkfifo failed')))));
  // Some files carry stray NUL bytes; iconv from Latin-1 cannot fail (every byte is a character).
  const writer = spawn('bash', ['-o', 'pipefail', '-c', `unzip -p ${shq(zip)} | tr -d '\\000' | iconv -f LATIN1 -t UTF-8 > ${shq(fifo)}`], {
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: true,
  });
  let stderr = '';
  writer.stderr.on('data', (d) => (stderr += d));
  const written = new Promise((resolve, reject) =>
    writer.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`unzip|iconv ${path.basename(zip)} exited ${code}: ${stderr.slice(0, 300)}`)))),
  );
  written.catch(() => {});
  const tmp = `${out}.tmp`;
  try {
    const r = await con.runAndReadAll(`COPY (${query(csvSource(fifo, cols))}) TO ${sqlStr(tmp)} (FORMAT parquet, COMPRESSION zstd)`);
    // A writer that died early would look like a short file to DuckDB: never accept that.
    await written;
    fs.renameSync(tmp, out);
    return Number(r.getRows()[0]?.[0] ?? 0);
  } catch (e) {
    try {
      process.kill(-writer.pid, 'SIGKILL');
    } catch {}
    fs.rmSync(tmp, { force: true });
    throw e;
  } finally {
    fs.rmSync(fifo, { force: true });
  }
}

/** Runs one streaming filter per zip, a few at a time, each on its own connection. */
async function streamAll(instance, zips, cols, query, outPrefix, workDir) {
  const t0 = Date.now();
  const counts = await pool(zips, PARALLEL_STREAMS, async (zip, k) => {
    const con = await instance.connect();
    try {
      return await streamZip(con, zip, cols, query, path.join(workDir, `${outPrefix}_${k}.parquet`), workDir);
    } finally {
      con.closeSync();
    }
  });
  const rows = counts.reduce((a, b) => a + b, 0);
  console.log(`  ${outPrefix}: ${rows.toLocaleString('pt-BR')} linhas de ${zips.length} arquivo(s) em ${secs(t0)}`);
  return rows;
}

/* ---------- Staging schema (all text, typed by etl/sql/10_cnpj.sql) ---------- */

const STAGE_FILES = {
  empresas: LAYOUT.empresas,
  estabelecimentos: [
    'cnpj_basico', 'cnpj_ordem', 'cnpj_dv', 'matriz_filial', 'nome_fantasia', 'situacao_cadastral', 'data_situacao_cadastral',
    'motivo_situacao_cadastral', 'data_inicio_atividade', 'cnae_fiscal_principal', 'cnae_fiscal_secundaria', 'uf', 'municipio',
    'situacao_especial', 'data_situacao_especial',
  ],
  // The partner's document is stored as published (PF: ***123456**; PJ: cnpj_basico); an unmasked
  // CPF would be masked here. The legal representative (name, CPF, qualification) is dropped.
  socios: [
    'cnpj_basico', 'identificador_socio', 'nome_socio', 'cnpj_cpf_socio', 'qualificacao_socio', 'data_entrada_sociedade', 'pais',
    'faixa_etaria', 'partner_key', 'name_norm',
  ],
  simples: LAYOUT.simples,
  cnaes: LAYOUT.lookup,
  motivos: LAYOUT.lookup,
  municipios: LAYOUT.lookup,
  naturezas: LAYOUT.lookup,
  qualificacoes: LAYOUT.lookup,
  paises: LAYOUT.lookup,
};
const SOURCE_COLS = {
  dataset: 'VARCHAR', label: 'VARCHAR', url: 'VARCHAR', published: 'VARCHAR', coverage_from: 'DATE', coverage_to: 'DATE',
  retrieved_at: 'TIMESTAMP', month: 'VARCHAR', last_modified: 'TIMESTAMP', extracted_on: 'DATE',
};

/** Empty staging files, so the database builds (with empty tables) before the first fetch. */
export async function ensureCnpjStaging() {
  fs.mkdirSync(STAGE, { recursive: true });
  const missing = [...Object.keys(STAGE_FILES), 'source'].filter((f) => !fs.existsSync(path.join(STAGE, `${f}.parquet`)));
  if (!missing.length) return;
  const inst = await DuckDBInstance.create(':memory:');
  const con = await inst.connect();
  for (const f of missing) {
    const cols = f === 'source' ? Object.entries(SOURCE_COLS) : STAGE_FILES[f].map((c) => [c, 'VARCHAR']);
    await con.run(`COPY (SELECT ${cols.map(([c, t]) => `NULL::${t} AS ${c}`).join(', ')} WHERE false) TO ${sqlStr(path.join(STAGE, `${f}.parquet`))} (FORMAT parquet)`);
  }
  con.closeSync();
  inst.closeSync();
}

/* ---------- Pipeline ---------- */

// Partner identity (docs/ENRICHMENT.md → rf_partner.partner_key). Names: upper case, no accents,
// single spaces. PF documents arrive masked (***123456**); an unmasked one is masked the same way.
const IDENTITY_MACROS = [
  `CREATE OR REPLACE MACRO rf_name(x) AS trim(regexp_replace(upper(strip_accents(coalesce(x, ''))), '\\s+', ' ', 'g'))`,
  `CREATE OR REPLACE MACRO rf_digits(x) AS regexp_replace(coalesce(x, ''), '[^0-9]', '', 'g')`,
  `CREATE OR REPLACE MACRO rf_pf_doc(x) AS CASE WHEN regexp_full_match(trim(coalesce(x, '')), '[0-9]{11}') THEN '***' || substr(trim(x), 4, 6) || '**' ELSE nullif(trim(coalesce(x, '')), '') END`,
  `CREATE OR REPLACE MACRO rf_doc(ident, x) AS CASE WHEN ident = '1' THEN nullif(trim(coalesce(x, '')), '') ELSE rf_pf_doc(x) END`,
  `CREATE OR REPLACE MACRO rf_partner_key(ident, name, doc) AS CASE
     WHEN ident = '1' AND length(rf_digits(doc)) >= 8 THEN 'j' || left(rf_digits(doc), 8)
     WHEN ident = '2' THEN 's' || left(md5(rf_name(name) || '|' || coalesce(rf_pf_doc(doc), '')), 16)
     ELSE 'x' || left(md5(rf_name(name)), 16)
   END`,
];

function memberDate(zip) {
  // Members are named like K3241.K03200Y0.D60912.EMPRECSV: D + last digit of the year + MMDD.
  return new Promise((resolve) => {
    const p = spawn('unzip', ['-Z1', zip], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('close', () => {
      const m = out.match(/\.D(\d)(\d{2})(\d{2})\./);
      resolve(m ? { y: Number(m[1]), m: m[2], d: m[3] } : null);
    });
  });
}

export async function fetchCnpj({ force = false, downloadOnly = false } = {}) {
  const t0 = Date.now();
  const rel = await latestCnpjRelease();
  const downloads = await downloadRelease(rel);
  if (downloadOnly) return { changed: false, month: rel.month };
  const zip = (name) => path.join(RAW, rel.month, `${name}.zip`);
  const group = (prefix) => downloads.filter((d) => new RegExp(`^${prefix}\\d\\.zip$`).test(d.name)).map((d) => d.dest).sort();

  fs.mkdirSync(STAGE, { recursive: true });
  const work = path.join(STAGE, '.work');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });

  const inst = await DuckDBInstance.create(':memory:', {
    memory_limit: process.env.PRUMO_CNPJ_MEMORY ?? '6GB',
    temp_directory: path.join(work, 'duckdb.tmp'),
    threads: String(Math.max(2, os.cpus().length - 2)),
    preserve_insertion_order: 'false',
  });
  const con = await inst.connect();
  for (const m of IDENTITY_MACROS) await con.run(m);

  // Scope: every CNPJ in the TSE records, as built into the current database.
  if (!fs.existsSync(DB_PATH)) throw new Error(`${DB_PATH} not found: build the TSE database first`);
  await con.run(`ATTACH ${sqlStr(DB_PATH)} AS tse (READ_ONLY)`);
  await con.run(`CREATE TABLE scope_cnpj AS SELECT DISTINCT substr(key, 2) AS cnpj FROM tse.entity WHERE regexp_full_match(key, 'j[0-9]{14}')`);
  await con.run(`DETACH tse`);
  await con.run(`CREATE TABLE scope_tse AS SELECT DISTINCT left(cnpj, 8) AS cnpj_basico FROM scope_cnpj`);
  const [[nCnpj, scopeHash]] = (await con.runAndReadAll(`SELECT count(*)::INT, md5(string_agg(cnpj, ',' ORDER BY cnpj)) FROM scope_cnpj`)).getRows();

  // Nothing to do when the month, its files and the scope are the ones already staged.
  const files = Object.fromEntries(downloads.map((d) => [d.name, d.lastModified]));
  const metaFile = path.join(STAGE, 'meta.json');
  const state = { version: 1, month: rel.month, files, scopeHash };
  let prev = null;
  try {
    prev = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  } catch {}
  const staged = [...Object.keys(STAGE_FILES), 'source'].every((f) => fs.existsSync(path.join(STAGE, `${f}.parquet`)));
  if (!force && staged && prev && JSON.stringify({ ...prev, stats: undefined }) === JSON.stringify(state)) {
    con.closeSync();
    inst.closeSync();
    fs.rmSync(work, { recursive: true, force: true });
    console.log(`cnpj ${rel.month}: staging up to date (${nCnpj} CNPJs in scope)`);
    return { changed: false, month: rel.month };
  }
  console.log(`cnpj ${rel.month}: ${nCnpj.toLocaleString('pt-BR')} CNPJs do TSE no escopo`);
  const stats = { scope_cnpj: nCnpj };
  const pq = (prefix) => sqlStr(path.join(work, `${prefix}_*.parquet`));

  // 1. Partners. First pass: (company, partner identity) for every row, to find the other companies
  //    of the partners of TSE companies; second pass: the full rows of every company in scope.
  const socios = group('Socios');
  stats.socios_scanned = await streamAll(inst, socios, LAYOUT.socios, (src) =>
    `SELECT cnpj_basico, rf_partner_key(identificador_socio, nome_socio, cnpj_cpf_socio) AS partner_key FROM ${src}`, 'socios_idx', work);
  await con.run(`CREATE TABLE socios_idx AS SELECT * FROM read_parquet(${pq('socios_idx')})`);
  await con.run(`CREATE TABLE tse_partner AS SELECT DISTINCT partner_key FROM socios_idx SEMI JOIN scope_tse USING (cnpj_basico)`);
  await con.run(`CREATE TABLE scope_company AS
    SELECT cnpj_basico, true AS in_tse FROM scope_tse
    UNION ALL
    SELECT DISTINCT cnpj_basico, false FROM socios_idx SEMI JOIN tse_partner USING (partner_key) ANTI JOIN scope_tse USING (cnpj_basico)`);
  const [[nTse, nOther, nPartners]] = (await con.runAndReadAll(
    `SELECT count(*) FILTER (WHERE in_tse)::INT, count(*) FILTER (WHERE NOT in_tse)::INT, (SELECT count(*) FROM tse_partner)::INT FROM scope_company`,
  )).getRows();
  console.log(`  escopo: ${nTse.toLocaleString('pt-BR')} empresas do TSE, ${nPartners.toLocaleString('pt-BR')} sócios, ${nOther.toLocaleString('pt-BR')} outras empresas desses sócios`);
  Object.assign(stats, { scope_tse_companies: nTse, scope_partners: nPartners, scope_other_companies: nOther });
  const degree = (await con.runAndReadAll(`
    SELECT left(partner_key, 1) AS kind, count(*)::INT AS partners, max(n)::INT AS max_companies,
      quantile_cont(n, 0.99)::INT AS p99, count(*) FILTER (WHERE n > 100)::INT AS over_100
    FROM (SELECT partner_key, count(DISTINCT cnpj_basico) AS n FROM socios_idx SEMI JOIN tse_partner USING (partner_key) GROUP BY 1)
    GROUP BY 1 ORDER BY 1`)).getRowObjectsJson();
  console.log('  empresas por sócio:', JSON.stringify(degree));
  stats.partner_degree = degree;
  await con.run(`DROP TABLE socios_idx`);
  for (const f of fs.readdirSync(work).filter((f) => f.startsWith('socios_idx_'))) fs.rmSync(path.join(work, f));

  stats.socios = await streamAll(inst, socios, LAYOUT.socios, (src) => `
    SELECT cnpj_basico, identificador_socio, nome_socio, rf_doc(identificador_socio, cnpj_cpf_socio) AS cnpj_cpf_socio,
      qualificacao_socio, data_entrada_sociedade, pais, faixa_etaria,
      rf_partner_key(identificador_socio, nome_socio, cnpj_cpf_socio) AS partner_key, rf_name(nome_socio) AS name_norm
    FROM ${src} SEMI JOIN scope_company USING (cnpj_basico)`, 'socios', work);

  // 2. Companies.
  stats.empresas = await streamAll(inst, group('Empresas'), LAYOUT.empresas, (src) =>
    `SELECT * FROM ${src} SEMI JOIN scope_company USING (cnpj_basico)`, 'empresas', work);

  // 3. Establishments: the ones named in TSE records and every company's head office.
  stats.estabelecimentos = await streamAll(inst, group('Estabelecimentos'), LAYOUT.estabelecimentos, (src) => `
    SELECT ${STAGE_FILES.estabelecimentos.join(', ')}
    FROM ${src} SEMI JOIN scope_company USING (cnpj_basico)
    WHERE matriz_filial = '1' OR cnpj_basico || cnpj_ordem || cnpj_dv IN (SELECT cnpj FROM scope_cnpj)`, 'estabelecimentos', work);

  // 4. Simples Nacional / MEI.
  stats.simples = await streamAll(inst, [zip('Simples')], LAYOUT.simples, (src) =>
    `SELECT * FROM ${src} SEMI JOIN scope_company USING (cnpj_basico)`, 'simples', work);

  // 5. Code tables.
  for (const [name, file] of [['cnaes', 'Cnaes'], ['motivos', 'Motivos'], ['municipios', 'Municipios'], ['naturezas', 'Naturezas'], ['qualificacoes', 'Qualificacoes'], ['paises', 'Paises']]) {
    if (!fs.existsSync(zip(file))) continue;
    await streamZip(con, zip(file), LAYOUT.lookup, (src) => `SELECT trim(code) AS code, trim(description) AS description FROM ${src}`, path.join(work, `${name}_0.parquet`), work);
  }

  // Provenance: the month folder, the newest file date and the extraction date in the member names.
  const lastModified = downloads.map((d) => new Date(d.lastModified)).filter((d) => !isNaN(d)).sort((a, b) => b - a)[0];
  const retrievedAt = downloads.map((d) => new Date(d.downloadedAt)).filter((d) => !isNaN(d)).sort((a, b) => b - a)[0] ?? new Date();
  const md = await memberDate(zip('Empresas0'));
  let extracted = null;
  if (md && lastModified) {
    const y = Math.floor(lastModified.getUTCFullYear() / 10) * 10 + md.y;
    const d = new Date(`${y}-${md.m}-${md.d}T00:00:00Z`);
    if (!isNaN(d) && d <= lastModified && lastModified - d < 90 * 864e5) extracted = d.toISOString().slice(0, 10);
  }
  await con.run(`COPY (SELECT
      'rf_cnpj' AS dataset, 'Receita Federal — Dados Abertos CNPJ' AS label, ${sqlStr(rel.url)} AS url, ${sqlStr(rel.month)} AS published,
      NULL::DATE AS coverage_from, ${extracted ? `DATE ${sqlStr(extracted)}` : 'NULL::DATE'} AS coverage_to,
      ${sqlStr(retrievedAt.toISOString())}::TIMESTAMP AS retrieved_at, ${sqlStr(rel.month)} AS month,
      ${lastModified ? `${sqlStr(lastModified.toISOString())}::TIMESTAMP` : 'NULL::TIMESTAMP'} AS last_modified,
      ${extracted ? `DATE ${sqlStr(extracted)}` : 'NULL::DATE'} AS extracted_on
    ) TO ${sqlStr(path.join(work, 'source_0.parquet'))} (FORMAT parquet)`);

  // Merge the per-file parts into one staging file per table and swap them in together.
  for (const name of [...Object.keys(STAGE_FILES), 'source']) {
    const parts = fs.readdirSync(work).filter((f) => new RegExp(`^${name}_\\d+\\.parquet$`).test(f));
    if (!parts.length) continue;
    const order = name === 'socios' ? 'ORDER BY cnpj_basico, partner_key' : name === 'estabelecimentos' ? 'ORDER BY cnpj_basico, cnpj_ordem' : name === 'source' ? '' : 'ORDER BY 1';
    await con.run(`COPY (SELECT * FROM read_parquet(${pq(name)}) ${order}) TO ${sqlStr(path.join(work, `${name}.parquet`))} (FORMAT parquet, COMPRESSION zstd)`);
  }
  // Rows whose fields don't look like the layout (a misparsed quote would shift the columns).
  const odd = (await con.runAndReadAll(`SELECT
      (SELECT count(*) FROM ${sqlStr(path.join(work, 'estabelecimentos.parquet'))} WHERE NOT regexp_full_match(coalesce(uf, ''), '[A-Z]{2}') OR NOT regexp_full_match(coalesce(municipio, ''), '[0-9]{1,4}') OR matriz_filial NOT IN ('1', '2'))::INT AS estabelecimentos,
      (SELECT count(*) FROM ${sqlStr(path.join(work, 'empresas.parquet'))} WHERE NOT regexp_full_match(coalesce(natureza_juridica, ''), '[0-9]{4}') OR coalesce(porte, '') NOT IN ('', '00', '01', '03', '05'))::INT AS empresas,
      (SELECT count(*) FROM ${sqlStr(path.join(work, 'socios.parquet'))} WHERE identificador_socio NOT IN ('1', '2', '3') OR NOT regexp_full_match(coalesce(faixa_etaria, '0'), '[0-9]'))::INT AS socios,
      (SELECT count(*) FROM ${sqlStr(path.join(work, 'simples.parquet'))} WHERE coalesce(opcao_simples, '') NOT IN ('', 'S', 'N') OR coalesce(opcao_mei, '') NOT IN ('', 'S', 'N'))::INT AS simples`)).getRowObjectsJson()[0];
  stats.malformed = odd;
  if (Object.values(odd).some((n) => n > 0)) console.warn('  linhas fora do leiaute:', odd);
  con.closeSync();
  inst.closeSync();
  for (const name of [...Object.keys(STAGE_FILES), 'source']) {
    const f = path.join(work, `${name}.parquet`);
    if (fs.existsSync(f)) fs.renameSync(f, path.join(STAGE, `${name}.parquet`));
  }
  fs.writeFileSync(metaFile, JSON.stringify({ ...state, stats }, null, 2));
  fs.rmSync(work, { recursive: true, force: true });

  // The new month is staged: older month folders (and their manifest entries) can go.
  const stale = {};
  for (const m of fs.readdirSync(RAW).filter((m) => /^\d{4}-\d{2}$/.test(m) && m !== rel.month)) {
    fs.rmSync(path.join(RAW, m), { recursive: true, force: true });
    for (const url of Object.keys(readManifest())) if (url.startsWith(`${CNPJ_SHARE}${m}/`)) stale[url] = null;
    console.log(`  removed data/raw/cnpj/${m}`);
  }
  if (Object.keys(stale).length) saveManifest(stale);

  console.log(`cnpj ${rel.month}: staging written in ${secs(t0)}`, stats);
  return { changed: true, month: rel.month, stats };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  fetchCnpj({ force: process.argv.includes('--force'), downloadOnly: process.argv.includes('--download-only') })
    .then((r) => console.log(`done in ${secs(t0)}`, r.changed ? '' : '(no changes)'))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
