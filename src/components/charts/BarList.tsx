import Link from "next/link";
import { brlc, num, pct } from "@/lib/format";

export interface BarItem {
  key: string;
  label: string;
  sublabel?: React.ReactNode;
  value: number;
  share?: number | null;
  href?: string;
  color?: string;
  extra?: React.ReactNode;
}

/**
 * Ranked horizontal bars rendered as a plain list (it is its own table view). One series,
 * one colour; bars share a scale anchored at zero; values sit at the bar's end, in ink.
 */
export function BarList({
  items,
  format = "brl",
  color = "var(--spend)",
  max,
  empty = "Sem registros.",
  showShare = true,
}: {
  items: BarItem[];
  format?: "brl" | "num";
  color?: string;
  max?: number;
  empty?: string;
  showShare?: boolean;
}) {
  if (!items.length) return <p className="text-[14px] text-muted">{empty}</p>;
  const top = max ?? Math.max(...items.map((i) => i.value), 1);
  const fmt = format === "brl" ? brlc : num;
  return (
    <ol className="space-y-3">
      {items.map((it) => {
        const w = Math.max(0.5, (it.value / top) * 100);
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-4">
              <div className="min-w-0">
                <div className="truncate text-[14.5px] font-medium leading-snug">{it.label}</div>
                {it.sublabel && <div className="truncate text-[12.5px] leading-snug text-muted">{it.sublabel}</div>}
              </div>
              <div className="tnum shrink-0 text-right text-[14px]">
                <span className="font-medium">{fmt(it.value)}</span>
                {showShare && it.share != null && <span className="ml-2 text-muted">{pct(it.share)}</span>}
                {it.extra}
              </div>
            </div>
            <div className="mt-1.5 h-[6px] w-full" aria-hidden="true">
              <div className="h-full rounded-r-[3px]" style={{ width: `${w}%`, background: it.color ?? color }} />
            </div>
          </>
        );
        return (
          <li key={it.key} className="break-inside-avoid">
            {it.href ? (
              <Link href={it.href} className="-mx-2 block rounded-[6px] px-2 py-1 hover:bg-[var(--hover)]">
                {body}
              </Link>
            ) : (
              <div className="py-1">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** A single stacked bar for part-to-whole (≤ 7 parts), with a 2px surface gap between parts. */
export function StackBar({ parts, height = 12 }: { parts: { key: string; label: string; value: number; color: string }[]; height?: number }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  const shown = parts.filter((p) => p.value > 0);
  return (
    <div className="flex w-full gap-[2px]" style={{ height }} role="img" aria-label={shown.map((p) => `${p.label} ${pct(p.value / total)}`).join(", ")}>
      {shown.map((p, i) => (
        <span
          key={p.key}
          title={`${p.label}: ${brlc(p.value)} (${pct(p.value / total)})`}
          className={`block h-full min-w-[2px] ${i === 0 ? "rounded-l-[3px]" : ""} ${i === shown.length - 1 ? "rounded-r-[3px]" : ""}`}
          style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
        />
      ))}
    </div>
  );
}
