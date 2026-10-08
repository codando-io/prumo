// Sanction and impediment registries published by CGU on the Portal da Transparência:
// CEIS (empresas inidôneas e suspensas), CNEP (empresas punidas, Lei 12.846/2013),
// CEPIM (entidades privadas sem fins lucrativos impedidas) and Acordos de Leniência.
//
//   node etl/sanctions.mjs
//
// Each dataset is published daily as one zip and only the latest date is kept online. The date is
// read from the dataset page, the zip is downloaded into data/raw/sancoes/ (manifest-tracked, so an
// unchanged file is not downloaded again) and streamed (unzip -p, CP1252 → UTF-8) through a CSV
// parser that keeps COMPANIES ONLY: rows of individuals (TIPO DE PESSOA = 'F', CPFs) are dropped
// before anything is written, and CPF-shaped numbers typed into free text are masked.
// Staging output (read by etl/sql/11_sanctions.sql): data/staging/sancoes/*.parquet.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { DuckDBInstance } from '@duckdb/node-api';
import { RAW_DIR, STAGING_DIR } from './config.mjs';
import { downloadFile, readManifest } from './download.mjs';
import { maskCpf, maskValidCpf } from './mask.mjs';

const PORTAL = 'https://portaldatransparencia.gov.br/download-de-dados';
const UA = 'Prumo/0.1 (transparencia eleitoral; contato: <none>)';
const RAW = path.join(RAW_DIR, 'sancoes');
const STAGE = path.join(STAGING_DIR, 'sancoes');
const MANIFEST = path.join(RAW_DIR, 'manifest.json');

// Column keys per staging table. Upstream headers are matched after removing accents/punctuation
// differences (see normHeader), so cosmetic header changes do not break the import, but a missing
// column does (loudly) instead of silently producing empty fields.
const REGISTRY_COLS = {
  cadastro: ['CADASTRO'],
  codigo: ['CODIGO DA SANCAO'],
  tipo_pessoa: ['TIPO DE PESSOA'],
  cnpj: ['CPF OU CNPJ DO SANCIONADO'],
  nome: ['NOME DO SANCIONADO'],
  nome_orgao: ['NOME INFORMADO PELO ORGAO SANCIONADOR'],
  razao_social: ['RAZAO SOCIAL - CADASTRO RECEITA'],
  nome_fantasia: ['NOME FANTASIA - CADASTRO RECEITA'],
  processo: ['NUMERO DO PROCESSO'],
  categoria: ['CATEGORIA DA SANCAO'],
  valor_multa: ['VALOR DA MULTA'], // CNEP only
  data_inicio: ['DATA INICIO SANCAO'],
  data_final: ['DATA FINAL SANCAO'],
  data_publicacao: ['DATA PUBLICACAO'],
  publicacao: ['PUBLICACAO'],
  detalhamento_publicacao: ['DETALHAMENTO DO MEIO DE PUBLICACAO'],
  data_transito: ['DATA DO TRANSITO EM JULGADO'],
  abrangencia: ['ABRAGENCIA DA SANCAO', 'ABRANGENCIA DA SANCAO'],
  orgao: ['ORGAO SANCIONADOR'],
  uf_orgao: ['UF ORGAO SANCIONADOR'],
  esfera_orgao: ['ESFERA ORGAO SANCIONADOR'],
  fundamentacao: ['FUNDAMENTACAO LEGAL'],
  data_origem: ['DATA ORIGEM INFORMACAO'],
  origem: ['ORIGEM INFORMACOES'],
  observacoes: ['OBSERVACOES'],
};

const TABLES = {
  ceis: { cols: REGISTRY_COLS, optional: ['valor_multa'] },
  cnep: { cols: REGISTRY_COLS, optional: [] },
  cepim: {
    cols: {
      cnpj: ['CNPJ ENTIDADE'],
      nome: ['NOME ENTIDADE'],
      convenio: ['NUMERO CONVENIO'],
      orgao: ['ORGAO CONCEDENTE'],
      motivo: ['MOTIVO DO IMPEDIMENTO'],
    },
    optional: [],
  },
  acordos: {
    cols: {
      id: ['ID DO ACORDO'],
      cnpj: ['CNPJ DO SANCIONADO'],
      razao_social: ['RAZAO SOCIAL - CADASTRO RECEITA'],
      nome_fantasia: ['NOME FANTASIA - CADASTRO RECEITA'],
      data_inicio: ['DATA DE INICIO DO ACORDO'],
      data_fim: ['DATA DE FIM DO ACORDO'],
      situacao: ['SITUACAO DO ACORDO DE LENIENICA', 'SITUACAO DO ACORDO DE LENIENCIA', 'SITUACAO DO ACORDO'],
      data_informacao: ['DATA DA INFORMACAO'],
      processo: ['NUMERO DO PROCESSO'],
      termos: ['TERMOS DO ACORDO'],
      orgao: ['ORGAO SANCIONADOR'],
    },
    optional: [],
  },
  efeitos: {
    cols: {
      id: ['ID DO ACORDO'],
      efeito: ['EFEITO DO ACORDO DE LENIENCIA'],
      complemento: ['COMPLEMENTO'],
    },
    optional: [],
  },
};

