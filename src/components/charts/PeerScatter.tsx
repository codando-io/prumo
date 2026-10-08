"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { EChart, baseTooltip, useTokens } from "./EChart";
import { brl, brlUnit, brlc, num, numc } from "@/lib/format";

/**
 * Spending vs votes for every campaign to the same office (same state), log scales.
 * The highlighted point is the current campaign. Purely descriptive: no ranking, no fit line.
 */
export function PeerScatter({
  peers,
  currentId,
  year,
  height = 360,
}: {
  peers: { id: string; ballot_name: string; party: string; votes: number; expense: number; expense_per_vote: number; elected: boolean }[];
  currentId: string;
  year: number;
  height?: number;
}) {
  const t = useTokens();
  const router = useRouter();
  const option = useMemo(() => {
    if (!t) return null;
    const others = peers.filter((p) => p.id !== currentId);
    const me = peers.find((p) => p.id === currentId);
    const pt = (p: (typeof peers)[number]) => ({ value: [p.votes, p.expense], id: p.id, name: p.ballot_name, party: p.party, epv: p.expense_per_vote, elected: p.elected });
    return {
      animation: false,
      textStyle: { fontFamily: t.font },
      grid: { left: 8, right: 24, top: 16, bottom: 28, containLabel: true },
      tooltip: {
        ...baseTooltip(t),
        trigger: "item",
        formatter: (p: { data: { name: string; party: string; value: [number, number]; epv: number; elected: boolean } }) =>
          `<div style="font-weight:600">${p.data.name} <span style="font-weight:400;color:${t.muted}">${p.data.party}</span></div>
           <div>${num(p.data.value[0])} votos · ${brl(p.data.value[1])}</div>
           <div style="color:${t.muted}">${brlUnit(p.data.epv)} por voto${p.data.elected ? " · eleito(a)" : ""}</div>`,
      },
      xAxis: {
        type: "log",
        name: "Votos (escala logarítmica)",
        nameLocation: "middle",
        nameGap: 26,
        nameTextStyle: { color: t.muted, fontSize: 12 },
        axisLine: { lineStyle: { color: t.axis } },
        axisLabel: { color: t.muted, fontSize: 11, formatter: (v: number) => numc(v) },
        splitLine: { lineStyle: { color: t.rule } },
      },
      yAxis: {
        type: "log",
        axisLabel: { color: t.muted, fontSize: 11, formatter: (v: number) => brlc(v) },
        splitLine: { lineStyle: { color: t.rule } },
      },
      series: [
        {
          type: "scatter",
          data: others.map(pt),
          symbolSize: 7,
          itemStyle: { color: t.spend, opacity: 0.35, borderColor: t.surface, borderWidth: 1 },
          emphasis: { itemStyle: { opacity: 1 } },
        },
        me && {
          type: "scatter",
          data: [pt(me)],
          symbolSize: 14,
          z: 10,
          itemStyle: { color: t.brass, borderColor: t.surface, borderWidth: 2 },
          label: { show: true, position: "right", color: t.ink, fontWeight: 600, fontSize: 12, formatter: () => me.ballot_name },
        },
      ].filter(Boolean),
    };
  }, [t, peers, currentId]);

  const onEvents = useMemo(
    () => ({
      click: (p: unknown) => {
        const id = (p as { data?: { id?: string } }).data?.id;
        if (id) router.push(`/candidatos/${year}/${id}`);
      },
    }),
    [router, year],
  );

  return <EChart option={option} height={height} onEvents={onEvents} ariaLabel="Gasto e votos das campanhas ao mesmo cargo" />;
}
