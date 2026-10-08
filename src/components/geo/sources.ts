import type { SourceInfo } from "@/components/ui/Source";
import { dataset } from "@/lib/provenance";

/*
 * Provenance for aggregate figures (party, state, municipality pages), which are sums over
 * many candidacies rather than one campaign's filing. Pure helpers, safe anywhere.
 */

type Kind = Parameters<typeof dataset>[0];
type Explore = { label: string; href: string };

/** A plain sum or count of official TSE records. */
export function officialSum(kind: Kind, year: number, generatedAt: string | null | undefined, what: string, explore?: Explore): SourceInfo {
  return { kind: "oficial", what, dataset: dataset(kind, year, generatedAt), explore };
}

/** A share, ratio, index or other calculation Prumo made from official records. */
export function calculation(kind: Kind, year: number, generatedAt: string | null | undefined, what: string, explore?: Explore): SourceInfo {
  return { kind: "calculo", what, dataset: dataset(kind, year, generatedAt), explore };
}
