import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container } from "@/components/ui/primitives";
import { Caption, Fig, PageHeader, SourceLine, YearTabs } from "@/components/ui/editorial";
import { Source } from "@/components/ui/Source";
import { SortTh, compareBy, parseSort, type SortDir } from "@/components/parties/SortHeader";
import { nameIsSigla, partyFullName } from "@/components/parties/names";
import { officialSum, calculation } from "@/components/geo/sources";
import { listParties, yearMeta, type PartyRow } from "@/lib/queries/parties";
import { CURRENT_YEAR, parseYear } from "@/lib/labels";
import { brlc, dateLong, num, pct, plural } from "@/lib/format";

export const metadata: Metadata = {
  title: "Partidos",
  description: "Quanto as candidaturas de cada partido arrecadaram e gastaram, quanto veio de dinheiro público e quantos foram eleitos, a partir dos dados do TSE.",
};

const COLS = ["sigla", "candidatos", "eleitos", "receita", "despesa", "publico", "parcela", "votos"] as const;
type Col = (typeof COLS)[number];

const VALUE: Record<Col, (r: PartyRow) => string | number | null> = {
  sigla: (r) => r.party,
  candidatos: (r) => r.n_candidates,
  eleitos: (r) => r.n_elected,
  receita: (r) => r.revenue,
  despesa: (r) => r.expense,
  publico: (r) => r.revenue_public,
  parcela: (r) => r.public_share,
  votos: (r) => r.votes_federal,
};

const defaultDir = (c: Col): SortDir => (c === "sigla" ? "asc" : "desc");

