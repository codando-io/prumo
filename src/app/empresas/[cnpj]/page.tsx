import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Container } from "@/components/ui/primitives";
import { PageHeader, Section, SourceLine, Fig, Caption, EmptyNote } from "@/components/ui/editorial";
import {
  companyExists,
  formatCnpj,
  getClientCampaigns,
  getClientParties,
  getClientTotals,
  getCnaeLabels,
  getCompanyRegistry,
  getContracts,
  getDonationTotals,
  getElectoralYears,
  getEnrichSources,
  getElectionRounds,
  getEntityBasics,
  getHoldings,
  getPartnerCompanies,
  getPartners,
  getPossibleMatches,
  getSanctions,
  getSiblingEstablishments,
  getSupplyCategories,
  type CompanyRegistry,
  type EnrichSource,
} from "@/lib/queries/company";
import { EXPENSE_GROUPS } from "@/lib/labels";
import { brl, brlc, date, dateLong, num, pct, titleName, inSentence } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/empresas/[cnpj]">): Promise<Metadata> {
  const { cnpj } = await params;
  const reg = /^\d{14}$/.test(cnpj) ? await getCompanyRegistry(cnpj) : null;
  const tse = /^\d{14}$/.test(cnpj) ? await getEntityBasics(`j${cnpj}`) : null;
  const name = titleName(reg?.razao_social ?? tse?.name ?? "") || formatCnpj(cnpj);
  return {
    title: `${name} — CNPJ ${formatCnpj(cnpj)}`,
    description: `Dados públicos de ${name}: cadastro na Receita Federal, sócios, atuação em campanhas eleitorais, contratos públicos e registros em cadastros oficiais, cada um com a fonte.`,
  };
}

// Blocking on a cheap existence check lets unknown CNPJs return a real 404.
export const instant = false;

