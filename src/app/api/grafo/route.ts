import type { NextRequest } from "next/server";
import { expand } from "@/lib/queries/graph";
import { parseYear } from "@/lib/labels";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const node = sp.get("no") ?? "";
  if (!/^(c:\d{4}:\d{5,14}|e:[a-z0-9]{2,20}|p:.{1,40}|s:[a-z0-9]{2,40}|g:\d{14}|r:[A-Za-zÀ-ú ]{3,30}:[\w.\/-]{1,40}|y:\d{4}|d:\d{4}:\d{5,14}|t:\d{4}:\d{5,14}:[a-z]{2,20})$/.test(node)) return Response.json({ error: "nó inválido" }, { status: 400 });
  const year = parseYear(sp.get("ano"));
  const limit = Math.min(Math.max(Number(sp.get("limite")) || 12, 3), 40);
  return Response.json(await expand(node, year, limit));
}
