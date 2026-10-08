"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { type Hit, hitKind, hitFacts } from "@/components/search/describe";
import { titleName } from "@/lib/format";

/** Adds a candidacy to the comparison by searching the global index (candidates only). */
export function CandidatePicker({ current }: { current: string[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/busca?q=${encodeURIComponent(term)}&tipo=candidato&limit=8`, { signal: ctrl.signal });
        setHits(await res.json());
      } catch {
        /* aborted */
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const shown = q.trim().length >= 2 ? hits : [];
  if (current.length >= 6) return <p className="text-[13.5px] text-muted">Limite de seis candidaturas. Remova uma para adicionar outra.</p>;

  return (
    <div className="relative max-w-[420px]">
      <label className="block">
        <span className="sr-only">Adicionar candidatura</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Adicionar candidatura pelo nome"
          className="field w-full placeholder:text-muted"
        />
      </label>
      {shown.length > 0 && (
        <ul className="raised absolute left-0 right-0 z-30 mt-1 py-1">
          {shown.map((h) => {
            const k = `${h.year}-${h.key}`;
            const already = current.includes(k);
            return (
              <li key={k}>
                <button
                  type="button"
                  disabled={already}
                  onClick={() => {
                    setQ("");
                    setHits([]);
                    router.push(`/comparar?c=${[...current, k].join(",")}`);
                  }}
                  className="block w-full border-l-2 border-transparent px-4 py-2 text-left hover:border-accent hover:bg-[var(--hover)] disabled:opacity-50"
                >
                  <span className="block text-[14.5px] font-medium text-ink">{titleName(h.label)}</span>
                  <span className="block text-[13px] text-ink-2">{already ? "Já na comparação" : hitKind(h)}</span>
                  {!already && hitFacts(h) && <span className="tnum block text-[13px] text-muted">{hitFacts(h)}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