export default async function CompanyPage({ params }: PageProps<"/empresas/[cnpj]">) {
  const { cnpj } = await params;
  if (!(await companyExists(cnpj))) notFound();
  return (
    <Container className="pb-16">
      <Suspense fallback={<p className="pt-10 text-[15px] text-muted">Reunindo os dados públicos da empresa…</p>}>
        <Profile cnpj={cnpj} />
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

/** ISO dates inside free text ("2026-10-07", "de 2026-10-03 a 2026-10-07") as dd/mm/aaaa. */
const fmtPublished = (s: string) => s.replace(/(\d{4})-(\d{2})-(\d{2})/g, "$3/$2/$1");

const monthLabel = (m: string | null | undefined) => {
  if (!m) return null;
  const [y, mo] = m.split("-");
  const names = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${names[Number(mo) - 1] ?? mo} de ${y}`;
};

function rfSourceLabel(src: Record<string, EnrichSource>, reg: CompanyRegistry | null) {
  const s = src.rf_cnpj;
  const month = monthLabel(s?.published ?? reg?.source_month);
  return `Receita Federal, Dados Abertos CNPJ${month ? ` (${month})` : ""}${s?.retrieved_at ? `, obtido em ${dateLong(s.retrieved_at.slice(0, 10))}` : ""}`;
}

async function Profile({ cnpj }: { cnpj: string }) {
  const key = `j${cnpj}`;
  const [reg, tse, sources, years, client, donation] = await Promise.all([
    getCompanyRegistry(cnpj),
    getEntityBasics(key),
    getEnrichSources(),
    getElectoralYears(key),
    getClientTotals(key),
    getDonationTotals(key),
  ]);
  const name = titleName(reg?.razao_social ?? tse?.name ?? "") || formatCnpj(cnpj);
  const basico = cnpj.slice(0, 8);
  const supplied = client?.value ?? 0;
  const donated = donation?.value ?? 0;
  const where = reg?.municipio ? `${reg.municipio}${reg.uf ? ` (${reg.uf})` : ""}` : null;
  const yearsActive = years.map((y) => y.year);

  const lede = (
    <>
      {reg ? (
        <>
          {reg.nome_fantasia && titleName(reg.nome_fantasia) !== name ? <>{titleName(reg.nome_fantasia)}. </> : null}
          {reg.natureza ? <>{reg.natureza}</> : "Empresa"}
          {where ? <> de {where}</> : null}
          {reg.data_inicio ? <>, aberta em {dateLong(reg.data_inicio)}</> : null}
          {reg.situacao ? <>, com situação cadastral {reg.situacao.toLowerCase()}</> : null}
          {reg.cnae_principal_desc ? <>. Atividade principal: {inSentence(reg.cnae_principal_desc)}</> : null}.
        </>
      ) : (
        <>Empresa identificada pelo CNPJ {formatCnpj(cnpj)} nos registros de campanha do TSE. </>
      )}{" "}
      {supplied > 0 && client && (
        <>
          Recebeu <Fig>{brlc(supplied)}</Fig> de {num(client.campaigns)} {client.campaigns === 1 ? "campanha" : "campanhas"} de {num(client.parties)}{" "}
          {client.parties === 1 ? "partido" : "partidos"}
          {client.elections > 1 ? ` em ${num(client.elections)} eleições` : client.first_year ? ` em ${client.first_year}` : ""}.
        </>
      )}
      {donated > 0 && (
        <>
          {" "}
          Repassou ou doou <Fig>{brlc(donated)}</Fig> a {num(donation!.campaigns)} {donation!.campaigns === 1 ? "campanha" : "campanhas"}.
        </>
      )}
    </>
  );

  const actions = [
    ...(supplied > 0 ? [{ label: "Como fornecedora de campanhas", href: `/fornecedores/${key}` }] : []),
    ...(donated > 0 ? [{ label: "Como doadora", href: `/doadores/${key}` }] : []),
    ...(supplied + donated > 0 ? [{ label: "Transações", href: `/transacoes?ano=${yearsActive[yearsActive.length - 1]}&contraparte=${key}` }] : []),
    { label: "Seguir as conexões", href: `/conexoes?no=e:${key}${yearsActive.length ? `&ano=${yearsActive[yearsActive.length - 1]}` : ""}` },
  ];

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Seguir o dinheiro" }, { label: "Empresas", href: "/empresas" }, { label: name }]}
        title={name}
        lede={lede}
        meta={
          <>
            CNPJ <span className="tnum text-ink">{formatCnpj(cnpj)}</span>
            {reg && !reg.matriz && !reg.via_matriz ? " · filial" : reg?.matriz ? " · matriz" : ""}
          </>
        }
        actions={actions}
      />
      {reg?.via_matriz && (
        <p className="mt-4 max-w-[72ch] text-[14.5px] text-ink-2">
          Este CNPJ não está no recorte carregado da Receita Federal; os dados cadastrais abaixo são os da matriz da mesma empresa ({formatCnpj(reg.cnpj)}).
        </p>
      )}

      <RegistrySection reg={reg} cnpj={cnpj} sources={sources} />

      <Suspense fallback={<SectionLoading label="Carregando a atuação nas eleições…" />}>
        <ElectoralSection cnpj={cnpj} name={name} />
      </Suspense>

      <Suspense fallback={<SectionLoading label="Carregando os sócios…" />}>
        <PartnersSection basico={basico} name={name} sources={sources} reg={reg} />
      </Suspense>

      <Suspense fallback={<SectionLoading label="Carregando os contratos públicos…" />}>
        <ContractsSection basico={basico} name={name} sources={sources} />
      </Suspense>

      <Suspense fallback={<SectionLoading label="Consultando os cadastros de sanções…" />}>
        <SanctionsSection basico={basico} cnpj={cnpj} sources={sources} />
      </Suspense>

      <Suspense fallback={<SectionLoading label="Montando a linha do tempo…" />}>
        <TimelineSection cnpj={cnpj} reg={reg} />
      </Suspense>

      <SourcesSection sources={sources} hasRegistry={Boolean(reg)} />
    </>
  );
}

/* ---------- Quem é a empresa? ---------- */

async function RegistrySection({ reg, cnpj, sources }: { reg: CompanyRegistry | null; cnpj: string; sources: Record<string, EnrichSource> }) {
  if (!reg) {
    return (
      <Section id="cadastro" question="Quem é a empresa?">
        <EmptyNote>
          Os dados cadastrais da Receita Federal para o CNPJ {formatCnpj(cnpj)} ainda não foram carregados nesta base. As informações abaixo vêm só dos registros de
          campanha do TSE.
        </EmptyNote>
      </Section>
    );
  }
  const secondary = await getCnaeLabels(reg.cnaes_secundarias ?? []);
  const simples =
    reg.opcao_mei
      ? `Microempreendedor individual (MEI) desde ${date(reg.data_opcao_mei)}`
      : reg.opcao_simples
        ? `Optante desde ${date(reg.data_opcao_simples)}`
        : reg.data_exclusao_simples
          ? `Não optante (saiu em ${date(reg.data_exclusao_simples)})`
          : reg.opcao_simples === false
            ? "Não optante"
            : "Não consta no cadastro do Simples Nacional";
  const rows: [string, React.ReactNode][] = [
    ["CNPJ", <span key="c" className="tnum">{formatCnpj(reg.cnpj)}{reg.matriz ? " (matriz)" : " (filial)"}</span>],
    ["Razão social", titleName(reg.razao_social)],
    ...(reg.nome_fantasia ? ([["Nome fantasia", titleName(reg.nome_fantasia)]] as [string, React.ReactNode][]) : []),
    [
      "Situação cadastral",
      <>
        {reg.situacao ?? "—"}
        {reg.data_situacao ? <span className="text-muted"> desde {date(reg.data_situacao)}</span> : null}
        {reg.motivo_situacao && reg.motivo_situacao !== "SEM MOTIVO" ? <span className="block text-[14px] text-muted">Motivo: {inSentence(reg.motivo_situacao)}</span> : null}
        {reg.situacao_especial ? <span className="block text-[14px] text-muted">Situação especial: {reg.situacao_especial}</span> : null}
      </>,
    ],
    ["Abertura", reg.data_inicio ? dateLong(reg.data_inicio) : "—"],
    ["Natureza jurídica", reg.natureza ?? "—"],
    [
      "Atividade principal",
      reg.cnae_principal ? (
        <>
          {reg.cnae_principal_desc} <span className="tnum text-muted">({reg.cnae_principal})</span>
        </>
      ) : (
        "—"
      ),
    ],
    [
      "Atividades secundárias",
      secondary.length ? (
        <details>
          <summary className="action cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            {num(secondary.length)} {secondary.length === 1 ? "atividade" : "atividades"}
          </summary>
          <ul className="mt-2 space-y-1 text-[14.5px] text-ink-2">
            {secondary.map((c) => (
              <li key={c.code}>
                {c.description} <span className="tnum text-muted">({c.code})</span>
              </li>
            ))}
          </ul>
        </details>
      ) : (
        "Nenhuma"
      ),
    ],
    ["Município", reg.municipio ? `${reg.municipio}${reg.uf ? ` (${reg.uf})` : ""}` : "—"],
    ["Capital social", reg.capital_social != null ? brl(reg.capital_social) : "—"],
    ["Porte", reg.porte ?? "—"],
    ["Simples Nacional", simples],
    ...(reg.ente_federativo ? ([["Ente federativo responsável", reg.ente_federativo]] as [string, React.ReactNode][]) : []),
  ];
  return (
    <Section
      id="cadastro"
      question="Quem é a empresa?"
      lede="Dados do Cadastro Nacional da Pessoa Jurídica, como publicados pela Receita Federal."
      source={<SourceLine label={rfSourceLabel(sources, reg)} />}
    >
      <dl className="grid max-w-[880px] grid-cols-1 border-t border-rule sm:grid-cols-[220px_minmax(0,1fr)]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="border-b-0 pt-3 text-[14px] text-muted sm:border-b sm:border-rule sm:py-3">{k}</dt>
            <dd className="border-b border-rule pb-3 text-[15.5px] text-ink sm:py-3">{v}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

/* ---------- O que fez nas eleições? ---------- */

async function ElectoralSection({ cnpj, name }: { cnpj: string; name: string }) {
  const key = `j${cnpj}`;
  const [years, totals, campaigns, parties, cats, donation, siblings, tse] = await Promise.all([
    getElectoralYears(key),
    getClientTotals(key),
    getClientCampaigns(key, 12),
    getClientParties(key, 8),
    getSupplyCategories(key),
    getDonationTotals(key),
    getSiblingEstablishments(cnpj),
    getEntityBasics(key),
  ]);
  const supplied = totals?.value ?? 0;
  const donated = donation?.value ?? 0;
  if (!years.length && !siblings.length) {
    return (
      <Section id="eleicoes" question="O que a empresa fez nas eleições?">
        <EmptyNote>Este CNPJ não aparece nas prestações de contas de 2018, 2022 e 2026 carregadas no Prumo, nem como fornecedor nem como doador.</EmptyNote>
      </Section>
    );
  }
  const top = campaigns[0];
  const catTotal = cats.reduce((s, c) => s + c.value, 0);
  return (
    <Section
      id="eleicoes"
      question="O que a empresa fez nas eleições?"
      lede={
        <>
          {supplied > 0 && totals ? (
            <>
              {name} recebeu <Fig>{brlc(supplied)}</Fig> em {num(totals.n)} {totals.n === 1 ? "despesa" : "despesas"} de {num(totals.campaigns)}{" "}
              {totals.campaigns === 1 ? "campanha" : "campanhas"} ({num(totals.candidates)} {totals.candidates === 1 ? "candidato" : "candidatos"}, {num(totals.parties)}{" "}
              {totals.parties === 1 ? "partido" : "partidos"}){totals.elections > 1 ? ` em ${num(totals.elections)} eleições` : ""}.
              {top && (
                <>
                  {" "}
                  A que mais pagou foi a de{" "}
                  <Link href={`/candidatos/${top.year}/${top.candidate_id}`} className="link text-ink">
                    {titleName(top.ballot_name)}
                  </Link>{" "}
                  ({top.year}, <Fig>{brlc(top.value)}</Fig>).
                </>
              )}
            </>
          ) : null}
          {donated > 0 && (
            <>
              {" "}
              {tse?.kind === "partido" ? "Como órgão partidário, repassou" : tse?.kind === "campanha" ? "Como conta de campanha, repassou" : "Doou"}{" "}
              <Fig>{brlc(donated)}</Fig> a {num(donation!.campaigns)} {donation!.campaigns === 1 ? "campanha" : "campanhas"}.
            </>
          )}
        </>
      }
      source={<SourceLine label="TSE, prestações de contas eleitorais de 2018, 2022 e 2026" links={supplied > 0 ? [{ label: "Ver as despesas", href: `/transacoes?ano=${years[years.length - 1]?.year ?? 2022}&contraparte=${key}&tipo=despesa` }] : []} />}
    >
      {years.length > 0 && (
        <table className="dt">
          <thead>
            <tr>
              <th scope="col">Eleição</th>
              <th scope="col" className="n">
                Recebeu de campanhas
              </th>
              <th scope="col" className="n hidden sm:table-cell">
                Campanhas
              </th>
              <th scope="col" className="n hidden sm:table-cell">
                Partidos
              </th>
              <th scope="col" className="n">
                Doou ou repassou
              </th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y.year}>
                <td>
                  <Link href={`/fornecedores/${key}?ano=${y.year}`} className="e tnum no-underline hover:underline">
                    {y.year}
                  </Link>
                </td>
                <td className="n text-ink">{y.supplied ? brlc(y.supplied) : "—"}</td>
                <td className="n s hidden sm:table-cell">{y.n_candidates_supplied ? num(y.n_candidates_supplied) : "—"}</td>
                <td className="n s hidden sm:table-cell">{y.n_parties_supplied ? num(y.n_parties_supplied) : "—"}</td>
                <td className="n s">{y.donated ? brlc(y.donated) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {supplied > 0 && (
        <div className="mt-10 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">Campanhas que mais pagaram</h3>
            <table className="dt mt-3">
              <tbody>
                {campaigns.map((c) => (
                  <tr key={`${c.year}-${c.candidate_id}`}>
                    <td>
                      <Link href={`/candidatos/${c.year}/${c.candidate_id}`} className="e no-underline hover:underline">
                        {titleName(c.ballot_name)}
                      </Link>
                      <div className="s text-[13.5px]">
                        {c.office}
                        {c.uf !== "BR" ? ` (${c.uf})` : ""}, {c.party}, {c.year}
                      </div>
                    </td>
                    <td className="n">
                      <Link href={`/transacoes?ano=${c.year}&candidato=${c.candidate_id}&contraparte=${key}`} className="text-ink no-underline hover:underline">
                        {brlc(c.value)}
                      </Link>
                      <div className="s text-[13px]">
                        {num(c.n)} {c.n === 1 ? "despesa" : "despesas"}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-10">
            {parties.length > 0 && (
              <div>
                <h3 className="text-[15px] font-semibold text-ink">Por partido das campanhas</h3>
                <table className="dt mt-3">
                  <tbody>
                    {parties.map((p) => (
                      <tr key={p.party}>
                        <td>
                          <Link href={`/partidos/${encodeURIComponent(p.party)}`} className="e no-underline hover:underline">
                            {p.party}
                          </Link>
                          <div className="s text-[13px]">
                            {num(p.campaigns)} {p.campaigns === 1 ? "campanha" : "campanhas"}
                          </div>
                        </td>
                        <td className="n text-ink">{brlc(p.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {cats.length > 0 && (
              <div>
                <h3 className="text-[15px] font-semibold text-ink">Por tipo de gasto declarado</h3>
                <table className="dt mt-3">
                  <tbody>
                    {cats.map((c) => (
                      <tr key={c.category_group}>
                        <td className="e">{EXPENSE_GROUPS[c.category_group]?.label ?? c.category_group}</td>
                        <td className="n text-ink">{brlc(c.value)}</td>
                        <td className="n s">{pct(catTotal ? c.value / catTotal : 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {siblings.length > 0 && (
        <div className="mt-10">
          <h3 className="text-[15px] font-semibold text-ink">Outros estabelecimentos da mesma empresa nos registros do TSE</h3>
          <p className="mt-1 max-w-[70ch] text-[14.5px] text-ink-2">Mesma raiz de CNPJ ({cnpj.slice(0, 8)}), outro estabelecimento (filial ou matriz).</p>
          <table className="dt mt-3">
            <tbody>
              {siblings.map((s) => (
                <tr key={s.key}>
                  <td>
                    <Link href={`/empresas/${s.key.slice(1)}`} className="e no-underline hover:underline">
                      {titleName(s.name) || formatCnpj(s.key.slice(1))}
                    </Link>
                    <div className="s tnum text-[13px]">CNPJ {formatCnpj(s.key.slice(1))}</div>
                  </td>
                  <td className="n text-ink">{s.supplied ? brlc(s.supplied) : "—"}</td>
                  <td className="n s">{s.donated ? `doou ${brlc(s.donated)}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

/* ---------- Sócios ---------- */

const KIND_LABEL: Record<string, string> = { PF: "Pessoa física", PJ: "Pessoa jurídica", Estrangeiro: "Estrangeiro" };

async function PartnersSection({ basico, name, sources, reg }: { basico: string; name: string; sources: Record<string, EnrichSource>; reg: CompanyRegistry | null }) {
  const partners = await getPartners(basico);
  if (!reg) return null;
  const keys = partners.map((p) => p.partner_key);
  const [matches, others, holdings] = await Promise.all([getPossibleMatches(keys.filter((k) => k.startsWith("s"))), getPartnerCompanies(keys, basico), getHoldings(basico)]);
  const byPartner = new Map<string, typeof others>();
  for (const o of others) byPartner.set(o.partner_key, [...(byPartner.get(o.partner_key) ?? []), o]);
  const companyHref = (matriz: string | null) => (matriz ? `/empresas/${matriz}` : null);

  return (
    <>
      <Section
        id="socios"
        question="Quem são os sócios?"
        lede={
          partners.length ? (
            <>
              A Receita Federal lista {num(partners.length)} {partners.length === 1 ? "pessoa no quadro" : "pessoas ou empresas no quadro"} de sócios e administradores de {name}.
              CPFs aparecem mascarados, como publicados.
            </>
          ) : (
            "A Receita Federal não lista sócios para esta empresa (é o caso, por exemplo, de órgãos partidários, associações e empresários individuais)."
          )
        }
        source={<SourceLine label={rfSourceLabel(sources, reg)} />}
      >
        {partners.length > 0 && (
          <>
            <table className="dt">
              <thead>
                <tr>
                  <th scope="col">Nome</th>
                  <th scope="col" className="hidden md:table-cell">
                    Qualificação
                  </th>
                  <th scope="col" className="n">
                    Entrada
                  </th>
                </tr>
              </thead>
              <tbody>
                {partners.map((p) => {
                  const m = matches.filter((x) => x.partner_key === p.partner_key);
                  const pjHref = p.partner_type === "PJ" && p.partner_cnpj_basico ? others.find((o) => o.cnpj_basico === p.partner_cnpj_basico)?.matriz_cnpj : null;
                  return (
                    <tr key={p.partner_key + (p.data_entrada ?? "")}>
                      <td>
                        {pjHref ? (
                          <Link href={`/empresas/${pjHref}`} className="e no-underline hover:underline">
                            {titleName(p.name)}
                          </Link>
                        ) : (
                          <span className="e">{titleName(p.name)}</span>
                        )}
                        <div className="s text-[13.5px]">
                          {[KIND_LABEL[p.partner_type] ?? p.partner_type, p.doc_masked && p.partner_type === "PF" ? `CPF ${p.doc_masked}` : null, p.faixa_etaria, p.pais]
                            .filter(Boolean)
                            .join(", ")}
                          <span className="md:hidden">{p.qualificacao ? `. ${p.qualificacao}` : ""}</span>
                        </div>
                        {m.map((x) => (
                          <PossibleMatchNote key={x.tse_key + x.tse_kind} m={x} />
                        ))}
                      </td>
                      <td className="s hidden md:table-cell">{p.qualificacao ?? "—"}</td>
                      <td className="n s">{p.data_entrada ? date(p.data_entrada) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Caption>
              Quadro de sócios e administradores (QSA) como informado à Receita Federal. Uma “possível correspondência” indica apenas que o nome e os dígitos visíveis do CPF
              coincidem com uma pessoa nos registros do TSE; não é confirmação de que sejam a mesma pessoa.
            </Caption>
          </>
        )}
      </Section>

      {(others.length > 0 || holdings.length > 0) && (
        <Section
          id="outras-empresas"
          question="Os sócios têm outras empresas?"
          lede={
            <>
              Empresas em que os mesmos sócios aparecem no cadastro da Receita Federal, identificados pelo nome e pelo documento como publicados (CNPJ, ou CPF mascarado).
              Participar de várias empresas é comum e não indica, por si só, relação entre elas.
            </>
          }
          source={<SourceLine label={rfSourceLabel(sources, reg)} />}
        >
          {partners
            .filter((p) => byPartner.has(p.partner_key))
            .map((p) => (
              <div key={p.partner_key} className="mt-8 first:mt-0">
                <h3 className="text-[15px] font-semibold text-ink">
                  {titleName(p.name)} <span className="font-normal text-muted">· {num(byPartner.get(p.partner_key)!.length)} outras</span>
                </h3>
                <table className="dt mt-3">
                  <tbody>
                    {byPartner.get(p.partner_key)!.slice(0, 15).map((o) => {
                      const href = companyHref(o.matriz_cnpj);
                      return (
                        <tr key={o.cnpj_basico}>
                          <td>
                            {href ? (
                              <Link href={href} className="e no-underline hover:underline">
                                {titleName(o.razao_social) || o.cnpj_basico}
                              </Link>
                            ) : (
                              <span className="e">{titleName(o.razao_social) || o.cnpj_basico}</span>
                            )}
                            <div className="s text-[13.5px]">
                              {[o.qualificacao, o.municipio ? `${o.municipio}${o.uf ? ` (${o.uf})` : ""}` : null, o.situacao ? `situação ${o.situacao.toLowerCase()}` : null]
                                .filter(Boolean)
                                .join(", ")}
                            </div>
                          </td>
                          <td className="s hidden text-[14px] md:table-cell">{o.in_tse ? "Aparece em prestações de contas" : ""}</td>
                          <td className="n s">{o.data_entrada ? `desde ${date(o.data_entrada)}` : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          {holdings.length > 0 && (
            <div className="mt-8">
              <h3 className="text-[15px] font-semibold text-ink">Empresas das quais {name} é sócia</h3>
              <table className="dt mt-3">
                <tbody>
                  {holdings.map((h) => (
                    <tr key={h.cnpj_basico}>
                      <td>
                        {h.matriz_cnpj ? (
                          <Link href={`/empresas/${h.matriz_cnpj}`} className="e no-underline hover:underline">
                            {titleName(h.razao_social) || h.cnpj_basico}
                          </Link>
                        ) : (
                          <span className="e">{titleName(h.razao_social) || h.cnpj_basico}</span>
                        )}
                        <div className="s text-[13.5px]">{[h.qualificacao, h.situacao ? `situação ${h.situacao.toLowerCase()}` : null].filter(Boolean).join(", ")}</div>
                      </td>
                      <td className="n s">{h.data_entrada ? `desde ${date(h.data_entrada)}` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}
    </>
  );
}

function PossibleMatchNote({ m }: { m: Awaited<ReturnType<typeof getPossibleMatches>>[number] }) {
  return (
    <div className="mt-1.5 border-l border-dashed border-rule-strong pl-3 text-[13.5px] leading-snug text-ink-2">
      <span className="text-muted">Possível correspondência:</span>{" "}
      {m.href ? (
        <Link href={m.href} className="underline decoration-dashed decoration-[color-mix(in_srgb,currentColor_45%,transparent)] underline-offset-[3px] hover:decoration-accent">
          {titleName(m.label) || "pessoa nos registros do TSE"}
        </Link>
      ) : (
        titleName(m.label)
      )}
      {m.context ? `, ${m.context}` : ""}. <span className="text-muted">{m.basis}; não confirma que seja a mesma pessoa.</span>
    </div>
  );
}

/* ---------- Contratos públicos ---------- */

async function ContractsSection({ basico, name, sources }: { basico: string; name: string; sources: Record<string, EnrichSource> }) {
  const data = await getContracts(basico);
  const src = sources.pncp_contratos;
  const coverage =
    src?.coverage_from && src?.coverage_to ? `cópia do Prumo com contratos publicados de ${date(src.coverage_from)} a ${date(src.coverage_to)}` : "cópia do Prumo";
  if (!data) {
    return (
      <Section id="contratos" question="A empresa tem contratos com órgãos públicos?">
        <EmptyNote>Os contratos do Portal Nacional de Contratações Públicas (PNCP) ainda não foram carregados nesta base.</EmptyNote>
      </Section>
    );
  }
  const { rows, totals, orgaos } = data;
  return (
    <Section
      id="contratos"
      question="A empresa tem contratos com órgãos públicos?"
      lede={
        totals && totals.n > 0 ? (
          <>
            O PNCP registra <Fig>{num(totals.n)}</Fig> {totals.n === 1 ? "contrato" : "contratos"} de {name} com {num(totals.orgaos)}{" "}
            {totals.orgaos === 1 ? "órgão público" : "órgãos públicos"}, somando <Fig>{brlc(totals.value)}</Fig> em valor global
            {totals.first && totals.last ? `, assinados entre ${date(totals.first)} e ${date(totals.last)}` : ""}. Os valores são os publicados pelos órgãos e podem
            conter erros de digitação. Contratos públicos e pagamentos de campanha são registros independentes: um não indica relação com o outro.
          </>
        ) : (
          <>
            Nenhum contrato desta empresa (mesma raiz de CNPJ) foi encontrado no PNCP no período coberto pela {coverage}. O PNCP reúne contratações de todas as esferas
            desde 2021, mas muitos municípios só passaram a publicar nele a partir de 2024.
          </>
        )
      }
      source={<SourceLine label={`PNCP, Portal Nacional de Contratações Públicas (${coverage})`} />}
    >
      {rows.length > 0 && (
        <>
          {orgaos.length > 1 && (
            <div className="mb-10">
              <h3 className="text-[15px] font-semibold text-ink">Por órgão contratante</h3>
              <table className="dt mt-3">
                <tbody>
                  {orgaos.map((o) => (
                    <tr key={o.orgao_cnpj}>
                      <td>
                        <span className="e">{titleName(o.orgao_nome)}</span>
                        <div className="s text-[13.5px]">{[o.esfera, o.uf].filter(Boolean).join(", ")}</div>
                      </td>
                      <td className="n s">
                        {num(o.n)} {o.n === 1 ? "contrato" : "contratos"}
                      </td>
                      <td className="n text-ink">{brlc(o.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h3 className="text-[15px] font-semibold text-ink">Contratos</h3>
          <table className="dt mt-3">
            <thead>
              <tr>
                <th scope="col">Assinatura</th>
                <th scope="col">Órgão e objeto</th>
                <th scope="col" className="hidden md:table-cell">
                  Vigência
                </th>
                <th scope="col" className="n">
                  Valor global
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((c) => (
                <tr key={c.pncp_id}>
                  <td className="s tnum whitespace-nowrap">{date(c.data_assinatura)}</td>
                  <td>
                    <span className="e">{titleName(c.orgao_nome)}</span>
                    <div className="s text-[13.5px]">
                      {[c.unidade_nome && titleName(c.unidade_nome) !== titleName(c.orgao_nome) ? titleName(c.unidade_nome) : null, c.municipio ? `${titleName(c.municipio)}${c.uf ? ` (${c.uf})` : ""}` : c.uf, c.esfera, c.tipo_contrato]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    {c.objeto && <div className="mt-1 line-clamp-3 text-[14px] text-ink-2">{c.objeto}</div>}
                    {c.url && (
                      <a href={c.url} target="_blank" rel="noreferrer" className="action mt-1 inline-block text-[13.5px]">
                        Contrato {c.numero_contrato ?? c.pncp_id} no PNCP <span aria-hidden="true">↗</span>
                      </a>
                    )}
                  </td>
                  <td className="s tnum hidden whitespace-nowrap md:table-cell">
                    {c.data_vigencia_inicio ? date(c.data_vigencia_inicio) : "—"}
                    {c.data_vigencia_fim ? ` a ${date(c.data_vigencia_fim)}` : ""}
                  </td>
                  <td className="n text-ink">
                    {c.valor_global != null ? brlc(c.valor_global) : "—"}
                    {c.valor_global != null && c.valor_inicial != null && c.valor_inicial > 0 && c.valor_global > 20 * c.valor_inicial && (
                      <div className="s text-[12.5px] leading-snug">inicial {brlc(c.valor_inicial)}; como publicado</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 50 && <Caption>Mostrando os 50 contratos mais recentes de {num(totals?.n ?? rows.length)}.</Caption>}
        </>
      )}
    </Section>
  );
}

/* ---------- Sanções ---------- */

async function SanctionsSection({ basico, cnpj, sources }: { basico: string; cnpj: string; sources: Record<string, EnrichSource> }) {
  const rows = await getSanctions(basico);
  if (rows === null) {
    return (
      <Section id="registros" question="A empresa aparece em cadastros de sanções?">
        <EmptyNote>Os cadastros CEIS, CNEP, CEPIM e de acordos de leniência ainda não foram carregados nesta base.</EmptyNote>
      </Section>
    );
  }
  // "CEIS, CNEP e acordos de leniência de 07/10/2026; CEPIM de 06/10/2026"
  const SHORT: Record<string, string> = { ceis: "CEIS", cnep: "CNEP", cepim: "CEPIM", leniencia: "acordos de leniência" };
  const byDate = new Map<string, string[]>();
  for (const k of Object.keys(SHORT)) {
    const src = sources[k];
    if (!src) continue;
    const d = fmtPublished(src.published ?? src.retrieved_at?.slice(0, 10) ?? "");
    byDate.set(d, [...(byDate.get(d) ?? []), SHORT[k]]);
  }
  const fileDates = [...byDate.entries()].map(([d, names]) => `${names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}` : names[0]} de ${d}`);
  return (
    <Section
      id="registros"
      question="A empresa aparece em cadastros de sanções?"
      lede={
        rows.length ? (
          <>
            Há {num(rows.length)} {rows.length === 1 ? "registro" : "registros"} com a raiz deste CNPJ nos cadastros mantidos pela Controladoria-Geral da União. Cada
            registro é reproduzido como publicado, com o órgão responsável, as datas e a situação na data do arquivo.
          </>
        ) : (
          <>Nenhum registro com a raiz deste CNPJ nos cadastros CEIS, CNEP, CEPIM e de acordos de leniência, nos arquivos usados pelo Prumo.</>
        )
      }
      source={<SourceLine label={`CGU, Portal da Transparência${fileDates.length ? ` (${fileDates.join("; ")})` : ""}`} />}
    >
      {rows.length > 0 && (
        <ol className="border-t border-rule">
          {rows.map((r) => (
            <li key={`${r.source}-${r.record_id}`} className="grid gap-x-10 gap-y-2 border-b border-rule py-5 md:grid-cols-[200px_minmax(0,1fr)]">
              <div className="text-[14px]">
                <span className="font-medium text-ink">{r.source}</span>
                {!r.source.startsWith("Acordo") && r.status && (
                  <span className="block text-muted">{r.status === "Sem data final" ? "Sem data final" : `${r.status} na data do arquivo`}</span>
                )}
              </div>
              <div className="max-w-[78ch]">
                <p className="text-[16px] text-ink">{r.source.startsWith("Acordo") ? `Situação publicada: ${r.category ?? "—"}` : (r.category ?? "Registro")}</p>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 text-[14px]">
                  {r.authority && (
                    <>
                      <dt className="text-muted">Órgão</dt>
                      <dd className="text-ink-2">{[r.authority, r.authority_uf, r.authority_sphere].filter(Boolean).join(", ")}</dd>
                    </>
                  )}
                  <dt className="text-muted">Período</dt>
                  <dd className="tnum text-ink-2">
                    {r.start_date ? date(r.start_date) : "—"} a {r.end_date ? date(r.end_date) : "sem data final"}
                  </dd>
                  {r.cnpj !== cnpj && (
                    <>
                      <dt className="text-muted">CNPJ do registro</dt>
                      <dd className="tnum text-ink-2">{formatCnpj(r.cnpj)} (outro estabelecimento da mesma empresa)</dd>
                    </>
                  )}
                  {r.process_number && (
                    <>
                      <dt className="text-muted">Processo</dt>
                      <dd className="text-ink-2">{r.process_number}</dd>
                    </>
                  )}
                  {r.legal_basis && (
                    <>
                      <dt className="text-muted">Fundamento</dt>
                      <dd className="text-ink-2">{r.legal_basis}</dd>
                    </>
                  )}
                  {r.fine_value != null && r.fine_value > 0 && (
                    <>
                      <dt className="text-muted">Multa</dt>
                      <dd className="tnum text-ink-2">{brl(r.fine_value)}</dd>
                    </>
                  )}
                  {r.scope && (
                    <>
                      <dt className="text-muted">Abrangência</dt>
                      <dd className="text-ink-2">{r.scope}</dd>
                    </>
                  )}
                </dl>
                {r.details && <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{r.details}</p>}
                <p className="mt-2 text-[13.5px] text-muted">
                  Fonte: {r.source}, arquivo de {r.file_date ? date(r.file_date) : "—"}
                  {r.source_url ? (
                    <>
                      {" · "}
                      <a href={r.source_url} className="action" rel="noreferrer">
                        arquivo original <span aria-hidden="true">↗</span>
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <Caption>
        O CEIS e o CNEP reúnem sanções aplicadas por órgãos públicos; o CEPIM, entidades impedidas de receber transferências; os acordos de leniência são firmados com
        a administração pública. A situação é a informada na data do arquivo. Um registro não diz respeito às atividades eleitorais da empresa.
      </Caption>
    </Section>
  );
}

/* ---------- Linha do tempo ---------- */

interface Event {
  date: string; // YYYY-MM-DD (or YYYY-10-01 for an election)
  precision: "dia" | "ano";
  text: React.ReactNode;
  source: string;
}

async function TimelineSection({ cnpj, reg }: { cnpj: string; reg: CompanyRegistry | null }) {
  const basico = cnpj.slice(0, 8);
  const [years, contracts, sanctions, partners, rounds] = await Promise.all([
    getElectoralYears(`j${cnpj}`),
    getContracts(basico, 0),
    getSanctions(basico),
    getPartners(basico),
    getElectionRounds(),
  ]);
  const ev: Event[] = [];
  if (reg?.data_inicio) ev.push({ date: reg.data_inicio, precision: "dia", text: "Abertura da empresa", source: "Receita Federal" });
  if (reg?.data_opcao_simples) ev.push({ date: reg.data_opcao_simples, precision: "dia", text: "Opção pelo Simples Nacional", source: "Receita Federal" });
  if (reg?.data_exclusao_simples) ev.push({ date: reg.data_exclusao_simples, precision: "dia", text: "Saída do Simples Nacional", source: "Receita Federal" });
  if (reg?.data_opcao_mei) ev.push({ date: reg.data_opcao_mei, precision: "dia", text: "Registro como MEI", source: "Receita Federal" });
  if (reg?.data_situacao && reg.situacao && reg.situacao !== "Ativa") ev.push({ date: reg.data_situacao, precision: "dia", text: `Situação cadastral passa a ${reg.situacao.toLowerCase()}`, source: "Receita Federal" });
  const entries = new Map<string, number>();
  for (const p of partners) if (p.data_entrada) entries.set(p.data_entrada, (entries.get(p.data_entrada) ?? 0) + 1);
  for (const [d, n] of [...entries.entries()].slice(0, 12)) {
    ev.push({ date: d, precision: "dia", text: n === 1 ? "Entrada de um sócio ou administrador no quadro" : `Entrada de ${num(n)} sócios ou administradores no quadro`, source: "Receita Federal (QSA)" });
  }
  for (const y of years) {
    const day = rounds[y.year] ?? `${y.year}-10-01`;
    if (y.supplied > 0)
      ev.push({ date: day, precision: "ano", text: `Fornecedora de ${num(y.n_candidates_supplied)} ${y.n_candidates_supplied === 1 ? "campanha" : "campanhas"} nas eleições de ${y.year} (${brlc(y.supplied)})`, source: "TSE" });
    if (y.donated > 0)
      ev.push({ date: day, precision: "ano", text: `Doação ou repasse a ${num(y.n_candidates_donated)} ${y.n_candidates_donated === 1 ? "campanha" : "campanhas"} nas eleições de ${y.year} (${brlc(y.donated)})`, source: "TSE" });
  }
  for (const y of contracts?.years ?? [])
    ev.push({ date: y.first ?? `${y.year}-01-01`, precision: "ano", text: `${num(y.n)} ${y.n === 1 ? "contrato público assinado" : "contratos públicos assinados"} em ${y.year} (${brlc(y.value)})`, source: "PNCP" });
  for (const s of sanctions ?? []) {
    if (s.start_date) ev.push({ date: s.start_date, precision: "dia", text: `Início de registro no ${s.source}: ${s.category ?? "registro"}${s.authority ? `, por ${s.authority}` : ""}`, source: `CGU (${s.source})` });
    if (s.end_date) ev.push({ date: s.end_date, precision: "dia", text: `Fim do período do registro no ${s.source}`, source: `CGU (${s.source})` });
  }
  if (ev.length < 2) return null;
  ev.sort((a, b) => a.date.localeCompare(b.date));
  return (
    <Section
      id="linha-do-tempo"
      question="O que aconteceu, e quando?"
      lede="Eventos documentados nas fontes oficiais, em ordem cronológica. A ordem não indica relação de causa entre eles."
    >
      <ol className="max-w-[820px] border-l border-rule-strong">
        {ev.map((e, i) => (
          <li key={i} className="relative grid gap-x-6 pb-5 pl-6 sm:grid-cols-[120px_minmax(0,1fr)]">
            <span aria-hidden="true" className="absolute -left-[4.5px] top-[9px] h-2 w-2 rounded-full bg-[var(--muted)]" />
            <span className="tnum text-[14px] text-muted">{e.precision === "ano" ? e.date.slice(0, 4) : date(e.date)}</span>
            <span className="text-[15.5px] text-ink">
              {e.text} <span className="text-[13.5px] text-muted">· {e.source}</span>
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/* ---------- Fontes ---------- */

function SourcesSection({ sources, hasRegistry }: { sources: Record<string, EnrichSource>; hasRegistry: boolean }) {
  const rows = Object.values(sources);
  return (
    <Section id="fontes" question="De onde vêm estes dados?" lede="Cada bloco desta página vem de uma fonte oficial, carregada pelo Prumo na data indicada. Nada é alterado; nomes de pessoas e documentos aparecem como publicados (CPFs mascarados).">
      <table className="dt">
        <thead>
          <tr>
            <th scope="col">Fonte</th>
            <th scope="col" className="hidden md:table-cell">
              Publicação
            </th>
            <th scope="col" className="n">
              Obtido em
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <span className="e">TSE, prestações de contas eleitorais</span>
              <div className="s text-[13.5px]">Receitas e despesas de campanha de 2018, 2022 e 2026</div>
            </td>
            <td className="s hidden md:table-cell">
              <Link href="/atualizacoes" className="action">
                Ver as datas de publicação
              </Link>
            </td>
            <td className="n s">—</td>
          </tr>
          {rows.map((s) => (
            <tr key={s.dataset}>
              <td>
                {s.url ? (
                  <a href={s.url} className="e no-underline hover:underline" rel="noreferrer">
                    {s.label ?? s.dataset}
                  </a>
                ) : (
                  <span className="e">{s.label ?? s.dataset}</span>
                )}
                {s.coverage_from && s.coverage_to && (
                  <div className="s text-[13.5px]">
                    Cobertura: {date(s.coverage_from)} a {date(s.coverage_to)}
                  </div>
                )}
              </td>
              <td className="s hidden md:table-cell">{s.published ? fmtPublished(s.published) : "—"}</td>
              <td className="n s">{s.retrieved_at ? date(s.retrieved_at.slice(0, 10)) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!hasRegistry && rows.length === 0 && <Caption>As fontes externas (Receita Federal, CGU, PNCP) ainda não foram carregadas nesta base.</Caption>}
      <Caption>
        Como o Prumo liga as fontes: sempre pelo CNPJ (ou pela raiz do CNPJ, quando o registro é de outro estabelecimento da mesma empresa). Ligações por nome não são
        usadas como confirmação.{" "}
        <Link href="/metodologia#enriquecimento" className="link">
          Metodologia
        </Link>
      </Caption>
    </Section>
  );
}

