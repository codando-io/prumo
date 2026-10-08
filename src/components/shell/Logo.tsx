import Link from "next/link";

/** A plumb bob hanging from its line: the vertical reference between money in and money out. */
export function PlumbMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size * 0.6} height={size} viewBox="0 0 12 20" aria-hidden="true" className="shrink-0">
      <line x1="6" y1="0" x2="6" y2="8" stroke="var(--brass)" strokeWidth="1.25" />
      <path d="M6 7.5c2.2 0 3.6 1.4 3.6 3.2 0 1.6-1.4 3.9-3.6 8.8-2.2-4.9-3.6-7.2-3.6-8.8 0-1.8 1.4-3.2 3.6-3.2Z" fill="var(--brass)" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 no-underline" aria-label="Prumo — página inicial">
      <PlumbMark />
      <span className="font-serif text-[23px] font-medium leading-none tracking-tight text-ink">Prumo</span>
    </Link>
  );
}
