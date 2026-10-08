import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { partyExists } from "@/lib/queries/exists";
import { Container } from "@/components/ui/primitives";
import { Caption, Fig, PageHeader, YearTabs } from "@/components/ui/editorial";
import { officialSum, calculation } from "@/components/geo/sources";
import { federationName, partyTitle } from "@/components/parties/names";
import { getPartySummary, resolveParty, yearMeta } from "@/lib/queries/parties";
import { CURRENT_YEAR, parseYear } from "@/lib/labels";
import { brlc, dateLong, num, pct } from "@/lib/format";
import { DistributionSection } from "./_sections/Distribution";
import { MoneySection } from "./_sections/Money";
import { CounterpartsSection } from "./_sections/Counterparts";
import { BodiesSection } from "./_sections/Bodies";
import { OfficesSection } from "./_sections/Offices";
import { PartyHistorySection } from "./_sections/History";

function decode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export async function generateMetadata({ params }: PageProps<"/partidos/[sigla]">): Promise<Metadata> {
  const sigla = decode((await params).sigla);
  return {
    title: `${sigla} — partido`,
    description: `Como o dinheiro público foi distribuído, de onde veio e para onde foi o dinheiro das campanhas do ${sigla}, a partir das prestações de contas entregues ao TSE.`,
  };
}

// Blocking on a cheap existence check lets unknown records return a real 404.
export const instant = false;

