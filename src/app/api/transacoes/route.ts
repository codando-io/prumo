import fs, { type FileHandle } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import {
  CSV_MAX_ROWS,
  exportTransactionsCsv,
  getTransactionTotals,
  getTransactions,
  parseTxFilters,
  txParams,
  type TxFilters,
} from "@/lib/queries/transactions";

/**
 * GET /api/transacoes — same filters as /transacoes.
 *   formato=json (default): { total, value, page, pageSize, pages, filters, rows } for one page.
 *   formato=csv: every matching transaction (up to 200.000, in the chosen order) as a download.
 *     UTF-8 with BOM, `;` separator, decimal comma, ISO dates (AAAA-MM-DD), header row.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const f = parseTxFilters(sp);
  const formato = sp.get("formato") ?? "json";

  if (formato === "csv") return csv(f);
  if (formato !== "json") return Response.json({ error: "formato deve ser json ou csv" }, { status: 400 });

  const res = await getTransactions(f);
  return Response.json(
    { ...res, filters: Object.fromEntries(txParams(f)) },
    { headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" } },
  );
}

function fileName(f: TxFilters) {
  const parts = ["prumo-transacoes", String(f.year)];
  if (f.tipo) parts.push(f.tipo === "receita" ? "receitas" : "despesas");
  if (f.candidato) parts.push(f.candidato);
  if (f.contraparte) parts.push(f.contraparte);
  if (f.sq) parts.push(`sq${f.sq}`);
  if (f.grupo) parts.push(f.grupo);
  if (f.uf) parts.push(f.uf.toLowerCase());
  if (f.partido)
    parts.push(
      f.partido
        .toLowerCase()
        .normalize("NFD")
        .replace(/[^a-z0-9]/g, ""),
    );
  return `${parts.join("-")}.csv`;
}

async function csv(f: TxFilters) {
  // The export is written by DuckDB to a private temp file and streamed from there, so even a
  // 200.000-row download never sits in memory. The file is unlinked as soon as it is open.
  const tmp = path.join(os.tmpdir(), `prumo-tx-${randomUUID()}.csv`);
  let rows: number;
  let total: number;
  let handle: FileHandle;
  try {
    [rows, { total }] = await Promise.all([exportTransactionsCsv({ ...f, pagina: 1 }, tmp), getTransactionTotals(f)]);
    handle = await fs.open(tmp, "r");
  } finally {
    await fs.unlink(tmp).catch(() => undefined);
  }

  const BOM = new Uint8Array([0xef, 0xbb, 0xbf]);
  const buf = new Uint8Array(64 * 1024);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(BOM);
    },
    async pull(controller) {
      try {
        const { bytesRead } = await handle.read(buf, 0, buf.length, null);
        if (bytesRead === 0) {
          await handle.close();
          controller.close();
        } else {
          controller.enqueue(buf.slice(0, bytesRead));
        }
      } catch (err) {
        await handle.close().catch(() => undefined);
        controller.error(err);
      }
    },
    async cancel() {
      await handle.close().catch(() => undefined);
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName(f)}"`,
      "cache-control": "no-store",
      "x-prumo-linhas": String(rows),
      "x-prumo-total": String(total),
      "x-prumo-truncado": total > CSV_MAX_ROWS ? "1" : "0",
    },
  });
}
