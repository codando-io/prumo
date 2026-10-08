"use client";

import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, SankeyChart, GraphChart, MapChart, ScatterChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkAreaComponent,
  VisualMapComponent,
  GeoComponent,
  LegendComponent,
  DataZoomComponent,
} from "echarts/components";
import { SVGRenderer, CanvasRenderer } from "echarts/renderers";

echarts.use([
  BarChart,
  LineChart,
  SankeyChart,
  GraphChart,
  MapChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkAreaComponent,
  VisualMapComponent,
  GeoComponent,
  LegendComponent,
  DataZoomComponent,
  SVGRenderer,
  CanvasRenderer,
]);

export { echarts };

export interface Tokens {
  surface: string;
  ink: string;
  ink2: string;
  muted: string;
  rule: string;
  axis: string;
  brass: string;
  spend: string;
  spendSoft: string;
  fund: Record<string, string>;
  font: string;
  dark: boolean;
}

function readTokens(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    surface: v("--surface"),
    ink: v("--ink"),
    ink2: v("--ink-2"),
    muted: v("--muted"),
    rule: v("--rule"),
    axis: v("--axis"),
    brass: v("--brass"),
    spend: v("--spend"),
    spendSoft: v("--spend-soft"),
    fund: {
      fefc: v("--fund-fefc"),
      fp: v("--fund-fp"),
      pf: v("--fund-pf"),
      partido: v("--fund-partido"),
      proprios: v("--fund-proprios"),
      coletivo: v("--fund-coletivo"),
      outras: v("--fund-outras"),
    },
    font: getComputedStyle(document.body).fontFamily,
    dark: cs.getPropertyValue("color-scheme").includes("dark"),
  };
}

/** Design tokens resolved from CSS, refreshed when the theme changes. */
export function useTokens(): Tokens | null {
  const [t, setT] = useState<Tokens | null>(null);
  useEffect(() => {
    const update = () => setT(readTokens());
    update();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    window.addEventListener("prumo-theme", update);
    return () => {
      mq.removeEventListener("change", update);
      window.removeEventListener("prumo-theme", update);
    };
  }, []);
  return t;
}

export function baseTooltip(t: Tokens) {
  return {
    backgroundColor: t.surface,
    borderColor: t.rule,
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: t.ink, fontFamily: t.font, fontSize: 13 },
    extraCssText: "border-radius:8px;box-shadow:0 10px 28px -12px rgba(23,32,54,.35);",
  };
}

export function EChart({
  option,
  height,
  renderer = "svg",
  onEvents,
  ariaLabel,
  className,
  merge = false,
}: {
  option: echarts.EChartsCoreOption | null;
  /** Merge updates into the existing chart (keeps force-layout positions) instead of replacing. */
  merge?: boolean;
  height: number | string;
  renderer?: "svg" | "canvas";
  onEvents?: Record<string, (params: unknown) => void>;
  ariaLabel: string;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, undefined, { renderer });
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, [renderer]);

  useEffect(() => {
    const c = chart.current;
    if (c && !c.isDisposed() && option) c.setOption(option, { notMerge: !merge });
  }, [option, renderer, merge]);

  useEffect(() => {
    const c = chart.current;
    if (!c || c.isDisposed() || !onEvents) return;
    for (const [name, fn] of Object.entries(onEvents)) c.on(name, fn);
    return () => {
      if (!c.isDisposed()) for (const [name, fn] of Object.entries(onEvents)) c.off(name, fn);
    };
  }, [onEvents, renderer]);

  return <div ref={el} role="img" aria-label={ariaLabel} className={className} style={{ height, width: "100%" }} />;
}
