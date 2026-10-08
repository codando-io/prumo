"use client";

import { useEffect, useState } from "react";

/** In-page table of contents; the section being read is marked with the accent rule. */
export function Toc({ items }: { items: readonly (readonly [string, string])[] }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const els = items.map(([id]) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-90px 0px -65% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);

  return (
    <nav aria-label="Nesta página">
      <p className="text-[13.5px] text-muted">Nesta página</p>
      <ul className="mt-3 border-l border-rule text-[14px]">
        {items.map(([id, label]) => (
          <li key={id}>
            <a
              href={`#${id}`}
              aria-current={active === id ? "location" : undefined}
              className={`-ml-px block border-l py-1.5 pl-4 leading-snug no-underline ${active === id ? "border-accent text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
