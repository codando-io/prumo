"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { EChart, baseTooltip, useTokens } from "./EChart";
import { brl, pct } from "@/lib/format";

export interface FlowNode {
  id: string;
  label: string;
  colorKey: string; // fund:<group> | spend | account | sink | supplier
  depth: number;
  href?: string;
}
export interface FlowEdge {
  source: string;
  target: string;
  value: number;
}

/** Sankey of a campaign's money: source → account → spending group → supplier. */
export function FlowChart({ nodes, links, height = 520 }: { nodes: FlowNode[]; links: FlowEdge[]; height?: number }) {
  const t = useTokens();
  const router = useRouter();

  const option = useMemo(() => {
    if (!t) return null;
    const colorOf = (k: string) => {
      if (k.startsWith("fund:")) return t.fund[k.slice(5)] ?? t.fund.outras;
      if (k === "spend") return t.spend;
      if (k === "account") return t.ink2;
      if (k === "sink") return t.axis;
      return t.spendSoft;
    };
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const total = links.filter((l) => byId.get(l.source)?.depth === 0).reduce((s, l) => s + l.value, 0);
    return {
      animation: false,
      textStyle: { fontFamily: t.font },
      tooltip: {
        ...baseTooltip(t),
        trigger: "item",
        formatter: (p: { dataType: string; data: { source?: string; target?: string; value: number; name?: string } }) => {
          if (p.dataType === "edge") {
            const s = byId.get(p.data.source!);
            const d = byId.get(p.data.target!);
            return `<div style="font-weight:600">${brl(p.data.value)}</div><div style="color:${t.muted}">${s?.label} → ${d?.label}</div>`;
          }
          const n = byId.get(p.data.name!);
          return `<div style="font-weight:600">${n?.label}</div><div style="color:${t.muted}">${brl(p.data.value)}${total ? ` · ${pct(p.data.value / total)}` : ""}</div>`;
        },
      },
      series: [
        {
          type: "sankey",
          left: 4,
          right: 220,
          top: 8,
          bottom: 8,
          nodeWidth: 10,
          nodeGap: 10,
          layoutIterations: 64,
          draggable: false,
          emphasis: { focus: "adjacency" },
          label: { color: t.ink, fontSize: 12, fontFamily: t.font, formatter: (p: { name: string }) => truncate(byId.get(p.name)?.label ?? p.name, 32) },
          lineStyle: { color: "gradient", opacity: 0.28, curveness: 0.5 },
          itemStyle: { borderWidth: 0 },
          data: nodes.map((n) => ({ name: n.id, depth: n.depth, itemStyle: { color: colorOf(n.colorKey) } })),
          links: links.filter((l) => l.value > 0),
        },
      ],
    };
  }, [t, nodes, links]);

  const onEvents = useMemo(
    () => ({
      click: (p: unknown) => {
        const e = p as { dataType: string; data: { name?: string } };
        if (e.dataType !== "node") return;
        const n = nodes.find((x) => x.id === e.data.name);
        if (n?.href) router.push(n.href);
      },
    }),
    [nodes, router],
  );

  return <EChart option={option} height={height} renderer="svg" onEvents={onEvents} ariaLabel="Fluxo do dinheiro da campanha, das fontes aos fornecedores" />;
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
