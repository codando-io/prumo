import type { SourceInfo } from "@/components/ui/Source";
import { FILING_TYPE, cdnFile, tseCandidateUrl } from "./labels";

type Kind = Parameters<typeof cdnFile>[0];

const DATASET_LABEL: Record<Kind, string> = {
  receitas: "Prestação de contas eleitorais — receitas de candidatos",
  despesas_contratadas: "Prestação de contas eleitorais — despesas contratadas por candidatos",
  despesas_pagas: "Prestação de contas eleitorais — despesas pagas por candidatos",
  candidatos: "Candidatos — consulta de candidaturas",
  bens: "Bens declarados por candidatos",
  votacao: "Votação nominal por município e zona",
};

export function dataset(kind: Kind, year: number, generatedAt?: string | null) {
  const f = cdnFile(kind, year);
  return { label: `${DATASET_LABEL[kind]} (${year})`, file: f.file, zip: f.zip, generatedAt };
}

export interface CandidateRef {
  year: number;
  id: string;
  uf: string;
  filing_type?: string | null;
  filing_date?: string | null;
  finance_generated_at?: string | null;
  generated_at?: string | null;
}

export function filingOf(c: CandidateRef) {
  return c.filing_type && c.filing_date ? { type: FILING_TYPE[c.filing_type] ?? c.filing_type, date: c.filing_date } : null;
}

/** A figure that is a sum/count of the candidate's official records. */
export function officialFinance(
  c: CandidateRef,
  kind: "receitas" | "despesas_contratadas" | "despesas_pagas",
  what: string,
  explore?: { label: string; href: string },
): SourceInfo {
  return {
    kind: "oficial",
    what,
    dataset: dataset(kind, c.year, c.finance_generated_at),
    filing: filingOf(c),
    record: { label: "Ver a prestação no DivulgaCandContas (TSE)", href: tseCandidateUrl(c.year, c.uf, c.id) },
    explore,
  };
}

/** A value Prumo calculated from official records. */
export function calculated(c: CandidateRef | null, kind: Kind, what: string, explore?: { label: string; href: string }, year?: number): SourceInfo {
  const y = c?.year ?? year ?? 2026;
  return {
    kind: "calculo",
    what,
    dataset: dataset(kind, y, kind === "candidatos" || kind === "bens" || kind === "votacao" ? c?.generated_at : c?.finance_generated_at),
    filing: kind === "receitas" || kind.startsWith("despesas") ? (c ? filingOf(c) : null) : null,
    record: c ? { label: "Ver no DivulgaCandContas (TSE)", href: tseCandidateUrl(c.year, c.uf, c.id) } : undefined,
    explore,
  };
}

export function officialRecord(c: CandidateRef, kind: "candidatos" | "bens" | "votacao", what: string, generatedAt?: string | null): SourceInfo {
  return {
    kind: "oficial",
    what,
    dataset: dataset(kind, c.year, generatedAt ?? c.generated_at),
    record: { label: "Ver no DivulgaCandContas (TSE)", href: tseCandidateUrl(c.year, c.uf, c.id) },
  };
}
