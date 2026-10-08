import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container } from "@/components/ui/primitives";
import { Caption, EmptyNote, Fig, PageHeader, SourceLine, YearTabs } from "@/components/ui/editorial";
import { FilterForm } from "@/components/ui/FilterForm";
import { Pagination } from "@/components/ui/Pagination";
import { hrefWith, pageNumber, param, pickOne } from "@/components/entities/parts";
import { DONOR_KINDS, DONOR_KIND_OPTIONS, DONOR_SORTS, DONOR_SORT_DEFAULT, DONOR_SORT_OPTIONS, KIND_NOUN, UF_KEYS, UF_OPTIONS, inUf } from "@/components/entities/options";
import { PAGE_SIZE, listDonors, partiesOf, type DonorListFilters, type DonorSort } from "@/lib/queries/entities";
import { ENTITY_KIND, parseYear } from "@/lib/labels";
import { brl0, brlc, num, plural, titleName } from "@/lib/format";
import { dataset } from "@/lib/provenance";

export const metadata: Metadata = {
  title: "Doadores",
  description: "Quem doou para as campanhas eleitorais: pessoas, órgãos partidários e plataformas de financiamento coletivo, a partir das prestações de contas entregues ao TSE.",
};

const CRUMBS = [{ label: "Seguir o dinheiro" }, { label: "Doadores" }];

