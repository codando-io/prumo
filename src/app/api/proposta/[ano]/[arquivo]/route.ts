import fs from "node:fs/promises";
import path from "node:path";

// The original government-plan PDFs as filed with the TSE, served unchanged (data/proposals).
const DATA_DIR = process.env.PRUMO_DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data");

export async function GET(_req: Request, ctx: RouteContext<"/api/proposta/[ano]/[arquivo]">) {
  const { ano, arquivo } = await ctx.params;
  if (!/^\d{4}$/.test(ano) || !/^\d{6,14}_\d{1,2}\.pdf$/.test(arquivo)) return new Response("Not found", { status: 404 });
  try {
    const buf = await fs.readFile(/*turbopackIgnore: true*/ `${DATA_DIR}/proposals/${ano}/${arquivo}`);
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="proposta-de-governo-${ano}-${arquivo}"`,
        "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
