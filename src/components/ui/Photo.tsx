"use client";

import { useState } from "react";

/** Official TSE candidate photo, with initials when the TSE has no photo on file. */
export function Photo({ year, id, name, size = 64 }: { year: number; id: string; name: string; size?: number }) {
  // One retry absorbs transient failures (e.g. a cold server); then fall back to initials.
  const [attempt, setAttempt] = useState(0);
  const failed = attempt > 1;
  const h = Math.round(size * 1.33);
  const initials = name
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  return (
    <span className="relative inline-block shrink-0 overflow-hidden rounded-[8px] bg-surface-2" style={{ width: size, height: h }}>
      <span aria-hidden="true" className="absolute inset-0 grid place-items-center font-semibold text-muted" style={{ fontSize: Math.max(11, size / 4) }}>
        {initials}
      </span>
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={attempt}
          src={`/api/foto/${year}/${id}${attempt ? "?r=1" : ""}`}
          alt={`Foto de ${name} enviada ao TSE`}
          loading="lazy"
          onError={() => setTimeout(() => setAttempt((a) => a + 1), attempt ? 0 : 700)}
          className="relative h-full w-full object-cover"
          width={size}
          height={h}
        />
      )}
    </span>
  );
}
