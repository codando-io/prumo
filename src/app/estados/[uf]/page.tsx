import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Container, ResultChip } from "@/components/ui/primitives";
import { PageHeader, Section, SourceLine, Fig, YearTabs, EmptyNote, Caption } from "@/components/ui/editorial";
import { AggregateMoney } from "@/components/money/AggregateMoney";
import { officialSum, calculation } from "@/components/geo/sources";
import {
  getStateExpenseByCategory,
  getStateOffices,
  getStateParties,
  getStateRevenueByCategory,
  getStateTopCampaigns,
  getStateTopDonors,
  getStateTopSuppliers,
  getStateTotals,
  getStatesOverview,
  isStateUf,
} from "@/lib/queries/geo";
import { getStateRaces, type RaceRow } from "@/lib/queries/state";
import { donorsByGroup, suppliersByGroup } from "@/lib/queries/dashboard";
import { yearMeta } from "@/lib/queries/parties";
import { CURRENT_YEAR, ENTITY_KIND, EXPENSE_GROUPS, UF_NAMES, parseYear } from "@/lib/labels";
import { brlUnit, brlc, num, pct, titleName, inSentence } from "@/lib/format";
import { VotesMapSection } from "./_sections/VotesMap";

export async function generateMetadata({ params }: PageProps<"/estados/[uf]">): Promise<Metadata> {
  const uf = (await params).uf.toUpperCase();
  const name = UF_NAMES[uf];
  if (!name || !isStateUf(uf)) return { title: "Estado não encontrado" };
  return {
    title: `${name} — campanhas`,
    description: `Quem disputou, quanto as campanhas em ${name} arrecadaram e gastaram, com quem, e onde estavam os votos, a partir dos dados do TSE.`,
  };
}

// Blocking on a cheap existence check lets unknown records return a real 404.
export const instant = false;

