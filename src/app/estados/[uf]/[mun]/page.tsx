import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { municipalityExists } from "@/lib/queries/exists";
import { Suspense } from "react";
import { Container, ResultChip } from "@/components/ui/primitives";
import { Caption, EmptyNote, Fig, PageHeader, Section, SourceLine, YearTabs } from "@/components/ui/editorial";
import { MunicipalityMap } from "@/components/charts/MunicipalityMap";
import { calculation, officialSum } from "@/components/geo/sources";
import { getMunicipality, getMunicipalityVotes, getStateMunicipalities, isStateUf, type MunCandidateRow } from "@/lib/queries/geo";
import { yearMeta } from "@/lib/queries/parties";
import { CURRENT_YEAR, OFFICES, UF_NAMES, parseYear } from "@/lib/labels";
import { num, pct, titleName } from "@/lib/format";

function munName(m: { tse_name: string; ibge_name: string | null }) {
  return m.ibge_name ?? titleName(m.tse_name);
}

export async function generateMetadata({ params, searchParams }: PageProps<"/estados/[uf]/[mun]">): Promise<Metadata> {
  const [{ uf: raw, mun }] = await Promise.all([params, searchParams]);
  const uf = raw.toUpperCase();
  const code = Number(mun);
  if (!isStateUf(uf) || !Number.isInteger(code)) return { title: "Município não encontrado" };
  const m = await getMunicipality(uf, code);
  if (!m) return { title: "Município não encontrado" };
  const name = munName(m);
  return {
    title: `${name} (${uf}) — votos`,
    description: `Os candidatos mais votados em ${name} (${UF_NAMES[uf]}) para cada cargo, com links para as contas de campanha de cada um.`,
  };
}

// Blocking on a cheap existence check lets unknown records return a real 404.
export const instant = false;

