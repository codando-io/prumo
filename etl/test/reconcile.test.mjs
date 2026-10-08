// Reconciles the built database against the staged TSE CSVs, year by year: no rows lost in
// parsing, no value double-counted by joins or aggregates. Run after `npm run data:build`.
import assert from 'node:assert/strict';
import path from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { DB_PATH, STAGING_DIR, YEARS } from '../config.mjs';

const inst = await DuckDBInstance.create(':memory:');
const con = await inst.connect();
await con.run(`ATTACH '${DB_PATH}' AS db (READ_ONLY)`);
const one = async (sql) => Object.values((await con.runAndReadAll(sql)).getRowObjectsJson()[0]);
const csv = (y, name) =>
  `read_csv('${path.join(STAGING_DIR, String(y), `${name}.csv`)}', delim=';', header=true, all_varchar=true, max_line_size=10000000)`;
const money = (col) => `round(sum(TRY_CAST(replace(${col}, ',', '.') AS DECIMAL(18,2))), 2)::VARCHAR`;
const realRows = (col) => `WHERE ${col} NOT IN ('-1', '#NULO', '#NULO#')`;

let failures = 0;
const check = (label, a, b) => {
  try {
    // Aggregates are DOUBLE, facts DECIMAL: compare as numbers, within half a centavo.
    if (typeof a === 'number' || /^[\d.]+$/.test(String(a))) assert.ok(Math.abs(Number(a) - Number(b)) < 0.005);
    else assert.equal(String(a), String(b));
    console.log(`  ok  ${label}: ${a}`);
  } catch {
    failures++;
    console.log(`  ✖   ${label}: db=${a} csv=${b}`);
  }
};

for (const y of YEARS) {
  console.log(`${y}`);
  const [rRows, rSum] = await one(`SELECT count(*), ${money('VR_RECEITA')} FROM ${csv(y, 'receitas')} ${realRows('SQ_RECEITA')}`);
  const [dbRRows, dbRSum] = await one(`SELECT count(*), round(sum(value), 2)::VARCHAR FROM db.revenue WHERE year = ${y}`);
  check('revenue rows', dbRRows, rRows);
  check('revenue total', dbRSum, rSum);

  const [eRows, eSum] = await one(`SELECT count(*), ${money('VR_DESPESA_CONTRATADA')} FROM ${csv(y, 'despesas_contratadas')} ${realRows('SQ_DESPESA')}`);
  const [dbERows, dbESum] = await one(`SELECT count(*), round(sum(value), 2)::VARCHAR FROM db.expense WHERE year = ${y}`);
  check('expense rows', dbERows, eRows);
  check('expense total', dbESum, eSum);

  const [pSum] = await one(`SELECT ${money('VR_PAGTO_DESPESA')} FROM ${csv(y, 'despesas_pagas')} ${realRows('SQ_DESPESA')}`);
  const [dbPSum] = await one(`SELECT round(sum(value), 2)::VARCHAR FROM db.payment WHERE year = ${y}`);
  check('payment total', dbPSum, pSum);

  // Aggregates must add back up to the facts.
  const [sRev, sExp] = await one(`SELECT round(sum(revenue), 2)::VARCHAR, round(sum(expense), 2)::VARCHAR FROM db.candidate_summary WHERE year = ${y}`);
  check('summary revenue = facts', sRev, dbRSum);
  check('summary expense = facts', sExp, dbESum);
  const [cubeR] = await one(`SELECT round(sum(value), 2)::VARCHAR FROM db.rev_cube WHERE year = ${y}`);
  const [cubeE] = await one(`SELECT round(sum(value), 2)::VARCHAR FROM db.exp_cube WHERE year = ${y}`);
  check('revenue cube = facts', cubeR, dbRSum);
  check('expense cube = facts', cubeE, dbESum);

  const [cands] = await one(`SELECT count(DISTINCT SQ_CANDIDATO) FROM ${csv(y, 'candidatos')}`);
  const [dbCands] = await one(`SELECT count(*) FROM db.candidate WHERE year = ${y}`);
  check('candidacies', dbCands, cands);
}

if (failures) {
  console.error(`\n${failures} reconciliation check(s) failed`);
  process.exit(1);
}
console.log('\nall reconciliation checks passed');
