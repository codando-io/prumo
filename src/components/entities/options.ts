import { EXPENSE_GROUPS, UF_NAMES } from "@/lib/labels";

/*
 * Filter vocabularies shared by the donor and supplier lists. Pure data. The "all" choice is
 * the empty value, added by the filter row itself (`allLabel`).
 */

/** States of the candidacies (BR = national offices, i.e. President). */
export const UF_OPTIONS = [
  { value: "BR", label: "Brasil (Presidente)" },
  ...Object.entries(UF_NAMES)
    .filter(([k]) => k !== "BR" && k !== "ZZ")
    .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))
    .map(([k, v]) => ({ value: k, label: v })),
];
export const UF_KEYS = UF_OPTIONS.map((o) => o.value);

export const DONOR_KINDS = ["pf", "pj", "partido", "plataforma", "campanha"] as const;
export const DONOR_KIND_OPTIONS = [
  { value: "pf", label: "Pessoas físicas" },
  { value: "pj", label: "Empresas" },
  { value: "partido", label: "Órgãos partidários" },
  { value: "plataforma", label: "Financiamento coletivo" },
  { value: "campanha", label: "Outras campanhas" },
];

export const DONOR_SORTS = ["valor", "candidatos", "doacoes", "indireto"] as const;
/** The default order ("valor") is the empty value. */
export const DONOR_SORT_DEFAULT = "Valor doado";
export const DONOR_SORT_OPTIONS = [
  { value: "candidatos", label: "Nº de candidaturas" },
  { value: "doacoes", label: "Nº de doações" },
  { value: "indireto", label: "Doações indiretas" },
];

export const SUPPLIER_KINDS = ["pf", "pj"] as const;
export const SUPPLIER_KIND_OPTIONS = [
  { value: "pf", label: "Pessoas físicas" },
  { value: "pj", label: "Empresas" },
];

export const SUPPLIER_SORTS = ["valor", "candidatos", "partidos"] as const;
export const SUPPLIER_SORT_DEFAULT = "Valor contratado";
export const SUPPLIER_SORT_OPTIONS = [
  { value: "candidatos", label: "Nº de campanhas" },
  { value: "partidos", label: "Nº de partidos" },
];

export const GROUP_KEYS = Object.keys(EXPENSE_GROUPS);
export const GROUP_OPTIONS = Object.entries(EXPENSE_GROUPS).map(([k, v]) => ({ value: k, label: v.label }));

/** Nouns for a list filtered by kind: [one, many, feminine]. */
export const KIND_NOUN: Record<string, [string, string, boolean]> = {
  pf: ["pessoa física", "pessoas físicas", true],
  pj: ["empresa", "empresas", true],
  partido: ["órgão partidário", "órgãos partidários", false],
  plataforma: ["plataforma de financiamento coletivo", "plataformas de financiamento coletivo", true],
  campanha: ["conta de campanha", "contas de campanha", true],
};

export function ufLabel(uf: string) {
  return uf === "BR" ? "Brasil (Presidente)" : (UF_NAMES[uf] ?? uf);
}

// States whose names take an article in Portuguese ("no Rio de Janeiro", "na Bahia").
const UF_NO = new Set(["AC", "AM", "AP", "CE", "DF", "ES", "MA", "MS", "MT", "PA", "PI", "PR", "RJ", "RN", "RS", "TO"]);
const UF_NA = new Set(["BA", "PB"]);

/** "em São Paulo", "no Rio de Janeiro", "na Bahia" */
export function inUf(uf: string) {
  const name = UF_NAMES[uf] ?? uf;
  return `${UF_NO.has(uf) ? "no" : UF_NA.has(uf) ? "na" : "em"} ${name}`;
}
