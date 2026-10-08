"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { EChart, baseTooltip, useTokens } from "@/components/charts/EChart";
import { brl, brlc, num } from "@/lib/format";
import type { Expansion, GEdge, GNode, NodeType } from "@/lib/queries/graph";

const TYPE_LABEL: Record<NodeType, string> = {
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

const EDGE_LABEL: Record<GEdge["kind"], string> = {
  doacao: "doou",
  fornecimento: "pagou",
  indireta: "doou via partido ou vaquinha",
  partido: "candidatura do partido",
  socio: "é sócio ou administrador de",
  contrato: "tem contratos públicos com",
  registro: "aparece em",
  eleicao: "disputou",
  proposta: "entregou",
  tema: "menciona (Índice Prumo)",
  possivel: "possível correspondência com",
};

const MIN_STEPS = [0, 1_000, 10_000, 100_000, 1_000_000];

export function GraphExplorer({ initial, year }: { initial: Expansion; year: number }) {
  const t = useTokens();
  const [nodes, setNodes] = useState<Map<string, GNode>>(() => {
    const m = new Map<string, GNode>();
    if (initial.center) m.set(initial.center.id, initial.center);
    for (const n of initial.nodes) if (!m.has(n.id)) m.set(n.id, n);
    return m;
  });
  const [edges, setEdges] = useState<GEdge[]>(initial.edges);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initial.center ? [initial.center.id] : []));
  const [selected, setSelected] = useState<string | null>(initial.center?.id ?? null);
  const [loading, setLoading] = useState<string | null>(null);
  const [show, setShow] = useState({ doacao: true, fornecimento: true, indireta: true, partido: true });
  const [minIdx, setMinIdx] = useState(0);
  const [truncated, setTruncated] = useState<Record<string, Expansion["truncated"]>>(() => (initial.center ? { [initial.center.id]: initial.truncated } : {}));
  const [added, setAdded] = useState<Record<string, number>>({});

  const expand = useCallback(
    async (id: string) => {
      if (expanded.has(id)) return;
      setLoading(id);
      try {
        const res = await fetch(`/api/grafo?no=${encodeURIComponent(id)}&ano=${year}`);
        const x = (await res.json()) as Expansion;
        setNodes((prev) => {
          const m = new Map(prev);
          for (const n of x.nodes) if (!m.has(n.id)) m.set(n.id, n);
          if (x.center && m.has(x.center.id)) m.set(x.center.id, { ...m.get(x.center.id)!, value: Math.max(m.get(x.center.id)!.value, x.center.value) });
          return m;
        });
        setEdges((prev) => {
          const key = (e: GEdge) => `${e.source}>${e.target}>${e.kind}`;
          const seen = new Set(prev.map(key));
          return [...prev, ...x.edges.filter((e) => !seen.has(key(e)))];
        });
        setExpanded((s) => new Set(s).add(id));
        setTruncated((tr) => ({ ...tr, [id]: x.truncated }));
        setAdded((a) => ({ ...a, [id]: x.nodes.filter((n) => !nodes.has(n.id)).length }));
      } finally {
        setLoading(null);
      }
    },
    [expanded, year, nodes],
  );

  const minValue = MIN_STEPS[minIdx];
  const visibleEdges = useMemo(
    () => edges.filter((e) => (show[e.kind as keyof typeof show] ?? true) && (!["doacao", "fornecimento", "indireta"].includes(e.kind) || e.value >= minValue)),
    [edges, show, minValue],
  );
  const visibleNodeIds = useMemo(() => {
    const s = new Set<string>(expanded);
    for (const e of visibleEdges) {
      s.add(e.source);
      s.add(e.target);
    }
    return s;
  }, [visibleEdges, expanded]);

  const option = useMemo(() => {
    if (!t) return null;
    const colorOf = (type: NodeType) =>
      ({
        candidato: t.ink,
        partido: t.surface,
        pf: t.fund.pf,
        pj: t.spend,
        partido_org: t.fund.partido,
        plataforma: t.fund.coletivo,
        desconhecido: t.muted,
        pessoa: t.ink2,
        orgao: t.surface,
        registro: t.muted,
        eleicao: t.surface,
        proposta: t.surface,
        tema: t.surface,
      })[type];
    const list = [...nodes.values()].filter((n) => visibleNodeIds.has(n.id));
    const maxV = Math.max(...list.map((n) => n.value), 1);
    const maxE = Math.max(...visibleEdges.map((e) => e.value), 1);
    return {
      animationDurationUpdate: 300,
      textStyle: { fontFamily: t.font },
      tooltip: {
        ...baseTooltip(t),
        formatter: (p: { dataType: string; data: { id?: string; source?: string; target?: string; value?: number; kind?: GEdge["kind"]; n?: number } }) => {
          if (p.dataType === "edge") {
            const s = nodes.get(p.data.source!);
            const d = nodes.get(p.data.target!);
            if (p.data.kind === "partido") return `${d?.label} é candidatura do ${s?.label}`;
            return `<div style="font-weight:600">${brl(p.data.value)}</div><div style="color:${t.muted}">${s?.label} ${EDGE_LABEL[p.data.kind!]} ${p.data.kind === "fornecimento" ? "" : "a "}${d?.label}${p.data.n ? ` · ${num(p.data.n)} transações` : ""}</div>`;
          }
          const n = nodes.get(p.data.id!);
          return `<div style="font-weight:600">${n?.label}</div><div style="color:${t.muted}">${n?.sub}</div>${n?.value ? `<div>${brlc(n.value)}</div>` : ""}`;
        },
      },
      series: [
        {
          type: "graph",
          layout: "force",
          roam: true,
          draggable: true,
          force: { repulsion: 280, edgeLength: [70, 170], gravity: 0.07, friction: 0.2 },
          edgeSymbol: ["none", "arrow"],
          edgeSymbolSize: 6,
          label: { show: true, position: "right", color: t.ink, fontSize: 11, formatter: (p: { data: { label: string; showLabel: boolean } }) => (p.data.showLabel ? truncate(p.data.label, 28) : "") },
          emphasis: { focus: "adjacency", label: { show: true, formatter: (p: { data: { label: string } }) => truncate(p.data.label, 40) }, lineStyle: { opacity: 0.9 } },
          data: list.map((n) => {
            const size = n.type === "partido" ? 22 : 10 + 30 * Math.sqrt(n.value / maxV);
            return {
              id: n.id,
              name: n.id,
              label: n.label,
              showLabel: list.length <= 18 || expanded.has(n.id) || n.id === selected || size > 18,
              symbolSize: size,
              symbol: n.type === "candidato" ? "circle" : n.type === "partido" ? "roundRect" : n.type === "pf" ? "circle" : "diamond",
              itemStyle: {
                color: colorOf(n.type),
                borderColor: n.id === selected ? t.brass : n.type === "partido" ? t.ink2 : t.surface,
                borderWidth: n.id === selected ? 3 : n.type === "partido" ? 1.5 : 2,
              },
            };
          }),
          links: visibleEdges.map((e) => ({
            source: e.source,
            target: e.target,
            value: e.value,
            kind: e.kind,
            n: e.n,
            lineStyle: {
              color: e.kind === "fornecimento" ? t.spend : e.kind === "partido" ? t.axis : t.fund.pf,
              width: e.kind === "partido" ? 1 : 1 + 5 * Math.sqrt(e.value / maxE),
              opacity: e.kind === "indireta" ? 0.35 : 0.55,
              type: e.confidence === "possivel" ? "dashed" : "solid",
              curveness: 0.08,
            },
          })),
        },
      ],
    };
  }, [t, nodes, visibleEdges, visibleNodeIds, expanded, selected]);

  const onEvents = useMemo(
    () => ({
      click: (p: unknown) => {
        const e = p as { dataType: string; data: { id?: string } };
        if (e.dataType === "node" && e.data.id) setSelected(e.data.id);
      },
      dblclick: (p: unknown) => {
        const e = p as { dataType: string; data: { id?: string } };
        if (e.dataType === "node" && e.data.id) expand(e.data.id);
      },
    }),
    [expand],
  );

  const sel = selected ? nodes.get(selected) : null;
  const selEdges = sel ? edges.filter((e) => e.source === sel.id || e.target === sel.id).sort((a, b) => b.value - a.value) : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px]">
          {(
            [
              ["doacao", "Doações", t?.fund.pf],
              ["fornecimento", "Pagamentos a fornecedores", t?.spend],
              ["indireta", "Doações via partido ou vaquinha", t?.fund.pf],
              ["partido", "Partido", t?.axis],
            ] as const
          ).map(([k, label, color]) => (
            <label key={k} className="inline-flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={show[k]} onChange={(e) => setShow((s) => ({ ...s, [k]: e.target.checked }))} className="h-4 w-4 accent-[var(--accent)]" />
              <span aria-hidden="true" className="inline-block h-[3px] w-5 rounded" style={{ background: color, opacity: k === "indireta" ? 0.5 : 1 }} />
              {label}
            </label>
          ))}
          <label className="inline-flex items-center gap-2">
            Valor mínimo
            <input type="range" min={0} max={MIN_STEPS.length - 1} step={1} value={minIdx} onChange={(e) => setMinIdx(Number(e.target.value))} className="w-28 accent-[var(--accent)]" aria-valuetext={brlc(minValue)} />
            <span className="tnum w-16 text-ink-2">{minValue ? brlc(minValue) : "qualquer"}</span>
          </label>
        </div>
        <div className="relative overflow-hidden border-y border-rule">
          <EChart option={option} height={620} renderer="canvas" merge onEvents={onEvents} ariaLabel="Mapa de conexões entre candidaturas, doadores, fornecedores e partidos" />
          {loading && <div className="absolute left-3 top-3 bg-bg px-2 py-1 text-[13px] text-ink-2">Carregando conexões…</div>}
          <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-x-4 gap-y-1 bg-bg/90 px-2.5 py-1.5 text-[12.5px] text-ink-2">
            <Legend shape="circle" color="var(--ink)" label="Candidatura" />
            <Legend shape="circle" color="var(--fund-pf)" label="Pessoa física" />
            <Legend shape="diamond" color="var(--spend)" label="Empresa" />
            <Legend shape="diamond" color="var(--fund-partido)" label="Órgão partidário" />
            <Legend shape="square" color="var(--surface)" border label="Partido" />
          </div>
        </div>
        <p className="mt-2 text-[13.5px] text-muted">Clique para ver detalhes; clique duas vezes (ou use “Expandir”) para abrir as conexões de um nó. Arraste para reorganizar; role para aproximar.</p>
      </div>

      <aside className="min-w-0" aria-live="polite">
        {sel ? (
          <div>
            <div className="text-[13.5px] text-muted">{TYPE_LABEL[sel.type]}</div>
            <h2 className="mt-0.5 font-serif text-[23px] font-medium leading-tight text-ink">{sel.label}</h2>
            <p className="mt-1 text-[14px] text-ink-2">{sel.sub}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {!expanded.has(sel.id) && (
                <button type="button" onClick={() => expand(sel.id)} disabled={loading === sel.id} className="rounded-[6px] border border-rule-strong px-3 py-1.5 text-[14px] text-ink hover:border-accent disabled:opacity-60">
                  Expandir conexões
                </button>
              )}
              <Link href={sel.href} className="action px-1 py-1.5 text-[14px]">
                Abrir página
              </Link>
            </div>
            {added[sel.id] === 0 && (
              <p className="mt-3 text-[12.5px] leading-snug text-muted">Nenhuma outra conexão em {year} além das que já estão no mapa.</p>
            )}
            {truncated[sel.id] && (truncated[sel.id].donations > 0 || truncated[sel.id].supplies > 0) && (
              <p className="mt-3 text-[12.5px] leading-snug text-muted">
                Mostrando as conexões de maior valor. Há mais {num(truncated[sel.id].donations + truncated[sel.id].supplies)} na página completa.
              </p>
            )}
            <h3 className="mt-6 text-[14px] font-semibold text-ink">Conexões carregadas</h3>
            <ul className="mt-2 max-h-[360px] divide-y divide-rule overflow-auto border-y border-rule text-[14px]">
              {selEdges.length === 0 && <li className="py-2 text-muted">Nenhuma ainda. Use “Expandir conexões”.</li>}
              {selEdges.map((e, i) => {
                const other = nodes.get(e.source === sel.id ? e.target : e.source);
                if (!other) return null;
                const verb =
                  e.kind === "partido" ? "partido" : e.kind === "fornecimento" ? (e.source === sel.id ? "pagou a" : "recebeu de") : e.source === sel.id ? "doou a" : "recebeu de";
                return (
                  <li key={i} className="flex items-start justify-between gap-3 py-2">
                    <button type="button" onClick={() => setSelected(other.id)} className="min-w-0 text-left hover:underline">
                      <span className="block text-muted">{verb}</span>
                      <span className="block truncate font-medium text-ink">{other.label}</span>
                    </button>
                    {e.value > 0 && <span className="tnum shrink-0">{brlc(e.value)}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="text-[14px] text-ink-2">Selecione um nó para ver detalhes.</p>
        )}
        <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
          Uma conexão mostra apenas que houve doação ou pagamento registrado na prestação de contas. Ela não indica, por si só, proximidade, influência ou
          irregularidade.
        </p>
      </aside>

      <details className="lg:col-span-2">
        <summary className="action cursor-pointer text-[14.5px]">Ver todas as conexões visíveis em lista ({num(visibleEdges.length)})</summary>
        <table className="dt mt-3">
          <thead>
            <tr>
              <th scope="col">De</th>
              <th scope="col">Relação</th>
              <th scope="col">Para</th>
              <th scope="col" className="n">Valor</th>
            </tr>
          </thead>
          <tbody>
            {[...visibleEdges]
              .sort((a, b) => b.value - a.value)
              .map((e, i) => (
                <tr key={i}>
                  <td className="e">{nodes.get(e.source)?.label}</td>
                  <td className="s">{EDGE_LABEL[e.kind]}</td>
                  <td className="e">{nodes.get(e.target)?.label}</td>
                  <td className="n">{e.value ? brl(e.value) : "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function Legend({ shape, color, label, border }: { shape: "circle" | "diamond" | "square"; color: string; label: string; border?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={`inline-block h-2.5 w-2.5 ${shape === "circle" ? "rounded-full" : shape === "diamond" ? "rotate-45" : "rounded-[2px]"}`}
        style={{ background: color, boxShadow: border ? "inset 0 0 0 1.5px var(--ink-2)" : undefined }}
      />
      {label}
    </span>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
