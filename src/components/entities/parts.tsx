import Link from "next/link";
import { Container } from "@/components/ui/primitives";
import { ENTITY_KIND, YEARS } from "@/lib/labels";
import { titleName } from "@/lib/format";
import type { Candidacy, EntityLite } from "@/lib/queries/entities";
import { ufLabel } from "./options";

/* Building blocks shared by the donor and supplier explorers (server components). */

/** "2018", "2018 e 2022", "2018, 2022 e 2026" */
export function yearsText(items: readonly (number | string)[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/** "SP, RJ e MG" / "SP, RJ, Brasil e outros" for the states of supported candidacies. */
export function ufListText(ufs: string[]) {
  const shown = ufs.slice(0, 3).map((u) => (u === "BR" ? "Brasil" : u));
  return ufs.length > 3 ? `${shown.join(", ")} e outros` : yearsText(shown);
}

/** Lower-case only the first letter, so acronyms survive inside a sentence ("rádio, TV e vídeo"). */
export function lcFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** First value of a search param, trimmed; undefined when empty. */
export function param(v: string | string[] | undefined): string | undefined {
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s : undefined;
}

export function pickOne<T extends string>(v: string | undefined, allowed: readonly T[]): T | undefined {
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

export function pageNumber(v: string | undefined) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 100000) : 1;
}

/** Build a URL keeping only non-empty params. */
export function hrefWith(path: string, params: Record<string, string | number | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

/** "Belo Horizonte, MG" / "Minas Gerais" / null. */
export function placeOf(e: Pick<EntityLite, "city" | "uf">) {
  if (e.city) return `${titleName(e.city)}${e.uf && e.uf !== "BR" ? `, ${e.uf}` : ""}`;
  if (e.uf && e.uf !== "BR" && e.uf !== "ZZ") return ufLabel(e.uf);
  return null;
}

/**
 * The first words of a profile's lede: what kind of counterparty this is and where it is
 * registered ("Empresa de Belo Horizonte, MG."). A campaign account names its candidacy.
 */
export function WhoSentence({ e, owner, year }: { e: EntityLite; owner?: Candidacy; year: number }) {
  const place = placeOf(e);
  if (e.kind === "campanha" && owner)
    return (
      <>
        Conta bancária da campanha de{" "}
        <Link href={`/candidatos/${owner.year}/${owner.id}`} className="link text-ink">
          {titleName(owner.ballot_name)}
        </Link>{" "}
        ({owner.office}
        {owner.uf !== "BR" ? `, ${owner.uf}` : ""}, {owner.party}, {owner.year}).
      </>
    );
  if (e.kind === "partido")
    return (
      <>
        Órgão partidário
        {e.party && (
          <>
            {" "}
            do{" "}
            <Link href={`/partidos/${encodeURIComponent(e.party)}?ano=${year}`} className="link text-ink">
              {e.party}
            </Link>
          </>
        )}
        {e.uf === "BR" ? ", de âmbito nacional" : place ? `, ${place}` : ""}.
      </>
    );
  const kind = ENTITY_KIND[e.kind] ?? "Registro não identificado";
  return (
    <>
      {kind}
      {place ? ` de ${place}` : ""}.
    </>
  );
}

/**
 * Election switch for a profile. Same look as the editorial `YearTabs`, but elections without
 * records stay visible and are not linked, so the reader can see where the entity appears.
 */
export function ProfileYears({ year, active, hrefFor }: { year: number; active: readonly number[]; hrefFor: (year: number) => string }) {
  return (
    <nav aria-label="Eleição" className="flex items-baseline gap-4 text-[15px]">
      {YEARS.map((y) => {
        const on = y === year;
        if (!on && !active.includes(y))
          return (
            <span key={y} className="tnum border-b border-transparent pb-0.5 text-muted opacity-60" title={`Sem registros em ${y}`}>
              {y}
              <span className="sr-only"> (sem registros)</span>
            </span>
          );
        return (
          <Link
            key={y}
            href={hrefFor(y)}
            aria-current={on ? "true" : undefined}
            scroll={false}
            className={`tnum border-b pb-0.5 no-underline ${on ? "border-accent font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
          >
            {y}
          </Link>
        );
      })}
    </nav>
  );
}

/** Plain-text loading state (no skeleton boxes). */
export function Loading({ label = "Carregando…", section = false }: { label?: string; section?: boolean }) {
  return (
    <div className={section ? "section" : "mt-8"} aria-busy="true">
      <p className="text-[15px] text-muted">{label}</p>
    </div>
  );
}

export function ProfileLoading({ label }: { label: string }) {
  return (
    <Container>
      <div className="pt-10" aria-busy="true">
        <p className="text-[15px] text-muted">{label}</p>
      </div>
    </Container>
  );
}

/** Party link (parties never get a colour). */
export function PartyLink({ party, year, className = "action" }: { party: string | null; year: number; className?: string }) {
  if (!party) return <span className="text-muted">—</span>;
  return (
    <Link className={className} href={`/partidos/${encodeURIComponent(party)}?ano=${year}`}>
      {party}
    </Link>
  );
}
