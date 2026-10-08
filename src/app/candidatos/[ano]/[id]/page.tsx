import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { candidacyExists } from "@/lib/queries/exists";
import { Container } from "@/components/ui/primitives";
import { Photo } from "@/components/ui/Photo";
import { Actions, Crumbs, EmptyNote, SourceLine } from "@/components/ui/editorial";
import { getCandidate, getDonorsByGroup, getExpenseByCategory, getRevenueByCategory, getRunningMates, getSuppliersByGroup, type CandidateSummary } from "@/lib/queries/candidate";
import { CURRENT_YEAR, FILING_TYPE, UF_NAMES, tseCandidateUrl } from "@/lib/labels";
import { dateLong, num, titleName } from "@/lib/format";
import { officialFinance } from "@/lib/provenance";
import { MoneyOverview } from "./_sections/MoneyOverview";
import { FundingSection } from "./_sections/Funding";
import { SpendingSection } from "./_sections/Spending";
import { FlowSection } from "./_sections/Flow";
import { SignalsSection } from "./_sections/Signals";
import { CompareSection } from "./_sections/Compare";
import { HistorySection } from "./_sections/History";
import { VotesSection } from "./_sections/Votes";
import { AssetsSection } from "./_sections/Assets";
import { DataSection } from "./_sections/Data";
import { SectionNav } from "./_sections/SectionNav";
import { ProposalSection } from "./_sections/Proposal";
import { hasProposal } from "@/lib/queries/proposals";

export async function generateMetadata({ params }: PageProps<"/candidatos/[ano]/[id]">): Promise<Metadata> {
  const { ano, id } = await params;
  const c = await getCandidate(Number(ano), id);
  if (!c) return { title: "Candidatura não encontrada" };
  return {
    title: `${titleName(c.ballot_name)} — ${c.office} ${c.uf} ${c.year}`,
    description: `De onde veio e para onde foi o dinheiro da campanha de ${titleName(c.ballot_name)} (${c.party}) a ${c.office.toLowerCase()} em ${c.year}.`,
  };
}

// Blocking on a cheap existence check lets unknown candidacies return a real 404.
export const instant = false;

export default async function CandidatePage({ params }: PageProps<"/candidatos/[ano]/[id]">) {
  const { ano, id } = await params;
  if (!(await candidacyExists(Number(ano), id))) notFound();
  return (
    <Suspense fallback={<ProfileLoading />}>
      <Profile params={params} />
    </Suspense>
  );
}

function ProfileLoading() {
  return (
    <Container className="pt-10" aria-busy="true">
      <p className="text-[15px] text-muted">Carregando a prestação de contas…</p>
    </Container>
  );
}

const fem = (c: CandidateSummary) => (c.gender ?? "").toLowerCase().startsWith("fem");

