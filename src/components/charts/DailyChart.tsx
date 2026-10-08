"use client";

import { useMemo, useState } from "react";
import { EChart, baseTooltip, useTokens } from "./EChart";
import { brl, brlc, dateLong } from "@/lib/format";

/**
 * Money over time. One measure at a time (spending or revenue) — never two y-axes.
 * Election days are marked with a brass rule.
 */
export function DailyChart({
  data,
  marks,
  initial = "expense",
  height = 240,
}: {
  data: { date: string; expense: number; revenue: number }[];
  marks: { date: string; label: string }[];
  initial?: "expense" | "revenue";
  height?: number;
}) {
  const t = useTokens();
  const [mode, setMode] = useState<"expense" | "revenue">(initial);
  const [cumulative, setCumulative] = useState(false);

  const option = useMemo(() => {
    if (!t) return null;
    let acc = 0;
    const series = data.map((d) => {
      const v = mode === "expense" ? d.expense : d.revenue;
      acc += v;
      return [d.date, cumulative ? acc : v];
    });
    const color = mode === "expense" ? t.spend : t.fund.fefc;
    return {
      animation: false,
      textStyle: { fontFamily: t.font },
      grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
      tooltip: {
        ...baseTooltip(t),
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: t.axis } },
        formatter: (ps: { value: [string, number] }[]) => {
          const p = ps[0];
          return `<div style="font-weight:600">${brl(p.value[1])}</div><div style="color:${t.muted}">${cumulative ? "acumulado até " : ""}${dateLong(p.value[0])}</div>`;
        },
      },
      xAxis: {
        type: "time",
        axisLine: { lineStyle: { color: t.axis } },
        axisTick: { show: false },
        axisLabel: { color: t.muted, fontSize: 12, hideOverlap: true, formatter: "{dd}/{MM}" },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: t.muted, fontSize: 12, formatter: (v: number) => brlc(v) },
        splitLine: { lineStyle: { color: t.rule } },
      },
      series: [
        cumulative
          ? {
              type: "line",
              data: series,
              showSymbol: false,
              lineStyle: { width: 2, color },
              areaStyle: { color, opacity: 0.1 },
              step: "end",
              markLine: markLine(),
            }
          : {
              type: "bar",
              data: series,
              barMaxWidth: 10,
              itemStyle: { color, borderRadius: [3, 3, 0, 0] },
              markLine: markLine(),
            },
      ],
    };
    function markLine() {
      return {
        symbol: "none",
        silent: true,
        lineStyle: { color: t!.brass, type: "solid", width: 1 },
        label: { color: t!.ink2, fontSize: 11, formatter: (p: { name: string }) => p.name, position: "insideEndTop" },
        data: marks.map((m) => ({ xAxis: m.date, name: m.label })),
      };
    }
  }, [t, data, marks, mode, cumulative]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
        <Toggle on={mode === "expense"} onClick={() => setMode("expense")}>
          Gastos contratados
        </Toggle>
        <Toggle on={mode === "revenue"} onClick={() => setMode("revenue")}>
          Receitas
        </Toggle>
        <span className="mx-1 h-4 w-px bg-rule" aria-hidden="true" />
        <Toggle on={!cumulative} onClick={() => setCumulative(false)}>
          Por dia
        </Toggle>
        <Toggle on={cumulative} onClick={() => setCumulative(true)}>
          Acumulado
        </Toggle>
      </div>
      <EChart option={option} height={height} ariaLabel={`${mode === "expense" ? "Gastos" : "Receitas"} por data`} />
    </div>
  );
}

export function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`border-b pb-0.5 ${on ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
    >
      {children}
    </button>
  );
}
