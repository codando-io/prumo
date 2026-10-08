"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { EChart, useTokens } from "./EChart";
import { MapError } from "./BrazilMap";
import { buildMapOption, useGeoMap, type MapFormat, type MapItem } from "@/components/geo/mapUtils";

export interface MunicipalityMapDatum {
  /** IBGE municipality code, as in `/geo/mun/{UF}.json` (`properties.ibge`). */
  ibge: number;
  value: number | null;
  name: string;
  /** TSE municipality code (fills `{tse}` in `hrefTemplate`); or pass a `codes` mapping. */
  tse?: number | string;
  /** Optional extra line for the tooltip (plain text). */
  note?: string;
}

/**
 * Choropleth of one state's municipalities, same conventions as BrazilMap. `hrefTemplate` may
 * use `{ibge}` and/or `{tse}`; TSE codes come from each datum's `tse` or from `codes`
 * (IBGE → TSE, see table mun_xwalk). `highlight` outlines one municipality (IBGE code).
 */
export function MunicipalityMap({
  uf,
  data,
  format,
  label,
  hrefTemplate,
  codes,
  highlight,
  height = 460,
  domain,
  showLegend = true,
  ariaLabel,
}: {
  uf: string;
  data: MunicipalityMapDatum[];
  format: MapFormat;
  label: string;
  /** e.g. "/estados/SP/{tse}?ano=2026" */
  hrefTemplate?: string;
  codes?: Record<number, number | string>;
  highlight?: number;
  /** Pixels or any CSS length, e.g. "clamp(300px, 90vw, 460px)". */
  height?: number | string;
  domain?: [number, number];
  showLegend?: boolean;
  ariaLabel?: string;
}) {
  const t = useTokens();
  const router = useRouter();
  const UF = uf.toUpperCase();
  const geo = useGeoMap(`prumo-mun-${UF}`, `/geo/mun/${UF}.json`);

  const items = useMemo<MapItem[]>(
    () =>
      data.map((d) => {
        const tse = d.tse ?? codes?.[d.ibge];
        let href: string | undefined;
        if (hrefTemplate && !(hrefTemplate.includes("{tse}") && tse == null)) {
          href = hrefTemplate.replaceAll("{ibge}", String(d.ibge)).replaceAll("{tse}", String(tse ?? ""));
        }
        return { key: String(d.ibge), value: d.value, title: d.name, note: d.note, href, highlight: d.ibge === highlight };
      }),
    [data, codes, hrefTemplate, highlight],
  );

  const option = useMemo(() => {
    if (!t || !geo.map) return null;
    return buildMapOption({
      t,
      map: geo.map.name,
      aspect: geo.map.aspect,
      nameProperty: "ibge",
      items,
      format,
      label,
      domain,
      showLegend,
      emptyTitle: () => "Município",
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
  return (
    <EChart
      option={option}
      height={height}
      renderer={data.length > 300 ? "canvas" : "svg"}
      onEvents={onEvents}
      ariaLabel={ariaLabel ?? `Mapa dos municípios de ${UF}: ${label}`}
    />
  );
}
