import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container } from "@/components/ui/primitives";
import { Caption, EmptyNote, Fig, PageHeader, SourceLine, YearTabs } from "@/components/ui/editorial";
import { FilterForm } from "@/components/ui/FilterForm";
import { Pagination } from "@/components/ui/Pagination";
import { hrefWith, lcFirst, pageNumber, param, pickOne } from "@/components/entities/parts";
import {
  GROUP_KEYS,
  GROUP_OPTIONS,
  KIND_NOUN,
  SUPPLIER_KINDS,
  SUPPLIER_KIND_OPTIONS,
  SUPPLIER_SORTS,
  SUPPLIER_SORT_DEFAULT,
  SUPPLIER_SORT_OPTIONS,
  UF_KEYS,
  UF_OPTIONS,
  inUf,
} from "@/components/entities/options";
import { PAGE_SIZE, listSuppliers, partiesOf, type SupplierListFilters, type SupplierSort } from "@/lib/queries/entities";
import { ENTITY_KIND, EXPENSE_GROUPS, parseYear } from "@/lib/labels";
import { brl0, brlc, num, plural, titleName } from "@/lib/format";
import { dataset } from "@/lib/provenance";

export const metadata: Metadata = {
  title: "Fornecedores",
  description: "Empresas e pessoas contratadas pelas campanhas eleitorais: quanto receberam, de quais candidaturas e partidos, a partir das prestações de contas entregues ao TSE.",
};

const CRUMBS = [{ label: "Seguir o dinheiro" }, { label: "Fornecedores" }];

