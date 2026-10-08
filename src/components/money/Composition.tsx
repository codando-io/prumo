"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { brlc, pct } from "@/lib/format";

export type Tone = "public" | "public-2" | "public-3" | "private" | "private-2" | "private-3" | "private-4" | "spend" | "spend-2";

export interface Part {
  key: string;
  label: string;
  value: number;
  tone: Tone;
  /** Where "ver transações" goes for this part. */
  href?: string;
  hint?: string;
}

export interface Group {
  label: string;
  value: number;
  tone: Tone;
}

const toneVar = (t: Tone) => `var(--${t})`;

/**
 * Money in or money out of a campaign (or of an aggregate): total → proportional strip →
 * rows that expand into counterparties. When `scale` is shared by an "in" and an "out"
 * composition, strip lengths are comparable (spending shorter than revenue reads at a glance).
 * Hovering a strip segment or a row highlights the pair.
 */
export function Composition({
  title,
  total,
  totalNode,
  summary,
  parts,
  groups,
  scale,
  details = {},
  more,
}: {
  title: string;
  total: number;
  totalNode?: React.ReactNode;
  summary?: React.ReactNode;
  parts: Part[];
  groups?: Group[];
  scale?: number;
  details?: Record<string, React.ReactNode>;
  more?: React.ReactNode;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const shown = parts.filter((p) => p.value > 0);
  const width = scale && scale > 0 ? Math.max(2, (total / scale) * 100) : 100;
  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <div>
      <div className="text-[15px] text-ink-2">{title}</div>
      <div className="big mt-1.5 text-ink">{totalNode ?? brlc(total)}</div>
      {summary && <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{summary}</p>}

      {groups && groups.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-[15px]">
          {groups.map((g) => (
            <li key={g.label} className="flex items-baseline gap-2">
              <span aria-hidden="true" className="inline-block h-2.5 w-2.5 translate-y-[1px]" style={{ background: toneVar(g.tone) }} />
              <span className="text-ink-2">{g.label}</span>
              <span className="num">{pct(total ? g.value / total : 0)}</span>
              <span className="tnum text-muted">{brlc(g.value)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 h-3.5 w-full" aria-hidden="true">
        <div className="flex h-full gap-[2px]" style={{ width: `${width}%` }}>
          {shown.map((p) => (
            <span
              key={p.key}
              onMouseEnter={() => setHover(p.key)}
              onMouseLeave={() => setHover(null)}
              onClick={() => details[p.key] && toggle(p.key)}
              title={`${p.label}: ${brlc(p.value)} (${pct(total ? p.value / total : 0)})`}
              className="block h-full min-w-[2px] cursor-pointer transition-opacity"
              style={{ width: `${(p.value / total) * 100}%`, background: toneVar(p.tone), opacity: hover && hover !== p.key ? 0.3 : 1 }}
            />
          ))}
        </div>
      </div>

      <ul className="mt-4 border-t border-rule">
        {shown.map((p) => {
          const has = Boolean(details[p.key]);
          const isOpen = open.has(p.key);
          const dim = hover && hover !== p.key;
          const row = (
            <>
              <span className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0" style={{ background: toneVar(p.tone) }} />
                <span className="truncate text-ink">{p.label}</span>
                {has && <ChevronRight size={14} aria-hidden="true" className={`shrink-0 text-muted transition-transform ${isOpen ? "rotate-90" : ""}`} />}
              </span>
              <span className="tnum shrink-0 text-right">
                <span className="font-medium text-ink">{brlc(p.value)}</span>
                <span className="ml-3 inline-block w-11 text-muted">{pct(total ? p.value / total : 0)}</span>
              </span>
            </>
          );
          return (
            <li key={p.key} className={`border-b border-rule transition-opacity ${dim ? "opacity-45" : ""}`} onMouseEnter={() => setHover(p.key)} onMouseLeave={() => setHover(null)}>
              {has ? (
                <button type="button" aria-expanded={isOpen} onClick={() => toggle(p.key)} className="flex w-full items-center justify-between gap-4 py-2.5 text-left text-[15px] hover:bg-[var(--hover)]">
                  {row}
                </button>
              ) : p.href ? (
                <Link href={p.href} className="flex items-center justify-between gap-4 py-2.5 text-[15px] no-underline hover:bg-[var(--hover)]">
                  {row}
                </Link>
              ) : (
                <div className="flex items-center justify-between gap-4 py-2.5 text-[15px]">{row}</div>
              )}
              {has && isOpen && (
                <div className="pb-4 pl-5">
                  {p.hint && <p className="mb-2 text-[14px] text-ink-2">{p.hint}</p>}
                  {details[p.key]}
                  {p.href && (
                    <Link href={p.href} className="action mt-2 inline-block text-[14px]">
                      Ver as transações
                    </Link>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {more && <div className="mt-3 text-[14px]">{more}</div>}
    </div>
  );
}

/** Compact list of counterparties shown inside an expanded row. */
export function CounterList({ rows, total }: { rows: { key: string; label: string; value: number; href?: string; note?: string }[]; total: number }) {
  if (!rows.length) return <p className="text-[14px] text-muted">Sem contraparte identificada.</p>;
  return (
    <ol className="space-y-1 text-[14.5px]">
      {rows.map((r) => (
        <li key={r.key} className="flex items-baseline justify-between gap-4">
          <span className="min-w-0">
            {r.href ? (
              <Link href={r.href} className="link text-ink">
                {r.label}
              </Link>
            ) : (
              <span className="text-ink">{r.label}</span>
            )}
            {r.note && <span className="ml-2 text-[13.5px] text-muted">{r.note}</span>}
          </span>
          <span className="tnum shrink-0 text-ink-2">
            {brlc(r.value)} <span className="ml-1 inline-block w-11 text-right text-muted">{pct(total ? r.value / total : 0)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
