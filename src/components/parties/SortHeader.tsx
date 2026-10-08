import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";

export type SortDir = "asc" | "desc";

/** Read `?ordem=` / `?dir=` against the allowed column keys. */
export function parseSort<K extends string>(ordem: unknown, dir: unknown, keys: readonly K[], fallback: K, defaultDir: (k: K) => SortDir): { key: K; dir: SortDir } {
  const o = (Array.isArray(ordem) ? ordem[0] : ordem) as string | undefined;
  const d = (Array.isArray(dir) ? dir[0] : dir) as string | undefined;
  const key = (keys as readonly string[]).includes(o ?? "") ? (o as K) : fallback;
  return { key, dir: d === "asc" || d === "desc" ? d : defaultDir(key) };
}

/** Compare helper: nulls always last, strings in pt-BR collation. */
export function compareBy<T>(get: (r: T) => string | number | null | undefined, dir: SortDir) {
  return (a: T, b: T) => {
    const x = get(a);
    const y = get(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    const c = typeof x === "string" && typeof y === "string" ? x.localeCompare(y, "pt-BR") : Number(x) - Number(y);
    return dir === "asc" ? c : -c;
  };
}

/**
 * Sortable header cell for a `.dt` table (docs/DESIGN.md): inherits the table's header type,
 * marks the active column in ink with a text arrow, and links to `?ordem=` / `?dir=`.
 * Works without JavaScript. Numeric columns are right aligned (`.n`) with the arrow before the
 * label, so the label's right edge stays on the numbers' edge.
 */
export function SortTh({
  label,
  col,
  active,
  dir,
  defaultDir,
  hrefFor,
  numeric = true,
  className = "",
}: {
  label: React.ReactNode;
  col: string;
  active: boolean;
  dir: SortDir;
  defaultDir: SortDir;
  hrefFor: (col: string, dir: SortDir) => string;
  numeric?: boolean;
  className?: string;
}) {
  const next: SortDir = active ? (dir === "asc" ? "desc" : "asc") : defaultDir;
  const arrow = (
    <span aria-hidden="true" className={`inline-block w-[0.9em] ${numeric ? "text-left" : "text-right"}`}>
      {active ? (dir === "asc" ? "↑" : "↓") : ""}
    </span>
  );
  return (
    <th scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined} className={`${numeric ? "n" : ""} ${className}`}>
      <Link
        href={hrefFor(col, next)}
        scroll={false}
        className={`no-underline hover:text-ink ${active ? "text-ink" : ""}`}
        title={active ? "Inverter a ordem" : "Ordenar por esta coluna"}
      >
        {numeric && arrow}
        {label}
        {!numeric && arrow}
      </Link>
    </th>
  );
}