export default async function PartyPage({ params, searchParams }: PageProps<"/partidos/[sigla]">) {
  if (!(await partyExists(decode((await params).sigla)))) notFound();
  return (
    <Container className="pb-16">
      <Suspense fallback={<PartyLoading />}>
        <PartyView params={params} searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

function PartyLoading() {
  return (
    <div className="pt-10" aria-busy="true">
      <p className="text-[15px] text-muted">Somando as prestações de contas do partido…</p>
    </div>
  );
}

function SectionLoading({ label }: { label: string }) {
  return (
    <div className="section" aria-busy="true">
      <p className="text-[15px] text-muted">{label}</p>
    </div>
  );
}

async function PartyView({ params, searchParams }: { params: PageProps<"/partidos/[sigla]">["params"]; searchParams: PageProps<"/partidos/[sigla]">["searchParams"] }) {
  const [{ sigla: raw }, sp] = await Promise.all([params, searchParams]);
  const sigla = decode(raw);
  const year = parseYear(sp.ano);
  const matches = await resolveParty(sigla);
  if (!matches.length) notFound();

  const here = matches.find((m) => m.year === year && m.party === sigla) ?? matches.find((m) => m.year === year);
  const display = here ?? matches[0];
  const years = [...new Set([...matches.map((m) => m.year), year])].sort((a, b) => b - a);
  const crumbs = [{ label: "Explorar" }, { label: "Partidos", href: `/partidos?ano=${year}` }, { label: display.party }];
  const tabs = <YearTabs path={`/partidos/${encodeURIComponent(sigla)}`} params={{}} year={year} years={years} />;

  // The sigla has no candidacy of its own in this election: either it did not run at all, or it
  // only appears on running mates (vices and suplentes, whose money is in the head of the ticket's account).
  const absent = (reason: React.ReactNode) => {
    const others = matches.filter((m) => m.year !== year);
    return (
      <>
        <PageHeader
          crumbs={crumbs}
          title={partyTitle(display.party, display.party_name)}
          lede={
            <>
              {reason}
              {others.length > 0 && (
                <>
                  {" "}
                  Ver o partido em{" "}
                  {others.map((m, i) => (
                    <span key={m.year}>
                      {i > 0 && (i === others.length - 1 ? " e " : ", ")}
                      <Link className="link text-ink" href={`/partidos/${encodeURIComponent(m.party)}?ano=${m.year}`}>
                        {m.year}
                      </Link>
                    </span>
                  ))}
                  .
                </>
              )}
            </>
          }
          aside={tabs}
        />
        <Suspense fallback={<SectionLoading label="Buscando outras eleições…" />}>
          <PartyHistorySection sigla={display.party} year={year} />
        </Suspense>
      </>
    );
  };

  if (!here) return absent(<>Não há candidaturas com a sigla {display.party} nas eleições de {year}.</>);

  const party = here.party;
  const [s, meta] = await Promise.all([getPartySummary(year, party), yearMeta(year)]);
  if (!s)
    return absent(
      <>
        Em {year}, a sigla {party} aparece apenas em candidaturas a vice ou a suplente, que não têm contas próprias: o dinheiro dessas chapas é registrado na
        conta de quem as encabeça.
      </>,
    );

  const gen = s.generated_at ?? meta.finance_generated_at;
  const q = encodeURIComponent(party);
  const txBase = `/transacoes?ano=${year}&partido=${q}`;
  const federation = federationName(here.federation_name);
  const isCurrent = year === CURRENT_YEAR;
  const cands = (what: string) => officialSum("candidatos", year, meta.candidates_generated_at, what);

  const elected =
    s.n_elected === 0 && s.n_runoff === 0 ? (
      <>, nenhuma delas eleita</>
    ) : (
      <>
        , das quais{" "}
        <Fig info={cands("Candidaturas com situação de eleito (inclusive por quociente partidário e por média) no resultado divulgado pelo TSE.")}>{num(s.n_elected)}</Fig>{" "}
        {s.n_elected === 1 ? "foi eleita" : "foram eleitas"}
        {s.n_runoff > 0 && (
          <>
            {isCurrent ? " no 1º turno" : ""} e{" "}
            <Fig info={cands("Candidaturas com resultado “2º turno” na totalização do TSE.")}>{num(s.n_runoff)}</Fig> {isCurrent ? (s.n_runoff === 1 ? "disputa" : "disputam") : s.n_runoff === 1 ? "foi" : "foram"}{" "}
            {isCurrent ? "o" : "ao"} 2º turno
          </>
        )}
      </>
    );

  const money =
    s.n_finance === 0 ? (
      <> Nenhuma delas tem prestação de contas publicada pelo TSE até agora.</>
    ) : (
      <>
        {" "}
        Suas campanhas arrecadaram{" "}
        <Fig
          info={officialSum(
            "receitas",
            year,
            gen,
            `Soma das ${num(s.n_revenue_tx)} receitas declaradas pelas campanhas do ${party}, incluindo doações em bens e serviços (estimáveis).`,
            { label: "Ver as receitas", href: `${txBase}&tipo=receita` },
          )}
        >
          {brlc(s.revenue)}
        </Fig>{" "}
        e gastaram{" "}
        <Fig
          info={officialSum("despesas_contratadas", year, gen, `Soma das ${num(s.n_expense_tx)} despesas declaradas pelas campanhas do ${party}, inclusive doações a outras campanhas e partidos.`, {
            label: "Ver as despesas",
            href: `${txBase}&tipo=despesa`,
          })}
        >
          {brlc(s.expense)}
        </Fig>
        .{" "}
        {s.revenue_public > 0 ? (
          <>
            Do que entrou,{" "}
            <Fig
              info={officialSum(
                "receitas",
                year,
                gen,
                "Receitas das campanhas classificadas pelo TSE como Fundo Especial de Financiamento de Campanha (FEFC) ou Fundo Partidário.",
                { label: "Ver as receitas do Fundo Eleitoral", href: `${txBase}&tipo=receita&grupo=fefc` },
              )}
            >
              {brlc(s.revenue_public)}
            </Fig>{" "}
            <span className="whitespace-nowrap">
              (<Fig info={calculation("receitas", year, gen, "Dinheiro público (FEFC + Fundo Partidário) dividido pelas receitas totais das campanhas do partido.")}>{pct(s.public_share ?? 0)}</Fig>)
            </span>
            {" "}vieram do Fundo Eleitoral e do Fundo Partidário, o dinheiro público que cada partido reparte entre suas candidaturas.
          </>
        ) : (
          <>Nenhuma campanha do partido registrou receitas do Fundo Eleitoral ou do Fundo Partidário.</>
        )}
      </>
    );

  return (
    <>
      <PageHeader
        crumbs={crumbs}
        title={partyTitle(party, here.party_name)}
        lede={
          <>
            Em {year}, o {party} teve{" "}
            <Fig info={cands("Candidaturas registradas pelo partido, sem contar vices e suplentes (que não têm contas próprias).")}>{num(s.n_candidates)}</Fig>{" "}
            {s.n_candidates === 1 ? "candidatura" : "candidaturas"}
            {elected}.{money}
          </>
        }
        meta={
          <>
            Número {here.party_number}
            {federation && (
              <>
                {" "}
                · {isCurrent ? "Integra" : "Integrou"} a federação {federation}
              </>
            )}
            {isCurrent && (
              <span className="mt-1 block text-[13.5px] text-muted">
                A prestação de contas de {CURRENT_YEAR} está em andamento: os valores mudam a cada publicação do TSE (última em {dateLong(gen?.slice(0, 10))}).
              </span>
            )}
          </>
        }
        actions={[
          { label: "Candidaturas do partido", href: `/candidatos?ano=${year}&partido=${q}` },
          { label: "Todas as transações", href: txBase },
          { label: "Seguir as conexões", href: `/conexoes?no=${encodeURIComponent(`p:${party}`)}&ano=${year}` },
        ]}
        aside={tabs}
      />

      <Suspense fallback={<SectionLoading label="Calculando a divisão do dinheiro público…" />}>
        <DistributionSection year={year} party={party} generatedAt={gen} />
      </Suspense>

      {s.n_finance > 0 && (
        <Suspense fallback={<SectionLoading label="Somando receitas e despesas…" />}>
          <MoneySection year={year} party={party} generatedAt={gen} />
        </Suspense>
      )}

      {s.n_finance > 0 && (
        <Suspense fallback={<SectionLoading label="Carregando fornecedores e doadores…" />}>
          <CounterpartsSection year={year} party={party} expense={s.expense} revenue={s.revenue} generatedAt={gen} />
        </Suspense>
      )}

      <Suspense fallback={<SectionLoading label="Carregando os repasses dos diretórios…" />}>
        <BodiesSection year={year} party={party} generatedAt={gen} />
      </Suspense>

      <Suspense fallback={<SectionLoading label="Carregando os cargos…" />}>
        <OfficesSection year={year} party={party} generatedAt={gen} />
      </Suspense>

      <Suspense fallback={<SectionLoading label="Buscando outras eleições…" />}>
        <PartyHistorySection sigla={party} year={year} />
      </Suspense>

      <section className="section" aria-labelledby="sobre">
        <h2 id="sobre" className="text-[15px] font-semibold text-ink">
          Sobre estes números
        </h2>
        <Caption>
          Todos os valores somam as prestações de contas das candidaturas do partido, publicadas pelo TSE. As contas dos próprios diretórios partidários são uma base
          separada e não entram aqui; o que os diretórios repassaram às campanhas aparece como receita das candidaturas. Esta página é descritiva: não compara o
          desempenho dos partidos nem avalia a forma como cada um usa seus recursos.
        </Caption>
        <Caption>Dados de {year} publicados pelo TSE até {gen ? dateLong(gen.slice(0, 10)) : "a data desta base"}.</Caption>
      </section>
    </>
  );
}
