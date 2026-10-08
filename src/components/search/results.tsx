"use client";

import { useEffect, useState } from "react";
import { type Hit, hitFacts, hitKind, hitLabel } from "./describe";

/** Debounced fetch of /api/busca. Results only exist for queries of 2+ characters. */
export function useSearch(q: string, perType = 4) {
  const [state, setState] = useState<{ q: string; hits: Hit[] }>({ q: "", hits: [] });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/busca?q=${encodeURIComponent(term)}&limit=${perType}`, { signal: ctrl.signal });
        setState({ q: term, hits: (await res.json()) as Hit[] });
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, perType]);
  const term = q.trim();
  return { hits: term.length >= 2 ? state.hits : [], loading: term.length >= 2 && (loading || state.q !== term), term };
}

export function HitRow({ h, active, onPick, onHover, id }: { h: Hit; active: boolean; onPick: () => void; onHover: () => void; id: string }) {
  const facts = hitFacts(h);
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      onMouseDown={(e) => {
        e.preventDefault();
        onPick();
      }}
      onMouseMove={onHover}
      className={`cursor-pointer border-l-2 px-4 py-2.5 ${active ? "border-accent bg-[var(--hover)]" : "border-transparent"}`}
    >
      <div className="text-[15.5px] font-medium leading-snug text-ink">{hitLabel(h)}</div>
      <div className="text-[13.5px] leading-snug text-ink-2">{hitKind(h)}</div>
      {facts && <div className="tnum mt-0.5 text-[13.5px] leading-snug text-muted">{facts}</div>}
    </li>
  );
}
