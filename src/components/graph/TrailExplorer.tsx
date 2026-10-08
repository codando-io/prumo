"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { brlc, num } from "@/lib/format";
import type { Expansion, GEdge, GNode, NodeType } from "@/lib/queries/graph";

export const TYPE_LABEL: Record<NodeType, string> = {
  candidato: "Candidatura",
  partido: "Partido",
  pf: "Pessoa física",
  pj: "Empresa",
  partido_org: "Órgão partidário",
  plataforma: "Plataforma de financiamento coletivo",
  desconhecido: "Não identificado",
  pessoa: "Pessoa (sócio ou administrador)",
  orgao: "Órgão público",
  registro: "Registro em cadastro oficial",
  eleicao: "Eleição",
  proposta: "Proposta de governo",
  tema: "Tema (Índice Prumo)",
};

type Dir = "in" | "out";
interface Rel {
  key: string;
  label: string;
  /** Verb used in the trail sentence, e.g. "recebeu de". */
  verb: string;
  test: (e: GEdge, id: string) => boolean;
}

// How each relationship reads from the point of view of the node in the column.
const RELS: Rel[] = [
  { key: "doou-in", label: "Recebeu doações de", verb: "recebeu de", test: (e, id) => e.kind === "doacao" && e.target === id },
  { key: "ind-in", label: "Recebeu, por meio de partido ou vaquinha, de", verb: "recebeu indiretamente de", test: (e, id) => e.kind === "indireta" && e.target === id },
  { key: "pagou", label: "Pagou a", verb: "pagou a", test: (e, id) => e.kind === "fornecimento" && e.source === id },
  { key: "doou-out", label: "Doou a", verb: "doou a", test: (e, id) => e.kind === "doacao" && e.source === id },
  { key: "ind-out", label: "Doou, por meio de partido ou vaquinha, a", verb: "doou indiretamente a", test: (e, id) => e.kind === "indireta" && e.source === id },
  { key: "recebeu", label: "Recebeu pagamentos de", verb: "recebeu pagamentos de", test: (e, id) => e.kind === "fornecimento" && e.target === id },
  { key: "cands", label: "Candidaturas do partido", verb: "tem a candidatura de", test: (e, id) => e.kind === "partido" && e.source === id },
  { key: "partido", label: "Partido", verb: "é do", test: (e, id) => e.kind === "partido" && e.target === id },
  { key: "eleicao-out", label: "Eleição", verb: "disputou as", test: (e, id) => e.kind === "eleicao" && e.source === id },
  { key: "eleicao-in", label: "Candidaturas", verb: "teve a candidatura de", test: (e, id) => e.kind === "eleicao" && e.target === id },
  { key: "proposta-out", label: "Proposta de governo", verb: "entregou a", test: (e, id) => e.kind === "proposta" && e.source === id },
  { key: "proposta-in", label: "Entregue por", verb: "foi entregue por", test: (e, id) => e.kind === "proposta" && e.target === id },
  { key: "tema-out", label: "Temas (Índice Prumo)", verb: "menciona o tema", test: (e, id) => e.kind === "tema" && e.source === id },
  { key: "tema-in", label: "Na proposta", verb: "aparece na", test: (e, id) => e.kind === "tema" && e.target === id },
  { key: "socio-in", label: "Sócios e administradores", verb: "tem como sócio ou administrador", test: (e, id) => e.kind === "socio" && e.target === id },
  { key: "socio-out", label: "É sócio ou administrador de", verb: "é sócio ou administrador de", test: (e, id) => e.kind === "socio" && e.source === id },
  { key: "contrato-out", label: "Tem contratos públicos com", verb: "tem contratos públicos com", test: (e, id) => e.kind === "contrato" && e.source === id },
  { key: "contrato-in", label: "Contratou", verb: "contratou", test: (e, id) => e.kind === "contrato" && e.target === id },
  { key: "registro-out", label: "Aparece em cadastros oficiais", verb: "aparece em", test: (e, id) => e.kind === "registro" && e.source === id },
  { key: "registro-in", label: "Registro de", verb: "é registro de", test: (e, id) => e.kind === "registro" && e.target === id },
  { key: "possivel", label: "Possível correspondência (não confirmada)", verb: "talvez corresponda a", test: (e, id) => e.kind === "possivel" && (e.source === id || e.target === id) },
];

