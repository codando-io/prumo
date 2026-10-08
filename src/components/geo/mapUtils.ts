import { useEffect, useState } from "react";
import { baseTooltip, echarts, type Tokens } from "@/components/charts/EChart";
import { brl0, brlUnit, brlc, num, numc, pct } from "@/lib/format";

/*
 * Shared plumbing for the choropleth maps (BrazilMap, MunicipalityMap): GeoJSON loading and
 * one-time registration, the sequential colour ramp, value formatting and the ECharts option.
 * Imported only by client components.
 */

export type MapFormat = "brl" | "num" | "pct" | "brlUnit";

/*
 * Sequential single-hue ramp (blue), light → dark for magnitude. In dark mode the anchor flips:
 * low values sit near the dark surface and high values are the lightest step. Steps come from
 * the validated dataviz blue ramp (light 100…650, dark 700…150).
 */
export const SEQ_RAMP_LIGHT = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#104281"];
export const SEQ_RAMP_DARK = ["#0d366b", "#184f95", "#2a78d6", "#5598e7", "#86b6ef", "#b7d3f6"];

export function seqRamp(t: Tokens) {
  return t.dark ? SEQ_RAMP_DARK : SEQ_RAMP_LIGHT;
}

/** Value as shown in tooltips (full) or on the legend (compact). */
export function formatMapValue(v: number | null | undefined, format: MapFormat, compact = false): string {
  if (v == null || !Number.isFinite(v)) return "—";
  switch (format) {
    case "brl":
      return compact ? brlc(v) : brl0(v);
    case "brlUnit":
      return brlUnit(v);
    case "pct":
      return pct(v);
    default:
      return compact ? numc(v) : num(v);
  }
}

/* ---------- GeoJSON loading ---------- */

interface LoadedMap {
  name: string;
  /** cos(mid-latitude): keeps shapes undistorted at Brazil's latitudes. */
  aspect: number;
}

const cache = new Map<string, Promise<LoadedMap>>();

function latRange(geo: { features: { geometry: { coordinates: unknown } }[] }): [number, number] {
  let lo = 90;
  let hi = -90;
  const walk = (c: unknown) => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number" && typeof c[1] === "number") {
      if (c[1] < lo) lo = c[1];
      if (c[1] > hi) hi = c[1];
      return;
    }
    for (const x of c) walk(x);
  };
  for (const f of geo.features) walk(f.geometry?.coordinates);
  return lo <= hi ? [lo, hi] : [-15, -15];
}

function loadGeoMap(name: string, url: string): Promise<LoadedMap> {
  let p = cache.get(name);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Mapa indisponível (${r.status})`);
        return r.json();
      })
      .then((geo: { features: { properties: Record<string, unknown>; geometry: { coordinates: unknown } }[] }) => {
        // ECharts matches regions to data by name with strict equality and data names are
        // strings, so numeric keys (properties.ibge) must become strings before registering.
        for (const f of geo.features) {
          for (const k of Object.keys(f.properties ?? {})) if (typeof f.properties[k] === "number") f.properties[k] = String(f.properties[k]);
        }
        if (!echarts.getMap(name)) echarts.registerMap(name, geo as never);
        const [lo, hi] = latRange(geo);
        return { name, aspect: Math.cos((((lo + hi) / 2) * Math.PI) / 180) };
      });
    p.catch(() => cache.delete(name));
    cache.set(name, p);
  }
  return p;
}

/** Load and register a GeoJSON map once per page session. */
export function useGeoMap(name: string, url: string) {
  const [state, setState] = useState<{ name: string; map: LoadedMap | null; error: boolean }>({ name, map: null, error: false });
  useEffect(() => {
    let alive = true;
    loadGeoMap(name, url).then(
      (map) => alive && setState({ name, map, error: false }),
      () => alive && setState({ name, map: null, error: true }),
    );
    return () => {
      alive = false;
    };
  }, [name, url]);
  return state.name === name ? state : { name, map: null, error: false };
}

/* ---------- Option ---------- */

export interface MapItem {
  /** Region key as stored in the GeoJSON property named by `nameProperty`. */
  key: string;
  value: number | null;
  title: string;
  note?: string;
  href?: string;
  highlight?: boolean;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function buildMapOption({
  t,
  map,
  aspect,
  nameProperty,
  items,
  format,
  label,
  domain,
  showLegend,
  emptyTitle,
}: {
  t: Tokens;
  map: string;
  aspect: number;
  nameProperty: string;
  items: MapItem[];
  format: MapFormat;
  label: string;
  domain?: [number, number];
  showLegend: boolean;
  emptyTitle: (key: string) => string;
}) {
  const values = items.map((i) => i.value).filter((v): v is number => v != null && Number.isFinite(v));
  const lo = domain?.[0] ?? 0;
  let hi = domain?.[1] ?? Math.max(0, ...values);
  if (hi <= lo) hi = lo + (format === "pct" ? 0.01 : 1);
  const byKey = new Map(items.map((i) => [i.key, i]));
  const legendH = showLegend ? 34 : 0;

  return {
    animation: false,
    textStyle: { fontFamily: t.font },
    tooltip: {
      ...baseTooltip(t),
      trigger: "item",
      formatter: (p: { name: string }) => {
        const it = byKey.get(p.name);
        if (!it) return `<div style="font-weight:600">${esc(emptyTitle(p.name))}</div><div style="color:${t.muted}">Sem dados</div>`;
        const line = it.value == null ? `<div style="color:${t.muted}">Sem dados</div>` : `<div>${label ? `${esc(label)}: ` : ""}<span style="font-weight:600">${formatMapValue(it.value, format)}</span></div>`;
        return `<div style="font-weight:600">${esc(it.title)}</div>${label || it.value == null ? line : ""}${it.note ? `<div style="color:${t.muted};max-width:260px;white-space:normal">${esc(it.note)}</div>` : ""}`;
      },
    },
    visualMap: {
      type: "continuous",
      show: showLegend,
      min: lo,
      max: hi,
      calculable: false,
      realtime: false,
      seriesIndex: 0,
      orient: "horizontal",
      left: 0,
      bottom: 0,
      itemWidth: 10,
      itemHeight: 140,
      text: [formatMapValue(hi, format, true), formatMapValue(lo, format, true)],
      formatter: (v: number) => formatMapValue(v, format, true),
      textGap: 8,
      textStyle: { color: t.muted, fontSize: 11.5, fontFamily: t.font },
      inRange: { color: seqRamp(t) },
      outOfRange: { color: t.rule },
    },
    series: [
      {
        type: "map",
        map,
        nameProperty,
        roam: false,
        selectedMode: false,
        aspectScale: aspect,
        // ECharts 6 stretches the map to the box unless asked to keep the shape.
        preserveAspect: true,
        left: 4,
        right: 4,
        top: 4,
        bottom: legendH + 6,
        cursor: "pointer",
        label: { show: false },
        itemStyle: { areaColor: t.rule, borderColor: t.surface, borderWidth: 0.8 },
        emphasis: { label: { show: false }, itemStyle: { areaColor: null, color: null, borderColor: t.ink, borderWidth: 1.6 } },
        select: { disabled: true },
        data: items.map((i) => ({
          name: i.key,
          value: i.value == null ? NaN : i.value,
          ...(i.highlight ? { itemStyle: { borderColor: t.ink, borderWidth: 2 } } : {}),
        })),
      },
    ],
  };
}
