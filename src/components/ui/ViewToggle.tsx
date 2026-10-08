"use client";

import { useState } from "react";

/** Switch between equivalent views of the same data (e.g. ranked list ↔ map). */
export function ViewToggle({ views, label }: { views: { key: string; label: string; node: React.ReactNode }[]; label: string }) {
  const [current, setCurrent] = useState(views[0]?.key);
  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-5 text-[14.5px]">
        {views.map((v) => (
          <button
            key={v.key}
            role="tab"
            type="button"
            aria-selected={v.key === current}
            onClick={() => setCurrent(v.key)}
            className={`border-b pb-1 ${v.key === current ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {views.map((v) => (
          <div key={v.key} role="tabpanel" hidden={v.key !== current}>
            {v.node}
          </div>
        ))}
      </div>
    </div>
  );
}
