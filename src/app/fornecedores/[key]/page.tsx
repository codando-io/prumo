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
  getEntity,
  getEntityYears,
  getSupplierPaid,
  getSupplies,
  getSuppliesBy,
  getSupplyCategories,
} from "@/lib/queries/entities";
import { CURRENT_YEAR, parseYear } from "@/lib/labels";
import { brlc, num, pct, titleName } from "@/lib/format";
import { Clients } from "./_sections/Clients";
import { Categories } from "./_sections/Categories";
import { SupplierYears } from "./_sections/Years";

export async function generateMetadata({ params }: PageProps<"/fornecedores/[key]">): Promise<Metadata> {
  const { key } = await params;
  const e = await getEntity(key);
  if (!e) return { title: "Fornecedor não encontrado" };
  const name = titleName(e.name) || "Fornecedor";
  return {
    title: `${name} — fornecedor`,
    description: `Quanto ${name} recebeu de campanhas eleitorais nas eleições gerais de 2018, 2022 e 2026: candidaturas, partidos e categorias de gasto, segundo as prestações de contas entregues ao TSE.`,
  };
}

// Blocking on a cheap existence check lets unknown records return a real 404.
export const instant = false;

export default async function SupplierPage({ params, searchParams }: PageProps<"/fornecedores/[key]">) {
  if (!(await entityExists((await params).key))) notFound();
  return (
    <Suspense fallback={<ProfileLoading label="Carregando o fornecedor…" />}>
      <SupplierView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function SupplierView({ params, searchParams }: Pick<PageProps<"/fornecedores/[key]">, "params" | "searchParams">) {
  const [{ key }, sp] = await Promise.all([params, searchParams]);
  const e = await getEntity(key);
  if (!e) notFound();

  const [years, candidacies, owner, paidByYear] = await Promise.all([
    getEntityYears(key),
    getCandidacies(e.person_id),
    e.campaign_candidate_id ? getCampaignOwner(e.campaign_year, e.campaign_candidate_id) : Promise.resolve(undefined),
    e.supplied > 0 ? getSupplierPaid(key) : Promise.resolve([]),
  ]);
  const supplierYears = years.filter((y) => y.supplied > 0).map((y) => y.year);
  // Without ?ano=, focus the most recent election in which this supplier appears.
  const asked = param(sp.ano);
  const year = asked ? parseYear(asked) : (supplierYears[supplierYears.length - 1] ?? CURRENT_YEAR);
  const y = years.find((r) => r.year === year);
  const active = !!y && y.supplied > 0;

  const [supplies, byParty, byUf, cats, generatedAt] = await Promise.all([
    active ? getSupplies(key, year) : Promise.resolve([]),
    active ? getSuppliesBy(key, year, "party") : Promise.resolve([]),
    active ? getSuppliesBy(key, year, "uf") : Promise.resolve([]),
    active ? getSupplyCategories(key, year) : Promise.resolve([]),
    financeGeneratedAt(year),
  ]);

  const name = titleName(e.name) || "(sem nome)";
  const tx = `/transacoes?ano=${year}&contraparte=${key}&tipo=despesa`;
  const doc = e.kind === "pf" ? "CPF" : "CNPJ";
  const paid = paidByYear.find((p) => p.year === year);
  const top = supplies[0];
  const ownerInLede = e.kind === "campanha" && owner;

  const lede = (
    <>
      <WhoSentence e={e} owner={owner} year={year} />{" "}
      {active && y ? (
        <>
          Em {year},{" "}
          {y.n_candidates_supplied === 1 ? (
            "uma campanha contratou"
          ) : (
            <>
              <Fig>{num(y.n_candidates_supplied)}</Fig> campanhas
              {y.n_parties_supplied > 1 && (
                <>
                  {" "}
                  de <Fig>{num(y.n_parties_supplied)}</Fig> partidos
                </>
              )}{" "}
              contrataram
            </>
          )}{" "}
          <Fig
            info={entityOfficial(
              "despesas_contratadas",
              year,
              generatedAt,
              `Soma das ${num(y.n_supplies)} despesas declaradas pelas campanhas em que este ${doc} aparece como fornecedor nas prestações de contas de ${year}.`,
              { label: "Ver as despesas", href: tx },
            )}
          >
            {brlc(y.supplied)}
          </Fig>{" "}
          deste fornecedor
          {top &&
            (y.n_candidates_supplied === 1 ? (
              <>
                : a de{" "}
                <Link href={`/candidatos/${year}/${top.candidate_id}`} className="link text-ink">
                  {titleName(top.ballot_name)}
                </Link>
              </>
            ) : (
              <>
                ; a que mais contratou foi a de{" "}
                <Link href={`/candidatos/${year}/${top.candidate_id}`} className="link text-ink">
                  {titleName(top.ballot_name)}
                </Link>{" "}
                (<Fig>{pct(top.value / y.supplied)}</Fig> do valor)
              </>
            ))}
          .
        </>
      ) : supplierYears.length ? (
        <>Aparece como fornecedor de campanhas em {yearsText(supplierYears)}, mas não nas prestações de contas de {year}.</>
      ) : (
        <>Não aparece como fornecedor de campanhas nas prestações de contas de 2018, 2022 e 2026.</>
      )}
    </>
  );

  const meta = [
    e.doc_display && (
      <span key="doc">
        {e.kind === "pf" ? "CPF (mascarado)" : "CNPJ"} <span className="tnum">{e.doc_display}</span>
      </span>
    ),
    e.cnae && <span key="cnae">Atividade econômica: {e.cnae}</span>,
    supplierYears.length > 0 && <span key="years">Contratado em {yearsText(supplierYears)}</span>,
  ].filter(Boolean);

  return (
    <>
      <Container>
        <PageHeader
          crumbs={[{ label: "Seguir o dinheiro" }, { label: "Fornecedores", href: `/fornecedores?ano=${year}` }, { label: name }]}
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
          aside={<ProfileYears year={year} active={supplierYears} hrefFor={(yy) => `/fornecedores/${key}?ano=${yy}`} />}
          actions={[
            ...(active ? [{ label: "Ver as despesas", href: tx }] : []),
            { label: "Seguir as conexões", href: `/conexoes?no=e:${key}&ano=${year}` },
            ...(/^j\d{14}$/.test(key) ? [{ label: "Dados públicos da empresa", href: `/empresas/${key.slice(1)}` }] : []),
            ...(e.kind === "partido" && e.party ? [{ label: "Ver o partido", href: `/partidos/${encodeURIComponent(e.party)}?ano=${year}` }] : []),
          ]}
        />
        <CrossLinks e={e} role="fornecedor" year={year} candidacies={candidacies} owner={ownerInLede ? undefined : owner} />
        <div className="mt-6">
          <Caption>
            Prestar serviços ou vender para campanhas é uma atividade legal e comum. Aparecer como fornecedor não indica, por si só, nenhuma irregularidade, nem que o
            fornecedor tenha relação com as candidaturas além do contrato.
          </Caption>
        </div>

        {!active && (
          <div className="mt-10">
            <EmptyNote>
              Não há despesas com {name} nas prestações de contas de {year}.
              {supplierYears.length > 0 && <> Escolha {supplierYears.length === 1 ? `${supplierYears[0]}` : "outra eleição"} acima para ver os registros.</>}
              {year === CURRENT_YEAR && " As campanhas de 2026 ainda estão entregando prestações de contas; novos registros aparecem a cada atualização do TSE."}
            </EmptyNote>
          </div>
        )}

        {active && y && (
          <>
            <Clients
              name={name}
              entityKey={key}
              year={year}
              total={y.supplied}
              nSupplies={y.n_supplies}
              nCandidates={y.n_candidates_supplied}
              paid={paid?.paid ?? 0}
              generatedAt={generatedAt}
              supplies={supplies}
            />
            <Categories entityKey={key} year={year} total={y.supplied} cats={cats} generatedAt={generatedAt} />
            <PartiesAndStates role="fornecedor" year={year} total={y.supplied} byParty={byParty} byUf={byUf} generatedAt={generatedAt} />
          </>
        )}
        <Suspense fallback={<Loading section label="Carregando as outras eleições…" />}>
          <SupplierYears e={e} name={name} years={years} focus={year} paid={paidByYear} />
        </Suspense>
        <DataSources entityKey={key} role="fornecedor" focus={year} years={years.filter((r) => r.n_supplies > 0).map((r) => ({ year: r.year, n: r.n_supplies }))} />
      </Container>
    </>
  );
}