/** One or two sentences that say who this is and what happened at the ballot box. */
function describe(c: CandidateSummary, mates: Awaited<ReturnType<typeof getRunningMates>>) {
  const f = fem(c);
  const place = c.uf === "BR" ? "" : ` por ${UF_NAMES[c.uf] ?? c.uf}`;
  const role = `${f ? "candidata" : "candidato"} a ${c.office.toLowerCase()}${place}`;
  const alliance = c.federation_name ? `, em federação (${titleName(c.federation_name.replace(/^FEDERA[ÇC][ÃA]O\s+/i, ""))})` : "";
  const who = (
    <>
      {titleName(c.name)}
      {c.social_name ? ` (nome social ${titleName(c.social_name)})` : ""} foi {role} pelo {c.party}
      {alliance} nas eleições de {c.year}.
    </>
  );
  const v = <span className="num">{num(c.votes)}</span>;
  const elected = f ? "eleita" : "eleito";
  let result: React.ReactNode = null;
  switch (c.result) {
    case "ELEITO":
      result = c.votes_r2 != null ? <>Foi {elected} no 2º turno, com {v} votos.</> : <>Foi {elected} com {v} votos.</>;
      break;
    case "ELEITO POR QP":
    case "ELEITO POR MÉDIA":
      result = (
        <>
          Foi {elected} ({c.result === "ELEITO POR QP" ? "pelo quociente partidário" : "por média"}) com {v} votos.
        </>
      );
      break;
    case "SUPLENTE":
      result = <>Ficou como suplente, com {v} votos.</>;
      break;
    case "NÃO ELEITO":
      result = c.votes_r2 != null ? <>Disputou o 2º turno e não foi {elected}; teve {v} votos.</> : <>Não foi {elected}; recebeu {v} votos.</>;
      break;
    case "2º TURNO":
      result =
        c.year === CURRENT_YEAR ? (
          <>
            Disputa o 2º turno em 25 de outubro, depois de {v} votos no 1º turno.
          </>
        ) : (
          <>Foi ao 2º turno com {v} votos.</>
        );
      break;
    default:
      result = c.registration_status === "INAPTO" ? <>A candidatura foi considerada inapta pela Justiça Eleitoral.</> : null;
  }
  const mate =
    mates.mates.length > 0 ? (
      <>
        {" "}
        Na chapa: {mates.mates.map((m) => titleName(m.ballot_name)).join(" e ")}.
      </>
    ) : mates.heads.length > 0 ? (
      <> Compõe a chapa de {titleName(mates.heads[0].ballot_name)}.</>
    ) : null;
  return (
    <>
      {who} {result}
      {mate}
    </>
  );
}

