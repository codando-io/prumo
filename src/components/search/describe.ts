import { brlc, num, numc, titleName } from "@/lib/format";
import { resultLabel } from "@/lib/labels";

/*
 * How a search hit describes itself: what it is (hitKind) and why it matters (hitFacts).
 * Pure functions, shared by the server results page and the client palette and pickers.
 */

export interface Hit {
  type: string;
  key: string;
  year: number | null;
  label: string;
  kind: string | null;
  context: string | null;
  extra: string | null;
  value: number | null;
  n1: number | null;
  n2: number | null;
  href: string;
}

export const TYPE_NAME: Record<string, string> = {
  eleicao: "Eleição",
  candidato: "Candidatura",
  partido: "Partido",
  fornecedor: "Fornecedor",
  doador: "Doador",
  estado: "Estado",
  municipio: "Município",
};

const GROUP_ORDER = ["eleicao", "candidato", "partido", "fornecedor", "doador", "estado", "municipio"];
const GROUP_NAME: Record<string, string> = {
  eleicao: "Eleições",
  candidato: "Candidaturas",
  partido: "Partidos",
  fornecedor: "Fornecedores",
  doador: "Doadores",
  estado: "Estados",
  municipio: "Municípios",
};

export function groupHits(hits: Hit[]) {
  return GROUP_ORDER.map((t) => ({ type: t, name: GROUP_NAME[t], hits: hits.filter((h) => h.type === t) })).filter((g) => g.hits.length);
}

/** The line that says what an entity is (type + kind). */
export function hitKind(h: Hit) {
  switch (h.type) {
    case "candidato":
      return `Candidatura · ${h.context ?? ""}`;
    case "fornecedor":
      return `Fornecedor · ${h.kind ?? ""}`;
    case "doador":
      return `Doador · ${h.kind ?? ""}${h.extra && h.kind === "Órgão partidário" ? ` (${h.extra})` : ""}`;
    case "partido":
      return `Partido · ${titleName(h.context)}`;
    case "estado":
      return "Estado";
    case "municipio":
      return `Município · ${h.context ?? h.extra ?? ""}`;
    case "eleicao":
      return `Eleição · ${h.context ?? ""}`;
    default:
      return TYPE_NAME[h.type] ?? h.type;
  }
}

/** The line that says why it matters (quantities). */
export function hitFacts(h: Hit): string | null {
  const plural = (n: number | null, one: string, many: string) => `${num(n ?? 0)} ${n === 1 ? one : many}`;
  switch (h.type) {
    case "candidato": {
      const r = resultLabel(h.extra, h.year ?? 0).label;
      const parts = [h.n1 ? `${numc(h.n1)} votos` : null, h.value ? `${brlc(h.value)} em despesas` : null, r !== "Sem resultado de votação" ? r.toLowerCase() : null];
      return parts.filter(Boolean).join(", ") || null;
    }
    case "fornecedor":
      return h.value ? `Recebeu ${brlc(h.value)} de ${plural(h.n1, "campanha", "campanhas")}${h.n2 ? `; também doou a ${plural(h.n2, "campanha", "campanhas")}` : ""}` : null;
    case "doador":
      return h.value ? `Doou ${brlc(h.value)} a ${plural(h.n1, "candidatura", "candidaturas")}${h.n2 ? `; também forneceu a ${plural(h.n2, "campanha", "campanhas")}` : ""}` : null;
    case "partido":
      return h.value ? `${brlc(h.value)} em receitas de ${plural(h.n1, "candidatura", "candidaturas")} em ${h.year}` : null;
    case "estado":
      return h.value ? `${plural(h.n1, "candidatura", "candidaturas")}, ${brlc(h.value)} em despesas em ${h.year}` : null;
    case "eleicao":
      return h.value ? `${plural(h.n1, "candidatura", "candidaturas")}, ${brlc(h.value)} em receitas declaradas` : null;
    default:
      return null;
  }
}

/** Entity names arrive in the TSE's upper case; places and parties keep their own casing. */
export function hitLabel(h: Hit) {
  return h.type === "candidato" || h.type === "fornecedor" || h.type === "doador" ? titleName(h.label) : h.label;
}
