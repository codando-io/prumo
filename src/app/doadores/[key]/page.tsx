import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { entityExists } from "@/lib/queries/exists";
import { Container } from "@/components/ui/primitives";
import { Caption, EmptyNote, Fig, PageHeader } from "@/components/ui/editorial";
import { Loading, ProfileLoading, ProfileYears, WhoSentence, param, yearsText } from "@/components/entities/parts";
import { CrossLinks } from "@/components/entities/CrossLinks";
import { DataSources } from "@/components/entities/DataSources";
import { PartiesAndStates } from "@/components/entities/Geography";
import { entityOfficial } from "@/components/entities/sources";
import {
  financeGeneratedAt,
  getCampaignOwner,
  getCandidacies,
  getDonationTotals,
  getDonations,
  getDonationsBy,
  getEntity,
  getEntityYears,
  getIndirect,
} from "@/lib/queries/entities";
import { CURRENT_YEAR, parseYear } from "@/lib/labels";
import { brlc, num, pct, titleName } from "@/lib/format";
import { Recipients } from "./_sections/Recipients";
import { Indirect } from "./_sections/Indirect";
import { DonorYears } from "./_sections/Years";

export async function generateMetadata({ params }: PageProps<"/doadores/[key]">): Promise<Metadata> {
  const { key } = await params;
  const e = await getEntity(key);
  if (!e) return { title: "Doador não encontrado" };
  const name = titleName(e.name) || "Doador";
  return {
    title: `${name} — doador`,
    description: `Doações de ${name} a campanhas eleitorais nas eleições gerais de 2018, 2022 e 2026: candidaturas, partidos e estados, segundo as prestações de contas entregues ao TSE.`,
  };
}

// Blocking on a cheap existence check lets unknown records return a real 404.
export const instant = false;

