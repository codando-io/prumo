import { titleName } from "@/lib/format";

/*
 * How a party names itself on the page. Every party is presented the same way: full name
 * followed by the sigla, unless the official name is the sigla itself (Avante, Cidadania…).
 */

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();

/** "PARTIDO DOS TRABALHADORES" → "Partido dos Trabalhadores" (whitespace normalised). */
export function partyFullName(name: string | null | undefined): string {
  return titleName((name ?? "").replace(/\s+/g, " ").trim());
}

/** True when the official name adds nothing to the sigla ("SOLIDARIEDADE" / "SOLIDARIEDADE"). */
export function nameIsSigla(sigla: string, name: string | null | undefined): boolean {
  return !name || fold(name) === fold(sigla);
}

/** Page title: "Partido dos Trabalhadores (PT)", or just "Avante". */
export function partyTitle(sigla: string, name: string | null | undefined): string {
  return nameIsSigla(sigla, name) ? partyFullName(name) || sigla : `${partyFullName(name)} (${sigla})`;
}

/**
 * "FEDERAÇÃO BRASIL DA ESPERANÇA - FE BRASIL" → "Brasil da Esperança (FE BRASIL)". The TSE spells
 * the same federation in upper or mixed case, so it is upper-cased first; the short name after
 * the dash is an acronym and stays as published.
 */
export function federationName(name: string | null | undefined): string | null {
  if (!name) return null;
  const [main, short] = name
    .toUpperCase()
    .replace(/^FEDERA[ÇC][ÃA]O\s+/, "")
    .split(/\s+-\s+/, 2);
  return short ? `${titleName(main)} (${short})` : titleName(main);
}