// Provenance of each dataset actually staged (one row per dataset).
const META_COLS = ['dataset', 'label', 'url', 'file_url', 'file_date', 'last_modified', 'retrieved_at', 'rows_total', 'rows_kept'];

export const SANCTION_DATASETS = [
  { key: 'ceis', slug: 'ceis', label: 'CEIS — Cadastro Nacional de Empresas Inidôneas e Suspensas (CGU)', members: { ceis: /_CEIS\.csv$/i } },
  { key: 'cnep', slug: 'cnep', label: 'CNEP — Cadastro Nacional de Empresas Punidas (CGU)', members: { cnep: /_CNEP\.csv$/i } },
  { key: 'cepim', slug: 'cepim', label: 'CEPIM — Cadastro de Entidades Privadas sem Fins Lucrativos Impedidas (CGU)', members: { cepim: /_CEPIM\.csv$/i } },
  {
    key: 'leniencia',
    slug: 'acordos-leniencia',
    label: 'Acordos de leniência (CGU)',
    members: { acordos: /_Acordos\.csv$/i, efeitos: /_Efeitos\.csv$/i },
  },
];

/* ---------- Helpers ---------- */

const normHeader = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const isCnpj = (s) => /^\d{14}$/.test(s ?? '');
const sqlStr = (s) => `'${String(s).replaceAll("'", "''")}'`;
// Identifiers: mask only numbers that are valid CPFs (most CPF-shaped process numbers are not).
const IDENTIFIERS = new Set(['codigo', 'processo', 'convenio', 'id']);

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

/** Latest publication date (YYYYMMDD) listed on the dataset's download page. */
export async function latestDate(slug) {
  const html = await fetchText(`${PORTAL}/${slug}`);
  const dates = [...html.matchAll(/arquivos\.push\(\{\s*"ano"\s*:\s*"(\d{4})"\s*,\s*"mes"\s*:\s*"(\d{1,2})"\s*,\s*"dia"\s*:\s*"(\d{1,2})"/g)].map(
    (m) => `${m[1]}${m[2].padStart(2, '0')}${m[3].padStart(2, '0')}`,
  );
  if (!dates.length) throw new Error(`no file date found on ${PORTAL}/${slug}`);
  return dates.sort().at(-1);
}

/** The portal answers /download-de-dados/{slug}/{date} with a 302 to the zip on the CGU bucket. */
async function resolveZip(portalUrl) {
  const res = await fetch(portalUrl, { method: 'HEAD', redirect: 'manual', headers: { 'User-Agent': UA } });
  const loc = res.headers.get('location');
  if (res.status >= 300 && res.status < 400 && loc) return new URL(loc, portalUrl).href;
  if (res.ok) return portalUrl;
  throw new Error(`HEAD ${portalUrl} -> ${res.status}`);
}

/** Streaming parser for CGU CSVs: ';'-separated, '"'-quoted ('""' escapes), CRLF, header row. */
function csvParser(onRow, sep = ';') {
  let field = '';
  let row = [];
  let inQ = false;
  let closed = false; // just left a quoted section: a following '"' is an escaped quote
  return {
    push(text) {
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQ) {
          if (c === '"') {
            inQ = false;
            closed = true;
          } else field += c;
          continue;
        }
        if (c === '"') {
          if (closed) field += '"';
          inQ = true;
          closed = false;
          continue;
        }
        closed = false;
        if (c === sep) {
          row.push(field);
          field = '';
        } else if (c === '\n') {
          row.push(field);
          field = '';
          if (!(row.length === 1 && row[0] === '')) onRow(row);
          row = [];
        } else if (c !== '\r') field += c;
      }
    },
    end() {
      if (field !== '' || row.length) {
        row.push(field);
        onRow(row);
      }
    },
  };
}