export default function DonorsPage({ searchParams }: PageProps<"/doadores">) {
  return (
    <Container className="pb-8">
      <Suspense fallback={<ListLoading />}>
        <DonorList searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

function ListLoading() {
  return (
    <div aria-busy="true">
      <PageHeader crumbs={CRUMBS} title="Doadores" lede="Quem transferiu dinheiro, bens ou serviços para as campanhas, segundo as prestações de contas entregues ao TSE." />
      <p className="mt-10 text-[15px] text-muted">Carregando os doadores…</p>
    </div>
  );
}

const SORT_LABEL: Record<DonorSort, string> = {
  valor: "por valor doado",
  candidatos: "por número de candidaturas",
  doacoes: "por número de doações",
  indireto: "por doações indiretas",
};

async function DonorList({ searchParams }: { searchParams: PageProps<"/doadores">["searchParams"] }) {
  const sp = await searchParams;
  const year = parseYear(sp.ano);
  const parties = await partiesOf(year);
  const partyParam = param(sp.partido);
  const f: DonorListFilters = {
    year,
    kind: pickOne(param(sp.tipo), DONOR_KINDS),
    uf: pickOne(param(sp.uf), UF_KEYS),
    party: partyParam && parties.includes(partyParam) ? partyParam : undefined,
    q: param(sp.q)?.slice(0, 80),
    sort: pickOne<DonorSort>(param(sp.ordem), DONOR_SORTS) ?? "valor",
    page: pageNumber(param(sp.pagina)),
  };
  const { rows, total } = await listDonors(f);
  const pages = Math.max(1, Math.ceil(total.n / PAGE_SIZE));
  const page = Math.min(f.page, pages);

  const params: Record<string, string | undefined> = {
    ano: String(year),
    tipo: f.kind,
    uf: f.uf,
    partido: f.party,
    q: f.q,
    ordem: f.sort === "valor" ? undefined : f.sort,
  };
  const href = (over: Record<string, string | undefined>) => hrefWith("/doadores", { ...params, ...over });
  const filtered = Boolean(f.kind || f.uf || f.party || f.q);
  const scoped = Boolean(f.uf || f.party);
  const n = total.n;
  const [one, many, fem]: [string, string, boolean] = (f.kind && KIND_NOUN[f.kind]) || ["doador", "doadores", false];
  const noun = n === 1 ? one : many;
  const scope = `${f.party ? ` do ${f.party}` : ""}${f.uf ? (f.uf === "BR" ? " à Presidência" : ` ${inUf(f.uf)}`) : ""}`;
  const named = f.q ? ` com “${f.q}” no nome ou no CNPJ` : "";
  const tx = `/transacoes?${new URLSearchParams(Object.entries({ ano: String(year), tipo: "receita", uf: f.uf, partido: f.party }).filter((e): e is [string, string] => Boolean(e[1]))).toString()}`;

  const lede =
    n === 0 ? (
      <>
        {fem ? "Nenhuma" : "Nenhum"} {one}
        {named} doou a candidaturas{scope} em {year}.
      </>
    ) : (
      <>
        Em {year},{" "}
        <Fig info={{ kind: "calculo", what: "Número de CPFs e CNPJs que aparecem como doadores (diretos ou originários) nas receitas declaradas pelas campanhas do recorte.", dataset: dataset("receitas", year) }}>
          {num(n)}
        </Fig>{" "}
        {noun}
        {named} {n === 1 ? "destinou" : "destinaram"}{" "}
        <Fig info={{ kind: "oficial", what: "Soma das doações diretas às campanhas do recorte, incluindo bens e serviços estimáveis em dinheiro.", dataset: dataset("receitas", year) }}>
          {brlc(total.donated)}
        </Fig>{" "}
        a candidaturas{scope}
        {total.donated_indirect > 0 && (
          <>
            , além de <Fig>{brlc(total.donated_indirect)}</Fig> que chegaram às campanhas por meio de partidos e vaquinhas
          </>
        )}
        .
      </>
    );

  return (
    <>
      <PageHeader
        crumbs={CRUMBS}
        title="Doadores"
        lede={lede}
        meta={
          <>
            <p className="max-w-[68ch]">
              {scoped
                ? "Os valores consideram apenas as doações a essas candidaturas."
                : "Desde 2015, empresas não podem doar a campanhas: a maior parte dos doadores são pessoas físicas, inclusive candidatos que aplicaram dinheiro próprio. Os órgãos partidários aparecem porque é por eles que o dinheiro público do Fundo Eleitoral e do Fundo Partidário chega às candidaturas."}
            </p>
            <div className="mt-3">
              <SourceLine
                label="TSE, receitas das campanhas"
                info={{ kind: "oficial", what: "Receitas declaradas pelas campanhas, com o CPF ou CNPJ de quem doou e, quando houver, o doador originário.", dataset: dataset("receitas", year) }}
                links={[{ label: "Ver as transações", href: tx }]}
              />
            </div>
          </>
        }
        aside={<YearTabs path="/doadores" params={params} year={year} />}
      />

      <div className="mt-8">
        <FilterForm
          key={JSON.stringify(params)}
          action="/doadores"
          hidden={{ ano: String(year) }}
          search={{ name: "q", label: "Nome ou CNPJ", value: f.q ?? "", placeholder: "Ex.: Silva" }}
          fields={[
            { name: "tipo", label: "Tipo de doador", allLabel: "Todos", value: f.kind ?? "", options: DONOR_KIND_OPTIONS },
            { name: "uf", label: "Estado das candidaturas", allLabel: "Todos", value: f.uf ?? "", options: UF_OPTIONS },
            { name: "partido", label: "Partido apoiado", allLabel: "Todos", value: f.party ?? "", options: parties.map((p) => ({ value: p, label: p })) },
            { name: "ordem", label: "Ordenar por", allLabel: DONOR_SORT_DEFAULT, value: params.ordem ?? "", options: DONOR_SORT_OPTIONS },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <div className="mt-10">
          <EmptyNote>
            {n > 0 ? (
              <>
                Esta página está além do fim da lista, que tem {plural(pages, "página", "páginas")}.{" "}
                <Link className="link text-ink" href={href({ pagina: undefined })}>
                  Voltar para a primeira página
                </Link>
                .
              </>
            ) : (
              <>
                Nenhum doador corresponde a esses filtros nas prestações de contas de {year}.{" "}
                {year === 2026 && "As campanhas de 2026 ainda estão entregando prestações de contas, e novas doações aparecem a cada atualização do TSE. "}
                {filtered && (
                  <Link className="link text-ink" href={`/doadores?ano=${year}`}>
                    Ver todos os doadores de {year}
                  </Link>
                )}
              </>
            )}
          </EmptyNote>
        </div>
      ) : (
        <div className="mt-8">
          <table className="dt">
            <caption className="sr-only">
              Doadores de campanhas em {year}, {SORT_LABEL[f.sort]}, página {num(page)} de {num(pages)}
            </caption>
            <thead>
              <tr>
                <th scope="col" className="hidden w-12 sm:table-cell">
                  <span className="sr-only">Posição</span>
                </th>
                <th scope="col" className="max-sm:pl-0!">Doador</th>
                <SortTh label="Doado a candidaturas" sort="valor" current={f.sort} href={href({ ordem: undefined })} />
                <SortTh label="Candidaturas" sort="candidatos" current={f.sort} href={href({ ordem: "candidatos" })} hide="hidden sm:table-cell" />
                <SortTh label="Doações" sort="doacoes" current={f.sort} href={href({ ordem: "doacoes" })} hide="hidden md:table-cell" />
                <SortTh label="Doações indiretas" sort="indireto" current={f.sort} href={href({ ordem: "indireto" })} hide="hidden sm:table-cell" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key}>
                  <td className="tnum hidden text-[13.5px] text-muted sm:table-cell">{num((page - 1) * PAGE_SIZE + i + 1)}</td>
                  <td className="max-sm:pl-0!">
                    <Link href={`/doadores/${r.key}?ano=${year}`} className="e break-words no-underline hover:underline">
                      {titleName(r.name) || "(sem nome)"}
                    </Link>
                    <div className="s text-[13.5px]">
                      {ENTITY_KIND[r.kind] ?? "Não identificado"}
                      {r.doc_display && <span className="tnum">, {r.doc_display}</span>}
                      {r.kind === "partido" && r.party && <>, {r.party}</>}
                      {r.uf && r.kind !== "partido" && r.uf !== "BR" && <>, {r.uf}</>}
                    </div>
                    <div className="tnum text-[13.5px] text-muted sm:hidden">
                      {r.n_candidates > 0 && <>a {plural(r.n_candidates, "candidatura", "candidaturas")}</>}
                      {r.donated_indirect > 0 && (
                        <>
                          {r.n_candidates > 0 ? "; " : ""}
                          {brlc(r.donated_indirect)} em doações indiretas
                        </>
                      )}
                    </div>
                  </td>
                  <td className={`n ${f.sort === "valor" ? "text-ink" : "s"}`}>{r.donated > 0 ? <Money v={r.donated} /> : <span className="text-muted">—</span>}</td>
                  <td className={`n ${f.sort === "candidatos" ? "text-ink" : "s hidden sm:table-cell"}`}>{r.n_candidates > 0 ? num(r.n_candidates) : <span className="text-muted">—</span>}</td>
                  <td className={`n ${f.sort === "doacoes" ? "text-ink" : "s hidden md:table-cell"}`}>{r.n_donations > 0 ? num(r.n_donations) : <span className="text-muted">—</span>}</td>
                  <td className={`n ${f.sort === "indireto" ? "text-ink" : "s hidden sm:table-cell"}`}>
                    {r.donated_indirect > 0 ? (
                      <>
                        <Money v={r.donated_indirect} />
                        <div className="text-[13.5px] text-muted">{plural(r.n_candidates_indirect, "candidatura", "candidaturas")}</div>
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="tnum mt-4 text-[13.5px] text-muted">
            {n > PAGE_SIZE ? `Doadores ${num((page - 1) * PAGE_SIZE + 1)} a ${num(Math.min(n, page * PAGE_SIZE))} de ${num(n)}, ` : ""}
            {SORT_LABEL[f.sort]}.
          </p>
        </div>
      )}

      <Pagination path="/doadores" params={params} page={page} total={n} pageSize={PAGE_SIZE} />

      <div className="mt-8 space-y-1">
        <Caption>
          Doações diretas: receitas em que o CPF ou CNPJ aparece como doador na prestação de contas da campanha, incluindo bens e serviços estimáveis em dinheiro.
          Doações indiretas: valores doados a partidos ou a plataformas de financiamento coletivo e repassados a campanhas, conforme o doador originário informado
          ao TSE. Esse dinheiro já aparece como doação direta do partido ou da plataforma, por isso as duas colunas não devem ser somadas.
        </Caption>
        <Caption>
          CPFs aparecem mascarados. Doar a campanhas é permitido a pessoas físicas, dentro dos limites da lei; aparecer nesta lista não indica, por si só, nenhuma
          irregularidade.
        </Caption>
      </div>
    </>
  );
}

/** Full value on wide screens, compact on phones (so the name keeps its width). */
function Money({ v }: { v: number }) {
  return (
    <>
      <span className="sm:hidden">{brlc(v)}</span>
      <span className="hidden sm:inline">{brl0(v)}</span>
    </>
  );
}

/** Column header that sorts the list: a plain link (works without JS), accent underline when active. The sorted column is always visible. */
function SortTh({ label, sort, current, href, hide = "" }: { label: string; sort: DonorSort; current: DonorSort; href: string; hide?: string }) {
  const on = sort === current;
  return (
    <th scope="col" aria-sort={on ? "descending" : undefined} className={`n ${on ? "" : hide}`}>
      <Link
        href={href}
        scroll={false}
        title={on ? undefined : `Ordenar ${SORT_LABEL[sort]}`}
        className={`border-b pb-px no-underline ${on ? "border-accent text-ink" : "border-transparent hover:text-ink"}`}
      >
        {label}
        {on && <span aria-hidden="true"> ↓</span>}
      </Link>
    </th>
  );
}
