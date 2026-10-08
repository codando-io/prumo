"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { HitRow, useSearch } from "./results";
import { groupHits, type Hit } from "./describe";

const EXAMPLES = ["Lula", "PL", "São Paulo", "Facebook", "gráfica", "2022"];

/**
 * The global search: a command palette opened from the header, with "/" or ⌘K / Ctrl+K.
 * Results are grouped by entity type and say what each entity is and why it matters.
 */
export function SearchPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable;
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("prumo-search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("prumo-search", onOpen);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full min-w-0 items-center gap-2 rounded-[6px] border border-rule bg-raised px-3 text-left text-[14px] text-muted hover:border-rule-strong hover:text-ink-2"
        aria-label="Buscar candidaturas, partidos, empresas, doadores ou lugares"
      >
        <Search size={15} aria-hidden="true" className="shrink-0" />
        <span className="hidden truncate sm:inline">Buscar candidatura, empresa, doador…</span>
        <kbd className="ml-auto hidden rounded border border-rule px-1.5 text-[11px] leading-5 text-muted sm:block">/</kbd>
      </button>
      {open && <PaletteDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const { hits, loading, term } = useSearch(q, 4);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const flat = groupHits(hits).flatMap((g) => g.hits);
  const total = flat.length + (term.length >= 2 ? 1 : 0);

  useEffect(() => {
    input.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const go = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, total - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active < flat.length && flat[active]) go(flat[active].href);
      else if (term.length >= 2) go(`/busca?q=${encodeURIComponent(term)}`);
    }
  }

  let i = -1;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/45 px-3 pt-[8vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Busca" className="raised w-full max-w-[680px] overflow-hidden" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 border-b border-rule px-4">
          <Search size={18} aria-hidden="true" className="text-muted" />
          <input
            ref={input}
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls={listId}
            aria-activedescendant={flat.length ? `${listId}-${active}` : undefined}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            placeholder="Nome de candidatura, partido, empresa, doador, CNPJ ou lugar"
            className="h-14 w-full bg-transparent text-[17px] text-ink outline-none placeholder:text-muted"
          />
          <kbd className="rounded border border-rule px-1.5 text-[11px] leading-5 text-muted">Esc</kbd>
        </div>
        <div className="max-h-[62vh] overflow-y-auto" id={listId} role="listbox">
          {term.length < 2 ? (
            <div className="px-4 py-5 text-[14px] text-ink-2">
              <p>Comece por um nome. Cada resultado mostra o que a entidade é e quanto dinheiro passou por ela.</p>
              <p className="mt-3 text-muted">
                Experimente:{" "}
                {EXAMPLES.map((ex, k) => (
                  <span key={ex}>
                    {k > 0 && ", "}
                    <button type="button" className="action" onClick={() => setQ(ex)}>
                      {ex}
                    </button>
                  </span>
                ))}
              </p>
            </div>
          ) : flat.length === 0 ? (
            <p className="px-4 py-5 text-[14px] text-ink-2">{loading ? "Buscando…" : `Nada encontrado para “${term}”. Tente parte do nome ou um CNPJ.`}</p>
          ) : (
            <>
              {groupHits(hits).map((g) => (
                <div key={g.type} className="py-1.5">
                  <div className="px-4 pb-1 pt-2 text-[13px] font-medium text-muted">{g.name}</div>
                  <ul>
                    {g.hits.map((h: Hit) => {
                      i++;
                      const idx = i;
                      return <HitRow key={`${h.type}-${h.key}`} id={`${listId}-${idx}`} h={h} active={idx === active} onPick={() => go(h.href)} onHover={() => setActive(idx)} />;
                    })}
                  </ul>
                </div>
              ))}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(`/busca?q=${encodeURIComponent(term)}`);
                }}
                onMouseMove={() => setActive(flat.length)}
                className={`block w-full border-t border-rule px-4 py-3 text-left text-[14px] ${active === flat.length ? "bg-[var(--hover)] text-ink" : "text-ink-2"}`}
              >
                Ver todos os resultados para “{term}”
              </button>
            </>
          )}
        </div>
        <div className="flex gap-4 border-t border-rule px-4 py-2 text-[13px] text-muted">
          <span>↑↓ para escolher</span>
          <span>Enter para abrir</span>
          <span>Esc para fechar</span>
        </div>
      </div>
    </div>
  );
}

/** Inline variant for the election overview: opens the palette with the same experience. */
export function SearchInvite({ placeholder = "Busque uma candidatura, um partido, uma empresa ou um doador" }: { placeholder?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("prumo-search"))}
      className="flex h-14 w-full items-center gap-3 rounded-[8px] border border-rule-strong bg-raised px-4 text-left text-[16.5px] text-muted hover:border-accent"
    >
      <Search size={19} aria-hidden="true" />
      <span className="truncate">{placeholder}</span>
      <kbd className="ml-auto hidden rounded border border-rule px-1.5 text-[12px] leading-5 sm:block">/</kbd>
    </button>
  );
}
