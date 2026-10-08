import Link from "next/link";
import { Suspense } from "react";
import { Container, ResultChip } from "@/components/ui/primitives";
import { Section, SourceLine, Fig, YearTabs, Caption, EmptyNote } from "@/components/ui/editorial";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { SearchInvite } from "@/components/search/SearchPalette";
import { FilterForm } from "@/components/ui/FilterForm";
import { AggregateMoney } from "@/components/money/AggregateMoney";
import { DailyChart } from "@/components/charts/DailyChart";
import { BrazilMap } from "@/components/charts/BrazilMap";
import {
  byOffice,
  byState,
  counterpartCounts,
  daily,
  donorsByGroup,
  expenseByGroup,
  featured,
  filterOptions,
  revenueByCategory,
  suppliersByGroup,
  topCampaigns,
  topPrivateDonors,
  topSuppliers,
  totals,
  type DashFilters,
} from "@/lib/queries/dashboard";
import { CURRENT_YEAR, ENTITY_KIND, OFFICES, UF_NAMES, parseYear } from "@/lib/labels";
import { brlc, dateLong, num, numc, pct, titleName } from "@/lib/format";
import { dataset } from "@/lib/provenance";
import { q1 } from "@/lib/db";

const JOURNEYS = [
  { label: "Uma candidatura", href: "/candidatos", note: "Quem financiou e com quem gastou" },
  { label: "Um estado", href: "/estados", note: "Quem disputou e para onde foi o dinheiro" },
  { label: "Um partido", href: "/partidos", note: "Como o dinheiro público foi distribuído" },
  { label: "Uma empresa contratada", href: "/fornecedores", note: "Quais campanhas pagaram e por quê" },
  { label: "Quem doou", href: "/doadores", note: "Pessoas, partidos e campanhas que repassaram" },
  { label: "Cada transação", href: "/transacoes", note: "Receitas e despesas, filtráveis e exportáveis" },
];

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <>
      <Container>
        <header className="grid gap-x-16 gap-y-10 pt-10 sm:pt-16 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
          <div>
            <h1 className="title max-w-[17ch] text-ink">De onde veio e para onde foi o dinheiro das campanhas</h1>
            <p className="lede mt-5 max-w-[58ch]">
              As prestações de contas que as candidaturas entregam à Justiça Eleitoral, organizadas para leitura. Cada número leva ao registro original do TSE.
            </p>
            <div className="mt-8 max-w-[620px]">
              <SearchInvite />
            </div>
            <Suspense fallback={<div className="mt-4 h-6" />}>
              <Featured searchParams={searchParams} />
            </Suspense>
          </div>
          <nav aria-label="Por onde começar" className="lg:pt-3">
            <h2 className="text-[15px] font-semibold text-ink">Comece por</h2>
            <ul className="mt-2 border-t border-rule">
              {JOURNEYS.map((j) => (
                <li key={j.href} className="border-b border-rule">
                  <Link href={j.href} className="group block py-2.5 no-underline">
                    <span className="block text-[16px] font-medium text-ink group-hover:underline group-hover:decoration-accent group-hover:underline-offset-[3px]">
                      {j.label}
                    </span>
                    <span className="block text-[14px] text-ink-2">{j.note}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </header>
      </Container>
      <Suspense fallback={<OverviewLoading />}>
        <Overview searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function OverviewLoading() {
  return (
    <Container className="mt-16 border-t border-rule-strong pt-8" aria-busy="true">
      <p className="text-[15px] text-muted">Somando as prestações de contas…</p>
    </Container>
  );
}

async function Featured({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const sp = await searchParams;
  const year = parseYear(sp.ano);
  const list = await featured(year);
  if (!list.length) return null;
  return (
    <p className="mt-4 max-w-[62ch] text-[14.5px] leading-relaxed text-ink-2">
      Por exemplo:{" "}
      {list.map((c, i) => (
        <span key={c.id}>
          {i > 0 && (i === list.length - 1 ? " ou " : ", ")}
          <Link className="link text-ink" href={`/candidatos/${year}/${c.id}`}>
            {titleName(c.ballot_name)}
          </Link>
          <span className="text-muted"> ({c.office === "Presidente" ? "Presidente" : `${c.office.replace("Governador", "Gov.")} ${c.uf}`})</span>
        </span>
      ))}
      .
    </p>
  );
}

function str(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

async function Overview({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const sp = await searchParams;
  const year = parseYear(sp.ano);
  const f: DashFilters = {
    year,
    uf: str(sp.uf) || undefined,
    office: Number(str(sp.cargo)) || undefined,
    party: str(sp.partido) || undefined,
  };
  const [t, counts, rev, exp, days, offices, states, camps, sups, donors, opts, election, donorGroups, supplierGroups] = await Promise.all([
    totals(f),
    counterpartCounts(f),
    revenueByCategory(f),
    expenseByGroup(f),
    daily(f),
    byOffice(f),
    byState(f),
    topCampaigns(f, 12),
    topSuppliers(f, 10),
    topPrivateDonors(f, 10),
    filterOptions(year),
    q1<{ round1: string; round2: string; label: string }>(`SELECT round1, round2, label FROM election WHERE year = ?`, [year]),
    donorsByGroup(f, 5),
    suppliersByGroup(f, 5),
  ]);
  if (!t) return null;

  const qs = (extra: Record<string, string | number | undefined> = {}) => {
    const p = new URLSearchParams({ ano: String(year) });
    if (f.uf) p.set("uf", f.uf);
    if (f.office) p.set("cargo", String(f.office));
    if (f.party) p.set("partido", f.party);
    for (const [k, v] of Object.entries(extra)) if (v !== undefined) p.set(k, String(v));
    return p.toString();
  };
  const scopeParts = [
    f.office ? OFFICES.find((o) => o.code === f.office)?.plural.toLowerCase() : null,
    f.uf ? (f.uf === "BR" ? "campanhas nacionais" : `em ${UF_NAMES[f.uf]}`) : null,
    f.party ? `do ${f.party}` : null,
  ].filter(Boolean);
  const scope = scopeParts.length ? ` (${scopeParts.join(", ")})` : "";
  const src = (what: string, kind: "oficial" | "calculo" = "oficial") => ({ kind, what, dataset: dataset("receitas", year, t.generated_at) });
  const isCurrent = year === CURRENT_YEAR;
  const mapRows = states.filter((s) => s.uf !== "BR").sort((a, b) => b.expense - a.expense);
  const national = states.find((s) => s.uf === "BR");
  const stateTotal = mapRows.reduce((s, r) => s + r.expense, 0);

  return (
    <Container>
      <div className="mt-16 border-t border-rule-strong pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
          <h2 className="question text-ink">{election?.label ?? `Eleições ${year}`}</h2>
          <YearTabs path="/" params={{ uf: f.uf, cargo: f.office ? String(f.office) : undefined, partido: f.party }} year={year} />
        </div>
        <div className="mt-5">
          <FilterForm
            key={`${year}-${f.uf}-${f.office}-${f.party}`}
            action="/"
            hidden={{ ano: String(year) }}
            fields={[
              { name: "uf", label: "Estado", allLabel: "Todos", value: f.uf ?? "", options: opts.ufs.map((u) => ({ value: u, label: u === "BR" ? "Nacional (Presidente)" : `${UF_NAMES[u] ?? u}` })) },
              { name: "cargo", label: "Cargo", allLabel: "Todos", value: f.office ? String(f.office) : "", options: OFFICES.map((o) => ({ value: String(o.code), label: o.plural })) },
              { name: "partido", label: "Partido", allLabel: "Todos", value: f.party ?? "", options: opts.parties.map((p) => ({ value: p.party, label: p.party })) },
            ]}
          />
        </div>

        {t.n_finance === 0 ? (
          <div className="mt-8">
            <EmptyNote>Nenhuma prestação de contas foi publicada para este recorte. Tente outro estado, cargo ou partido, ou outra eleição.</EmptyNote>
          </div>
        ) : (
          <>
            <p className="lede mt-8 max-w-[74ch] text-[18.5px]">
              <Fig info={{ kind: "oficial", what: "Candidaturas registradas (sem vices e suplentes, cujas contas ficam com o titular).", dataset: dataset("candidatos", year) }}>
                {num(t.n_candidates)}
              </Fig>{" "}
              candidaturas{scope}, das quais {num(t.n_finance)} já publicaram prestação de contas. Juntas, declararam{" "}
              <Fig info={src(`Soma de ${num(t.n_revenue_tx)} receitas declaradas, incluindo doações em bens e serviços.`)}>{brlc(t.revenue)}</Fig> em receitas,{" "}
              <Fig info={src("Receitas do Fundo Eleitoral e do Fundo Partidário divididas pela receita total.", "calculo")}>{pct(t.revenue ? t.revenue_public / t.revenue : 0)}</Fig> de
              dinheiro público, e{" "}
              <Fig info={{ kind: "oficial", what: `Soma de ${num(t.n_expense_tx)} despesas declaradas, incluindo doações a outras campanhas.`, dataset: dataset("despesas_contratadas", year, t.generated_at) }}>
                {brlc(t.expense)}
              </Fig>{" "}
              em despesas com {numc(counts.suppliers)} fornecedores. Uma campanha típica gastou{" "}
              <Fig info={src("Mediana das despesas entre as campanhas com prestação publicada. A média é puxada para cima pelas campanhas maiores.", "calculo")}>{brlc(t.median_expense)}</Fig>.
            </p>
            <div className="mt-3">
              <SourceLine
                label={`TSE, prestações publicadas até ${dateLong(t.generated_at?.slice(0, 10))}`}
                info={src("Receitas e despesas declaradas pelas campanhas, como publicadas no Portal de Dados Abertos do TSE.")}
                links={[{ label: "Ver as transações", href: `/transacoes?${qs()}` }]}
              />
            </div>
            {isCurrent && (
              <p className="mt-6 max-w-[74ch] border-l-2 border-accent pl-4 text-[15px] leading-relaxed text-ink-2">
                A prestação de contas de {CURRENT_YEAR} está em andamento: as campanhas ainda enviam relatórios e há 2º turno em 25 de outubro. Os totais mudam a cada
                publicação do TSE.{" "}
                <Link href="/atualizacoes" className="link text-ink">
                  O que mudou na última atualização
                </Link>
              </p>
            )}

            <section aria-labelledby="dinheiro" className="mt-12">
              <h2 id="dinheiro" className="sr-only">
                Dinheiro que entrou e saiu
              </h2>
              <AggregateMoney
                year={year}
                txQuery={qs()}
                revenue={t.revenue}
                expense={t.expense}
                revenuePublic={t.revenue_public}
                revenuePrivate={t.revenue_private}
                revenueEstimable={t.revenue_estimable}
                revCats={rev}
                expGroups={exp}
                donors={donorGroups}
                suppliers={supplierGroups}
                inSummary={<>{numc(counts.donors)} doadores, entre eles {numc(counts.donorsPf)} pessoas físicas.</>}
                outSummary={<>{numc(t.n_expense_tx)} despesas declaradas; {brlc(t.paid)} já pagos.</>}
              />
            </section>
          </>
        )}
      </div>

      {t.n_finance > 0 && (
        <>
          <Section
            id="quem"
            question="Quem mais recebeu, e quem mais doou?"
            lede="Fornecedores somam o que todas as campanhas do recorte contrataram de cada um. Doadores são pessoas e empresas, sem repasses de partidos nem recursos dos próprios candidatos."
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
                    {sups.map((s) => (
                      <tr key={s.key}>
                        <td>
                          <Link href={`/fornecedores/${s.key}?ano=${year}`} className="e no-underline hover:underline">
                            {titleName(s.name)}
                          </Link>
                          <div className="s text-[13.5px]">
                            {ENTITY_KIND[s.kind] ?? ""}, {num(s.n_parties)} {s.n_parties === 1 ? "partido" : "partidos"}
                          </div>
                        </td>
                        <td className="n s">{num(s.n_campaigns)}</td>
                        <td className="n text-ink">{brlc(s.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Link className="action mt-3 inline-block text-[14.5px]" href={`/fornecedores?${qs()}`}>
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
                        Candidaturas
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
                          <div className="s text-[13.5px]">
                            {ENTITY_KIND[d.kind] ?? ""}, {num(d.n_parties)} {d.n_parties === 1 ? "partido" : "partidos"}
                          </div>
                        </td>
                        <td className="n s">{num(d.n_candidates)}</td>
                        <td className="n text-ink">{brlc(d.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Link className="action mt-3 inline-block text-[14.5px]" href={`/doadores?${qs()}`}>
                  Todos os doadores
                </Link>
              </div>
            </div>
          </Section>

          {!f.uf && mapRows.length > 1 && (
            <Section
              id="estados"
              question="Onde o dinheiro foi gasto?"
              lede={
                <>
                  {mapRows[0] && (
                    <>
                      As campanhas de {UF_NAMES[mapRows[0].uf]} declararam <Fig>{brlc(mapRows[0].expense)}</Fig> em despesas, {pct(stateTotal ? mapRows[0].expense / stateTotal : 0)} do total
                      dos estados.{" "}
                    </>
                  )}
                  Valores absolutos acompanham o tamanho do eleitorado.
                  {national && national.expense > 0 && <> As campanhas presidenciais ({brlc(national.expense)}) ficam fora da divisão por estado.</>}
                </>
              }
            >
              <ViewToggle
                label="Formas de ver os estados"
                views={[
                  {
                    key: "lista",
                    label: "Lista",
                    node: (
                      <table className="dt">
                        <thead>
                          <tr>
                            <th scope="col">Estado</th>
                            <th scope="col" className="n hidden sm:table-cell">
                              Candidaturas
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
                            <th scope="col" className="n">
                              Do total
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {mapRows.map((r) => (
                            <tr key={r.uf}>
                              <td>
                                <Link href={`/estados/${r.uf}?ano=${year}`} className="e no-underline hover:underline">
                                  {UF_NAMES[r.uf] ?? r.uf}
                                </Link>
                              </td>
                              <td className="n s hidden sm:table-cell">{num(r.n)}</td>
                              <td className="n s hidden md:table-cell">{brlc(r.revenue)}</td>
                              <td className="n s hidden sm:table-cell">{pct(r.revenue ? r.revenue_public / r.revenue : 0)}</td>
                              <td className="n text-ink">{brlc(r.expense)}</td>
                              <td className="n s">{pct(stateTotal ? r.expense / stateTotal : 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ),
                  },
                  {
                    key: "mapa",
                    label: "Mapa",
                    node: (
                      <div className="max-w-[760px]">
                        <p className="mb-2 text-[14.5px] text-ink-2">Total de despesas das campanhas de cada estado. Mais escuro, mais dinheiro. Clique em um estado para abri-lo.</p>
                        <BrazilMap
                          data={mapRows.map((r) => ({ uf: r.uf, value: r.expense, note: `${num(r.n)} candidaturas` }))}
                          format="brl"
                          label="Total de despesas"
                          hrefTemplate={`/estados/{uf}?ano=${year}`}
                          height={460}
                          ariaLabel="Mapa do Brasil com o total de despesas das campanhas por estado"
                        />
                      </div>
                    ),
                  },
                ]}
              />
            </Section>
          )}

          <Section
            id="cargos"
            question="Quanto custa disputar cada cargo?"
            lede="A mediana mostra o gasto de uma campanha típica; o total é puxado pelas maiores."
            source={<SourceLine label="TSE, candidaturas e prestações de contas" info={src("Somas e medianas por cargo das campanhas com prestação publicada.", "calculo")} />}
          >
            <table className="dt">
              <thead>
                <tr>
                  <th scope="col">Cargo</th>
                  <th scope="col" className="n">
                    Candidaturas
                  </th>
                  <th scope="col" className="n hidden md:table-cell">
                    Receitas
                  </th>
                  <th scope="col" className="n hidden sm:table-cell">
                    Público
                  </th>
                  <th scope="col" className="n hidden sm:table-cell">
                    Despesas
                  </th>
                  <th scope="col" className="n">
                    Gasto típico
                  </th>
                </tr>
              </thead>
              <tbody>
                {offices.map((o) => (
                  <tr key={o.office_code}>
                    <td>
                      <Link className="e no-underline hover:underline" href={`/candidatos?${qs({ cargo: o.office_code })}`}>
                        {o.office}
                      </Link>
                    </td>
                    <td className="n s">{num(o.n)}</td>
                    <td className="n s hidden md:table-cell">{brlc(o.revenue)}</td>
                    <td className="n s hidden sm:table-cell">{pct(o.revenue ? o.revenue_public / o.revenue : 0)}</td>
                    <td className="n s hidden sm:table-cell">{brlc(o.expense)}</td>
                    <td className="n text-ink">{brlc(o.median_expense)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {days.length > 1 && election && (
            <Section id="tempo" question="Quando o dinheiro entrou e saiu?" lede="Receitas e despesas pela data registrada em cada transação.">
              <DailyChart
                data={days}
                marks={[
                  { date: election.round1, label: "1º turno" },
                  { date: election.round2, label: "2º turno" },
                ]}
              />
            </Section>
          )}

          <Section
            id="campanhas"
            question="Quais campanhas declararam mais despesas?"
            lede="Ordenadas pelo valor contratado, só para orientar a exploração. Volume de gastos não indica qualidade, eficiência nem irregularidade."
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
                </tr>
              </thead>
              <tbody>
                {camps.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/candidatos/${c.year}/${c.id}`} className="e no-underline hover:underline">
                        {titleName(c.ballot_name)}
                      </Link>
                      <div className="s text-[13.5px]">
                        {c.office}
                        {c.uf !== "BR" ? ` (${c.uf})` : ""}, {c.party}
                      </div>
                    </td>
                    <td className="hidden text-[14px] md:table-cell">
                      <ResultChip result={c.result} year={c.year} />
                    </td>
                    <td className="n s hidden sm:table-cell">{num(c.votes)}</td>
                    <td className="n text-ink">{brlc(c.expense)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Link className="action mt-3 inline-block text-[14.5px]" href={`/candidatos?${qs({ ordem: "despesa" })}`}>
              Todas as candidaturas
            </Link>
            <Caption>Valores das prestações publicadas até {dateLong(t.generated_at?.slice(0, 10))}.</Caption>
          </Section>
        </>
      )}
    </Container>
  );
}
