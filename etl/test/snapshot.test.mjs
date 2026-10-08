// Verifies change detection between two captures using a synthetic "previous" capture
// derived from the current one (rows removed / modified / added). Runs in a temp dir and
// never touches data/snapshots.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DuckDBInstance } from '@duckdb/node-api';
import { DB_PATH } from '../config.mjs';
import { snapshotAndDiff } from '../snapshot.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo-snap-'));
const inst = await DuckDBInstance.create(':memory:');
const con = await inst.connect();
await con.run(`ATTACH '${DB_PATH}' AS src (READ_ONLY)`);
for (const t of ['revenue', 'expense', 'candidate_summary', 'filing']) {
  await con.run(`CREATE VIEW ${t} AS SELECT * FROM src.${t} WHERE year = 2026`);
}

// 1st pass: writes the current capture.
await snapshotAndDiff(con, { years: [2026], root });
const [cur] = fs.readdirSync(path.join(root, '2026')).filter((d) => /T/.test(d));

// Fabricate an *earlier* capture: drop 5 revenue rows (=> "added" now), change 3 values
// (=> "modified"), and add 2 rows that no longer exist (=> "removed").
const prev = '20260101T000000';
const p = path.join(root, '2026', prev);
fs.mkdirSync(p);
const c = path.join(root, '2026', cur);
await con.run(`COPY (
  WITH r AS (SELECT *, row_number() OVER (ORDER BY sq) AS i FROM read_parquet('${c}/revenue.parquet'))
  SELECT * EXCLUDE (i) REPLACE (CASE WHEN i BETWEEN 6 AND 8 THEN value + 1 ELSE value END AS value) FROM r WHERE i > 5
  UNION ALL
  (SELECT * REPLACE ('ghost-' || sq AS sq) FROM read_parquet('${c}/revenue.parquet') LIMIT 2)
) TO '${p}/revenue.parquet' (FORMAT parquet)`);
fs.copyFileSync(`${c}/expense.parquet`, `${p}/expense.parquet`);
await con.run(`COPY (SELECT * REPLACE (CASE WHEN row_number() OVER () = 1 THEN revenue - 100 ELSE revenue END AS revenue) FROM read_parquet('${c}/campaign.parquet'))
  TO '${p}/campaign.parquet' (FORMAT parquet)`);

await snapshotAndDiff(con, { years: [2026], root });
const rows = (await con.runAndReadAll(`SELECT change, count(*)::INT AS n FROM change_log GROUP BY 1 ORDER BY 1`)).getRowObjectsJson();
const byChange = Object.fromEntries(rows.map((r) => [r.change, r.n]));
assert.equal(byChange.added, 5, 'added');
assert.equal(byChange.modified, 3, 'modified');
assert.equal(byChange.removed, 2, 'removed');
const camp = (await con.runAndReadAll(`SELECT count(*)::INT AS n FROM campaign_change`)).getRowObjectsJson()[0].n;
assert.equal(camp, 1, 'campaign-level change');
const caps = (await con.runAndReadAll(`SELECT count(*)::INT AS n, count(*) FILTER (WHERE is_current)::INT AS cur FROM capture`)).getRowObjectsJson()[0];
assert.deepEqual(caps, { n: 2, cur: 1 });
fs.rmSync(root, { recursive: true, force: true });
console.log('snapshot diff test passed', byChange);
