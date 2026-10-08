"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

/**
 * "Where did this number come from?" — every important figure can open this panel.
 * kind:
 *  - oficial: a value exactly as published by the TSE (or a plain sum of published records)
 *  - calculo: a calculation made by Prumo from TSE records (shares, medians, per-vote…)
 *  - sinal:   a statistical pattern; never an accusation
 */
export interface SourceInfo {
  kind: "oficial" | "calculo" | "sinal";
  what?: string;
  dataset?: { label: string; file?: string; zip?: string; generatedAt?: string | null };
  filing?: { type: string; date: string } | null;
  record?: { label: string; href: string };
  explore?: { label: string; href: string };
}

export const KIND_LABEL: Record<SourceInfo["kind"], { label: string; cls: string }> = {
  oficial: { label: "Dado oficial do TSE", cls: "bg-official-bg text-official" },
  calculo: { label: "Cálculo do Prumo", cls: "bg-calc-bg text-calc" },
  sinal: { label: "Padrão estatístico", cls: "bg-signal-bg text-signal" },
};

/** What kind of number this is — plain text, no badge. */
export function KindTag({ kind }: { kind: SourceInfo["kind"] }) {
  const k = KIND_LABEL[kind];
  return <span className="block text-[13px] font-medium text-accent">{k.label}</span>;
}

function fmtTs(v?: string | null) {
  if (!v) return null;
  const d = v.slice(0, 10).split("-").reverse().join("/");
  return v.length > 10 ? `${d}, ${v.slice(11, 16)}` : d;
}

export function Source({ info, children, align = "left" }: { info: SourceInfo; children: React.ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={wrap} className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        title="De onde vem este número?"
        className="cursor-help text-left underline decoration-transparent underline-offset-[5px] hover:decoration-accent"
      >
        {children}
      </button>
      {open && (
        <span
          id={id}
          role="dialog"
          aria-label="Origem do dado"
          className={`raised absolute top-full z-50 mt-2 block w-[min(360px,85vw)] p-4 text-left text-[14px] font-normal leading-snug text-ink ${align === "right" ? "right-0" : "left-0"}`}
          style={{ fontVariationSettings: '"wdth" 100', letterSpacing: 0, fontFamily: "var(--font-archivo)" }}
        >
          <KindTag kind={info.kind} />
          {info.what && <span className="mt-2 block text-ink-2">{info.what}</span>}
          {info.dataset && (
            <span className="mt-3 block">
              <span className="block text-[13px] text-muted">Fonte</span>
              <span className="block">
                TSE, {info.dataset.label}
                {info.dataset.file && <span className="block break-all text-[13px] text-muted">{info.dataset.file}</span>}
              </span>
              {info.dataset.generatedAt && <span className="mt-1 block text-[13px] text-ink-2">Arquivo gerado pelo TSE em {fmtTs(info.dataset.generatedAt)}</span>}
            </span>
          )}
          {info.filing && (
            <span className="mt-2 block text-[13px] text-ink-2">
              Prestação considerada: {info.filing.type}, entregue em {fmtTs(info.filing.date)}
            </span>
          )}
          <span className="mt-3 flex flex-col gap-1.5">
            {info.explore && (
              <Link href={info.explore.href} className="link text-ink">
                {info.explore.label}
              </Link>
            )}
            {info.record && (
              <a href={info.record.href} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 text-ink">
                {info.record.label} <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}
            {info.dataset?.zip && (
              <a href={info.dataset.zip} className="link inline-flex items-center gap-1 text-ink-2" rel="noreferrer">
                Baixar o arquivo original (zip) <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}
          </span>
        </span>
      )}
    </span>
  );
}
