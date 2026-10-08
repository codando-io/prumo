import Link from "next/link";
import { Source, type SourceInfo } from "./Source";

/*
 * Editorial building blocks (docs/DESIGN.md): pages are titled in the serif voice, sections are
 * questions answered by a sentence, and provenance is a quiet line rather than decoration.
 */

export function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
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

/** Page header: breadcrumbs, serif title, a lede and quiet secondary actions. */
export function PageHeader({
  crumbs,
  title,
  lede,
  meta,
  actions,
  aside,
}: {
  crumbs?: { label: string; href?: string }[];
  title: React.ReactNode;
  lede?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: { label: string; href: string; external?: boolean }[];
  aside?: React.ReactNode;
}) {
  return (
    <header className="pt-8 sm:pt-10">
      {crumbs && <Crumbs items={crumbs} />}
      <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-[820px]">
          <h1 className="title text-ink">{title}</h1>
          {lede && <div className="lede mt-4">{lede}</div>}
          {meta && <div className="mt-4 text-[14.5px] text-ink-2">{meta}</div>}
        </div>
        {aside}
      </div>
      {actions && actions.length > 0 && <Actions items={actions} className="mt-5" />}
    </header>
  );
}

export function Actions({ items, className = "" }: { items: { label: string; href: string; external?: boolean }[]; className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-x-5 gap-y-1 text-[14px] ${className}`}>
      {items.map((a) => (
        <li key={a.href}>
          {a.external ? (
            <a href={a.href} target="_blank" rel="noreferrer" className="action">
              {a.label} <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <Link href={a.href} className="action">
              {a.label}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

/** A section is a question, answered first in words, then with evidence. */
export function Section({
  id,
  question,
  lede,
  source,
  children,
  className = "",
}: {
  id?: string;
  question: string;
  lede?: React.ReactNode;
  source?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`section ${className}`} aria-labelledby={id}>
      <h2 id={id} className="question scroll-mt-28 text-ink">
        {question}
      </h2>
      {lede && <div className="lede mt-3">{lede}</div>}
      {source && <div className="mt-3">{source}</div>}
      {children && <div className="mt-8">{children}</div>}
    </section>
  );
}

/**
 * "Fonte: TSE, prestação de contas · publicado em 7 out. 2026 · Ver transações".
 * The dataset name opens the full provenance (file, generation time, filing, links).
 */
export function SourceLine({ info, label, links = [] }: { info?: SourceInfo; label: string; links?: { label: string; href: string }[] }) {
  return (
    <p className="text-[13.5px] leading-relaxed text-muted">
      {info ? (
        <Source info={info}>
          Fonte:{" "}
          <span className="text-ink-2 underline decoration-[color-mix(in_srgb,currentColor_30%,transparent)] underline-offset-[3px] hover:decoration-accent">{label}</span>
        </Source>
      ) : (
        <>
          Fonte: <span className="text-ink-2">{label}</span>
        </>
      )}
      {links.map((l) => (
        <span key={l.href}>
          <span aria-hidden="true" className="mx-2">
            ·
          </span>
          <Link href={l.href} className="action whitespace-nowrap">
            {l.label}
          </Link>
        </span>
      ))}
    </p>
  );
}

/** Year selector inside a page header (the election a page is about is always visible). */
export function YearTabs({ path, params, year, years = [2026, 2022, 2018] }: { path: string; params: Record<string, string | undefined>; year: number; years?: number[] }) {
  return (
    <nav aria-label="Eleição" className="flex items-baseline gap-4 text-[15px]">
      {years.map((y) => {
        const u = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) if (v && k !== "ano" && k !== "pagina") u.set(k, v);
        u.set("ano", String(y));
        const on = y === year;
        return (
          <Link
            key={y}
            href={`${path}?${u.toString()}`}
            aria-current={on ? "true" : undefined}
            scroll={false}
            className={`tnum border-b pb-0.5 no-underline ${on ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {y}
          </Link>
        );
      })}
    </nav>
  );
}

/** Inline figure inside a sentence; optional provenance on click. */
export function Fig({ children, info }: { children: React.ReactNode; info?: SourceInfo }) {
  const v = <span className="num">{children}</span>;
  return info ? <Source info={info}>{v}</Source> : v;
}

/** Quiet note under a table or chart. */
export function Caption({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 max-w-[80ch] text-[13.5px] leading-relaxed text-muted">{children}</p>;
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[68ch] border-l-2 border-rule-strong py-1 pl-4 text-[15px] leading-relaxed text-ink-2">{children}</p>;
}
