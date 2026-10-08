import fs from "node:fs/promises";
import path from "node:path";

// Photos live in the data directory, read at runtime (never traced into the build).
const DATA_DIR = process.env.PRUMO_DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data");

export async function GET(_req: Request, ctx: RouteContext<"/api/foto/[ano]/[id]">) {
  const { ano, id } = await ctx.params;
  if (!/^\d{4}$/.test(ano) || !/^\d{6,14}$/.test(id)) return new Response("Not found", { status: 404 });
  try {
    const buf = await fs.readFile(/*turbopackIgnore: true*/ `${DATA_DIR}/photos/${ano}/${id}.jpg`);
    return new Response(new Uint8Array(buf), {
      headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=86400, stale-while-revalidate=604800" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
