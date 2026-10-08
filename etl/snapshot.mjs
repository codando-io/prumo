// Snapshots and change detection.
//
// TSE republishes the finance files as candidates submit or correct their accounts, and each
// file only contains every campaign's *latest* submission. To make updates visible we keep a
// compact fingerprint of every transaction per capture (one capture = one TSE generation
// timestamp) and diff consecutive captures:
//   data/snapshots/<year>/<captureId>/{revenue,expense,campaign}.parquet
//   data/snapshots/<year>/changes/<from>__<to>.parquet
// All captures and changes are then loaded into the database (tables `capture`, `change_log`,
// `campaign_change`).
import fs from 'node:fs';
import path from 'node:path';
import { SNAPSHOT_DIR, YEARS } from './config.mjs';

const lit = (s) => `'${String(s).replaceAll("'", "''")}'`;

async function scalar(con, sql) {
  const r = await con.runAndReadAll(sql);
  const rows = r.getRowObjectsJson();
  return rows.length ? Object.values(rows[0])[0] : null;
}

function captureIdOf(ts) {
  // "2026-10-07 04:05:37" -> "20261007T040537"
  return String(ts).replace(/[-:]/g, '').replace(' ', 'T').slice(0, 15);
}

async function writeSnapshot(con, year, dir) {
  fs.mkdirSync(dir, { recursive: true });
  await con.run(`COPY (
    SELECT sq, candidate_id, sum(value)::DECIMAL(18,2) AS value, count(*) AS lines, min(date) AS date,
      any_value(donor_key) AS counterparty_key, any_value(donor_name) AS counterparty_name, any_value(category) AS category
    FROM revenue WHERE year = ${year} GROUP BY sq, candidate_id
  ) TO ${lit(path.join(dir, 'revenue.parquet'))} (FORMAT parquet)`);
  await con.run(`COPY (
    SELECT sq, candidate_id, sum(value)::DECIMAL(18,2) AS value, count(*) AS lines, min(date) AS date,
      any_value(supplier_key) AS counterparty_key, any_value(supplier_name) AS counterparty_name, any_value(category) AS category
    FROM expense WHERE year = ${year} GROUP BY sq, candidate_id
  ) TO ${lit(path.join(dir, 'expense.parquet'))} (FORMAT parquet)`);
  await con.run(`COPY (
    SELECT id AS candidate_id, filing_type, filing_date, revenue, expense, n_revenue_tx, n_expense_tx
    FROM candidate_summary WHERE year = ${year} AND has_finance
  ) TO ${lit(path.join(dir, 'campaign.parquet'))} (FORMAT parquet)`);
}

async function writeDiff(con, a, b, out) {
  const diffTx = (kind) => `
    SELECT '${kind}' AS kind,
      coalesce(b.sq, a.sq) AS sq,
      coalesce(b.candidate_id, a.candidate_id) AS candidate_id,
      CASE WHEN a.sq IS NULL THEN 'added' WHEN b.sq IS NULL THEN 'removed' ELSE 'modified' END AS change,
      a.value AS old_value, b.value AS new_value, a.date AS old_date, b.date AS new_date,
      coalesce(b.counterparty_key, a.counterparty_key) AS counterparty_key,
      coalesce(b.counterparty_name, a.counterparty_name) AS counterparty_name,
      coalesce(b.category, a.category) AS category
    FROM read_parquet(${lit(path.join(a, `${kind}.parquet`))}) a
    FULL JOIN read_parquet(${lit(path.join(b, `${kind}.parquet`))}) b ON a.sq = b.sq AND a.candidate_id = b.candidate_id
    WHERE a.sq IS NULL OR b.sq IS NULL OR a.value <> b.value OR a.lines <> b.lines
      OR a.date IS DISTINCT FROM b.date OR a.counterparty_key IS DISTINCT FROM b.counterparty_key`;
  await con.run(`COPY (${diffTx('revenue')} UNION ALL ${diffTx('expense')}) TO ${lit(out)} (FORMAT parquet)`);
  await con.run(`COPY (
    SELECT coalesce(b.candidate_id, a.candidate_id) AS candidate_id,
      a.filing_type AS old_filing_type, b.filing_type AS new_filing_type,
      a.filing_date AS old_filing_date, b.filing_date AS new_filing_date,
      a.revenue AS old_revenue, b.revenue AS new_revenue, a.expense AS old_expense, b.expense AS new_expense
    FROM read_parquet(${lit(path.join(a, 'campaign.parquet'))}) a
    FULL JOIN read_parquet(${lit(path.join(b, 'campaign.parquet'))}) b ON a.candidate_id = b.candidate_id
    WHERE a.candidate_id IS NULL OR b.candidate_id IS NULL
      OR a.filing_date IS DISTINCT FROM b.filing_date OR a.filing_type IS DISTINCT FROM b.filing_type
      OR a.revenue <> b.revenue OR a.expense <> b.expense
  ) TO ${lit(out.replace('.parquet', '.campaigns.parquet'))} (FORMAT parquet)`);
}

