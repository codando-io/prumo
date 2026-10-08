// Display helpers for transaction rows. Pure functions — safe on server and client.
import { DONOR_TYPE, ENTITY_KIND, EXPENSE_GROUPS, FUNDING_GROUPS, REVENUE_CATEGORY, fundingGroupOf } from "@/lib/labels";

interface RowLike {
  tipo: "receita" | "despesa";
  year: number;
  candidate_id: string;
  key: string | null;
  kind: string | null;
  donor_type: string | null;
  entity_party: string | null;
  campaign_candidate_id: string | null;
  campaign_year: number | null;
  category: string | null;
  category_group: string | null;
}

/** Where a counterparty name links to: party body, other campaign, donor or supplier page. */
export function counterpartyHref(r: RowLike): string | undefined {
  if (!r.key) return undefined;
  if (r.tipo === "receita" && r.donor_type === "proprio") return `/candidatos/${r.year}/${r.candidate_id}`;
  if (r.kind === "partido" && r.entity_party) return `/partidos/${encodeURIComponent(r.entity_party)}?ano=${r.year}`;
  if (r.kind === "campanha" && r.campaign_candidate_id) return `/candidatos/${r.campaign_year ?? r.year}/${r.campaign_candidate_id}`;
  return r.tipo === "receita" ? `/doadores/${r.key}?ano=${r.year}` : `/fornecedores/${r.key}?ano=${r.year}`;
}

/** "Empresa", "Pessoa física", "Órgão partidário", "O próprio candidato"… */
export function counterpartyKind(r: RowLike): string {
  if (r.tipo === "receita" && r.donor_type === "proprio") return DONOR_TYPE.proprio;
  if (r.kind) return ENTITY_KIND[r.kind] ?? "";
  if (r.tipo === "receita" && r.donor_type) return DONOR_TYPE[r.donor_type] ?? "";
  return "";
}

/** Main category label: the funding group for revenues (or the finer category when the group is "outras"), the official TSE category for expenses. */
export function categoryLabel(r: RowLike): string {
  if (!r.category) return "—";
  if (r.tipo === "despesa") return r.category;
  const g = fundingGroupOf(r.category);
  return g === "outras" ? (REVENUE_CATEGORY[r.category]?.label ?? r.category) : (FUNDING_GROUPS.find((x) => x.key === g)?.label ?? r.category);
}

/** Secondary label: the expense group; for revenues, the official category name when it differs. */
export function categorySub(r: RowLike): string | null {
  if (r.tipo === "despesa") return r.category_group ? (EXPENSE_GROUPS[r.category_group]?.label ?? null) : null;
  return null;
}

export function categoryColor(r: RowLike): string {
  if (r.tipo === "despesa") return "var(--spend)";
  return FUNDING_GROUPS.find((g) => g.key === fundingGroupOf(r.category ?? ""))?.color ?? "var(--fund-outras)";
}
