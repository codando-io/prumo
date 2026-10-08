import fs from "node:fs";
import path from "node:path";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

/**
 * Read-only access to data/prumo.duckdb. Imported directly only by the request proxy (src/proxy.ts);
 * everything else goes through ./db, which adds the server-only guard.
 *
 * The ETL builds a new database file and atomically renames it over the old one. We check the
 * file's mtime periodically and reopen when it changes, so a running server picks up new TSE
 * data without a restart. Query results are memoised per database version.
 */

// turbopackIgnore: the data directory is read at runtime and must not be traced into the build.
const DB_PATH = process.env.PRUMO_DB ?? path.join(process.env.PRUMO_DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data"), "prumo.duckdb");
const POOL_SIZE = 4;
const CHECK_EVERY_MS = 30_000;
const MEMO_MAX = 800;
const MEMO_MAX_ROWS = 5000; // large results (exports) are not kept in memory

type Row = Record<string, unknown>;

interface Slot {
  con: DuckDBConnection;
  tail: Promise<unknown>;
  pending: number;
}

interface State {
  instance: DuckDBInstance;
  pool: Slot[];
  mtimeMs: number;
  checkedAt: number;
  version: number;
}

// Kept on globalThis so dev hot-reloads reuse the open database instead of leaking handles.
const g = globalThis as unknown as { __prumoDbState?: Promise<State>; __prumoQueryMemo?: Map<string, { v: number; rows: Row[] }> };
const memo = (g.__prumoQueryMemo ??= new Map());

async function open(version: number): Promise<State> {
  memo.clear();
  const mtimeMs = fs.statSync(/*turbopackIgnore: true*/ DB_PATH).mtimeMs;
  const instance = await DuckDBInstance.create(DB_PATH, { access_mode: "READ_ONLY", threads: "4" });
  const cons = await Promise.all(Array.from({ length: POOL_SIZE }, () => instance.connect()));
  const pool = cons.map((con) => ({ con, tail: Promise.resolve(), pending: 0 }));
  return { instance, pool, mtimeMs, checkedAt: performance.now(), version };
}

async function state(): Promise<State> {
  if (!g.__prumoDbState) g.__prumoDbState = open(1);
  const s = await g.__prumoDbState;
  // performance.now(): a monotonic interval clock (Date.now() is disallowed during prerender).
  const elapsed = performance.now() - s.checkedAt;
  if (elapsed > CHECK_EVERY_MS || elapsed < 0) {
    s.checkedAt = performance.now();
    let mtime = s.mtimeMs;
    try {
      mtime = fs.statSync(/*turbopackIgnore: true*/ DB_PATH).mtimeMs;
    } catch {
      /* file momentarily missing during swap: keep serving the open handle */
    }
    if (mtime !== s.mtimeMs) {
      const fresh = open(s.version + 1);
      g.__prumoDbState = fresh;
      // Close the old instance after in-flight queries have had time to finish.
      setTimeout(() => {
        s.pool.forEach((slot) => slot.con.closeSync());
        s.instance.closeSync();
      }, 60_000).unref?.();
      return fresh;
    }
  }
  return s;
}

function plain(v: unknown): unknown {
  if (typeof v === "bigint") return Number(v);
  if (v instanceof Date) {
    const iso = v.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
  }
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") {
    const o: Row = {};
    for (const [k, x] of Object.entries(v)) o[k] = plain(x);
    return o;
  }
  return v;
}

/** Run a parameterised query (positional `?` params) and return plain JS rows. */
export async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const s = await state();
  const key = `${sql}\u0000${JSON.stringify(params)}`;
  const hit = memo.get(key);
  if (hit && hit.v === s.version) {
    memo.delete(key);
    memo.set(key, hit);
    return hit.rows as T[];
  }
  // Each connection runs one query at a time; pick the least busy one and queue behind it.
  const slot = s.pool.reduce((a, b) => (b.pending < a.pending ? b : a));
  slot.pending++;
  const run = slot.tail.then(() => slot.con.runAndReadAll(sql, params as never));
  slot.tail = run.catch(() => undefined);
  let rows: Row[];
  try {
    rows = (await run).getRowObjectsJS().map((r) => plain(r) as Row);
  } finally {
    slot.pending--;
  }
  if (rows.length <= MEMO_MAX_ROWS) memo.set(key, { v: s.version, rows });
  if (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value!);
  return rows as T[];
}

export async function q1<T = Row>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(sql, params))[0];
}

export function dbPath() {
  return DB_PATH;
}