export default async function StatePage({ params, searchParams }: PageProps<"/estados/[uf]">) {
  if (!isStateUf((await params).uf.toUpperCase())) notFound();
  return (
    <Container className="pb-16">
      <Suspense fallback={<p className="pt-10 text-[15px] text-muted">Carregando o estado…</p>}>
        <StateView params={params} searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

function SectionLoading({ label }: { label: string }) {
  return (
    <div className="section" aria-busy="true">
      <p className="text-[15px] text-muted">{label}</p>
    </div>
  );
}

const OFFICE_ORDER = [3, 5, 6, 7, 8];

async function StateView({ params, searchParams }: { params: PageProps<"/estados/[uf]">["params"]; searchParams: PageProps<"/estados/[uf]">["searchParams"] }) {
  const [{ uf: raw }, sp] = await Promise.all([params, searchParams]);
  const uf = raw.toUpperCase();
  if (!isStateUf(uf)) notFound();
  const year = parseYear(sp.ano);
  const name = UF_NAMES[uf];

  const [t, offices, overview, meta] = await Promise.all([getStateTotals(year, uf), getStateOffices(year, uf), getStatesOverview(year), yearMeta(year)]);
  const gen = t?.generated_at ?? meta.finance_generated_at;
  const txBase = `/transacoes?ano=${year}&uf=${uf}`;
  const govVotes = overview.find((r) => r.uf === uf)?.gov_votes ?? null;
  const perVote = govVotes && t?.expense ? t.expense / govVotes : null;
  const officeRows = OFFICE_ORDER.map((c) => offices.find((o) => o.office_code === c)).filter((o): o is (typeof offices)[number] => !!o);
  const runoff = officeRows.some((o) => o.n_runoff > 0);

  return (
    <>
      <PageHeader
        crumbs={[{ label: `Eleições ${year}`, href: `/?ano=${year}` }, { label: "Estados", href: `/estados?ano=${year}` }, { label: name }]}
        title={name}
        lede={
          !t || !t.n_candidates ? (
            `Não há candidaturas registradas em ${name} nas eleições de ${year} nesta base.`
          ) : (
            <>
              Em {year}, <Fig info={officialSum("candidatos", year, meta.candidates_generated_at, "Candidaturas registradas no estado, sem contar vices e suplentes (que não têm contas próprias).")}>{num(t.n_candidates)}</Fig>{" "}
              candidaturas disputaram o governo, o Senado e as vagas de deputado em {name}. As campanhas declararam{" "}
              <Fig
                info={officialSum("receitas", year, gen, `Soma das ${num(t.n_revenue_tx)} receitas declaradas pelas campanhas em ${name}, incluindo doações em bens e serviços.`, {
                  label: "Ver as receitas",
                  href: `${txBase}&tipo=receita`,
                })}
              >
                {brlc(t.revenue)}
              </Fig>{" "}
              em receitas,{" "}
              <Fig info={calculation("receitas", year, gen, "Receitas do Fundo Eleitoral (FEFC) e do Fundo Partidário divididas pela receita total das campanhas do estado.")}>{pct(t.public_share ?? 0)}</Fig>{" "}
              de dinheiro público, e{" "}
              <Fig
                info={officialSum("despesas_contratadas", year, gen, `Soma das ${num(t.n_expense_tx)} despesas declaradas pelas campanhas em ${name}, inclusive doações a outras campanhas e partidos.`, {
                  label: "Ver as despesas",
                  href: `${txBase}&tipo=despesa`,
                })}
              >
                {brlc(t.expense)}
              </Fig>{" "}
              em despesas
              {perVote != null && (
                <>
                  , o equivalente a{" "}
                  <Fig
                    info={calculation(
                      "despesas_contratadas",
                      year,
                      gen,
                      "Total de despesas de todas as campanhas do estado dividido pelos votos válidos para governador no 1º turno, uma aproximação do número de eleitores que escolheram um candidato. Não mede eficiência.",
                      { label: "Comparar com outros estados", href: `/estados?ano=${year}&metrica=gasto_por_voto` },
                    )}
                  >
                    {brlUnit(perVote)}
                  </Fig>{" "}
                  por voto para governador
                </>
              )}
              .
            </>
          )
        }
        meta={year === CURRENT_YEAR ? "A campanha de 2026 ainda está em curso: os valores mudam a cada nova prestação de contas publicada pelo TSE." : undefined}
        actions={[
          { label: "Candidaturas no estado", href: `/candidatos?ano=${year}&uf=${uf}` },
          { label: "Transações", href: txBase },
          { label: "Comparar estados", href: `/estados?ano=${year}` },
        ]}
        aside={<YearTabs path={`/estados/${uf}`} params={{ cargo: first(sp.cargo), turno: first(sp.turno) }} year={year} />}
      />

      {t && t.n_candidates > 0 && (
        <>
          <Suspense fallback={<SectionLoading label="Carregando o resultado…" />}>
            <OutcomeSection year={year} uf={uf} name={name} offices={officeRows} />
          </Suspense>

          <Section
            id="quem"
            question="Quem disputou?"
            lede={
              <>
                {officeRows.map((o, i) => (
                  <span key={o.office_code}>
                    {i > 0 && (i === officeRows.length - 1 ? " e " : ", ")}
                    {num(o.n_candidates)} {o.n_candidates === 1 ? "candidatura" : "candidaturas"} a {o.office.toLowerCase()}
                  </span>
                ))}
                . {num(t.n_finance)} delas já tinham prestação de contas publicada{runoff ? "; o governo foi decidido em 2º turno" : ""}.
              </>
            }
          >
            <table className="dt">
              <thead>
                <tr>
                  <th scope="col">Cargo</th>
                  <th scope="col" className="n">
                    Candidaturas
                  </th>
                  <th scope="col" className="n">
                    Eleitos
                  </th>
                  <th scope="col" className="n hidden md:table-cell">
                    Receitas
                  </th>
                  <th scope="col" className="n hidden sm:table-cell">
                    Público
                  </th>
                  <th scope="col" className="n">
                    Despesas
                  </th>
                </tr>
              </thead>
              <tbody>
                {officeRows.map((o) => (
                  <tr key={o.office_code}>
                    <td>
                      <Link className="e no-underline hover:underline" href={`/candidatos?ano=${year}&uf=${uf}&cargo=${o.office_code}`}>
                        {o.office}
                      </Link>
                      {o.n_finance < o.n_candidates && <div className="s text-[13.5px]">{num(o.n_finance)} com prestação de contas</div>}
                    </td>
                    <td className="n s">{num(o.n_candidates)}</td>
                    <td className="n s">
                      {num(o.n_elected)}
                      {o.n_runoff > 0 && <span className="block text-[13px]">{num(o.n_runoff)} no 2º turno</span>}
                    </td>
                    <td className="n s hidden md:table-cell">{brlc(o.revenue)}</td>
                    <td className="n s hidden sm:table-cell">{o.public_share == null ? "—" : pct(o.public_share)}</td>
                    <td className="n text-ink">{brlc(o.expense)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Caption>
              As campanhas presidenciais são nacionais e não entram nos totais do estado.{" "}
              <Link className="link" href={`/candidatos?ano=${year}&cargo=1`}>
                Candidaturas a presidente
              </Link>
            </Caption>
            <Suspense fallback={null}>
              <PartiesTable year={year} uf={uf} name={name} />
            </Suspense>
          </Section>

          <Suspense fallback={<SectionLoading label="Somando receitas e despesas…" />}>
            <MoneySection year={year} uf={uf} name={name} totals={t} txBase={txBase} />
          </Suspense>

          <Suspense fallback={<SectionLoading label="Carregando fornecedores e doadores…" />}>
            <CounterpartsSection year={year} uf={uf} name={name} expense={t.expense} revenue={t.revenue} txBase={txBase} />
          </Suspense>

          <Suspense fallback={<SectionLoading label="Carregando campanhas…" />}>
            <TopCampaignsSection year={year} uf={uf} name={name} expense={t.expense} />
          </Suspense>

          <Suspense fallback={<SectionLoading label="Carregando votos por município…" />}>
            <VotesMapSection year={year} uf={uf} cargo={sp.cargo} turno={sp.turno} votesGeneratedAt={meta.votes_generated_at} />
          </Suspense>
        </>
      )}
    </>
  );
}

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/* ---------- O que aconteceu? ---------- */

const elected = (r: RaceRow) => r.result === "ELEITO" || r.result === "ELEITO POR QP" || r.result === "ELEITO POR MÉDIA";

async function OutcomeSection({ year, uf, name, offices }: { year: number; uf: string; name: string; offices: { office_code: number; office: string; n_elected: number }[] }) {
  const races = await getStateRaces(year, uf, 5);
  const gov = races.filter((r) => r.office_code === 3);
  const sen = races.filter((r) => r.office_code === 5);
  if (!gov.length && !sen.length) return null;
  const share = (r: RaceRow) => (r.share_r2 != null ? r.share_r2 : r.share_r1);
  const nm = (r: RaceRow) => (
    <Link href={`/candidatos/${year}/${r.id}`} className="link text-ink">
      {titleName(r.ballot_name)}
    </Link>
  );

  const govWinner = gov.find(elected);
  const govRunoff = gov.filter((r) => r.result === "2º TURNO");
  const senWinners = sen.filter(elected);
  const fed = offices.find((o) => o.office_code === 6);
  const state = offices.find((o) => o.office_code === 7 || o.office_code === 8);

  const govSentence = govWinner ? (
    <>
      {nm(govWinner)} ({govWinner.party}) venceu a disputa pelo governo
      {govWinner.votes_r2 != null ? (
        <>
          {" "}
          no 2º turno, com <Fig>{pct(govWinner.share_r2)}</Fig> dos votos
          {gov.find((r) => r !== govWinner && r.votes_r2 != null) && <>, contra {nm(gov.find((r) => r !== govWinner && r.votes_r2 != null)!)}</>}
        </>
      ) : (
        <>
          {" "}
          no 1º turno, com <Fig>{pct(govWinner.share_r1)}</Fig> dos votos
        </>
      )}
      .
    </>
  ) : govRunoff.length === 2 ? (
    <>
      {nm(govRunoff[0])} ({govRunoff[0].party}, <Fig>{pct(govRunoff[0].share_r1)}</Fig> no 1º turno) e {nm(govRunoff[1])} ({govRunoff[1].party}, <Fig>{pct(govRunoff[1].share_r1)}</Fig>){" "}
      {year === CURRENT_YEAR ? "disputam o governo no 2º turno, em 25 de outubro" : "foram ao 2º turno"}.
    </>
  ) : gov.length ? (
    <>A disputa pelo governo ainda não tem resultado nesta base.</>
  ) : null;

  const senSentence = senWinners.length ? (
    <>
      {" "}
      Para o Senado, {senWinners.length === 1 ? "foi eleito" : "foram eleitos"}{" "}
      {senWinners.map((r, i) => (
        <span key={r.id}>
          {i > 0 && " e "}
          {nm(r)} ({r.party}, <Fig>{pct(r.share_r1)}</Fig>)
        </span>
      ))}
      .
    </>
  ) : null;

  return (
    <Section
      id="resultado"
      question="O que aconteceu?"
      lede={
        <>
          {govSentence}
          {senSentence}
          {(fed?.n_elected || state?.n_elected) && (
            <>
              {" "}
              {name} elegeu {fed?.n_elected ? <>{num(fed.n_elected)} deputados federais</> : null}
              {fed?.n_elected && state?.n_elected ? " e " : ""}
              {state?.n_elected ? <>{num(state.n_elected)} {state.office_code === 8 ? "deputados distritais" : "deputados estaduais"}</> : null}.
            </>
          )}
        </>
      }
      source={<SourceLine label="TSE, resultado da totalização" info={officialSum("votacao", year, null, "Votos nominais de cada candidatura no estado e situação final divulgada pelo TSE.")} />}
    >
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
        {[
          { label: "Governo", rows: gov, code: 3, all: "Todas as candidaturas ao governo" },
          { label: "Senado", rows: sen, code: 5, all: "Todas as candidaturas ao Senado" },
        ]
          .filter((g) => g.rows.length)
          .map((g) => (
            <div key={g.label}>
              <h3 className="text-[15px] font-semibold text-ink">
                {g.label} <span className="font-normal text-muted">· {num(g.rows[0].n_running)} candidaturas</span>
              </h3>
              <table className="dt mt-3">
                <thead>
                  <tr>
                    <th scope="col">Candidatura</th>
                    <th scope="col" className="n">
                      Votos
                    </th>
                    <th scope="col" className="n hidden sm:table-cell">
                      Despesas
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/candidatos/${year}/${r.id}`} className="e no-underline hover:underline">
                          {titleName(r.ballot_name)}
                        </Link>
                        <div className="s text-[13.5px]">
                          {r.party}, <ResultChip result={r.result} year={year} registration={r.registration_status} />
                        </div>
                      </td>
                      <td className="n">
                        <span className="text-ink">{pct(share(r))}</span>
                        <div className="s text-[13px]">
                          {num(r.votes_r2 ?? r.votes_r1)}
                          {r.votes_r2 != null ? " no 2º turno" : ""}
                        </div>
                      </td>
                      <td className="n s hidden sm:table-cell">{r.has_finance ? brlc(r.expense) : "sem prestação"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Link href={`/candidatos?ano=${year}&uf=${uf}&cargo=${g.code}`} className="action mt-3 inline-block text-[14.5px]">
                {g.all}
              </Link>
            </div>
          ))}
      </div>
    </Section>
  );
}

/* ---------- Quem disputou? (parties) ---------- */

async function PartiesTable({ year, uf, name }: { year: number; uf: string; name: string }) {
  const parties = (await getStateParties(year, uf)).sort((a, b) => b.expense - a.expense);
  if (!parties.length) return null;
  return (
    <details className="mt-8">
      <summary className="action cursor-pointer list-none text-[15px] [&::-webkit-details-marker]:hidden">
        Ver os {num(parties.length)} partidos com candidaturas em {name}
      </summary>
      <table className="dt mt-4">
        <thead>
          <tr>
            <th scope="col">Partido</th>
            <th scope="col" className="n">
              Candidaturas
            </th>
            <th scope="col" className="n hidden sm:table-cell">
              Eleitos
            </th>
            <th scope="col" className="n hidden md:table-cell">
              Receitas
            </th>
            <th scope="col" className="n hidden sm:table-cell">
              Público
            </th>
            <th scope="col" className="n">
              Despesas
            </th>
          </tr>
        </thead>
        <tbody>
          {parties.map((p) => (
            <tr key={p.party}>
              <td>
                <Link className="e no-underline hover:underline" href={`/partidos/${encodeURIComponent(p.party)}?ano=${year}`}>
                  {p.party}
                </Link>
                <div className="s hidden text-[13.5px] md:block">{titleName(p.party_name)}</div>
              </td>
              <td className="n s">
                <Link className="action" href={`/candidatos?ano=${year}&uf=${uf}&partido=${encodeURIComponent(p.party)}`}>
                  {num(p.n_candidates)}
                </Link>
              </td>
              <td className="n s hidden sm:table-cell">{num(p.n_elected)}</td>
              <td className="n s hidden md:table-cell">{brlc(p.revenue)}</td>
              <td className="n s hidden sm:table-cell">{p.public_share == null ? "—" : pct(p.public_share)}</td>
              <td className="n text-ink">{brlc(p.expense)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/* ---------- De onde veio e para onde foi? ---------- */

async function MoneySection({
  year,
  uf,
  name,
  totals: t,
  txBase,
}: {
  year: number;
  uf: string;
  name: string;
  totals: NonNullable<Awaited<ReturnType<typeof getStateTotals>>>;
  txBase: string;
}) {
  const f = { year, uf };
  const [revCats, expRows, donors, suppliers] = await Promise.all([getStateRevenueByCategory(year, uf), getStateExpenseByCategory(year, uf), donorsByGroup(f, 5), suppliersByGroup(f, 5)]);
  if (!t.n_finance) {
    return (
      <Section id="dinheiro" question="De onde veio e para onde foi o dinheiro?">
        <EmptyNote>Nenhuma campanha em {name} publicou prestação de contas ainda.</EmptyNote>
      </Section>
    );
  }
  const groups = new Map<string, number>();
  for (const r of expRows) groups.set(r.category_group, (groups.get(r.category_group) ?? 0) + r.value);
  const expGroups = [...groups.entries()].map(([category_group, value]) => ({ category_group, value })).sort((a, b) => b.value - a.value);
  const top = expGroups[0];
  const topSupplier = [...suppliers].sort((a, b) => b.value - a.value)[0];

  return (
    <Section
      id="dinheiro"
      question="De onde veio e para onde foi o dinheiro?"
      lede={
        <>
          <Fig>{pct(t.public_share ?? 0)}</Fig> do que entrou nas campanhas veio dos fundos públicos (<Fig>{brlc(t.revenue_public)}</Fig>, distribuídos pelos partidos); os outros{" "}
          <Fig>{brlc(t.revenue_private)}</Fig> vieram de fontes privadas.
          {top && (
            <>
              {" "}
              O maior destino foi {inSentence(EXPENSE_GROUPS[top.category_group]?.label ?? top.category_group)} (<Fig>{brlc(top.value)}</Fig>)
              {topSupplier && (
                <>
                  , e o fornecedor que mais recebeu foi{" "}
                  <Link href={`/fornecedores/${topSupplier.key}?ano=${year}`} className="link text-ink">
                    {titleName(topSupplier.name)}
                  </Link>{" "}
                  (<Fig>{brlc(topSupplier.value)}</Fig>)
                </>
              )}
              .
            </>
          )}
        </>
      }
      source={
        <SourceLine
          label="TSE, receitas e despesas das campanhas do estado"
          info={officialSum("receitas", year, t.generated_at, `Receitas e despesas declaradas pelas campanhas que disputaram em ${name}. A localização é a da candidatura, não a do gasto.`)}
          links={[{ label: "Ver as transações", href: txBase }]}
        />
      }
    >
      <AggregateMoney
        year={year}
        txQuery={`ano=${year}&uf=${uf}`}
        revenue={t.revenue}
        expense={t.expense}
        revenuePublic={t.revenue_public}
        revenuePrivate={t.revenue_private}
        revCats={revCats}
        expGroups={expGroups}
        expCategories={expRows}
        donors={donors}
        suppliers={suppliers}
        inSummary={<>De {num(t.n_finance)} campanhas com prestação de contas publicada.</>}
        outSummary={<>{brlc(t.paid)} já pagos.</>}
      />
    </Section>
  );
}

/* ---------- Quem mais recebeu / doou ---------- */

async function CounterpartsSection({ year, uf, name, expense, revenue, txBase }: { year: number; uf: string; name: string; expense: number; revenue: number; txBase: string }) {
  const [suppliers, donors] = await Promise.all([getStateTopSuppliers(year, uf, 12), getStateTopDonors(year, uf, 12)]);
  if (!suppliers.length && !donors.length) return null;
  return (
    <Section
      id="fornecedores"
      question="Quem mais recebeu, e quem mais doou?"
      lede={`Somando todas as campanhas que disputaram em ${name}. A localização é a da candidatura: o fornecedor ou o doador pode estar em outro estado. Doadores excluem repasses de partidos e de outras campanhas.`}
    >
      <div className="grid gap-x-12 gap-y-12 lg:grid-cols-2">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Fornecedores</h3>
          <table className="dt mt-3">
            <thead>
              <tr>
                <th scope="col">Fornecedor</th>
                <th scope="col" className="n">
                  Campanhas
                </th>
                <th scope="col" className="n">
                  Recebeu
                </th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.key}>
                  <td>
                    <Link href={`/fornecedores/${s.key}?ano=${year}`} className="e no-underline hover:underline">
                      {titleName(s.name)}
                    </Link>
                    <div className="s text-[13.5px]">
                      {[ENTITY_KIND[s.kind ?? ""], s.main_group ? inSentence(EXPENSE_GROUPS[s.main_group]?.label) : null].filter(Boolean).join(", ")}
                    </div>
                  </td>
                  <td className="n s">
                    <Link href={`${txBase}&tipo=despesa&contraparte=${s.key}`} className="action">
                      {num(s.n_campaigns)}
                    </Link>
                  </td>
                  <td className="n">
                    <span className="text-ink">{brlc(s.value)}</span>
                    <div className="s text-[13px]">{pct(expense ? s.value / expense : 0)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link className="action mt-3 inline-block text-[14.5px]" href={`/fornecedores?ano=${year}&uf=${uf}`}>
            Todos os fornecedores
          </Link>
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Doadores privados</h3>
          <table className="dt mt-3">
            <thead>
              <tr>
                <th scope="col">Doador</th>
                <th scope="col" className="n">
                  Campanhas
                </th>
                <th scope="col" className="n">
                  Doou
                </th>
              </tr>
            </thead>
            <tbody>
              {donors.map((d) => (
                <tr key={d.key}>
                  <td>
                    <Link href={`/doadores/${d.key}?ano=${year}`} className="e no-underline hover:underline">
                      {titleName(d.name)}
                    </Link>
                    <div className="s text-[13.5px]">{ENTITY_KIND[d.kind ?? ""] ?? ""}</div>
                  </td>
                  <td className="n s">
                    <Link href={`${txBase}&tipo=receita&contraparte=${d.key}`} className="action">
                      {num(d.n_campaigns)}
                    </Link>
                  </td>
                  <td className="n">
                    <span className="text-ink">{brlc(d.value)}</span>
                    <div className="s text-[13px]">{pct(revenue ? d.value / revenue : 0)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link className="action mt-3 inline-block text-[14.5px]" href={`/doadores?ano=${year}&uf=${uf}`}>
            Todos os doadores
          </Link>
        </div>
      </div>
    </Section>
  );
}

/* ---------- Campanhas que mais gastaram ---------- */

async function TopCampaignsSection({ year, uf, name, expense }: { year: number; uf: string; name: string; expense: number }) {
  const rows = await getStateTopCampaigns(year, uf, 12);
  if (!rows.length) return null;
  const top3 = rows.slice(0, 3).reduce((s, r) => s + r.expense, 0);
  return (
    <Section
      id="campanhas"
      question="Quais campanhas gastaram mais?"
      lede={
        <>
          As três maiores somam <Fig>{pct(expense ? top3 / expense : 0)}</Fig> das despesas declaradas em {name}. Gastar mais não indica irregularidade: os limites
          variam por cargo, e campanhas ao governo e ao Senado cobrem o estado inteiro.
        </>
      }
    >
      <table className="dt">
        <thead>
          <tr>
            <th scope="col">Candidatura</th>
            <th scope="col" className="hidden md:table-cell">
              Resultado
            </th>
            <th scope="col" className="n hidden sm:table-cell">
              Votos
            </th>
            <th scope="col" className="n">
              Despesas
            </th>
            <th scope="col" className="n hidden sm:table-cell">
              Do total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>
                <Link href={`/candidatos/${year}/${c.id}`} className="e no-underline hover:underline">
                  {titleName(c.ballot_name)}
                </Link>
                <div className="s text-[13.5px]">
                  {c.office}, {c.party}
                </div>
              </td>
              <td className="hidden text-[14px] md:table-cell">
                <ResultChip result={c.result} year={year} registration={c.registration_status} />
              </td>
              <td className="n s hidden sm:table-cell">{num(c.votes)}</td>
              <td className="n text-ink">{brlc(c.expense)}</td>
              <td className="n s hidden sm:table-cell">{pct(expense ? c.expense / expense : 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Link className="action mt-3 inline-block text-[14.5px]" href={`/candidatos?ano=${year}&uf=${uf}&ordem=despesa`}>
        Todas as candidaturas em {name}
      </Link>
    </Section>
  );
}
