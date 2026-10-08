// One place that decides where a counterparty link goes, so every page follows the same path:
// party bodies → party, campaign accounts → that candidacy, everyone else → donor/supplier profile.

export function counterpartHref(
  e: { key: string | null; kind?: string | null; party?: string | null; campaign_candidate_id?: string | null; donor_type?: string | null },
  role: "doador" | "fornecedor",
  year: number,
): string | undefined {
  if (!e.key || e.donor_type === "proprio") return undefined;
  if (e.kind === "partido" && e.party) return `/partidos/${encodeURIComponent(e.party)}?ano=${year}`;
  if (e.kind === "campanha" && e.campaign_candidate_id) return `/candidatos/${year}/${e.campaign_candidate_id}`;
  return role === "doador" ? `/doadores/${e.key}?ano=${year}` : `/fornecedores/${e.key}?ano=${year}`;
}

export function candidateHref(year: number, id: string) {
  return `/candidatos/${year}/${id}`;
}

export function txHref(params: Record<string, string | number | undefined | null>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  return `/transacoes?${u.toString()}`;
}
