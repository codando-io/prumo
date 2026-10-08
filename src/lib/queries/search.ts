import "server-only";
import { q } from "../db";

export interface SearchRow {
  type: string; // candidato | partido | fornecedor | doador | estado | municipio | eleicao
  key: string;
  year: number | null;
  label: string;
  kind: string | null; // office, entity kind…
  context: string | null; // short identifying line (office/state/party/year, CNPJ, party name…)
  extra: string | null; // candidate result, party of a party body, UF of a municipality
  value: number | null; // money: expense (candidates), received (suppliers), donated (donors)…
  n1: number | null; // votes (candidates), campaigns served/supported, candidacies
  n2: number | null; // secondary count (e.g. a supplier's donations)
  href: string;
}

export function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[%_\\]/g, " ")
    .trim();
}

export function hrefFor(type: string, key: string, year: number | null) {
  switch (type) {
    case "candidato":
      return `/candidatos/${year}/${key}`;
    case "partido":
      return `/partidos/${encodeURIComponent(key)}`;
    case "doador":
      return `/doadores/${key}`;
    case "fornecedor":
      return `/fornecedores/${key}`;
    case "estado":
      return `/estados/${key}`;
    case "municipio": {
      const [uf, code] = key.split("-");
      return `/estados/${uf}/${code}`;
    }
    case "eleicao":
      return `/?ano=${key}`;
    default:
      return "/";
  }
}

function match(term: string) {
  const norm = normalize(term);
  const words = norm.split(/\s+/).filter((w) => w.length > 0).slice(0, 6);
  if (!words.length || norm.length < 2) return null;
  const digits = norm.replace(/\D/g, "");
  let where = words.map(() => "haystack LIKE ?").join(" AND ");
  const params: unknown[] = words.map((w) => `%${w}%`);
  if (digits.length >= 8) {
    // a CNPJ typed with punctuation should still match
    where = `(${where}) OR haystack LIKE ?`;
    params.push(`%${digits}%`);
  }
  return { norm, where, params };
}

/**
 * Accent-insensitive search. Every word must appear; names starting with the query rank
 * first, then by prominence (votes and money). `perType` caps results per entity type.
 */
export async function search(term: string, { perType = 4, type }: { perType?: number; type?: string } = {}): Promise<SearchRow[]> {
  const m = match(term);
  if (!m) return [];
  // Params are pushed in the same order as their placeholders appear in the SQL.
  const params: unknown[] = [m.norm, m.norm, ...m.params];
  let typeCond = "";
  if (type) {
    typeCond = "AND type = ?";
    params.push(type);
  }
  params.push(perType);
  const rows = await q<Omit<SearchRow, "href"> & { prefix: number }>(
    `SELECT type, key, year, label, kind, context, extra, value, n1, n2, prefix FROM (
       SELECT type, key, year, label, kind, context, extra, value, n1, n2,
         CASE WHEN haystack LIKE ? || '%' THEN 2 WHEN haystack LIKE '% ' || ? || '%' THEN 1 ELSE 0 END AS prefix,
         weight
       FROM search_index
       WHERE (${m.where}) ${typeCond}
     )
     QUALIFY row_number() OVER (PARTITION BY type ORDER BY prefix DESC, weight DESC) <= ?
     ORDER BY CASE type WHEN 'eleicao' THEN 0 WHEN 'candidato' THEN 1 WHEN 'partido' THEN 2 WHEN 'estado' THEN 3
       WHEN 'fornecedor' THEN 4 WHEN 'doador' THEN 5 ELSE 6 END,
       prefix DESC, weight DESC`,
    params,
  );
  return rows.map((r) => ({ ...r, href: hrefFor(r.type, r.key, r.year) }));
}

/** How many entities of each type match (for the results page tabs). */
export async function searchCounts(term: string): Promise<Record<string, number>> {
  const m = match(term);
  if (!m) return {};
  const rows = await q<{ type: string; n: number }>(`SELECT type, count(*)::INT AS n FROM search_index WHERE (${m.where}) GROUP BY type`, m.params);
  return Object.fromEntries(rows.map((r) => [r.type, r.n]));
}