export default async function MunicipalityPage({ params, searchParams }: PageProps<"/estados/[uf]/[mun]">) {
  const p = await params;
  if (!(await municipalityExists(p.uf.toUpperCase(), p.mun))) notFound();
  return (
    <Container className="pb-8">
      <Suspense fallback={<MunLoading />}>
        <MunicipalityView params={params} searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

function MunLoading() {
  return (
    <div aria-busy="true" className="pt-10">
      <p className="text-[15px] text-muted">Contando os votos do município…</p>
    </div>
  );
}

const OFFICE_ORDER = [1, 3, 5, 6, 7, 8];

type Block = {
  office: number;
  turno: number;
  rows: MunCandidateRow[];
  multiRound: boolean;
};

const officeLabel = (office: number, fallback: string) => OFFICES.find((o) => o.code === office)?.label ?? fallback;
const roundText = (b: Block) => (b.multiRound || b.office === 1 || b.office === 3 ? ` no ${b.turno}º turno` : "");

async function MunicipalityView({
  params,
  searchParams,
}: {
  params: PageProps<"/estados/[uf]/[mun]">["params"];
  searchParams: PageProps<"/estados/[uf]/[mun]">["searchParams"];
}) {
  const [{ uf: raw, mun }, sp] = await Promise.all([params, searchParams]);
  const uf = raw.toUpperCase();
  const code = Number(mun);
  if (!isStateUf(uf) || !/^\d{1,7}$/.test(mun)) notFound();
  const year = parseYear(sp.ano);

  const [m, votes, all, meta] = await Promise.all([
    getMunicipality(uf, code),
    getMunicipalityVotes(year, uf, code, 10),
    getStateMunicipalities(uf),
    yearMeta(year),
  ]);
  if (!m) notFound();

  const name = munName(m);
  const stateName = UF_NAMES[uf];

  // Group per office, then per round (second round first: it is the deciding one).
  const blocks: Block[] = OFFICE_ORDER.flatMap((office) => {
    const rows = votes.filter((v) => v.office_code === office);
    const rounds = [...new Set(rows.map((r) => r.turno))].sort((a, b) => b - a);
    return rounds.map((turno) => ({
      office,
      turno,
      rows: rows.filter((r) => r.turno === turno),
      multiRound: rounds.length > 1,
    }));
  });
  // Every candidate who got votes appears in the first round; second-round candidates are a subset.
  const distinctCandidates = blocks.filter((b) => b.turno === 1).reduce((s, b) => s + (b.rows[0]?.n_candidates ?? 0), 0);

  // The headline races: the deciding round for president and governor.
  const headline = [1, 3].map((o) => blocks.find((b) => b.office === o)).filter((b): b is Block => Boolean(b?.rows[0]));

  const votesInfo = officialSum(
    "votacao",
    year,
    meta.votes_generated_at,
    "Candidaturas com pelo menos um voto nominal registrado neste município, em qualquer cargo e turno, segundo a votação por município e zona do TSE.",
  );

  const lede =
    blocks.length === 0 ? null : (
      <>
        {headline.map((b, i) => {
          const top = b.rows[0];
          const label = officeLabel(b.office, top.office).toLowerCase();
          const share = top.office_total ? top.votes / top.office_total : null;
          return (
            <span key={`${b.office}-${b.turno}`}>
              {i === 0 ? (
                <>
                  Em {year}, quem votou em {name} deu{" "}
                  <Fig
                    info={calculation(
                      "votacao",
                      year,
                      meta.votes_generated_at,
                      "Total de votos nominais dados a candidatos a este cargo no município, neste turno. Não inclui votos de legenda, brancos e nulos.",
                    )}
                  >
                    {num(top.office_total)}
                  </Fig>{" "}
                  votos nominais para {label}
                  {roundText(b)}, e {titleName(top.ballot_name)} ({top.party}) foi quem mais recebeu: <Fig>{num(top.votes)}</Fig>
                  {share != null ? `, ${pct(share)}` : ""}.
                </>
              ) : (
                <>
                  {" "}
                  Para {label}
                  {roundText(b)}, {titleName(top.ballot_name)} ({top.party}) liderou aqui com <Fig>{num(top.votes)}</Fig> votos
                  {share != null ? ` (${pct(share)})` : ""}.
                </>
              )}
            </span>
          );
        })}{" "}
        Ao todo, <Fig info={votesInfo}>{num(distinctCandidates)}</Fig> candidaturas receberam votos no município.
      </>
    );

  return (
    <>
      <PageHeader
        crumbs={[{ label: `Eleições ${year}`, href: `/?ano=${year}` }, { label: stateName, href: `/estados/${uf}?ano=${year}` }, { label: name }]}
        title={name}
        lede={
          lede ?? (
            <>
              Município de {stateName}. Não há votos registrados aqui nas eleições de {year}
              {year === CURRENT_YEAR ? " nesta base" : ""}.
            </>
          )
        }
        meta={
          <div className="space-y-3">
            <YearTabs path={`/estados/${uf}/${mun}`} params={{}} year={year} />
            <p className="text-[14px] text-ink-2">
              As prestações de contas não dizem em que cidade cada despesa aconteceu, por isso esta página mostra votos, não gastos.{" "}
              <a href="#por-que" className="link text-ink-2">
                Por quê
              </a>
            </p>
            <p className="text-[13.5px] text-muted">
              Código TSE {m.tse_code}
              {m.ibge_code ? `, código IBGE ${m.ibge_code}` : ""}
            </p>
          </div>
        }
        aside={
          m.ibge_code && all.length > 1 ? (
            <aside aria-label={`Localização de ${name} em ${stateName}`} className="hidden w-[300px] shrink-0 lg:block">
              <MunicipalityMap
                uf={uf}
                data={all.map((x) => ({
                  ibge: x.ibge_code,
                  tse: x.tse_code,
                  name: x.name,
                  value: x.ibge_code === m.ibge_code ? 1 : 0,
                }))}
                format="num"
                label=""
                hrefTemplate={`/estados/${uf}/{tse}?ano=${year}`}
                highlight={m.ibge_code}
                domain={[0, 1]}
                showLegend={false}
                height={220}
                ariaLabel={`Mapa de ${stateName} com ${name} destacado`}
              />
              <p className="mt-2 text-[13.5px] leading-snug text-muted">{name} em destaque. Clique em outro município para ver os votos dele.</p>
            </aside>
          ) : undefined
        }
      />

      {blocks.length === 0 ? (
        <div className="mt-10">
          <EmptyNote>
            Não há votos registrados neste município nas eleições de {year}
            {year === CURRENT_YEAR ? " nesta base" : ""}. O código pode corresponder a um município que não existia ou tinha outro código nessa eleição.
          </EmptyNote>
        </div>
      ) : (
        blocks.map((b) => (
          <OfficeBlock key={`${b.office}-${b.turno}`} year={year} uf={uf} munName={name} block={b} votesGeneratedAt={meta.votes_generated_at} />
        ))
      )}

      <Section
        id="por-que"
        question="Por que esta página mostra votos, e não gastos?"
        lede={
          <>
            Nas eleições gerais, as campanhas disputam o estado inteiro (ou o país, no caso da Presidência). As prestações de contas entregues ao TSE dizem quem
            pagou e quem recebeu, mas não em que cidade cada despesa aconteceu: o endereço do fornecedor quase nunca é preenchido e, quando aparece, indica onde
            ele está registrado, não onde o serviço foi prestado. Por isso não é possível dizer, com honestidade, quanto foi gasto em {name}.
          </>
        }
      >
        <p className="max-w-[68ch] text-[16px] leading-relaxed text-ink-2">
          O que os dados mostram com precisão é onde cada candidato recebeu votos. Acima estão os mais votados aqui em cada cargo; a página de cada candidatura
          mostra de onde veio e para onde foi o dinheiro da campanha, e a{" "}
          <Link href={`/estados/${uf}?ano=${year}`} className="link text-ink">
            página de {stateName}
          </Link>{" "}
          soma o dinheiro de todas as campanhas do estado.
        </p>
        <div className="mt-6 max-w-[80ch]">
          <Caption>
            Votos nominais por município de votação, do arquivo de votação por município e zona do TSE. A parcela de cada candidato é sobre o total de votos
            nominais dados a candidatos daquele cargo no município: não inclui votos de legenda (dados só ao partido), brancos e nulos. Votos de quem mora aqui
            mas votou em outra cidade aparecem na cidade de votação.
          </Caption>
          {(year === 2018 || year === 2026) && (
            <Caption>Em {year} cada eleitor escolheu dois nomes para o Senado; as parcelas do Senado somam os dois votos.</Caption>
          )}
        </div>
      </Section>
    </>
  );
}

function OfficeBlock({
  year,
  uf,
  munName,
  block,
  votesGeneratedAt,
}: {
  year: number;
  uf: string;
  munName: string;
  block: Block;
  votesGeneratedAt: string | null;
}) {
  const { office, turno, rows } = block;
  const first = rows[0];
  if (!first) return null;
  const label = officeLabel(office, first.office);
  const lower = label.toLowerCase();
  const id = `cargo-${office}-${turno}`;
  const listHref = office === 1 ? `/candidatos?ano=${year}&cargo=1` : `/candidatos?ano=${year}&uf=${uf}&cargo=${office}`;
  const round = roundText(block);
  const presidentialRound = office === 1 || office === 3 ? ` no ${turno}º turno` : "";

  return (
    <Section
      id={id}
      question={`Quem teve mais votos para ${lower}${round}?`}
      lede={
        <>
          <Fig>{num(first.office_total)}</Fig> votos nominais para {lower} em {munName}, distribuídos entre{" "}
          {first.n_candidates === 1 ? "1 candidatura" : `${num(first.n_candidates)} candidaturas`}.
          {rows.length < first.n_candidates ? ` Abaixo, as ${num(rows.length)} mais votadas aqui.` : ""}
        </>
      }
      source={
        <SourceLine
          label="TSE, votação nominal por município e zona"
          info={calculation(
            "votacao",
            year,
            votesGeneratedAt,
            "Total de votos nominais dados a candidatos a este cargo no município, neste turno. Não inclui votos de legenda, brancos e nulos.",
          )}
        />
      }
    >
      <div className="max-w-[900px]">
        <table className="dt">
          <thead>
            <tr>
              <th scope="col">Candidatura</th>
              <th scope="col" className="hidden md:table-cell">
                Resultado
              </th>
              <th scope="col" className="n">
                Votos aqui
              </th>
              <th scope="col" className="n">
                <span className="sm:hidden">Parcela</span>
                <span className="hidden sm:inline">Dos votos no município</span>
              </th>
              <th scope="col" className="n hidden sm:table-cell">
                Dos votos da candidatura
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const fromHere = r.candidate_votes ? r.votes / r.candidate_votes : null;
              return (
                <tr key={r.candidate_id}>
                  <td>
                    <Link href={`/candidatos/${year}/${r.candidate_id}`} className="e no-underline hover:underline">
                      {titleName(r.ballot_name)}
                    </Link>
                    <div className="s text-[13.5px]">
                      {r.party}
                      <span className="md:hidden">
                        , <ResultChip result={r.result} year={year} registration={r.registration_status} />
                      </span>
                    </div>
                  </td>
                  <td className="hidden text-[14px] md:table-cell">
                    <ResultChip result={r.result} year={year} registration={r.registration_status} />
                  </td>
                  <td className="n text-ink">{num(r.votes)}</td>
                  <td className="n s">{first.office_total ? pct(r.votes / first.office_total) : "—"}</td>
                  <td className="n s hidden sm:table-cell">{fromHere == null ? "—" : fromHere >= 0.995 ? "todos" : pct(fromHere)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="hidden sm:block">
          <Caption>
            Dos votos da candidatura: que parte de todos os votos de cada candidatura{presidentialRound}, {office === 1 ? "no país" : `em ${UF_NAMES[uf]}`}, veio
            de {munName}.
          </Caption>
        </div>
        <Link className="action mt-3 inline-block text-[14.5px]" href={listHref}>
          Todas as candidaturas a {lower}
          {office === 1 ? "" : ` em ${UF_NAMES[uf]}`}
        </Link>
      </div>
    </Section>
  );
}
