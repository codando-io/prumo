import Link from "next/link";
import { Source, type SourceInfo } from "./Source";
import { resultLabel } from "@/lib/labels";

/*
 * Shared layout primitives. They follow docs/DESIGN.md: no tiles, no chips, no boxes —
 * hierarchy comes from type, rules and spacing.
 */

export function Container({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1200px] px-4 sm:px-6 ${className}`}>{children}</div>;
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Você está em" className="text-[13.5px] text-muted">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden="true">/</span>}
            {it.href ? (
              <Link href={it.href} className="action">
                {it.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-ink-2">
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Section heading in the editorial voice (prefer `Section` from ./editorial for new code). */
export function SectionHeader({ id, title, lead, aside }: { id?: string; title: string; lead?: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
      <div className="max-w-[72ch]">
        <h2 id={id} className="question scroll-mt-28 text-ink">
          {title}
        </h2>
        {lead && <div className="lede mt-3">{lead}</div>}
      </div>
      {aside}
    </div>
  );
}

/** A labelled figure. Kept small on purpose: numbers are read, not admired. */
export function Stat({ label, value, sub, source, align }: { label: string; value: string; sub?: React.ReactNode; source?: SourceInfo; align?: "left" | "right" }) {
  return (
    <div className="min-w-0">
      <div className="text-[13.5px] text-muted">{label}</div>
      <div className="tnum mt-0.5 text-[20px] font-medium leading-tight text-ink">
        {source ? (
          <Source info={source} align={align}>
            {value}
          </Source>
        ) : (
          value
        )}
      </div>
      {sub && <div className="mt-0.5 text-[13.5px] leading-snug text-ink-2">{sub}</div>}
    </div>
  );
}

/** Election result as plain text; elected is set in the strongest ink, nothing else is coloured. */
export function ResultChip({ result, year, registration }: { result: string | null; year: number; registration?: string | null }) {
  const r = resultLabel(result, year, registration);
  const cls = r.tone === "elected" ? "font-medium text-ink" : r.tone === "runoff" ? "text-ink" : r.tone === "muted" ? "text-muted" : "text-ink-2";
  return <span className={cls}>{r.label}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[68ch] border-l-2 border-rule-strong py-1 pl-4 text-[15px] leading-relaxed text-ink-2">{children}</div>;
}

export function Note({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[80ch] text-[13.5px] leading-relaxed text-muted">{children}</p>;
}