const other = (e: GEdge, id: string) => (e.source === id ? e.target : e.source);
const dirOf = (e: GEdge, id: string): Dir => (e.source === id ? "out" : "in");

/** Supplier entities open on their supplier profile; everyone else keeps the node's own page. */
function pageOf(n: GNode, x?: Expansion) {
  if (n.href.startsWith("/doadores/") && x?.edges.some((e) => e.kind === "fornecimento" && e.target === n.id)) {
    return n.href.replace("/doadores/", "/fornecedores/");
  }
  return n.href;
}

/**
 * The connections explorer as an investigation trail: one column per step. Each column lists
 * the node's relationships in plain words ("Pagou a", "Recebeu doações de"), largest first;
 * choosing one opens the next column. The path so far reads as a sentence above.
 */
export function TrailExplorer({ initial, year, initialTrail = [] }: { initial: Expansion; year: number; initialTrail?: string[] }) {
  const root = initial.center!;
  const [cache, setCache] = useState<Record<string, Expansion>>({ [root.id]: initial });
  const [nodes, setNodes] = useState<Record<string, GNode>>(() => Object.fromEntries([root, ...initial.nodes].map((n) => [n.id, n])));
  const [trail, setTrail] = useState<string[]>([root.id]);
  const [loading, setLoading] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  async function load(id: string) {
    if (cache[id]) return cache[id];
    setLoading(id);
    try {
      const res = await fetch(`/api/grafo?no=${encodeURIComponent(id)}&ano=${year}&limite=24`);
      const x = (await res.json()) as Expansion;
      setCache((c) => ({ ...c, [id]: x }));
      setNodes((m) => {
        const n = { ...m };
        for (const v of [...(x.center ? [x.center] : []), ...x.nodes]) if (!n[v.id]) n[v.id] = v;
        return n;
      });
      return x;
    } finally {
      setLoading(null);
    }
  }

  async function open(col: number, id: string) {
    setTrail((t) => [...t.slice(0, col + 1), id]);
    await load(id);
  }

  // Restore a shared trail (?trilha=…) step by step.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const path = [root.id];
      for (const id of initialTrail) {
        if (cancelled) return;
        await load(id);
        path.push(id);
        setTrail([...path]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL shareable and the newest column in view.
  useEffect(() => {
    const u = new URL(window.location.href);
    if (trail.length > 1) u.searchParams.set("trilha", trail.slice(1).join(","));
    else u.searchParams.delete("trilha");
    window.history.replaceState(null, "", u.toString());
    const el = scroller.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [trail]);

  const edgeBetween = (a: string, b: string) => {
    const x = cache[a];
    return x?.edges.find((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a));
  };

  return (
    <div>
      <ol aria-label="Caminho seguido" className="max-w-[90ch] text-[17px] leading-relaxed text-ink-2">
        {trail.map((id, i) => {
          const n = nodes[id];
          const e = i > 0 ? edgeBetween(trail[i - 1], id) : undefined;
          const rel = e ? RELS.find((r) => r.test(e, trail[i - 1])) : undefined;
          return (
            <li key={id} className="inline">
              {rel && (
                <span>
                  {" "}
                  {rel.verb}
                  {e && e.value > 0 && <span className="num"> {brlc(e.value)}</span>}{" "}
                </span>
              )}
              <button type="button" onClick={() => setTrail((t) => t.slice(0, i + 1))} className="font-medium text-ink underline decoration-transparent underline-offset-[3px] hover:decoration-accent">
                {n?.label ?? "…"}
              </button>
              {i < trail.length - 1 && <span>,</span>}
            </li>
          );
        })}
        {trail.length === 1 && <li className="inline text-muted"> Escolha uma relação abaixo para seguir o dinheiro.</li>}
      </ol>

      <div ref={scroller} className="-mx-4 mt-6 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
        <div className="flex gap-0">
          {trail.map((id, col) => (
            <Column
              key={`${col}-${id}`}
              node={nodes[id]}
              x={cache[id]}
              loading={loading === id}
              next={trail[col + 1]}
              nodes={nodes}
              year={year}
              onOpen={(target) => open(col, target)}
              first={col === 0}
            />
          ))}
        </div>
      </div>
      <p className="mt-2 max-w-[80ch] text-[13.5px] leading-relaxed text-muted">
        Uma conexão mostra apenas que houve doação ou pagamento registrado na prestação de contas de {year}. Ela não indica, por si só, proximidade, influência ou
        irregularidade.
      </p>
    </div>
  );
}

function Column({
  node,
  x,
  loading,
  next,
  nodes,
  year,
  onOpen,
  first,
}: {
  node?: GNode;
  x?: Expansion;
  loading: boolean;
  next?: string;
  nodes: Record<string, GNode>;
  year: number;
  onOpen: (id: string) => void;
  first: boolean;
}) {
  if (!node) return null;
  const groups = x
    ? RELS.map((r) => ({ r, edges: x.edges.filter((e) => r.test(e, node.id)).sort((a, b) => b.value - a.value) })).filter((g) => g.edges.length)
    : [];
  const hidden = x ? x.truncated.donations + x.truncated.supplies : 0;
  return (
    <section
      aria-label={node.label}
      className={`w-[min(400px,88vw)] shrink-0 pr-6 ${first ? "" : "border-l border-rule pl-6"}`}
    >
      <div className="text-[13.5px] text-muted">{TYPE_LABEL[node.type]}</div>
      <h2 className="mt-0.5 font-serif text-[23px] font-medium leading-tight text-ink">{node.label}</h2>
      <p className="mt-1 text-[14px] text-ink-2">{node.sub}</p>
      <Link href={pageOf(node, x)} className="action mt-1 inline-block text-[14px]">
        Abrir a página
      </Link>

      {!x || loading ? (
        <p className="mt-6 text-[14.5px] text-muted">Carregando as relações…</p>
      ) : groups.length === 0 ? (
        <p className="mt-6 text-[14.5px] text-ink-2">Nenhuma relação registrada em {year}.</p>
      ) : (
        <div className="mt-5 space-y-6">
          {groups.map(({ r, edges }) => (
            <div key={r.key}>
              <h3 className="text-[14px] font-semibold text-ink">
                {r.label} <span className="tnum font-normal text-muted">{num(edges.length)}</span>
              </h3>
              <ul className="mt-1.5 border-t border-rule">
                {edges.map((e) => {
                  const oid = other(e, node.id);
                  const o = nodes[oid];
                  const on = next === oid;
                  return (
                    <li key={`${e.kind}-${oid}-${dirOf(e, node.id)}`} className="border-b border-rule">
                      <button
                        type="button"
                        onClick={() => onOpen(oid)}
                        aria-pressed={on}
                        className={`grid w-full grid-cols-[1fr_auto] items-baseline gap-x-3 border-l-2 py-2 pl-2.5 pr-1 text-left hover:bg-[var(--hover)] ${on ? "border-accent bg-[var(--hover)]" : e.confidence === "possivel" ? "border-dashed border-rule-strong" : "border-transparent"}`}
                      >
                        <span className="min-w-0">
                          <span className={`block truncate text-[14.5px] font-medium ${e.confidence === "possivel" ? "text-ink-2" : "text-ink"}`}>{o?.label ?? oid}</span>
                          <span className="block truncate text-[13px] text-muted">
                            {o ? TYPE_LABEL[o.type] : ""}
                            {e.n > 1 ? `, ${num(e.n)} ${e.kind === "contrato" ? "contratos" : "transações"}` : ""}
                            {e.detail && e.confidence !== "possivel" ? `, ${e.detail}` : ""}
                          </span>
                          <span className="block text-[12.5px] leading-snug text-muted">
                            {e.confidence === "possivel" ? `Possível correspondência: ${e.detail ?? "não confirmada"}. ` : ""}
                            {[e.origin, e.when].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        {e.value > 0 && e.kind !== "tema" && <span className="tnum text-[14px] text-ink">{brlc(e.value)}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {hidden > 0 && (
            <p className="text-[13.5px] text-muted">
              Mostrando as relações de maior valor; há mais {num(hidden)}.{" "}
              <Link href={pageOf(node, x)} className="link">
                Ver todas na página
              </Link>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
