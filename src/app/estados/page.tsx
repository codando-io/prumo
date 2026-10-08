import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container } from "@/components/ui/primitives";
import { Caption, Fig, PageHeader, Section, SourceLine, YearTabs } from "@/components/ui/editorial";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { BrazilMap } from "@/components/charts/BrazilMap";
import { compareBy, parseSort, type SortDir } from "@/components/parties/SortHeader";
import { calculation, officialSum } from "@/components/geo/sources";
import { getStatesOverview, type StateRow } from "@/lib/queries/geo";
import { yearMeta } from "@/lib/queries/parties";
import { EXPENSE_GROUPS, UF_NAMES, parseYear } from "@/lib/labels";
import { brlUnit, brlc, dateLong, num, pct } from "@/lib/format";

export const metadata: Metadata = {
  title: "Estados",
  description: "Quanto as campanhas de cada estado arrecadaram e gastaram, quanto veio de dinheiro público e em que gastaram, a partir dos dados do TSE.",
};

const METRICS = {
  gasto: { label: "Total de despesas", short: "Despesas", format: "brl" as const, value: (r: StateRow) => r.expense },
  publico: { label: "Dinheiro público recebido", short: "Dinheiro público", format: "brl" as const, value: (r: StateRow) => r.revenue_public },
  candidatos: { label: "Candidaturas", short: "Candidaturas", format: "num" as const, value: (r: StateRow) => r.n_candidates },
  gasto_por_voto: {
    label: "Despesas por voto válido",
    short: "Despesas por voto",
    format: "brlUnit" as const,
    value: (r: StateRow) => (r.gov_votes && r.expense ? r.expense / r.gov_votes : null),
  },
};
type MetricKey = keyof typeof METRICS;

/** What the colour of the map means, per metric (one line above the map). */
const MAP_LEGEND: Record<MetricKey, string> = {
  gasto: "Cor: total de despesas declaradas pelas campanhas de cada estado",
  publico: "Cor: dinheiro do Fundo Eleitoral e do Fundo Partidário recebido pelas campanhas de cada estado",
  candidatos: "Cor: número de candidaturas registradas em cada estado",
  gasto_por_voto: "Cor: despesas das campanhas do estado divididas pelos votos válidos para governador",
};

// Sortable keys. Some have no column any more but old links keep working.
const COLS = ["estado", "candidatos", "prestacao", "receita", "despesa", "publico", "parcela", "por_voto"] as const;
type Col = (typeof COLS)[number];
const VALUE: Record<Col, (r: StateRow) => string | number | null> = {
  estado: (r) => UF_NAMES[r.uf] ?? r.uf,
  candidatos: (r) => r.n_candidates,
  prestacao: (r) => r.n_finance,
  receita: (r) => r.revenue,
  despesa: (r) => r.expense,
  publico: (r) => r.revenue_public,
  parcela: (r) => r.public_share,
  por_voto: (r) => METRICS.gasto_por_voto.value(r),
};
const defaultDir = (c: Col): SortDir => (c === "estado" ? "asc" : "desc");

