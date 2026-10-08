import { NextResponse, type NextRequest } from "next/server";
import { isMissingRecord } from "@/lib/route-exists";

/**
 * Real 404s for unknown records. Detail pages are partially prerendered, so their static shell is
 * sent (with status 200) before the page can call notFound(). Checking existence here, before the
 * page renders, lets an unknown candidacy, company or party answer 404 — rewritten to a path no
 * route matches, which renders app/not-found.tsx with that status.
 */
export async function proxy(request: NextRequest) {
  try {
    if (await isMissingRecord(request.nextUrl.pathname)) {
      return NextResponse.rewrite(new URL("/_registro-inexistente", request.url));
    }
  } catch {
    // The database may be missing or being swapped: let the page handle it.
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/candidatos/:ano/:id/:path*", "/empresas/:cnpj", "/fornecedores/:key", "/doadores/:key", "/partidos/:sigla", "/estados/:uf/:path*"],
};
