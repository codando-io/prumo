"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type Hit, hitKind, hitFacts } from "@/components/search/describe";
import { titleName } from "@/lib/format";

/**
 * Picks a candidacy (`candidato`) or a donor/supplier (`contraparte`) for the explorer by
 * searching the global index, then navigates with that filter added to the current ones.
 * A candidacy from another election also switches `ano`. Needs JS; without it the
 * explorer still works through the links in each row.
 */
export function EntityPicker({
  param,
  label,
  placeholder,
  year,
  params,
}: {
  param: "candidato" | "contraparte";
  label: string;
  placeholder: string;
  year: number;
  /** Current canonical query (without this param and without `pagina`). */
  params: [string, string][];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pending, start] = useTransition();
  const id = useId();

  useEffect(() => {
    const term = q.trim();
    // Shorter terms show no list (see `open && q.trim().length >= 2` below), so nothing to fetch.
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const url =
          param === "candidato" ? `/api/busca?q=${encodeURIComponent(term)}&tipo=candidato&limit=8` : `/api/busca?q=${encodeURIComponent(term)}&limit=6`;
        const res = await fetch(url, { signal: ctrl.signal });
        const data = (await res.json()) as Hit[];
        const seen = new Set<string>();
        const list =
          param === "candidato"
            ? // this election first
              [...data].sort((a, b) => Number(b.year === year) - Number(a.year === year))
            : data.filter((h) => (h.type === "doador" || h.type === "fornecedor") && !seen.has(h.key) && seen.add(h.key));
        setHits(list.slice(0, 8));
        setActive(-1);
        setOpen(true);
      } catch {
        /* aborted */
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, param, year]);

  function choose(h: Hit) {
    const p = new URLSearchParams(params);
    if (param === "candidato" && h.year && h.year !== year) p.set("ano", String(h.year));
    p.set(param, h.key);
    setOpen(false);
    start(() => router.push(`/transacoes?${p.toString()}`, { scroll: false }));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Enter") {
      // Never submit the surrounding filter form from here.
      e.preventDefault();
      const h = hits[active >= 0 ? active : 0];
      if (h && open) choose(h);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <label htmlFor={`${id}-input`} className="block text-[13px] text-muted">
        {label}
      </label>
      <div className={`mt-1 ${pending ? "opacity-60" : ""}`}>
        <input
          id={`${id}-input`}
          role="combobox"
          aria-expanded={open && hits.length > 0}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => hits.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="field h-9 w-full min-w-0 text-[14px] placeholder:text-muted"
        />
      </div>
      {open && q.trim().length >= 2 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="raised absolute left-0 right-0 z-50 mt-1 max-h-[360px] min-w-[300px] overflow-auto py-1"
        >
          {hits.length === 0 && <li className="px-3 py-2.5 text-[13.5px] text-muted">Nada encontrado para “{q.trim()}”.</li>}
          {hits.map((h, i) => (
            <li
              key={`${h.type}-${h.key}`}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(h);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer border-l-2 px-3 py-2 ${i === active ? "border-accent bg-[var(--hover)]" : "border-transparent"}`}
            >
              <span className="block truncate text-[14.5px] font-medium text-ink">{titleName(h.label)}</span>
              <span className="block truncate text-[13px] text-ink-2">
                {hitKind(h)}
                {param === "candidato" && h.year !== year ? " (outra eleição)" : ""}
              </span>
              {hitFacts(h) && <span className="tnum block truncate text-[13px] text-muted">{hitFacts(h)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