export default function SuppliersPage({ searchParams }: PageProps<"/fornecedores">) {
  return (
    <Container className="pb-8">
      <Suspense fallback={<ListLoading />}>
        <SupplierList searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

function ListLoading() {
  return (
    <div aria-busy="true">
      <PageHeader crumbs={CRUMBS} title="Fornecedores" lede="Empresas e pessoas contratadas pelas campanhas, segundo as despesas declaradas ao TSE." />
      <p className="mt-10 text-[15px] text-muted">Carregando os fornecedores…</p>
    </div>
  );
}

const SORT_LABEL: Record<SupplierSort, string> = {
  valor: "por valor contratado",
  candidatos: "por número de campanhas",
  partidos: "por número de partidos",
};

async function SupplierList({ searchParams }: { searchParams: PageProps<"/fornecedores">["searchParams"] }) {
  const sp = await searchParams;
  const year = parseYear(sp.ano);
  const parties = await partiesOf(year);
  const partyParam = param(sp.partido);
  const f: SupplierListFilters = {
    year,
    kind: pickOne(param(sp.tipo), SUPPLIER_KINDS),
    group: pickOne(param(sp.grupo), GROUP_KEYS),
    uf: pickOne(param(sp.uf), UF_KEYS),
    party: partyParam && parties.includes(partyParam) ? partyParam : undefined,
    q: param(sp.q)?.slice(0, 80),
    sort: pickOne<SupplierSort>(param(sp.ordem), SUPPLIER_SORTS) ?? "valor",
    page: pageNumber(param(sp.pagina)),
  };
  const { rows, total } = await listSuppliers(f);
  const pages = Math.max(1, Math.ceil(total.n / PAGE_SIZE));
  const page = Math.min(f.page, pages);

  const params: Record<string, string | undefined> = {
    ano: String(year),
    tipo: f.kind,
    grupo: f.group,
    uf: f.uf,
    partido: f.party,
    q: f.q,
    ordem: f.sort === "valor" ? undefined : f.sort,
  };
  const href = (over: Record<string, string | undefined>) => hrefWith("/fornecedores", { ...params, ...over });
  const filtered = Boolean(f.kind || f.group || f.uf || f.party || f.q);
  const scoped = Boolean(f.group || f.uf || f.party);
  const n = total.n;
  const [one, many]: [string, string, boolean] = (f.kind && KIND_NOUN[f.kind]) || ["fornecedor", "fornecedores", false];
  const noun = n === 1 ? one : many;
  const campaigns = `campanhas${f.party ? ` do ${f.party}` : ""}${f.uf ? (f.uf === "BR" ? " à Presidência" : ` ${inUf(f.uf)}`) : ""}`;
  const named = f.q ? ` com “${f.q}” no nome ou no CNPJ` : "";
  const forGroup = f.group ? ` para ${lcFirst(EXPENSE_GROUPS[f.group].label)}` : "";
  const tx = `/transacoes?${new URLSearchParams(
    Object.entries({ ano: String(year), tipo: "despesa", grupo: f.group, uf: f.uf, partido: f.party }).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString()}`;

  const lede =
    n === 0 ? (
      <>
        Nenhuma das {campaigns} contratou {many}
        {named}
        {forGroup} em {year}.
      </>
    ) : (
      <>
        Em {year}, as {campaigns} contrataram{" "}
        <Fig info={{ kind: "calculo", what: "Número de CPFs e CNPJs que aparecem como fornecedores nas despesas declaradas pelas campanhas do recorte.", dataset: dataset("despesas_contratadas", year) }}>
          {num(n)}
        </Fig>{" "}
        {noun}
        {named}
        {forGroup}, somando{" "}
        <Fig info={{ kind: "oficial", what: "Soma das despesas contratadas pelas campanhas do recorte com esses fornecedores.", dataset: dataset("despesas_contratadas", year) }}>
          {brlc(total.supplied)}
        </Fig>
        .
      </>
    );

  return (
    <>
      <PageHeader
        crumbs={CRUMBS}
        title="Fornecedores"
        lede={lede}
        meta={
          <>
            <p className="max-w-[68ch]">
              {scoped
                ? "Os valores consideram apenas as despesas que correspondem aos filtros."
                : "Empresas e pessoas contratadas para produzir material, impulsionar conteúdo na internet, gravar programas, alugar veículos e imóveis ou trabalhar na rua. O valor é o contratado, declarado pelas campanhas; os pagamentos registrados aparecem no perfil de cada fornecedor."}
            </p>
            <div className="mt-3">
              <SourceLine
                label="TSE, despesas contratadas pelas campanhas"
                info={{ kind: "oficial", what: "Despesas declaradas pelas campanhas, com o CPF ou CNPJ do fornecedor e a categoria oficial do TSE.", dataset: dataset("despesas_contratadas", year) }}
                links={[{ label: "Ver as transações", href: tx }]}
              />
            </div>
          </>
        }
        aside={<YearTabs path="/fornecedores" params={params} year={year} />}
      />

      <div className="mt-8">
        <FilterForm
          key={JSON.stringify(params)}
          action="/fornecedores"
          hidden={{ ano: String(year) }}
          search={{ name: "q", label: "Nome ou CNPJ", value: f.q ?? "", placeholder: "Ex.: gráfica" }}
          fields={[
            { name: "tipo", label: "Tipo", allLabel: "Todos", value: f.kind ?? "", options: SUPPLIER_KIND_OPTIONS },
            { name: "grupo", label: "Categoria de gasto", allLabel: "Todas", value: f.group ?? "", options: GROUP_OPTIONS },
            { name: "uf", label: "Estado das campanhas", allLabel: "Todos", value: f.uf ?? "", options: UF_OPTIONS },
            { name: "partido", label: "Partido atendido", allLabel: "Todos", value: f.party ?? "", options: parties.map((p) => ({ value: p, label: p })) },
            { name: "ordem", label: "Ordenar por", allLabel: SUPPLIER_SORT_DEFAULT, value: params.ordem ?? "", options: SUPPLIER_SORT_OPTIONS },
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
                Nenhum fornecedor corresponde a esses filtros nas prestações de contas de {year}.{" "}
                {year === 2026 && "As campanhas de 2026 ainda estão entregando prestações de contas, e novas despesas aparecem a cada atualização do TSE. "}
                {filtered && (
                  <Link className="link text-ink" href={`/fornecedores?ano=${year}`}>
                    Ver todos os fornecedores de {year}
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
              Fornecedores de campanhas em {year}, {SORT_LABEL[f.sort]}, página {num(page)} de {num(pages)}
            </caption>
            <thead>
              <tr>
                <th scope="col" className="hidden w-12 sm:table-cell">
                  <span className="sr-only">Posição</span>
                </th>
                <th scope="col" className="max-sm:pl-0!">Fornecedor</th>
                <SortTh label="Valor contratado" sort="valor" current={f.sort} href={href({ ordem: undefined })} />
                <SortTh label="Campanhas" sort="candidatos" current={f.sort} href={href({ ordem: "candidatos" })} hide="hidden sm:table-cell" />
                <SortTh label="Partidos" sort="partidos" current={f.sort} href={href({ ordem: "partidos" })} hide="hidden md:table-cell" />
                <th scope="col" className="n hidden md:table-cell">
                  Despesas
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key}>
                  <td className="tnum hidden text-[13.5px] text-muted sm:table-cell">{num((page - 1) * PAGE_SIZE + i + 1)}</td>
                  <td className="max-sm:pl-0!">
                    <Link href={`/fornecedores/${r.key}?ano=${year}`} className="e break-words no-underline hover:underline">
                      {titleName(r.name) || "(sem nome)"}
                    </Link>
                    <div className="s text-[13.5px]">
                      {ENTITY_KIND[r.kind] ?? "Não identificado"}
                      {r.doc_display && <span className="tnum">, {r.doc_display}</span>}
                      {r.main_group && !f.group && <>, principalmente {lcFirst(EXPENSE_GROUPS[r.main_group]?.label ?? r.main_group)}</>}
                    </div>
                    <div className="tnum text-[13.5px] text-muted sm:hidden">
                      {plural(r.n_candidates, "campanha", "campanhas")} de {plural(r.n_parties, "partido", "partidos")}
                    </div>
                  </td>
                  <td className={`n ${f.sort === "valor" ? "text-ink" : "s"}`}><Money v={r.supplied} /></td>
                  <td className={`n ${f.sort === "candidatos" ? "text-ink" : "s hidden sm:table-cell"}`}>{num(r.n_candidates)}</td>
                  <td className={`n ${f.sort === "partidos" ? "text-ink" : "s hidden md:table-cell"}`}>{num(r.n_parties)}</td>
                  <td className="n s hidden md:table-cell">{num(r.n_supplies)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="tnum mt-4 text-[13.5px] text-muted">
            {n > PAGE_SIZE ? `Fornecedores ${num((page - 1) * PAGE_SIZE + 1)} a ${num(Math.min(n, page * PAGE_SIZE))} de ${num(n)}, ` : ""}
            {SORT_LABEL[f.sort]}.
          </p>
        </div>
      )}

      <Pagination path="/fornecedores" params={params} page={page} total={n} pageSize={PAGE_SIZE} />

      <div className="mt-8 space-y-1">
        <Caption>
          Valor contratado: soma das despesas em que o CPF ou CNPJ aparece como fornecedor, como declaradas pelas campanhas. Campanhas e partidos contam as
          candidaturas que contrataram o fornecedor e os partidos dessas candidaturas. Categorias de gasto agrupam as categorias oficiais do TSE; veja a{" "}
          <Link className="link" href="/metodologia">
            metodologia
          </Link>
          .
        </Caption>
        <Caption>
          Pessoas físicas, em geral contratadas como pessoal de campanha, aparecem com o CPF mascarado. Prestar serviços a campanhas é uma atividade legal e comum;
          aparecer nesta lista não indica, por si só, nenhuma irregularidade.
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
function SortTh({ label, sort, current, href, hide = "" }: { label: string; sort: SupplierSort; current: SupplierSort; href: string; hide?: string }) {
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
