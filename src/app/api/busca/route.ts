import type { NextRequest } from "next/server";
import { search } from "@/lib/queries/search";

export async function GET(req: NextRequest) {
  const term = req.nextUrl.searchParams.get("q") ?? "";
  const perType = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 4, 50);
  const type = req.nextUrl.searchParams.get("tipo") ?? undefined;
  const rows = await search(term, { perType, type });
  return Response.json(rows);
}
