"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { EChart, useTokens } from "./EChart";
import { buildMapOption, useGeoMap, type MapFormat, type MapItem } from "@/components/geo/mapUtils";
import { UF_NAMES } from "@/lib/labels";

export type { MapFormat };

export interface BrazilMapDatum {
  /** Two-letter state code, as in `/geo/br-uf.json` (`properties.uf`). */
  uf: string;
  value: number | null;
  /** Optional extra line for the tooltip (plain text). */
  note?: string;
}

/**
 * Choropleth of the 27 federative units: one measure, a single-hue sequential scale with a
 * small gradient legend, hover tooltip with the value (no rank). States without data are
 * drawn in the rule colour. Clicking a state navigates to `hrefTemplate` with `{uf}`
 * replaced. Pair it with a table on the page: the map is never the only view of the data.
 */
export function BrazilMap({
  data,
  format,
  label,
  hrefTemplate,
  height = 440,
  domain,
  showLegend = true,
  ariaLabel,
}: {
  data: BrazilMapDatum[];
  format: MapFormat;
  /** Metric name for the tooltip, e.g. "Total de despesas". */
  label: string;
  /** e.g. "/estados/{uf}?ano=2026" */
  hrefTemplate?: string;
  /** Pixels or any CSS length, e.g. "clamp(300px, 90vw, 460px)". */
  height?: number | string;
  /** Colour-scale domain; defaults to [0, max]. */
  domain?: [number, number];
  showLegend?: boolean;
  ariaLabel?: string;
}) {
  const t = useTokens();
  const router = useRouter();
  const geo = useGeoMap("prumo-br-uf", "/geo/br-uf.json");

  const items = useMemo<MapItem[]>(
    () =>
      data
        .filter((d) => d.uf !== "BR" && d.uf !== "ZZ")
        .map((d) => ({
          key: d.uf,
          value: d.value,
          title: UF_NAMES[d.uf] ?? d.uf,
          note: d.note,
          href: hrefTemplate ? hrefTemplate.replaceAll("{uf}", d.uf) : undefined,
        })),
    [data, hrefTemplate],
  );

  const option = useMemo(() => {
    if (!t || !geo.map) return null;
    return buildMapOption({
      t,
      map: geo.map.name,
      aspect: geo.map.aspect,
      nameProperty: "uf",
      items,
      format,
      label,
      domain,
      showLegend,
      emptyTitle: (k) => UF_NAMES[k] ?? k,
    });
  }, [t, geo.map, items, format, label, domain, showLegend]);

  const onEvents = useMemo(
    () => ({
      click: (p: unknown) => {
        const name = (p as { name?: string }).name;
        const href = items.find((i) => i.key === name)?.href;
        if (href) router.push(href);
      },
    }),
    [items, router],
  );

  if (geo.error) return <MapError height={height} />;
  return <EChart option={option} height={height} renderer="svg" onEvents={onEvents} ariaLabel={ariaLabel ?? `Mapa do Brasil por estado: ${label}`} />;
}

export function MapError({ height }: { height: number | string }) {
  return (
    <div className="grid place-items-center text-[13.5px] text-muted" style={{ height }}>
      Não foi possível carregar o mapa. Os mesmos dados estão na tabela.
    </div>
  );
}
