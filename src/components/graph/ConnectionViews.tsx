"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { TrailExplorer } from "./TrailExplorer";
import { GraphExplorer } from "./GraphExplorer";
import { HitRow, useSearch } from "@/components/search/results";
import type { Hit } from "@/components/search/describe";
import type { Expansion } from "@/lib/queries/graph";

/** Trail first (it explains itself); the network is one click away for those who want the shape. */
export function ConnectionViews({ initial, year, initialTrail }: { initial: Expansion; year: number; initialTrail: string[] }) {
  const [view, setView] = useState<"trilha" | "rede">("trilha");
  return (
    <div>
      <div role="tablist" aria-label="Formas de ver as conexões" className="flex gap-5 border-b border-rule text-[14.5px]">
        {(
          [
            ["trilha", "Trilha"],
            ["rede", "Rede"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={view === k}
            onClick={() => setView(k)}
            className={`-mb-px border-b-2 pb-2 ${view === k ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {view === "trilha" ? <TrailExplorer initial={initial} year={year} initialTrail={initialTrail} /> : <GraphExplorer initial={initial} year={year} />}
      </div>
    </div>
  );
}

const NODE_OF: Record<string, (h: Hit) => string> = {
  candidato: (h) => `c:${h.year}:${h.key}`,
  doador: (h) => `e:${h.key}`,
  fornecedor: (h) => `e:${h.key}`,
  partido: (h) => `p:${h.key}`,
};

/** Where a trail starts: any candidacy, donor, supplier or party. */
export function ConnectionStart({ year }: { year: number }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const { hits, loading, term } = useSearch(q, 4);
  const list = hits.filter((h) => NODE_OF[h.type]);
  const router = useRouter();
  const id = useId();
  const pick = (h: Hit) => router.push(`/conexoes?no=${encodeURIComponent(NODE_OF[h.type](h))}&ano=${h.type === "candidato" && h.year ? h.year : year}`);

  return (
    <div className="relative max-w-[620px]">
      <label htmlFor={`${id}-q`} className="sr-only">
        Começar por
      </label>
      <input
        id={`${id}-q`}
        role="combobox"
        aria-expanded={list.length > 0}
        aria-controls={`${id}-list`}
        aria-activedescendant={list.length ? `${id}-${active}` : undefined}
        autoComplete="off"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, list.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && list[active]) {
            e.preventDefault();
            pick(list[active]);
          }
        }}
        placeholder="Uma candidatura, um partido, um doador ou um fornecedor"
        className="field h-12 w-full text-[17px] placeholder:text-muted"
      />
      {term.length >= 2 && (
        <div className="raised absolute left-0 right-0 z-30 mt-1 max-h-[420px] overflow-auto py-1">
          {list.length === 0 ? (
            <p className="px-4 py-3 text-[14.5px] text-muted">{loading ? "Buscando…" : `Nada encontrado para “${term}”.`}</p>
          ) : (
            <ul id={`${id}-list`} role="listbox">
              {list.map((h, i) => (
                <HitRow key={`${h.type}-${h.year}-${h.key}`} id={`${id}-${i}`} h={h} active={i === active} onHover={() => setActive(i)} onPick={() => pick(h)} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