function parseMetric(v: unknown): MetricKey {
  const s = String(Array.isArray(v) ? v[0] : (v ?? ""));
  if (s === "gasto_por_eleitor") return "gasto_por_voto";
  return s in METRICS ? (s as MetricKey) : "gasto";
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function StatesPage({ searchParams }: PageProps<"/estados">) {
  return (
    <Container className="pb-8">
      <Suspense fallback={<StatesLoading />}>
        <StatesView searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

function StatesLoading() {
  return (
    <div aria-busy="true">
      <PageHeader title="Estados" />
      <p className="mt-8 text-[15px] text-muted">Somando as prestações de contas de cada estado…</p>
    </div>
  );
}

async function StatesView({ searchParams }: { searchParams: PageProps<"/estados">["searchParams"] }) {
  const sp = await searchParams;
  const year = parseYear(sp.ano);
  const metric = parseMetric(sp.metrica);
  const sort = parseSort<Col>(sp.ordem, sp.dir, COLS, "estado", defaultDir);
  const [rows, meta] = await Promise.all([getStatesOverview(year), yearMeta(year)]);

  const states = rows.filter((r) => r.uf !== "BR" && r.uf !== "ZZ" && UF_NAMES[r.uf]);
  const br = rows.find((r) => r.uf === "BR");
  const sorted = [...states].sort(compareBy(VALUE[sort.key], sort.dir));
  const sum = (f: (r: StateRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const tot = { n: sum((r) => r.n_candidates), fin: sum((r) => r.n_finance), revenue: sum((r) => r.revenue), expense: sum((r) => r.expense), pub: sum((r) => r.revenue_public) };
  const stateExpense = states.reduce((s, r) => s + r.expense, 0);
  const topState = [...states].sort((a, b) => b.expense - a.expense)[0];
  const m = METRICS[metric];
  const gen = meta.finance_generated_at;

  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ ano: String(year) });
    if (metric !== "gasto") p.set("metrica", metric);
    if (!(sort.key === "estado" && sort.dir === "asc")) {
      p.set("ordem", sort.key);
      p.set("dir", sort.dir);
    }
    for (const [k, v] of Object.entries(extra)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    return `/estados?${p.toString()}`;
  };
  const hrefFor = (col: Col, dir: SortDir) => (col === "estado" && dir === "asc" ? qs({ ordem: undefined, dir: undefined }) : qs({ ordem: col, dir })) + "#tabela";

  /** Sortable header: a plain link (works without JavaScript); the active column shows its direction. */
  const th = (col: Col, label: string, className = "n") => {
    const active = sort.key === col;
    const next: SortDir = active ? (sort.dir === "asc" ? "desc" : "asc") : defaultDir(col);
    return (
      <th scope="col" className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
        <Link href={hrefFor(col, next)} scroll={false} className={`no-underline hover:text-ink ${active ? "text-ink" : ""}`}>
          {label}
          {active && <span aria-hidden="true"> {sort.dir === "asc" ? "↑" : "↓"}</span>}
        </Link>
      </th>
    );
  };
  const topGroup = (r: StateRow) =>
    r.top_group ? (
      <>
        {EXPENSE_GROUPS[r.top_group]?.label ?? r.top_group}
        {r.expense ? <span className="text-muted">, {pct((r.top_group_value ?? 0) / r.expense)}</span> : null}
      </>
    ) : (
      <span className="text-muted">—</span>
    );

  const perVoteNote =
    "Total de despesas de todas as campanhas do estado (governador, senador e deputados) dividido pelos votos válidos para governador no 1º turno, uma aproximação do número de eleitores que escolheram um candidato. Métrica descritiva: não mede eficiência.";
  const alphabetical = sort.key === "estado" && sort.dir === "asc";
  const yearParams = { metrica: metric !== "gasto" ? metric : undefined, ordem: one(sp.ordem), dir: one(sp.dir) };

  const row = (r: StateRow, opts: { name: React.ReactNode; sub?: React.ReactNode; perVote?: React.ReactNode }) => (
    <>
      <td>
        {opts.name}
        {opts.sub && <div className="s text-[13.5px]">{opts.sub}</div>}
      </td>
      <td className="n s hidden sm:table-cell">{num(r.n_candidates)}</td>
      <td className="n s hidden xl:table-cell">{num(r.n_finance)}</td>
      <td className="n s hidden md:table-cell">{brlc(r.revenue)}</td>
      <td className="n s hidden sm:table-cell">{r.public_share == null ? "—" : pct(r.public_share)}</td>
      <td className="n text-ink">{brlc(r.expense)}</td>
      <td className="n s hidden lg:table-cell">{opts.perVote ?? brlUnit(METRICS.gasto_por_voto.value(r))}</td>
      <td className="s hidden text-[14px] lg:table-cell">{topGroup(r)}</td>
    </>
  );

  const list = (
    <div>
      <table className="dt">
        <caption className="sr-only">Campanhas por estado em {year}</caption>
        <thead>
          <tr>
            {th("estado", "Estado", "")}
            {th("candidatos", "Candidaturas", "n hidden sm:table-cell")}
            {th("prestacao", "Com prestação", "n hidden xl:table-cell")}
            {th("receita", "Receitas", "n hidden md:table-cell")}
            {th("parcela", "% público", "n hidden sm:table-cell")}
            {th("despesa", "Despesas")}
            {th("por_voto", "Por voto", "n hidden lg:table-cell")}
            <th scope="col" className="hidden lg:table-cell">
              Maior categoria de gasto
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.uf}>
              {row(r, {
                name: (
                  <Link href={`/estados/${r.uf}?ano=${year}`} className="e no-underline hover:underline">
                    {UF_NAMES[r.uf]}
                  </Link>
                ),
              })}
            </tr>
          ))}
        </tbody>
        <tbody className="[&>tr:first-child>*]:border-t [&>tr:first-child>*]:border-t-rule-strong">
          {br && (
            <tr>
              {row(br, {
                name: (
                  <Link href={`/candidatos?ano=${year}&cargo=1`} className="e no-underline hover:underline">
                    Presidência
                  </Link>
                ),
                sub: "campanhas nacionais",
                perVote: <span className="text-muted">—</span>,
              })}
            </tr>
          )}
          <tr className="[&>td]:font-medium">
            <td className="e">Total</td>
            <td className="n hidden text-ink sm:table-cell">{num(tot.n)}</td>
            <td className="n hidden text-ink xl:table-cell">{num(tot.fin)}</td>
            <td className="n hidden text-ink md:table-cell">{brlc(tot.revenue)}</td>
            <td className="n hidden text-ink sm:table-cell">{tot.revenue ? pct(tot.pub / tot.revenue) : "—"}</td>
            <td className="n text-ink">{brlc(tot.expense)}</td>
            <td className="n s hidden lg:table-cell">—</td>
            <td className="hidden lg:table-cell" />
          </tr>
        </tbody>
      </table>
      <Caption>
        Receitas e despesas somam as prestações de contas das candidaturas de cada estado (vices e suplentes não têm contas próprias). Maior categoria de gasto: o
        grupo de despesas com mais dinheiro no estado, com sua parcela do total. Por voto: {perVoteNote}
      </Caption>
    </div>
  );

  const map = (
    <div className="max-w-[760px]">
      <nav aria-label="Medida no mapa" className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[14px]">
        <span className="text-muted">Medida:</span>
        {(Object.keys(METRICS) as MetricKey[]).map((k) => (
          <Link
            key={k}
            href={qs({ metrica: k === "gasto" ? undefined : k })}
            scroll={false}
            aria-current={k === metric ? "true" : undefined}
            className={`border-b pb-0.5 no-underline ${k === metric ? "border-accent text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
          >
            {METRICS[k].short}
          </Link>
        ))}
      </nav>
      <p className="mb-2 mt-4 text-[14.5px] text-ink-2">
        {MAP_LEGEND[metric]} em {year}, do menor ao maior valor na escala sob o mapa. Clique em um estado para abri-lo.
      </p>
      <BrazilMap
        data={states.map((r) => ({ uf: r.uf, value: m.value(r), note: `${num(r.n_candidates)} candidaturas` }))}
        format={m.format}
        label={m.label}
        hrefTemplate={`/estados/{uf}?ano=${year}`}
        height="clamp(320px, 92vw, 460px)"
        ariaLabel={`Mapa do Brasil: ${m.label.toLowerCase()} por estado`}
      />
      {metric === "gasto_por_voto" && <Caption>{perVoteNote}</Caption>}
    </div>
  );

  return (
    <>
      <PageHeader
        crumbs={[{ label: `Eleições ${year}`, href: `/?ano=${year}` }, { label: "Estados" }]}
        title="Estados"
        aside={<YearTabs path="/estados" params={yearParams} year={year} />}
        lede={
          tot.n === 0 ? (
            `Ainda não há candidaturas registradas nos dados de ${year}.`
          ) : (
            <>
              <Fig
                info={officialSum("candidatos", year, meta.candidates_generated_at, "Candidaturas registradas, sem contar vices e suplentes (que não têm contas próprias).")}
              >
                {num(tot.n)}
              </Fig>{" "}
              candidaturas disputaram as eleições de {year}, {num(tot.fin)} delas com prestação de contas publicada. Juntas, declararam{" "}
              <Fig
                info={officialSum("despesas_contratadas", year, gen, "Soma das despesas declaradas por todas as candidaturas, inclusive as presidenciais.", {
                  label: "Ver as despesas",
                  href: `/transacoes?ano=${year}&tipo=despesa`,
                })}
              >
                {brlc(tot.expense)}
              </Fig>{" "}
              em despesas, e{" "}
              <Fig
                info={calculation("receitas", year, gen, "Receitas classificadas pelo TSE como Fundo Eleitoral (FEFC) ou Fundo Partidário, divididas pela receita total de todas as candidaturas.")}
              >
                {tot.revenue ? pct(tot.pub / tot.revenue) : "—"}
              </Fig>{" "}
              das receitas ({brlc(tot.pub)}) foram dinheiro público.
              {topState && stateExpense > 0 && (
                <>
                  {" "}
                  Entre os estados, as campanhas de {UF_NAMES[topState.uf]} gastaram mais: <Fig>{brlc(topState.expense)}</Fig>, {pct(topState.expense / stateExpense)} do
                  total dos estados.
                </>
              )}
            </>
          )
        }
        meta={
          br && br.n_candidates > 0 ? (
            <>
              As {num(br.n_candidates)} campanhas presidenciais ({brlc(br.expense)} em despesas) são nacionais e aparecem numa linha à parte. O dinheiro é atribuído ao
              estado pelo qual a candidatura concorre.
            </>
          ) : undefined
        }
      />

      <Section
        id="tabela"
        question="Quanto as campanhas de cada estado arrecadaram e gastaram?"
        lede={
          <>
            Valores absolutos acompanham o tamanho do eleitorado: estados com mais eleitores têm mais vagas de deputado, mais candidaturas e limites de gastos mais
            altos. Para comparar estados de tamanhos diferentes, use o gasto por voto.{" "}
            {alphabetical ? (
              "A lista está em ordem alfabética; clique no título de uma coluna para reordenar."
            ) : (
              <>
                A lista está reordenada pela coluna escolhida;{" "}
                <Link className="link text-ink" href={hrefFor("estado", "asc")} scroll={false}>
                  voltar à ordem alfabética
                </Link>
                .
              </>
            )}
          </>
        }
        source={
          <SourceLine
            label={`TSE, prestações publicadas até ${dateLong(gen?.slice(0, 10))}`}
            info={officialSum("despesas_contratadas", year, gen, "Receitas e despesas declaradas pelas campanhas, somadas pelo estado pelo qual cada candidatura concorre.")}
            links={[{ label: "Ver as despesas", href: `/transacoes?ano=${year}&tipo=despesa` }]}
          />
        }
      >
        <ViewToggle
          label="Formas de ver os estados"
          views={[
            { key: "lista", label: "Lista", node: list },
            { key: "mapa", label: "Mapa", node: map },
          ]}
        />
        <Caption>
          O TSE não registra onde cada despesa foi feita, por isso não há gastos por município; nas páginas dos estados, os municípios mostram votos.
        </Caption>
      </Section>
    </>
  );
}
