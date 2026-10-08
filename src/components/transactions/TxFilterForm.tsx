"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * GET form for the transaction explorer. Without JS it submits natively to /transacoes. With JS
 * it drops empty fields from the URL, navigates client-side keeping the scroll position, and
 * applies a select as soon as it changes (text, date and value fields apply on Enter or with
 * the button). The page keeps its previous render while the new results load.
 */
export function TxFilterForm({ children, order = [], action = "/transacoes" }: { children: React.ReactNode; order?: readonly string[]; action?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function go(form: HTMLFormElement) {
    const entries: [string, string][] = [];
    for (const [k, v] of new FormData(form).entries()) {
      const s = String(v).trim();
      if (s) entries.push([k, s]);
    }
    // Same key order as the links the server writes (unknown keys last).
    const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
    const params = new URLSearchParams(entries.sort((a, b) => rank(a[0]) - rank(b[0])));
    start(() => router.push(`${action}?${params.toString()}`, { scroll: false }));
  }

  return (
    <form
      action={action}
      method="get"
      role="search"
      aria-label="Filtrar transações"
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        go(e.currentTarget);
      }}
      onChange={(e) => {
        if ((e.target as HTMLElement).tagName === "SELECT") go(e.currentTarget);
      }}
      className={`transition-opacity ${pending ? "opacity-60" : ""}`}
    >
      {children}
      <p aria-live="polite" className="sr-only">
        {pending ? "Carregando transações" : ""}
      </p>
    </form>
  );
}