async function Profile({ params }: { params: PageProps<"/candidatos/[ano]/[id]">["params"] }) {
  const { ano, id } = await params;
  const year = Number(ano);
  const c = await getCandidate(year, id);
  if (!c) notFound();
  const [revCats, expCats, mates, donorsByGroup, suppliersByGroup, proposal] = await Promise.all([
    getRevenueByCategory(year, id),
    getExpenseByCategory(year, id),
    getRunningMates(year, id),
    getDonorsByGroup(year, id, 5),
    getSuppliersByGroup(year, id, 5),
    hasProposal(year, id),
  ]);
  const name = titleName(c.ballot_name);
  const officeHref = `/candidatos?ano=${year}&cargo=${c.office_code}${c.uf !== "BR" ? `&uf=${c.uf}` : ""}`;
  const finance = c.has_finance;
  const showSections = !c.is_running_mate || finance;

  return (
    <>
      <Container>
        <header className="pt-8 sm:pt-10">
          <Crumbs
            items={[
              { label: `Eleições ${year}`, href: `/?ano=${year}` },
              ...(c.uf !== "BR" ? [{ label: UF_NAMES[c.uf] ?? c.uf, href: `/estados/${c.uf}?ano=${year}` }] : []),
              { label: c.office, href: officeHref },
              { label: name },
            ]}
          />
          <div className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-4 sm:gap-x-8">
            <span className="sm:hidden">
              <Photo year={year} id={id} name={c.ballot_name} size={52} />
            </span>
            <span className="hidden sm:block">
              <Photo year={year} id={id} name={c.ballot_name} size={88} />
            </span>
            <div className="contents sm:block sm:min-w-0">
              <h1 className="title self-center text-ink sm:self-auto">{name}</h1>
              <p className="lede col-span-2 max-w-[64ch] sm:mt-3">{describe(c, mates)}</p>
              <Actions
                className="col-span-2 sm:mt-4"
                items={[
                  { label: "Comparar com outras candidaturas", href: `/comparar?c=${year}-${id}` },
                  { label: "Seguir as conexões", href: `/conexoes?no=c:${year}:${id}` },
                  { label: "Todas as transações", href: `/transacoes?ano=${year}&candidato=${id}` },
                  ...(proposal ? [{ label: "Proposta de governo", href: `/candidatos/${year}/${id}/proposta` }] : []),
                  { label: "Registro no TSE", href: tseCandidateUrl(year, c.uf, id), external: true },
                ]}
              />
            </div>
          </div>
        </header>

        <section aria-labelledby="dinheiro" className="mt-12 border-t border-rule-strong pt-8">
          <h2 id="dinheiro" className="sr-only">
            O dinheiro da campanha
          </h2>
          {!finance ? (
            <EmptyNote>
              {c.is_running_mate
                ? "Candidaturas a vice e a suplente normalmente não têm prestação de contas própria: o dinheiro da chapa é registrado na conta do titular."
                : `O TSE ainda não publicou nenhuma prestação de contas desta candidatura. Quando ela aparecer nos dados abertos, os valores serão mostrados aqui.`}
            </EmptyNote>
          ) : (
            <MoneyOverview c={c} revCats={revCats} expCats={expCats} donorsByGroup={donorsByGroup} suppliersByGroup={suppliersByGroup} />
          )}
          {finance && (
            <div className="mt-8">
              <SourceLine
                label={`TSE, ${(FILING_TYPE[c.filing_type ?? ""] ?? "prestação de contas").toLowerCase()} entregue em ${dateLong(c.filing_date)}, publicada em ${dateLong(c.finance_generated_at?.slice(0, 10))}`}
                info={officialFinance(c, "receitas", "Receitas e despesas declaradas pela campanha à Justiça Eleitoral, como publicadas no Portal de Dados Abertos do TSE.", {
                  label: "Ver todas as transações",
                  href: `/transacoes?ano=${year}&candidato=${id}`,
                })}
                links={[{ label: "Baixar CSV", href: `/api/transacoes?ano=${year}&candidato=${id}&formato=csv` }]}
              />
              {year === CURRENT_YEAR && <p className="mt-1 text-[13.5px] text-muted">A campanha de {CURRENT_YEAR} ainda está em curso: os valores mudam a cada nova prestação.</p>}
            </div>
          )}
        </section>
      </Container>

      {showSections && (
        <>
          <SectionNav hasFinance={finance} signals={c.signals} hasProposal={proposal} />
          <Container className="[&>.section:first-child]:border-t-0 [&>.section:first-child]:pt-10">
            {finance && (
              <>
                <Suspense fallback={<SectionLoading label="Carregando doadores…" />}>
                  <FundingSection c={c} />
                </Suspense>
                <Suspense fallback={<SectionLoading label="Carregando despesas…" />}>
                  <SpendingSection c={c} />
                </Suspense>
                <Suspense fallback={<SectionLoading label="Montando o caminho do dinheiro…" />}>
                  <FlowSection c={c} />
                </Suspense>
                <Suspense fallback={<SectionLoading label="Calculando sinais…" />}>
                  <SignalsSection c={c} />
                </Suspense>
              </>
            )}
            {proposal && (
              <Suspense fallback={<SectionLoading label="Abrindo a proposta de governo…" />}>
                <ProposalSection c={c} />
              </Suspense>
            )}
            <Suspense fallback={<SectionLoading label="Carregando votos…" />}>
              <VotesSection c={c} />
            </Suspense>
            {finance && (
              <Suspense fallback={<SectionLoading label="Comparando campanhas…" />}>
                <CompareSection c={c} />
              </Suspense>
            )}
            <Suspense fallback={<SectionLoading label="Buscando outras eleições…" />}>
              <HistorySection c={c} />
            </Suspense>
            <Suspense fallback={<SectionLoading label="Carregando bens declarados…" />}>
              <AssetsSection c={c} />
            </Suspense>
            <Suspense fallback={<SectionLoading label="Carregando fontes…" />}>
              <DataSection c={c} />
            </Suspense>
          </Container>
        </>
      )}
    </>
  );
}

function SectionLoading({ label }: { label: string }) {
  return (
    <div className="section" aria-busy="true">
      <p className="text-[15px] text-muted">{label}</p>
    </div>
  );
}