/** Streams one zip member through the CP1252 decoder and the CSV parser. */
function readMember(zip, member, onRecord) {
  return new Promise((resolve, reject) => {
    const p = spawn('unzip', ['-p', zip, member], { stdio: ['ignore', 'pipe', 'pipe'] });
    // WHATWG windows-1252 maps every byte (iconv -f CP1252 rejects the 5 undefined ones).
    const dec = new TextDecoder('windows-1252');
    let header = null;
    let n = 0;
    const parser = csvParser((row) => {
      if (!header) {
        header = row.map((h) => normHeader(h.replace(/^﻿/, '')));
        return;
      }
      n++;
      onRecord(row, header);
    });
    const err = [];
    p.stdout.on('data', (d) => parser.push(dec.decode(d, { stream: true })));
    p.stderr.on('data', (d) => err.push(d));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`unzip -p ${zip} ${member} -> ${code}: ${Buffer.concat(err).toString().slice(0, 300)}`));
      parser.push(dec.decode());
      parser.end();
      resolve(n);
    });
  });
}

function columnIndex(table, header) {
  const { cols, optional } = TABLES[table];
  const idx = {};
  for (const [key, names] of Object.entries(cols)) {
    const i = header.findIndex((h) => names.includes(h));
    if (i < 0 && !optional.includes(key)) throw new Error(`${table}: column ${names[0]} not found in header [${header.join(' | ')}]`);
    idx[key] = i;
  }
  const known = new Set(Object.values(cols).flat());
  const extra = header.filter((h) => !known.has(h));
  if (extra.length) console.warn(`  ${table}: ignoring unknown columns ${extra.join(', ')}`);
  return idx;
}

