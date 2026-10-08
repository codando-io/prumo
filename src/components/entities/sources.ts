import type { SourceInfo } from "@/components/ui/Source";
import { dataset } from "@/lib/provenance";
import { yearsText } from "./parts";

type FinanceKind = "receitas" | "despesas_contratadas" | "despesas_pagas";

/** A sum/count of official TSE records about one counterparty in one election. */
export function entityOfficial(kind: FinanceKind, year: number, generatedAt: string | null, what: string, explore?: { label: string; href: string }): SourceInfo {
  return { kind: "oficial", what, dataset: dataset(kind, year, generatedAt), explore };
}

/** A count or share Prumo calculated from those records. */
export function entityCalc(kind: FinanceKind, year: number, generatedAt: string | null, what: string, explore?: { label: string; href: string }): SourceInfo {
  return { kind: "calculo", what, dataset: dataset(kind, year, generatedAt), explore };
}

/** Sum over several elections (one file per election). */
export function entityOfficialYears(kind: FinanceKind, years: number[], what: string, explore?: { label: string; href: string }): SourceInfo {
  const last = years[years.length - 1] ?? 2026;
  const d = dataset(kind, last);
  return {
    kind: "oficial",
    what,
    dataset: { label: d.label.replace(/\(\d{4}\)$/, `(${yearsText(years)})`) },
    explore,
  };
}
