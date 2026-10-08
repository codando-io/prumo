"use client";

import { useEffect, useState } from "react";

/** Sticky in-page navigation; the section in view is underlined in the accent. */
export function SectionNav({ hasFinance, signals, hasProposal = false }: { hasFinance: boolean; signals: number; hasProposal?: boolean }) {
  const items = [
    ...(hasFinance
      ? [
          { id: "origem", label: "De onde veio" },
          { id: "destino", label: "Para onde foi" },
          { id: "fluxo", label: "Caminho" },
          { id: "padroes", label: signals ? `Sinais (${signals})` : "Sinais" },
        ]
      : []),
    ...(hasProposal ? [{ id: "proposta", label: "Proposta" }] : []),
    { id: "votos", label: "Votos" },
    ...(hasFinance ? [{ id: "comparacao", label: "Por voto" }] : []),
    { id: "historico", label: "Outras eleições" },
    { id: "bens", label: "Bens" },
    { id: "dados", label: "Fontes" },
  ];
  const [active, setActive] = useState(items[0].id);

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-120px 0px -60% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFinance, signals, hasProposal]);

  return (
    <nav aria-label="Nesta página" className="sticky top-[60px] z-30 mt-12 border-y border-rule bg-bg/95 backdrop-blur-sm">
      <div className="mx-auto max-w-[1200px] overflow-x-auto px-4 sm:px-6">
        <ul className="flex gap-6 whitespace-nowrap text-[14px]">
          {items.map((i) => (
            <li key={i.id}>
              <a
                href={`#${i.id}`}
                aria-current={active === i.id ? "location" : undefined}
                className={`-mb-px block border-b-2 py-2.5 no-underline ${active === i.id ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
              >
                {i.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
