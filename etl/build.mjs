// Builds data/prumo.duckdb from the staged CSVs.
// The database is built into a temporary file and atomically swapped in, so a running
// app keeps serving the previous version until the new one is complete.
import fs from 'node:fs';
import path from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { DATA_DIR, DB_PATH, STAGING_DIR, PERSON_SALT, ELECTIONS, YEARS, ROOT } from './config.mjs';
import { readManifest } from './download.mjs';
import { snapshotAndDiff } from './snapshot.mjs';
import { ensureProposalStaging } from './proposals.mjs';
import { ensureCnpjStaging } from './cnpj.mjs';
import { ensureSanctionsStaging } from './sanctions.mjs';
import { ensurePncpStaging } from './pncp.mjs';

const SQL_DIR = path.join(ROOT, 'etl', 'sql');

export function splitStatements(sql) {
  // Statements end with ";" at end of line; ";" inside string literals (e.g. delim = ';') is safe.
  return sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
}

function render(sql, vars) {
  return sql.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`Unknown template variable ${k}`);
    return vars[k];
  });
}

const lit = (s) => `'${String(s).replaceAll("'", "''")}'`;

export async function build({ only } = {}) {
  const tmp = path.join(DATA_DIR, 'prumo.build.duckdb');
  // --only=NN runs a subset of SQL files against the existing work-in-progress DB (dev loop).
  if (!only) for (const f of [tmp, `${tmp}.wal`]) if (fs.existsSync(f)) fs.rmSync(f);

  const instance = await DuckDBInstance.create(tmp, { threads: String(Math.max(2, (await import('node:os')).cpus().length - 2)) });
  const con = await instance.connect();
  await con.run(`SET preserve_insertion_order = false`);

  const vars = {
    STAGING: STAGING_DIR,
    DATA: DATA_DIR,
    SALT: PERSON_SALT.replaceAll("'", "''"),
    ELECTIONS_VALUES: YEARS.map((y) => {
      const e = ELECTIONS[y];
      return `(${y}, ${lit(e.label)}, ${lit(e.round1)}, ${lit(e.round2)}, ${lit(e.portalId)})`;
    }).join(', '),
  };

  // Government plans are fetched separately (etl/proposals.mjs); build with empty tables until then.
  ensureProposalStaging();
  // Receita CNPJ enrichment is fetched separately (etl/cnpj.mjs); same idea.
  await ensureCnpjStaging();
  // CGU sanctions (etl/sanctions.mjs) and PNCP contracts (etl/pncp.mjs): same idea.
  await ensureSanctionsStaging();
  await ensurePncpStaging();

  const files = fs.readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (only && !only.some((o) => file.startsWith(o))) continue;
    const sql = render(fs.readFileSync(path.join(SQL_DIR, file), 'utf8'), vars);
    for (const stmt of splitStatements(sql)) {
      const t0 = Date.now();
      try {
        await con.run(stmt);
      } catch (e) {
        console.error(`\n✖ ${file}: ${e.message}\n--- statement ---\n${stmt.slice(0, 2000)}\n`);
        throw e;
      }
      const head = stmt.match(/^(CREATE OR REPLACE (TABLE|VIEW|MACRO)|CREATE INDEX|ALTER TABLE|UPDATE|INSERT INTO|DROP \w+)\s+(IF EXISTS\s+)?(\w+)/i);
      const ms = Date.now() - t0;
      if (ms > 500 || /TABLE/.test(head?.[1] ?? '')) console.log(`  ${file} ${head ? `${head[1]} ${head[4]}` : stmt.slice(0, 40)} — ${(ms / 1000).toFixed(1)}s`);
    }
  }

  if (only) {
    con.closeSync();
    instance.closeSync();
    console.log(`✔ ran ${only.join(',')} against ${tmp} (not finalised)`);
    return;
  }

  // Provenance: which upstream files (and versions) produced this database.
  const manifest = readManifest();
  await con.run(`CREATE OR REPLACE TABLE source_file (url VARCHAR, file VARCHAR, last_modified TIMESTAMP, content_length BIGINT, downloaded_at TIMESTAMP)`);
  for (const [url, m] of Object.entries(manifest)) {
    await con.run(
      `INSERT INTO source_file VALUES (${lit(url)}, ${lit(m.file)}, ${m.lastModified ? `strptime(${lit(m.lastModified)}, '%a, %d %b %Y %H:%M:%S GMT')` : 'NULL'}, ${m.contentLength ?? 'NULL'}, ${lit(m.downloadedAt)}::TIMESTAMP)`,
    );
  }

  await snapshotAndDiff(con);

  // SQL that depends on the snapshot/diff tables.
  const postDir = path.join(SQL_DIR, 'post');
  for (const file of fs.existsSync(postDir) ? fs.readdirSync(postDir).filter((f) => f.endsWith('.sql')).sort() : []) {
    for (const stmt of splitStatements(render(fs.readFileSync(path.join(postDir, file), 'utf8'), vars))) await con.run(stmt);
    console.log(`  post/${file}`);
  }

  await con.run(`CREATE OR REPLACE TABLE build_info AS SELECT now()::TIMESTAMP AS built_at, ${lit(YEARS.join(','))} AS years`);
  // Raw views point at staging files that may be deleted; drop them from the shipped DB.
  for (const v of ['raw_candidatos', 'raw_bens', 'raw_receitas', 'raw_receitas_originario', 'raw_despesas_contratadas', 'raw_despesas_pagas', 'raw_votacao']) {
    await con.run(`DROP VIEW IF EXISTS ${v}`);
  }
  await con.run(`DROP TABLE IF EXISTS candidate_stage`);
  await con.run('CHECKPOINT');
  con.closeSync();
  instance.closeSync();

  fs.renameSync(tmp, DB_PATH);
  console.log(`✔ built ${DB_PATH} (${(fs.statSync(DB_PATH).size / 1e9).toFixed(2)} GB)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const t0 = Date.now();
  build({ only: onlyArg ? onlyArg.slice(7).split(',') : undefined })
    .then(() => console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