function writeManifestEntries(update) {
  // Re-read right before writing: other fetchers may have updated the manifest meanwhile.
  const m = readManifest();
  update(m);
  const tmp = `${MANIFEST}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(m, null, 2));
  fs.renameSync(tmp, MANIFEST);
}

async function createTables(con) {
  for (const [t, { cols }] of Object.entries(TABLES)) {
    await con.run(`CREATE OR REPLACE TABLE ${t} (${Object.keys(cols).map((c) => `${c} VARCHAR`).join(', ')})`);
  }
  await con.run(`CREATE OR REPLACE TABLE meta (${META_COLS.map((c) => `${c} VARCHAR`).join(', ')})`);
}

async function writeParquet(con, tables, dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const t of tables) {
    const dest = path.join(dir, `${t}.parquet`);
    const tmp = `${dest}.tmp`;
    await con.run(`COPY ${t} TO ${sqlStr(tmp)} (FORMAT parquet, COMPRESSION zstd)`);
    fs.renameSync(tmp, dest);
  }
}

/* ---------- Pipeline ---------- */

export async function fetchSanctions({ force = false } = {}) {
  fs.mkdirSync(RAW, { recursive: true });
  const inst = await DuckDBInstance.create(':memory:');
  const con = await inst.connect();
  await createTables(con);
  let changed = false;
  const staged = [];

  for (const ds of SANCTION_DATASETS) {
    let date;
    let fileUrl;
    let r;
    const portalUrl = () => `${PORTAL}/${ds.slug}/${date}`;
    try {
      date = await latestDate(ds.slug);
      fileUrl = await resolveZip(portalUrl());
      const dest = path.join(RAW, path.basename(new URL(fileUrl).pathname));
      const manifest = readManifest();
      r = await downloadFile(fileUrl, dest, { force, manifest });
      if (r.changed) {
        changed = true;
        const prefix = `${path.dirname(fileUrl)}/`;
        writeManifestEntries((m) => {
          // CGU keeps only the latest file: drop older versions of this dataset (and their zips).
          for (const [u, e] of Object.entries(m)) {
            if (u !== fileUrl && u.startsWith(prefix)) {
              if (e?.file) fs.rmSync(path.join(RAW, e.file), { force: true });
              delete m[u];
            }
          }
          m[fileUrl] = manifest[fileUrl];
        });
      }
    } catch (e) {
      // Keep the previous staging of this dataset if the portal is unavailable.
      console.warn(`  sanções ${ds.key}: ${e.message}`);
      continue;
    }

    const zip = path.join(RAW, r.file);
    const list = spawnSync('unzip', ['-Z1', zip], { encoding: 'utf8' });
    if (list.status !== 0) throw new Error(`unzip -Z1 ${zip} failed`);
    const names = list.stdout.split('\n').filter(Boolean);

    let total = 0;
    let kept = 0;
    const counts = {};
    const keptAcordos = new Set();
    for (const [table, re] of Object.entries(ds.members)) {
      const member = names.find((n) => re.test(n));
      if (!member) throw new Error(`${path.basename(zip)}: no member matching ${re}`);
      const appender = await con.createAppender(table);
      const keys = Object.keys(TABLES[table].cols);
      let idx = null;
      let rows = 0;
      let dropped = 0;
      const n = await readMember(zip, member, (row, header) => {
        idx ??= columnIndex(table, header);
        const v = Object.fromEntries(keys.map((k) => [k, idx[k] >= 0 ? (row[idx[k]] ?? '').trim() : '']));
        // Companies only. CEIS/CNEP list individuals too (TIPO DE PESSOA = 'F', unmasked CPF); a
        // few rows have no TIPO DE PESSOA and are kept only when the document is a 14-digit CNPJ.
        // Acordos sometimes carry a foreign company name instead of a CNPJ.
        let keep;
        if (table === 'ceis' || table === 'cnep') keep = (v.tipo_pessoa === 'J' || v.tipo_pessoa === '') && isCnpj(v.cnpj);
        else if (table === 'efeitos') keep = keptAcordos.has(v.id);
        else keep = isCnpj(v.cnpj);
        if (!keep) {
          dropped++;
          return;
        }
        if (table === 'acordos') keptAcordos.add(v.id);
        for (const k of keys) {
          const s = v[k];
          if (s === '') appender.appendNull();
          else appender.appendVarchar(k === 'cnpj' ? s : IDENTIFIERS.has(k) ? maskValidCpf(s) : maskCpf(s));
        }
        appender.endRow();
        rows++;
      });
      appender.flushSync();
      appender.closeSync();
      counts[table] = { read: n, kept: rows, dropped };
      if (table !== 'efeitos') {
        total += n;
        kept += rows;
      }
    }

    const fileDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    const meta = {
      dataset: ds.key,
      label: ds.label,
      url: portalUrl(),
      file_url: fileUrl,
      file_date: fileDate,
      last_modified: r.lastModified ?? null,
      retrieved_at: r.downloadedAt ?? new Date().toISOString(),
      rows_total: String(total),
      rows_kept: String(kept),
    };
    const app = await con.createAppender('meta');
    for (const c of META_COLS) (meta[c] == null ? app.appendNull() : app.appendVarchar(String(meta[c])));
    app.endRow();
    app.flushSync();
    app.closeSync();
    staged.push(ds);
    console.log(
      `sanções ${ds.key} ${fileDate} ${r.changed ? '(novo)' : '(sem mudança)'}: ` +
        Object.entries(counts)
          .map(([t, c]) => `${t} ${c.kept} pessoas jurídicas de ${c.read} registros`)
          .join('; '),
    );
  }

  if (!staged.length) {
    con.closeSync();
    inst.closeSync();
    console.warn('sanções: nothing staged (portal unavailable?); previous staging kept');
    await ensureSanctionsStaging();
    return { changed: false };
  }
  // Datasets that failed keep their previous staging rows: carry them over.
  const failed = SANCTION_DATASETS.filter((d) => !staged.includes(d));
  for (const ds of failed) {
    for (const t of Object.keys(ds.members)) {
      const f = path.join(STAGE, `${t}.parquet`);
      if (fs.existsSync(f)) await con.run(`INSERT INTO ${t} SELECT * FROM read_parquet(${sqlStr(f)})`);
    }
    const mf = path.join(STAGE, 'meta.parquet');
    if (fs.existsSync(mf)) await con.run(`INSERT INTO meta SELECT * FROM read_parquet(${sqlStr(mf)}) WHERE dataset = ${sqlStr(ds.key)}`);
  }
  await writeParquet(con, [...Object.keys(TABLES), 'meta'], STAGE);
  con.closeSync();
  inst.closeSync();
  return { changed };
}

/** Empty staging files, so the database builds even before sanctions were fetched. */
export async function ensureSanctionsStaging() {
  const missing = [...Object.keys(TABLES), 'meta'].filter((t) => !fs.existsSync(path.join(STAGE, `${t}.parquet`)));
  if (!missing.length) return;
  const inst = await DuckDBInstance.create(':memory:');
  const con = await inst.connect();
  await createTables(con);
  await writeParquet(con, missing, STAGE);
  con.closeSync();
  inst.closeSync();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  fetchSanctions({ force: process.argv.includes('--force') })
    .then(() => console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