export default async function DonorPage({ params, searchParams }: PageProps<"/doadores/[key]">) {
  if (!(await entityExists((await params).key))) notFound();
  return (
    <Suspense fallback={<ProfileLoading label="Carregando o doador…" />}>
      <DonorView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** Party bodies, campaign accounts and crowdfunding platforms pass money on; people and companies donate. */
const PASSES_ON = new Set(["partido", "campanha", "plataforma"]);

async function DonorView({ params, searchParams }: Pick<PageProps<"/doadores/[key]">, "params" | "searchParams">) {
  const [{ key }, sp] = await Promise.all([params, searchParams]);
  const e = await getEntity(key);
  if (!e) notFound();

  const [years, candidacies, owner] = await Promise.all([
    getEntityYears(key),
    getCandidacies(e.person_id),
    e.kind === "campanha" ? getCampaignOwner(e.campaign_year, e.campaign_candidate_id) : Promise.resolve(undefined),
  ]);
  const donorYears = years.filter((y) => y.donated > 0 || y.donated_indirect > 0).map((y) => y.year);
  // Without ?ano=, focus the most recent election in which this donor appears.
  const asked = param(sp.ano);
  const year = asked ? parseYear(asked) : (donorYears[donorYears.length - 1] ?? CURRENT_YEAR);
  const y = years.find((r) => r.year === year);
  const direct = !!y && y.donated > 0;
  const indirect = !!y && y.donated_indirect > 0;

  const [totals, donations, byParty, byUf, ind, generatedAt] = await Promise.all([
    direct ? getDonationTotals(key, year) : Promise.resolve(undefined),
    direct ? getDonations(key, year) : Promise.resolve([]),
    direct ? getDonationsBy(key, year, "party") : Promise.resolve([]),
    direct ? getDonationsBy(key, year, "uf") : Promise.resolve([]),
    indirect ? getIndirect(key, year) : Promise.resolve({ rows: [], vias: [] }),
    financeGeneratedAt(year),
  ]);

  const name = titleName(e.name) || "(sem nome)";
  const tx = `/transacoes?ano=${year}&contraparte=${key}&tipo=receita`;
  const doc = e.kind === "pf" ? "CPF" : "CNPJ";
  const verb = PASSES_ON.has(e.kind) ? "repassou" : "doou";
  const top = donations[0];
  const ownerInLede = e.kind === "campanha" && owner;
  const candidate = (id: string, ballot: string) => (
    <Link href={`/candidatos/${year}/${id}`} className="link text-ink">
      {titleName(ballot)}
    </Link>
  );

  const lede = (
    <>
      <WhoSentence e={e} owner={owner} year={year} />{" "}
      {direct && y ? (
        <>
          Em {year}, {verb}{" "}
          <Fig
            info={entityOfficial(
              "receitas",
              year,
              generatedAt,
              `Soma das ${num(y.n_donations)} receitas em que este ${doc} aparece como doador nas prestações de contas de ${year}, incluindo doações em bens e serviços (estimáveis em dinheiro).`,
              { label: "Ver as doações", href: tx },
            )}
          >
            {brlc(y.donated)}
          </Fig>{" "}
          a{" "}
          {y.n_candidates_donated === 1 ? (
            <>uma candidatura{top && <>, a de {candidate(top.candidate_id, top.ballot_name)}</>}</>
          ) : (
            <>
              <Fig>{num(y.n_candidates_donated)}</Fig> candidaturas
              {y.n_parties_donated > 1 && (
                <>
                  {" "}
                  de <Fig>{num(y.n_parties_donated)}</Fig> partidos
                </>
              )}
              {top && (
                <>
                  ; quem mais recebeu foi {candidate(top.candidate_id, top.ballot_name)} (<Fig>{pct(top.value / y.donated)}</Fig>)
                </>
              )}
            </>
          )}
          .
        </>
      ) : indirect && y ? (
        <>
          Em {year}, não fez doações diretas a campanhas, mas <Fig>{brlc(y.donated_indirect)}</Fig> doados a partidos ou plataformas de financiamento coletivo chegaram a{" "}
          <Fig>{num(y.n_candidates_indirect)}</Fig> {y.n_candidates_indirect === 1 ? "candidatura" : "candidaturas"}.
        </>
      ) : donorYears.length ? (
        <>Aparece como doador em {yearsText(donorYears)}, mas não nas prestações de contas de {year}.</>
      ) : (
        <>Não aparece como doador de campanhas nas prestações de contas de 2018, 2022 e 2026.</>
      )}
    </>
  );

  const meta = [
    e.doc_display && (
      <span key="doc">
        {e.kind === "pf" ? "CPF (mascarado)" : "CNPJ"} <span className="tnum">{e.doc_display}</span>
      </span>
    ),
    e.cnae && e.kind === "pj" && <span key="cnae">Atividade econômica: {e.cnae}</span>,
    donorYears.length > 0 && <span key="years">Doações em {yearsText(donorYears)}</span>,
  ].filter(Boolean);

  return (
    <Container>
      <PageHeader
        crumbs={[{ label: "Seguir o dinheiro" }, { label: "Doadores", href: `/doadores?ano=${year}` }, { label: name }]}
        title={<span className="break-words">{name}</span>}
        lede={lede}
        meta={
          meta.length > 0 && (
            <p className="max-w-[72ch]">
              {meta.map((m, i) => (
                <span key={i}>
                  {i > 0 && <span aria-hidden="true" className="px-2 text-muted">·</span>}
                  {m}
                </span>
              ))}
            </p>
          )
        }
        aside={<ProfileYears year={year} active={donorYears} hrefFor={(yy) => `/doadores/${key}?ano=${yy}`} />}
        actions={[
          ...(direct ? [{ label: "Ver as doações", href: tx }] : []),
          { label: "Seguir as conexões", href: `/conexoes?no=e:${key}&ano=${year}` },
          ...(/^j\d{14}$/.test(key) ? [{ label: "Dados públicos da empresa", href: `/empresas/${key.slice(1)}` }] : []),
          ...(e.kind === "partido" && e.party ? [{ label: "Ver o partido", href: `/partidos/${encodeURIComponent(e.party)}?ano=${year}` }] : []),
        ]}
      />
      <CrossLinks e={e} role="doador" year={year} candidacies={candidacies} owner={ownerInLede ? undefined : owner} />
      <div className="mt-6">
        <Caption>
          {KIND_NOTE[e.kind] ?? "Os registros aparecem como foram declarados pelas campanhas ao TSE."} Aparecer como doador não indica, por si só, nenhuma irregularidade.
        </Caption>
      </div>

      {!direct && !indirect && (
        <div className="mt-10">
          <EmptyNote>
            Não há doações de {name} nas prestações de contas de {year}.
            {donorYears.length > 0 && <> Escolha {donorYears.length === 1 ? `${donorYears[0]}` : "outra eleição"} acima para ver os registros.</>}
            {year === CURRENT_YEAR && " As campanhas de 2026 ainda estão entregando prestações de contas; novos registros aparecem a cada atualização do TSE."}
          </EmptyNote>
        </div>
      )}

      {direct && y && totals && (
        <>
          <Recipients
            name={name}
            kind={e.kind}
            entityKey={key}
            year={year}
            total={y.donated}
            nDonations={y.n_donations}
            nCandidates={y.n_candidates_donated}
            totals={totals}
            generatedAt={generatedAt}
            donations={donations}
          />
          <PartiesAndStates role="doador" year={year} total={y.donated} byParty={byParty} byUf={byUf} generatedAt={generatedAt} />
        </>
      )}
      {indirect && y && <Indirect name={name} year={year} total={y.donated_indirect} rows={ind.rows} vias={ind.vias} nCandidates={y.n_candidates_indirect} generatedAt={generatedAt} />}
      <Suspense fallback={<Loading section label="Carregando as outras eleições…" />}>
        <DonorYears e={e} name={name} years={years} focus={year} />
      </Suspense>
      <DataSources entityKey={key} role="doador" focus={year} years={years.filter((r) => r.n_donations > 0).map((r) => ({ year: r.year, n: r.n_donations }))} />
    </Container>
  );
}

const KIND_NOTE: Record<string, string> = {
  pf: "Doar a campanhas é permitido a pessoas físicas, dentro dos limites da lei.",
  partido: "Repassar recursos às próprias candidaturas, inclusive dinheiro público dos fundos eleitoral e partidário, é parte do funcionamento normal dos partidos.",
  plataforma: "Plataformas de financiamento coletivo autorizadas pelo TSE repassam às campanhas as doações feitas por pessoas físicas pela internet.",
  campanha: "Campanhas podem repassar recursos a outras campanhas, e esses repasses são registrados como doações.",
};
