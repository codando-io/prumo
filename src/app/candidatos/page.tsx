import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container, ResultChip } from "@/components/ui/primitives";
import { Caption, EmptyNote, Fig, PageHeader, SourceLine, YearTabs } from "@/components/ui/editorial";
import { Photo } from "@/components/ui/Photo";
import { FilterForm } from "@/components/ui/FilterForm";
import { Pagination } from "@/components/ui/Pagination";
import { CompareForm } from "@/components/compare/CompareForm";
import { CANDIDATE_ORDERS, PAGE_SIZE, listCandidates, type CandidateListFilters } from "@/lib/queries/candidates";
import { filterOptions } from "@/lib/queries/dashboard";
import { CURRENT_YEAR, OFFICES, UF_NAMES, parseYear } from "@/lib/labels";
import { brlUnit, brlc, num, numc, pct, titleName } from "@/lib/format";
import { dataset } from "@/lib/provenance";

export const metadata: Metadata = {
  title: "Candidaturas",
  description: "Todas as candidaturas das eleições gerais, com votos, receitas, despesas e sinais nos dados de prestação de contas.",
};

const CRUMBS = [{ label: "Explorar" }, { label: "Candidaturas" }];

export default function CandidatesPage({ searchParams }: PageProps<"/candidatos">) {
  return (
    <Container className="pb-8">
      <Suspense fallback={<ListLoading />}>
        <Explorer searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

function ListLoading() {
  return (
    <div aria-busy="true">
      <PageHeader crumbs={CRUMBS} title="Candidaturas" lede="Todas as candidaturas das eleições gerais, com votos, receitas e despesas declaradas ao TSE." />
      <p className="mt-10 text-[15px] text-muted">Carregando as candidaturas…</p>
    </div>
  );
}

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/** "a deputado federal por São Paulo, do PL" — the current filter, in words, agreeing with the count. */
function scopeWords(f: CandidateListFilters, n: number) {
  const one = n === 1;
  const before: string[] = [];
  const after: string[] = [];
  if (f.result === "eleito") before.push(one ? "eleita" : "eleitas");
  if (f.result === "nao_eleito") before.push(one ? "não eleita" : "não eleitas");
  const office = OFFICES.find((o) => o.code === f.office);
  if (office) before.push(`a ${office.label.toLowerCase()}`);
  if (f.uf === "BR" && !office) before.push("à Presidência");
  else if (f.uf && f.uf !== "BR") before.push(`por ${UF_NAMES[f.uf] ?? f.uf}`);
  if (f.party) before.push(`do ${f.party}`);
  if (f.q) before.push(`com “${f.q}” no nome`);
  if (f.signals) before.push("com sinais nos dados");
  if (f.result === "segundo")
    after.push(f.year === CURRENT_YEAR ? (one ? "que disputa o 2º turno" : "que disputam o 2º turno") : one ? "que foi ao 2º turno" : "que foram ao 2º turno");
  if (f.result === "suplente") after.push(one ? "que ficou como suplente" : "que ficaram como suplentes");
  return [...before, ...after].join(" ");
}

type SortKey = keyof typeof CANDIDATE_ORDERS;

async function Explorer({ searchParams }: { searchParams: PageProps<"/candidatos">["searchParams"] }) {
  const sp = await searchParams;
  const year = parseYear(sp.ano);
  const f: CandidateListFilters = {
    year,
    uf: str(sp.uf),
    office: Number(str(sp.cargo)) || undefined,
    party: str(sp.partido),
    result: str(sp.resultado),
    q: str(sp.q),
    signals: str(sp.padroes) === "1",
    order: str(sp.ordem),
    page: Number(str(sp.pagina)) || 1,
  };
  const [data, opts] = await Promise.all([listCandidates(f), filterOptions(year)]);
  const params: Record<string, string | undefined> = {
    ano: String(year),
    uf: f.uf,
    cargo: f.office ? String(f.office) : undefined,
    partido: f.party,
    resultado: f.result,
    q: f.q,
    padroes: f.signals ? "1" : undefined,
    ordem: f.order,
  };
  const sort: SortKey = f.order && f.order in CANDIDATE_ORDERS ? f.order : "votos";
  const sortHref = (k: SortKey) => {
    const u = new URLSearchParams();
    for (const [key, v] of Object.entries({ ...params, ordem: k === "votos" ? undefined : k })) if (v) u.set(key, v);
    return `/candidatos?${u.toString()}`;
  };
  const txQuery = new URLSearchParams(Object.entries({ ano: String(year), uf: f.uf, cargo: params.cargo, partido: f.party }).filter((e): e is [string, string] => Boolean(e[1])));

  const n = data.total;
  const scope = scopeWords(f, n);
  const lede =
    n === 0 ? (
      <>
        Nenhuma candidatura{scope ? ` ${scope}` : ""} em {year}.
      </>
    ) : (
      <>
        {n === 1 ? (
          "Uma candidatura"
        ) : (
          <>
            <Fig info={{ kind: "oficial", what: "Candidaturas registradas no recorte, sem vices e suplentes de senador, cujas contas ficam com o titular.", dataset: dataset("candidatos", year) }}>
              {num(n)}
            </Fig>{" "}
            candidaturas
          </>
        )}
        {scope ? ` ${scope}` : ""} em {year}
        {data.withFinance === 0 ? (
          <>; {n === 1 ? "ela ainda não publicou" : "nenhuma publicou ainda"} prestação de contas.</>
        ) : data.withFinance === n ? (
          <>, {n === 1 ? "com prestação de contas publicada" : "todas com prestação de contas publicada"}.</>
        ) : (
          <>
            , das quais <Fig>{num(data.withFinance)}</Fig> {year === CURRENT_YEAR ? "já " : ""}
            {data.withFinance === 1 ? "publicou" : "publicaram"} prestação de contas.
          </>
        )}
        {data.withFinance > 0 && (
          <>
            {" "}
            {data.withFinance === 1 ? "Declarou" : "Juntas, declararam"}{" "}
            <Fig info={{ kind: "oficial", what: "Soma das receitas declaradas pelas candidaturas do recorte, incluindo doações em bens e serviços.", dataset: dataset("receitas", year) }}>
              {brlc(data.revenue)}
            </Fig>{" "}
            em receitas
            {data.revenue > 0 && (
              <>
                ,{" "}
                <Fig info={{ kind: "calculo", what: "Receitas do Fundo Eleitoral e do Fundo Partidário divididas pela receita total do recorte.", dataset: dataset("receitas", year) }}>
                  {pct(data.revenuePublic / data.revenue)}
                </Fig>{" "}
                de dinheiro público,
              </>
            )}{" "}
            e{" "}
            <Fig info={{ kind: "oficial", what: "Soma das despesas declaradas pelas candidaturas do recorte, incluindo doações a outras campanhas.", dataset: dataset("despesas_contratadas", year) }}>
              {brlc(data.expense)}
            </Fig>{" "}
            em despesas.
          </>
        )}
      </>
    );

  const from = (data.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(n, data.page * PAGE_SIZE);

  // Numeric columns. Low-priority ones hide on small screens, except the one the list is sorted by.
  type Row = (typeof data.rows)[number];
  const dash = <span className="text-muted">—</span>;
  const cols: { key: SortKey; label: string; hide: string; strong?: boolean; cell: (c: Row) => React.ReactNode }[] = [
    {
      key: "votos",
      label: "Votos",
      hide: "hidden sm:table-cell",
      cell: (c) => (
        <>
          <span className="sm:hidden">{numc(c.votes)}</span>
          <span className="hidden sm:inline">{num(c.votes)}</span>
        </>
      ),
    },
    { key: "receita", label: "Receitas", hide: "hidden md:table-cell", cell: (c) => (c.has_finance ? brlc(c.revenue) : dash) },
    ...(sort === "privado" ? [{ key: "privado", label: "Privado", hide: "", cell: (c: Row) => (c.has_finance ? brlc(c.revenue_private) : dash) }] : []),
    { key: "publico", label: "% público", hide: "hidden sm:table-cell", cell: (c) => (c.public_share != null ? pct(c.public_share) : dash) },
    {
      key: "despesa",
      label: "Despesas",
      hide: "",
      strong: true,
      cell: (c) =>
        c.has_finance ? (
          brlc(c.expense)
        ) : (
          <span className="text-muted" title="O TSE ainda não publicou a prestação de contas desta candidatura">
            sem contas
          </span>
        ),
    },
    { key: "gasto_voto", label: "Por voto", hide: "hidden lg:table-cell", cell: (c) => (c.expense_per_vote != null ? brlUnit(c.expense_per_vote) : dash) },
  ];
  const colClass = (k: SortKey, hide: string) => (sort === k ? "" : hide);

  return (
    <>
      <PageHeader
        crumbs={CRUMBS}
        title="Candidaturas"
        lede={lede}
        meta={
          <SourceLine
            label="TSE, candidaturas e prestações de contas"
            info={{ kind: "oficial", what: "Registro de candidaturas, votação e prestações de contas publicadas no Portal de Dados Abertos do TSE.", dataset: dataset("candidatos", year) }}
            links={[{ label: "Ver as transações", href: `/transacoes?${txQuery.toString()}` }]}
          />
        }
        aside={<YearTabs path="/candidatos" params={params} year={year} />}
      />

      <div className="mt-8">
        <FilterForm
          key={JSON.stringify(params)}
          action="/candidatos"
          hidden={{ ano: String(year) }}
          search={{ name: "q", label: "Nome", value: f.q ?? "", placeholder: "Nome de urna ou nome civil" }}
          fields={[
            { name: "uf", label: "Estado", allLabel: "Todos", value: f.uf ?? "", options: opts.ufs.map((u) => ({ value: u, label: u === "BR" ? "Nacional" : UF_NAMES[u] ?? u })) },
            { name: "cargo", label: "Cargo", allLabel: "Todos", value: f.office ? String(f.office) : "", options: OFFICES.map((o) => ({ value: String(o.code), label: o.plural })) },
            { name: "partido", label: "Partido", allLabel: "Todos", value: f.party ?? "", options: opts.parties.map((p) => ({ value: p.party, label: p.party })) },
            {
              name: "resultado",
              label: "Resultado",
              allLabel: "Todos",
              value: f.result ?? "",
              options: [
                { value: "eleito", label: "Eleitos" },
                { value: "segundo", label: "2º turno" },
                { value: "suplente", label: "Suplentes" },
                { value: "nao_eleito", label: "Não eleitos" },
              ],
            },
            { name: "padroes", label: "Sinais nos dados", allLabel: "Indiferente", value: f.signals ? "1" : "", options: [{ value: "1", label: "Com sinais para explorar" }] },
            {
              name: "ordem",
              label: "Ordenar por",
              allLabel: CANDIDATE_ORDERS.votos.label,
              value: f.order && f.order !== "votos" ? f.order : "",
              options: Object.entries(CANDIDATE_ORDERS)
                .filter(([k]) => k !== "votos")
                .map(([k, v]) => ({ value: k, label: v.label })),
            },
          ]}
        />
      </div>

      {data.rows.length === 0 ? (
        <div className="mt-10">
          <EmptyNote>
            {n === 0
              ? "Nenhuma candidatura com esses filtros. Tente remover um filtro ou buscar só por parte do nome."
              : "Esta página está além do fim da lista."}{" "}
            <Link href="/candidatos" className="link text-ink">
              Ver todas as candidaturas
            </Link>
            .
          </EmptyNote>
        </div>
      ) : (
        <div className="mt-8">
          <CompareForm key={`${JSON.stringify(params)}-${data.page}`}>
            <table className="dt">
              <caption className="sr-only">
                {`Candidaturas${scope ? ` ${scope}` : ""} em ${year}, ${CANDIDATE_ORDERS[sort].label.toLowerCase()}`}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="w-7">
                    <span className="sr-only">Marcar para comparar</span>
                  </th>
                  <SortTh col="nome" label="Candidatura" sort={sort} href={sortHref} align="left" />
                  <th scope="col" className="hidden md:table-cell">
                    Resultado
                  </th>
                  {cols.map((col) => (
                    <SortTh key={col.key} col={col.key} label={col.label} sort={sort} href={sortHref} className={colClass(col.key, col.hide)} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((c) => {
                  const name = titleName(c.ballot_name);
                  return (
                    <tr key={c.id}>
                      <td>
                        <input type="checkbox" name="c" value={`${c.year}-${c.id}`} aria-label={`Marcar ${name} para comparar`} className="mt-[3px] h-4 w-4 accent-accent" />
                      </td>
                      <td>
                        <div className="flex gap-3">
                          <span className="hidden sm:block">
                            <Photo year={c.year} id={c.id} name={c.ballot_name} size={30} />
                          </span>
                          <div className="min-w-0">
                            <Link href={`/candidatos/${c.year}/${c.id}`} className="e no-underline hover:underline hover:decoration-accent hover:underline-offset-[3px]">
                              {name}
                            </Link>
                            <div className="s text-[13.5px]">
                              {c.office}
                              {c.uf !== "BR" ? ` (${c.uf})` : ""}, {c.party}
                              <span className="md:hidden">
                                {" · "}
                                <ResultChip result={c.result} year={c.year} registration={c.registration_status} />
                              </span>
                              {c.signals > 0 && (
                                <span className="hidden sm:inline">
                                  {" · "}
                                  <Link href={`/candidatos/${c.year}/${c.id}#padroes`} className="action">
                                    {c.signals === 1 ? "1 sinal nos dados" : `${num(c.signals)} sinais nos dados`}
                                  </Link>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="hidden text-[14px] md:table-cell">
                        <ResultChip result={c.result} year={c.year} registration={c.registration_status} />
                      </td>
                      {cols.map((col) => (
                        <td key={col.key} className={`n ${colClass(col.key, col.hide)} ${sort === col.key || col.strong ? "text-ink" : "s"}`}>
                          {col.cell(c)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CompareForm>
          <p className="tnum mt-4 text-[13.5px] text-muted">
            {n > PAGE_SIZE ? `Candidaturas ${num(from)} a ${num(to)} de ${num(n)}, ` : ""}
            {CANDIDATE_ORDERS[sort].label.toLowerCase()}.
          </p>
        </div>
      )}
      <Pagination path="/candidatos" params={params} page={data.page} total={n} pageSize={PAGE_SIZE} />
      <Caption>
        Marque até seis candidaturas na primeira coluna para compará-las lado a lado. Vices e suplentes de senador não aparecem: as contas da chapa ficam com o
        titular. Parcela pública e gasto por voto são métricas descritivas calculadas pelo Prumo a partir dos dados do TSE; a ordenação serve para explorar, não é
        um ranking de mérito.
      </Caption>
    </>
  );
}

/** Column header that sorts the list: a plain link (works without JS), accent underline when active. */
function SortTh({
  col,
  label,
  sort,
  href,
  align = "right",
  className = "",
}: {
  col: SortKey;
  label: string;
  sort: SortKey;
  href: (k: SortKey) => string;
  align?: "left" | "right";
  className?: string;
}) {
  const on = sort === col;
  const asc = col === "nome";
  return (
    <th scope="col" aria-sort={on ? (asc ? "ascending" : "descending") : undefined} className={`${align === "right" ? "n" : ""} ${className}`}>
      <Link
        href={href(col)}
        scroll={false}
        title={on ? undefined : `Ordenar: ${CANDIDATE_ORDERS[col].label.toLowerCase()}`}
        className={`border-b pb-px no-underline ${on ? "border-accent text-ink" : "border-transparent hover:text-ink"}`}
      >
        {label}
        {on && <span aria-hidden="true">{asc ? " ↑" : " ↓"}</span>}
      </Link>
    </th>
  );
}
