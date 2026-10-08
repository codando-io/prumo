import Link from "next/link";
import { Caption } from "@/components/ui/editorial";
import { brlc, num, pct, titleName } from "@/lib/format";
import { PartyLink } from "./parts";

/* Tables shared by the donor and supplier profiles (server components, `.dt` style). */

const nameLink = "e no-underline hover:underline";

/** "Ver as 42 candidaturas" disclosure under a table (reference: candidate Votes/Assets). */
export function More({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="mt-3">
      <summary className="action cursor-pointer list-none text-[14.5px] [&::-webkit-details-marker]:hidden">{label}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

export interface CampaignRow {
  id: string;
  name: string;
  office: string;
  uf: string;
  party: string;
  value: number;
  n: number;
  /** Shares 0..1 for the two percentage columns, in order: of the entity's total, of the campaign's total. */
  shares: [number | null, number | null];
  /** Extra context for the secondary line ("recursos próprios", "principalmente material impresso"). */
  note?: string;
}

/**
 * Every campaign that received from (or contracted) this entity in one election. The first rows
 * are shown; the rest open below. Each row leads to the candidacy, its party and the transactions.
 */
export function CampaignTable({
  rows,
  total,
  year,
  head,
  nLabel,
  shareLabels,
  txHref,
  allTx,
  noun,
  noteOnPhones = true,
  top = 15,
}: {
  rows: CampaignRow[];
  /** Number of campaigns in the data (rows may be capped by the query). */
  total: number;
  year: number;
  head: string;
  nLabel: string;
  shareLabels: [string, string];
  txHref: (candidateId: string) => string;
  allTx: string;
  /** Plural, feminine ("candidaturas", "campanhas"). */
  noun: string;
  /** Long notes can be left out on phones, where the name column is narrow. */
  noteOnPhones?: boolean;
  top?: number;
}) {
  if (!rows.length) return null;
  const shown = rows.slice(0, top);
  const rest = rows.slice(top);
  const table = (items: CampaignRow[]) => (
    <table className="dt">
      <thead>
        <tr>
          <th scope="col">{head}</th>
          <th scope="col" className="n hidden sm:table-cell">
            {nLabel}
          </th>
          <th scope="col" className="n">
            Valor
          </th>
          <th scope="col" className="n">
            <span className="sm:hidden">Do total</span>
            <span className="hidden sm:inline">{shareLabels[0]}</span>
          </th>
          <th scope="col" className="n hidden md:table-cell">
            {shareLabels[1]}
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((r) => (
          <tr key={r.id}>
            <td>
              <Link className={nameLink} href={`/candidatos/${year}/${r.id}`}>
                {titleName(r.name)}
              </Link>
              <div className="s text-[13.5px]">
                {r.office}
                {r.uf !== "BR" ? ` (${r.uf})` : ""}, <PartyLink party={r.party} year={year} />
                {r.note && <span className={noteOnPhones ? "" : "hidden sm:inline"}>, {r.note}</span>}
              </div>
            </td>
            <td className="n s hidden sm:table-cell">
              <Link className="action" href={txHref(r.id)} title="Ver as transações">
                {num(r.n)}
              </Link>
            </td>
            <td className="n text-ink">{brlc(r.value)}</td>
            <td className="n s">{r.shares[0] == null ? "—" : pct(r.shares[0])}</td>
            <td className="n s hidden md:table-cell">{r.shares[1] == null ? "—" : pct(r.shares[1])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <div>
      {table(shown)}
      {rest.length > 0 && <More label={total > rows.length ? `Ver mais ${num(rest.length)} ${noun}` : `Ver as outras ${num(rest.length)} ${noun}`}>{table(rest)}</More>}
      {total > rows.length && (
        <Caption>
          A lista mostra as {num(rows.length)} maiores de {num(total)}.{" "}
          <Link className="link" href={allTx}>
            As demais estão nas transações
          </Link>
          .
        </Caption>
      )}
    </div>
  );
}

export interface ShareRow {
  key: string;
  label: string;
  href?: string;
  sub?: React.ReactNode;
  value: number;
  share: number | null;
}

/** A short ranked table (parties, states, intermediaries): name, value and share of the total. */
export function ShareTable({ rows, head, shareLabel = "Do total", top = 10, moreNoun }: { rows: ShareRow[]; head: string; shareLabel?: string; top?: number; moreNoun: string }) {
  if (!rows.length) return null;
  const table = (items: ShareRow[]) => (
    <table className="dt">
      <thead>
        <tr>
          <th scope="col">{head}</th>
          <th scope="col" className="n">
            Valor
          </th>
          <th scope="col" className="n">
            {shareLabel}
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((r) => (
          <tr key={r.key}>
            <td>
              {r.href ? (
                <Link className={nameLink} href={r.href}>
                  {r.label}
                </Link>
              ) : (
                <span className="e">{r.label}</span>
              )}
              {r.sub && <div className="s text-[13.5px]">{r.sub}</div>}
            </td>
            <td className="n text-ink">{brlc(r.value)}</td>
            <td className="n s">{r.share == null ? "—" : pct(r.share)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <div>
      {table(rows.slice(0, top))}
      {rows.length > top && <More label={`Ver os outros ${num(rows.length - top)} ${moreNoun}`}>{table(rows.slice(top))}</More>}
    </div>
  );
}

export interface YearRowSpec<T> {
  label: string;
  render: (r: T) => React.ReactNode;
}

/** One column per election, one row per measure (same form as the candidate history table). */
export function YearsTable<T extends { year: number }>({
  data,
  focus,
  rows,
  hrefFor,
  sections,
}: {
  data: T[];
  focus: number;
  rows: YearRowSpec<T>[];
  hrefFor: (year: number) => string;
  sections?: { before: string; title: string }[];
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[560px] border-collapse text-[14.5px]">
        <thead>
          <tr className="border-b border-rule-strong">
            <th scope="col" className="w-[190px] pb-2 text-left text-[13.5px] font-normal text-muted">
              Eleição
            </th>
            {data.map((d) => (
              <th key={d.year} scope="col" className="pb-2 pr-6 text-left">
                {d.year === focus ? (
                  <span className="tnum font-serif text-[22px] font-medium text-ink">{d.year}</span>
                ) : (
                  <Link href={hrefFor(d.year)} className="link tnum font-serif text-[22px] font-medium">
                    {d.year}
                  </Link>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const sec = sections?.find((s) => s.before === r.label);
            return [
              sec && (
                <tr key={`s-${sec.title}`}>
                  <th scope="rowgroup" colSpan={data.length + 1} className={`pb-2 text-left text-[14.5px] font-semibold text-ink ${i === 0 ? "pt-4" : "pt-8"}`}>
                    {sec.title}
                  </th>
                </tr>
              ),
              <tr key={r.label} className="border-b border-rule align-top">
                <th scope="row" className="py-2.5 pr-4 text-left text-[13.5px] font-normal text-muted">
                  {r.label}
                </th>
                {data.map((d) => (
                  <td key={d.year} className="py-2.5 pr-6">
                    {r.render(d)}
                  </td>
                ))}
              </tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A money value with a thin bar, for the per-election table. */
export function MoneyCell({ v, max, color }: { v: number; max: number; color: string }) {
  if (!v) return <span className="text-muted">—</span>;
  return (
    <div className="min-w-[120px]">
      <div className="tnum font-medium text-ink">{brlc(v)}</div>
      <div className="mt-1 h-[5px] w-full max-w-[160px]" aria-hidden="true">
        <div className="h-full rounded-r-[3px]" style={{ width: `${Math.max(1, (v / Math.max(max, 1)) * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

export function TopCandidates({ items, year }: { items: { candidate_id: string; ballot_name: string; value: number }[]; year: number }) {
  if (!items.length) return <span className="text-muted">—</span>;
  return (
    <ol className="space-y-1 text-[13.5px]">
      {items.map((i) => (
        <li key={i.candidate_id} className="leading-snug">
          <Link className="link text-ink" href={`/candidatos/${year}/${i.candidate_id}`}>
            {titleName(i.ballot_name)}
          </Link>{" "}
          <span className="tnum text-muted">{brlc(i.value)}</span>
        </li>
      ))}
    </ol>
  );
}

/** Tiny proportional bar under a name, for distributions only (one hue). */
export function ShareBar({ share, color }: { share: number; color: string }) {
  return (
    <div className="mt-1 h-[4px] max-w-[220px]" aria-hidden="true">
      <div className="h-full rounded-r-[2px]" style={{ width: `${Math.max(1, share * 100)}%`, background: color }} />
    </div>
  );
}