function str(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default function PartiesPage({ searchParams }: PageProps<"/partidos">) {
  return (
    <Container className="pb-16">
      <Suspense fallback={<PartiesLoading />}>
        <PartiesView searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

function PartiesLoading() {
  return (
    <div className="pt-10" aria-busy="true">
      <p className="text-[15px] text-muted">Somando as candidaturas de cada partido…</p>
    </div>
  );
}

async function PartiesView({ searchParams }: { searchParams: PageProps<"/partidos">["searchParams"] }) {
  const sp = await searchParams;
  const year = parseYear(sp.ano);
  const sort = parseSort<Col>(sp.ordem, sp.dir, COLS, "sigla", defaultDir);
  const [rows, meta] = await Promise.all([listParties(year), yearMeta(year)]);

  const sorted = [...rows].sort(compareBy(VALUE[sort.key], sort.dir));
  const tot = rows.reduce(
    (a, r) => ({
      n: a.n + r.n_candidates,
      elected: a.elected + r.n_elected,
      runoff: a.runoff + r.n_runoff,
      revenue: a.revenue + r.revenue,
      expense: a.expense + r.expense,
      pub: a.pub + r.revenue_public,
      votes: a.votes + r.votes_federal,
    }),
    { n: 0, elected: 0, runoff: 0, revenue: 0, expense: 0, pub: 0, votes: 0 },
  );
  const gen = meta.finance_generated_at;
  const alphabetical = sort.key === "sigla" && sort.dir === "asc";
  const hrefFor = (col: string, dir: SortDir) => `/partidos?ano=${year}${col === "sigla" && dir === "asc" ? "" : `&ordem=${col}&dir=${dir}`}`;
  const th = (col: Col, label: React.ReactNode, className = "") => (
    <SortTh label={label} col={col} active={sort.key === col} dir={sort.dir} defaultDir={defaultDir(col)} hrefFor={hrefFor} numeric={col !== "sigla"} className={className} />
  );

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Explorar" }, { label: "Partidos" }]}
        title="Partidos"
        lede={
          rows.length === 0 ? (
            <>Ainda não há candidaturas registradas para {year}.</>
          ) : (
            <>
              Em {year},{" "}
              <Fig info={officialSum("candidatos", year, meta.candidates_generated_at, "Partidos com ao menos uma candidatura registrada no TSE.")}>{num(rows.length)}</Fig> partidos
              tiveram{" "}
              <Fig info={officialSum("candidatos", year, meta.candidates_generated_at, "Candidaturas registradas no TSE, sem contar vices e suplentes (que não têm contas próprias).")}>
                {num(tot.n)}
              </Fig>{" "}
              candidaturas, das quais{" "}
              <Fig info={officialSum("candidatos", year, meta.candidates_generated_at, "Candidaturas com situação de eleito (inclusive por quociente partidário e por média) no resultado divulgado pelo TSE.")}>
                {num(tot.elected)}
              </Fig>{" "}
              foram eleitas{tot.runoff > 0 ? <> e {num(tot.runoff)} {tot.runoff === 1 ? "disputa" : "disputam"} o 2º turno</> : null}. Juntas, as campanhas arrecadaram{" "}
              <Fig
                info={officialSum("receitas", year, gen, "Soma das receitas declaradas por todas as candidaturas, incluindo doações em bens e serviços (estimáveis).", {
                  label: "Ver as receitas",
                  href: `/transacoes?ano=${year}&tipo=receita`,
                })}
              >
                {brlc(tot.revenue)}
              </Fig>
              ,{" "}
              <Fig info={calculation("receitas", year, gen, "Receitas classificadas pelo TSE como Fundo Especial de Financiamento de Campanha (FEFC) ou Fundo Partidário, divididas pelas receitas totais.")}>
                {tot.revenue > 0 ? pct(tot.pub / tot.revenue) : "—"}
              </Fig>{" "}
              em dinheiro público, e gastaram{" "}
              <Fig
                info={officialSum("despesas_contratadas", year, gen, "Soma das despesas declaradas por todas as candidaturas, inclusive doações a outras campanhas e partidos.", {
                  label: "Ver as despesas",
                  href: `/transacoes?ano=${year}&tipo=despesa`,
                })}
              >
                {brlc(tot.expense)}
              </Fig>
              .
            </>
          )
        }
        aside={<YearTabs path="/partidos" params={{ ordem: str(sp.ordem), dir: str(sp.dir) }} year={year} />}
      />

      {rows.length > 0 && (
        <section aria-labelledby="lista" className="mt-10 border-t border-rule-strong pt-6">
          <h2 id="lista" className="sr-only">
            Partidos em {year}
          </h2>
          <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
            <p className="text-[14.5px] text-ink-2">
              {alphabetical ? (
                "Em ordem alfabética. Clique no título de uma coluna para reordenar."
              ) : (
                <>
                  Reordenada pela coluna marcada.{" "}
                  <Link className="action" href={`/partidos?ano=${year}`} scroll={false}>
                    Voltar à ordem alfabética
                  </Link>
                </>
              )}
            </p>
            <SourceLine
              label={`TSE, prestações publicadas até ${dateLong(gen?.slice(0, 10))}`}
              info={officialSum("receitas", year, gen, "Receitas e despesas declaradas pelas candidaturas, somadas por partido.")}
              links={[{ label: "Ver as transações", href: `/transacoes?ano=${year}` }]}
            />
          </div>

          <table className="dt mt-4">
            <caption className="sr-only">Partidos em {year}: candidaturas, eleitos, receitas, despesas, dinheiro público e votos</caption>
            <thead>
              <tr>
                {th("sigla", "Partido")}
                {th("candidatos", "Candidaturas", "hidden sm:table-cell")}
                {th("eleitos", "Eleitos", "hidden sm:table-cell")}
                {th("receita", "Receitas")}
                {th("publico", "Dinheiro público", "hidden lg:table-cell")}
                {th("parcela", "% público")}
                {th("despesa", "Despesas", "hidden sm:table-cell")}
                {th("votos", "Votos dep. federal", "hidden lg:table-cell")}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.party}>
                  <th scope="row">
                    <Link href={`/partidos/${encodeURIComponent(r.party)}?ano=${year}`} className="e no-underline hover:underline">
                      {r.party}
                    </Link>
                    {!nameIsSigla(r.party, r.party_name) && <div className="s text-[13.5px] leading-snug">{partyFullName(r.party_name)}</div>}
                    <div className="text-[13.5px] leading-snug text-muted sm:hidden">
                      {plural(r.n_elected, "eleito", "eleitos")}
                      {r.n_runoff > 0 ? `, ${num(r.n_runoff)} no 2º turno` : ""}
                    </div>
                  </th>
                  <td className="n s hidden sm:table-cell">{num(r.n_candidates)}</td>
                  <td className="n text-ink hidden sm:table-cell">
                    {num(r.n_elected)}
                    {r.n_runoff > 0 && <div className="text-[13.5px] text-muted">+{num(r.n_runoff)} no 2º turno</div>}
                  </td>
                  <td className="n text-ink">{brlc(r.revenue)}</td>
                  <td className="n s hidden lg:table-cell">{brlc(r.revenue_public)}</td>
                  <td className="n s">{r.public_share == null ? "—" : pct(r.public_share)}</td>
                  <td className="n s hidden sm:table-cell">{brlc(r.expense)}</td>
                  <td className="n s hidden lg:table-cell">{r.votes_federal ? num(r.votes_federal) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-rule-strong font-medium text-ink [&_td]:px-3 [&_td]:py-3 [&_td:last-child]:pr-0 [&_th]:py-3 [&_th]:text-left">
              <tr>
                <th scope="row">Total</th>
                <td className="n hidden sm:table-cell">{num(tot.n)}</td>
                <td className="n hidden sm:table-cell">{num(tot.elected)}</td>
                <td className="n">{brlc(tot.revenue)}</td>
                <td className="n hidden lg:table-cell">{brlc(tot.pub)}</td>
                <td className="n">
                  <Source align="right" info={calculation("receitas", year, gen, "Dinheiro público (FEFC + Fundo Partidário) dividido pelas receitas totais das candidaturas.")}>
                    {tot.revenue > 0 ? pct(tot.pub / tot.revenue) : "—"}
                  </Source>
                </td>
                <td className="n hidden sm:table-cell">{brlc(tot.expense)}</td>
                <td className="n hidden lg:table-cell">
                  <Source
                    align="right"
                    info={officialSum("votacao", year, meta.votes_generated_at, "Soma dos votos nominais recebidos pelos candidatos a deputado federal. Não inclui votos de legenda, brancos e nulos.")}
                  >
                    {num(tot.votes)}
                  </Source>
                </td>
              </tr>
            </tfoot>
          </table>

          <Caption>
            Os valores somam as prestações de contas das candidaturas de cada partido. As contas dos próprios diretórios partidários são uma base separada do TSE e não
            entram nesses totais; o dinheiro que os diretórios repassam às campanhas aparece nas receitas das candidaturas. Vices e suplentes não são contados, porque
            não têm contas próprias.
          </Caption>
          <Caption>
            Votos: cada eleitor vota em vários cargos, então somar votos de cargos diferentes contaria a mesma pessoa mais de uma vez. A coluna mostra os votos nominais
            dados aos candidatos do partido a deputado federal, a única disputa com candidaturas de todos os estados.
          </Caption>
          {tot.runoff > 0 && (
            <Caption>
              {year === CURRENT_YEAR ? "A eleição ainda não terminou: " : ""}
              {plural(tot.runoff, "candidatura disputa", "candidaturas disputam")} o 2º turno e ainda não {tot.runoff === 1 ? "aparece" : "aparecem"} como eleita
              {tot.runoff === 1 ? "" : "s"}.
            </Caption>
          )}
        </section>
      )}
    </>
  );
}