export async function snapshotAndDiff(con, { years = YEARS, root = SNAPSHOT_DIR } = {}) {
  await con.run(`CREATE OR REPLACE TABLE capture (year INT, capture_id VARCHAR, generated_at TIMESTAMP, is_current BOOLEAN)`);
  await con.run(`CREATE OR REPLACE TABLE change_log (year INT, from_capture VARCHAR, to_capture VARCHAR, kind VARCHAR, sq VARCHAR,
    candidate_id VARCHAR, change VARCHAR, old_value DECIMAL(18,2), new_value DECIMAL(18,2), old_date DATE, new_date DATE,
    counterparty_key VARCHAR, counterparty_name VARCHAR, category VARCHAR)`);
  await con.run(`CREATE OR REPLACE TABLE campaign_change (year INT, from_capture VARCHAR, to_capture VARCHAR, candidate_id VARCHAR,
    old_filing_type VARCHAR, new_filing_type VARCHAR, old_filing_date DATE, new_filing_date DATE,
    old_revenue DOUBLE, new_revenue DOUBLE, old_expense DOUBLE, new_expense DOUBLE)`);

  for (const year of years) {
    const generated = await scalar(con, `SELECT strftime(max(generated_at), '%Y-%m-%d %H:%M:%S') FROM filing WHERE year = ${year}`);
    if (!generated) continue;
    const current = captureIdOf(generated);
    const yearDir = path.join(root, String(year));
    const capDir = path.join(yearDir, current);
    if (!fs.existsSync(path.join(capDir, 'campaign.parquet'))) {
      await writeSnapshot(con, year, capDir);
      console.log(`  snapshot ${year}/${current}`);
    }
    const captures = fs.readdirSync(yearDir).filter((d) => /^\d{8}T\d{6}$/.test(d)).sort();
    const changesDir = path.join(yearDir, 'changes');
    fs.mkdirSync(changesDir, { recursive: true });
    for (let i = 1; i < captures.length; i++) {
      const out = path.join(changesDir, `${captures[i - 1]}__${captures[i]}.parquet`);
      if (!fs.existsSync(out)) {
        await writeDiff(con, path.join(yearDir, captures[i - 1]), path.join(yearDir, captures[i]), out);
        console.log(`  diff ${year} ${captures[i - 1]} -> ${captures[i]}`);
      }
      await con.run(`INSERT INTO change_log SELECT ${year}, ${lit(captures[i - 1])}, ${lit(captures[i])}, * FROM read_parquet(${lit(out)})`);
      await con.run(`INSERT INTO campaign_change SELECT ${year}, ${lit(captures[i - 1])}, ${lit(captures[i])}, * FROM read_parquet(${lit(out.replace('.parquet', '.campaigns.parquet'))})`);
    }
    for (const c of captures) {
      const ts = `${c.slice(0, 4)}-${c.slice(4, 6)}-${c.slice(6, 8)} ${c.slice(9, 11)}:${c.slice(11, 13)}:${c.slice(13, 15)}`;
      await con.run(`INSERT INTO capture VALUES (${year}, ${lit(c)}, ${lit(ts)}::TIMESTAMP, ${c === current})`);
    }
  }
}
