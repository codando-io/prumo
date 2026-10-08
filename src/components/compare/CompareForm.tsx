"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const MAX = 6;
const CHECKED = 'input[name="c"]:checked';

/**
 * Wraps a table whose rows carry `<input type="checkbox" name="c" value="year-id">`. Without JS it
 * is a plain GET form to /comparar; with JS a quiet bar appears once something is marked and the
 * comparison opens with the compact `?c=a,b` URL.
 */
export function CompareForm({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [n, setN] = useState(0);

  function onChange(e: React.FormEvent<HTMLFormElement>) {
    setN(e.currentTarget.querySelectorAll(CHECKED).length);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const keys = [...e.currentTarget.querySelectorAll<HTMLInputElement>(CHECKED)].map((i) => i.value).slice(0, MAX);
    if (keys.length) router.push(`/comparar?c=${keys.join(",")}`);
  }

  return (
    <form action="/comparar" method="get" onChange={onChange} onSubmit={onSubmit} onReset={() => setN(0)}>
      {children}
      <noscript>
        <div className="mt-4 flex justify-end">
          <button type="submit" className="rounded-[6px] border border-rule-strong px-4 py-2 text-[14px] text-ink">
            Comparar as marcadas
          </button>
        </div>
      </noscript>
      {n > 0 && (
        <div className="pointer-events-none sticky bottom-4 z-20 mt-4 flex justify-end">
          <div role="status" className="pointer-events-auto flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[6px] border border-rule-strong bg-raised py-2 pl-4 pr-2 text-[14px]">
            <span className="text-ink-2">
              <span className="tnum font-medium text-ink">{n}</span> {n === 1 ? "marcada" : "marcadas"}
              {n > MAX && ", entram as seis primeiras"}
            </span>
            <button type="reset" className="action">
              Desmarcar
            </button>
            <button type="submit" className="rounded-[6px] border border-rule-strong px-3 py-1.5 text-ink hover:border-accent">
              Comparar lado a lado
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
