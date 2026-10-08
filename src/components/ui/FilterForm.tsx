"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export interface FilterField {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  value: string;
  allLabel: string;
}

/**
 * One row of filters above the content they scope. A plain GET form (works without JS);
 * with JS each change navigates immediately and the page keeps its previous render while
 * the new data loads.
 */
export function FilterForm({
  action,
  fields,
  hidden = {},
  search,
}: {
  action: string;
  fields: FilterField[];
  hidden?: Record<string, string>;
  search?: { name: string; label: string; value: string; placeholder: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function go(form: HTMLFormElement) {
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(form).entries()) if (v) params.set(k, String(v));
    start(() => router.push(`${action}?${params.toString()}`, { scroll: false }));
  }

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    go(e.currentTarget.form!);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    go(e.currentTarget);
  }

  const active = fields.some((f) => f.value) || Boolean(search?.value);
  const clearParams = new URLSearchParams(hidden).toString();

  return (
    <form action={action} method="get" onSubmit={onSubmit} className={`flex flex-wrap items-end gap-3 transition-opacity ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {search && (
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px] text-muted sm:max-w-[320px]">
          {search.label}
          <input
            type="search"
            name={search.name}
            defaultValue={search.value}
            placeholder={search.placeholder}
            className="field h-9 text-[14px] placeholder:text-muted"
          />
        </label>
      )}
      {fields.map((f) => (
        <label key={f.name} className="flex min-w-[150px] flex-col gap-1 text-[13px] text-muted">
          {f.label}
          <select
            name={f.name}
            defaultValue={f.value}
            onChange={onChange}
            className="field h-9 px-2 text-[14px]"
          >
            <option value="">{f.allLabel}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      <noscript>
        <button type="submit" className="h-9 rounded-[6px] border border-rule-strong px-3 text-[14px] text-ink">
          Aplicar
        </button>
      </noscript>
      {active && (
        <a href={`${action}${clearParams ? `?${clearParams}` : ""}`} className="action h-9 py-2 text-[14px]">
          Limpar filtros
        </a>
      )}
    </form>
  );
}
