import Link from "next/link";

/** Prev / numbered window / next, preserving every other query param. */
export function Pagination({ path, params, page, total, pageSize }: { path: string; params: Record<string, string | undefined>; page: number; total: number; pageSize: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) u.set(k, v);
    if (p > 1) u.set("pagina", String(p));
    else u.delete("pagina");
    return `${path}?${u.toString()}`;
  };
  const window: number[] = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p++) window.push(p);
  const cls = "inline-block min-w-7 border-b-2 px-1.5 py-1 text-center text-[14.5px] no-underline";
  return (
    <nav aria-label="Paginação" className="mt-8 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      {page > 1 && (
        <Link href={href(page - 1)} className={`${cls} border-transparent text-ink-2 hover:text-ink`} rel="prev">
          <span aria-hidden="true">← </span>
          Anterior
        </Link>
      )}
      {window[0] > 1 && (
        <>
          <Link href={href(1)} className={`${cls} border-transparent text-ink-2 hover:text-ink`}>
            1
          </Link>
          {window[0] > 2 && <span className="px-1 text-muted">…</span>}
        </>
      )}
      {window.map((p) => (
        <Link key={p} href={href(p)} aria-current={p === page ? "page" : undefined} className={`${cls} tnum ${p === page ? "border-accent text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>
          {p}
        </Link>
      ))}
      {window[window.length - 1] < pages && (
        <>
          {window[window.length - 1] < pages - 1 && <span className="px-1 text-muted">…</span>}
          <Link href={href(pages)} className={`${cls} tnum border-transparent text-ink-2 hover:text-ink`}>
            {pages}
          </Link>
        </>
      )}
      {page < pages && (
        <Link href={href(page + 1)} className={`${cls} border-transparent text-ink-2 hover:text-ink`} rel="next">
          Próxima<span aria-hidden="true"> →</span>
        </Link>
      )}
    </nav>
  );
}
