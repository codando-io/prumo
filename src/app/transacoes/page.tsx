import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container, Empty, Note } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/editorial";
import { Source, type SourceInfo } from "@/components/ui/Source";
import { Pagination } from "@/components/ui/Pagination";
import { ActiveFilters, FilterPanel } from "@/components/transactions/FilterPanel";
import { TxTable } from "@/components/transactions/TxTable";
import {
  CSV_MAX_ROWS,
  PAGE_SIZE,
  getFinanceGeneratedAt,
  getTransactionHighlights,
  getTransactions,
  getTxCandidate,
  getTxCounterparty,
  getTxOptions,
  parseTxFilters,
  textWords,
  txHref,
  txParams,
  txSides,
  type TxFilters,
  type TxResult,
} from "@/lib/queries/transactions";
import { EXPENSE_GROUPS, FUNDING_GROUPS, cdnFile, fundingGroupOf, tseCandidateUrl } from "@/lib/labels";
import { counterpartHref } from "@/lib/links";
import { brlc, date, dateTime, num, pct, titleName, inSentence } from "@/lib/format";
import { dataset } from "@/lib/provenance";

export const metadata: Metadata = {
  title: "Transações",
  description:
    "Todas as receitas e despesas declaradas pelas campanhas ao TSE, uma a uma: filtre por candidatura, doador, fornecedor, categoria, partido, estado, data e valor, e baixe em CSV.",
};

export default function TransactionsPage({ searchParams }: PageProps<"/transacoes">) {
  return (
    <>
      <Container>
        <PageHeader
          crumbs={[{ label: "Seguir o dinheiro" }, { label: "Transações" }]}
          title="Transações"
          lede="Cada receita e cada despesa declarada pelas campanhas à Justiça Eleitoral, como o TSE publicou. Filtre por candidatura, doador, fornecedor, categoria, lugar, data ou valor, e baixe o resultado."
        />
        <details className="mt-4 max-w-[72ch] text-[14.5px] text-ink-2">
          <summary className="action cursor-pointer list-none [&::-webkit-details-marker]:hidden">Como ler esta tabela</summary>
          <div className="mt-2 space-y-2 leading-relaxed">
            <p>
              Cada linha é uma transação da prestação de contas de uma campanha: uma receita (dinheiro, bens ou serviços que entraram) ou uma despesa (um gasto
              registrado com um fornecedor, pago ou ainda a pagar). Quando uma transação tem vários itens, eles aparecem somados.
            </p>
            <p>
              Os valores são os declarados pelas próprias campanhas, sem correções. As receitas incluem doações em bens e serviços, chamadas de estimáveis, pelo valor
              que a campanha atribuiu a elas.
            </p>
          </div>
        </details>
      </Container>
      <Suspense fallback={<ExplorerLoading />}>
        <Explorer searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function ExplorerLoading() {
  return (
    <Container className="mt-8" aria-busy="true">
      <p className="border-y border-rule py-5 text-[15px] text-muted">Buscando as transações…</p>
    </Container>
  );
}

async function Explorer({ searchParams }: { searchParams: PageProps<"/transacoes">["searchParams"] }) {
  const f = parseTxFilters(await searchParams);
  const [res, candidate, counterparty, generatedAt, options] = await Promise.all([
    getTransactions(f),
    f.candidato ? getTxCandidate(f.year, f.candidato) : Promise.resolve(undefined),
    f.contraparte ? getTxCounterparty(f.contraparte) : Promise.resolve(undefined),
    getFinanceGeneratedAt(f.year),
    getTxOptions(f.year),
  ]);
  const sides = txSides(f);
  // Files the listed rows come from (both when the filters cannot match either side).
  const files = sides.receita || sides.despesa ? sides : { receita: true, despesa: true };
  const csvHref = txHref(f, { pagina: null }, "/api/transacoes") + "&formato=csv";

  return (
    <Container className="mt-8">
      <FilterPanel f={f} candidate={candidate} counterparty={counterparty} options={options} />
      <ActiveFilters f={f} candidate={candidate} counterparty={counterparty} />

      {f.candidato && !candidate && (
        <div className="mt-4">
          <Note>
            Não há candidatura com o número {f.candidato} nas eleições de {f.year}. O número pode ser de outra eleição.{" "}
            <Link className="link text-ink" href={txHref(f, { candidato: null, pagina: null })}>
              Remover este filtro
            </Link>
          </Note>
        </div>
      )}
      {candidate?.is_running_mate && (
        <div className="mt-4">
          <Note>Candidaturas a vice e a suplente não têm prestação de contas própria: o dinheiro da chapa é registrado na conta do titular.</Note>
        </div>
      )}

      <section aria-labelledby="resultado" className="mt-8">
        <h2 id="resultado" className="sr-only">
          Resultado
        </h2>
        <div className="grid gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="min-w-0">
            <Summary res={res} f={f} generatedAt={generatedAt} />
            <Suspense fallback={null}>
              <Highlights f={f} res={res} />
            </Suspense>
          </div>
          <div className="text-[14px] lg:text-right">
            <ul className="flex flex-wrap gap-x-5 gap-y-1 lg:justify-end">
              {res.total > 0 && (
                <li>
                  <a href={csvHref} className="action" download>
                    Baixar CSV
                  </a>
                </li>
              )}
              {candidate && (
                <li>
                  <a href={tseCandidateUrl(candidate.year, candidate.uf, candidate.id)} target="_blank" rel="noreferrer" className="action">
                    Prestação no TSE <span aria-hidden="true">↗</span>
                  </a>
                </li>
              )}
              {candidate && (
                <li>
                  <Link href={`/candidatos/${candidate.year}/${candidate.id}`} className="action">
                    Perfil da candidatura
                  </Link>
                </li>
              )}
              {counterparty && (
                <li>
                  <Link href={`/conexoes?no=e:${counterparty.key}&ano=${f.year}`} className="action">
                    Seguir as conexões
                  </Link>
                </li>
              )}
            </ul>
            {res.pages > 1 && res.page <= res.pages && (
              <p className="mt-1 text-[13.5px] text-muted">
                Página {num(res.page)} de {num(res.pages)}, {PAGE_SIZE} por página
              </p>
            )}
          </div>
        </div>

        {res.rows.length > 0 ? (
          <TxTable rows={res.rows} f={f} />
        ) : (
          <div className="mt-6">
            <EmptyState f={f} res={res} sides={sides} />
          </div>
        )}

        {res.page <= res.pages && (
          <Pagination path="/transacoes" params={Object.fromEntries(txParams(f, { pagina: null }))} page={res.page} total={res.total} pageSize={PAGE_SIZE} />
        )}
      </section>

      <section aria-labelledby="fontes" className="section">
        <h2 id="fontes" className="question text-ink">
          De onde vêm estas linhas?
        </h2>
        <div className="mt-5 grid gap-x-12 gap-y-6 text-[14.5px] leading-relaxed text-ink-2 lg:grid-cols-2">
          <div className="space-y-2">
            <p>
              Fonte: TSE, arquivo{" "}
              {[files.receita && cdnFile("receitas", f.year).file, files.despesa && cdnFile("despesas_contratadas", f.year).file]
                .filter(Boolean)
                .map((file, i) => (
                  <span key={String(file)}>
                    {i > 0 && " / "}
                    <span className="text-ink [overflow-wrap:anywhere]">{file}</span>
                  </span>
                ))}
              {generatedAt ? `, gerado em ${dateTime(generatedAt)}` : ""}.
              {files.despesa && (
                <>
                  {" "}
                  Os pagamentos de cada despesa vêm de <span className="text-ink [overflow-wrap:anywhere]">{cdnFile("despesas_pagas", f.year).file}</span>.
                </>
              )}
            </p>
            <p>
              <a className="link" href={cdnFile("receitas", f.year).zip} rel="noreferrer">
                Baixar os arquivos originais de {f.year} (zip) <span aria-hidden="true">↗</span>
              </a>
              {candidate && (
                <>
                  {" "}
                  ou{" "}
                  <a className="link" href={tseCandidateUrl(candidate.year, candidate.uf, candidate.id)} target="_blank" rel="noreferrer">
                    ver a prestação de {titleName(candidate.ballot_name)} no DivulgaCandContas <span aria-hidden="true">↗</span>
                  </a>
                </>
              )}
              .
            </p>
            {f.year === 2026 && (
              <p>A campanha de 2026 ainda está em curso: as prestações mudam a cada entrega e os valores podem ser corrigidos pelas campanhas.</p>
            )}
          </div>
          <div className="space-y-2">
            <p>
              O CSV traz todas as transações filtradas, até {num(CSV_MAX_ROWS)}, na ordem escolhida. Ele usa UTF-8, colunas separadas por ponto e vírgula,
              vírgula decimal (1234,56) e datas no formato AAAA-MM-DD, e abre direto no Excel ou no LibreOffice.
            </p>
            <p>
              Colunas: ano, tipo, sq (identificador do TSE), data, valor, candidatura (identificador, nome, cargo, UF e partido), contraparte e documento,
              categoria, grupo, descrição, documento fiscal ou recibo, prestação de contas, fundo, valor pago, natureza e número de itens.
            </p>
            <p>
              CPFs nunca aparecem completos: os de pessoas aparecem mascarados (***.123.456-**), inclusive quando foram digitados na descrição. CNPJs aparecem
              por inteiro.
            </p>
            {res.total > CSV_MAX_ROWS && (
              <p className="text-ink">
                Com os filtros atuais, o arquivo traz as primeiras {num(CSV_MAX_ROWS)} de {num(res.total)} transações. Use filtros para baixar o restante em
                partes.
              </p>
            )}
          </div>
        </div>
      </section>
    </Container>
  );
}

function Summary({ res, f, generatedAt }: { res: TxResult; f: TxFilters; generatedAt: string | null }) {
  const src = (kind: "receitas" | "despesas_contratadas", what: string): SourceInfo => ({
    kind: "oficial",
    what,
    dataset: dataset(kind, f.year, generatedAt),
  });
  const rev = (
    <Source
      info={src(
        "receitas",
        "Soma dos valores das receitas que atendem aos filtros, como declarados pelas campanhas. Inclui doações em bens e serviços (estimáveis).",
      )}
    >
      {brlc(res.receitas.value)}
    </Source>
  );
  const exp = (
    <Source info={src("despesas_contratadas", "Soma dos valores das despesas que atendem aos filtros, como declarados pelas campanhas, pagas ou não.")}>
      {brlc(res.despesas.value)}
    </Source>
  );
  const n = (v: number, one: string, many: string) => `${num(v)} ${v === 1 ? one : many}`;
  const big = "font-serif text-[30px] font-medium leading-tight text-ink";

  if (res.receitas.n > 0 && res.despesas.n > 0) {
    return (
      <p className="text-[17px] leading-relaxed text-ink-2">
        <span className={`${big} block`}>{n(res.total, "transação", "transações")}</span>
        {n(res.receitas.n, "receita", "receitas")}, somando <span className="num text-ink">{rev}</span>, e {n(res.despesas.n, "despesa", "despesas")}, somando{" "}
        <span className="num text-ink">{exp}</span>.
      </p>
    );
  }
  if (res.receitas.n > 0) {
    return (
      <p className="text-[17px] leading-relaxed text-ink-2">
        <span className={`${big} block`}>{n(res.receitas.n, "receita", "receitas")}</span>
        somando <span className="num text-ink">{rev}</span>.
      </p>
    );
  }
  if (res.despesas.n > 0) {
    return (
      <p className="text-[17px] leading-relaxed text-ink-2">
        <span className={`${big} block`}>{n(res.despesas.n, "despesa", "despesas")}</span>
        somando <span className="num text-ink">{exp}</span>.
      </p>
    );
  }
  return <p className={big}>Nenhuma transação</p>;
}

/** What stands out in the filtered set, in one or two sentences, each part a link into it. */
async function Highlights({ f, res }: { f: TxFilters; res: TxResult }) {
  if (res.total < 2) return null;
  const h = await getTransactionHighlights(f);
  if (!h || !h.largest) return null;
  const L = h.largest;
  const rev = L.tipo === "receita";
  const supplier = h.top.find((t) => t.tipo === "despesa");
  const donor = h.top.find((t) => t.tipo === "receita");
  const sideTotal = (tipo: "receita" | "despesa") => (tipo === "receita" ? res.receitas.value : res.despesas.value);
  // Main category of the side with more money.
  const side: "receita" | "despesa" = res.despesas.value >= res.receitas.value ? "despesa" : "receita";
  const catTotals = new Map<string, number>();
  for (const c of h.cats.filter((c) => c.tipo === side)) {
    const k = side === "receita" ? fundingGroupOf(c.cat ?? "") : (c.cat ?? "outros");
    catTotals.set(k, (catTotals.get(k) ?? 0) + c.value);
  }
  const mainCat = [...catTotals.entries()].sort((a, b) => b[1] - a[1])[0];
  const catLabel = mainCat ? (side === "receita" ? FUNDING_GROUPS.find((g) => g.key === mainCat[0])?.label : EXPENSE_GROUPS[mainCat[0]]?.label) : null;
  const cpLink = (t: NonNullable<typeof supplier>) => {
    const href = counterpartHref(t, t.tipo === "receita" ? "doador" : "fornecedor", f.year);
    const name = titleName(t.name) || "sem identificação";
    return href ? (
      <Link href={href} className="link text-ink">
        {name}
      </Link>
    ) : (
      <span className="text-ink">{name}</span>
    );
  };

  return (
    <div className="mt-4 max-w-[68ch] space-y-2 text-[15.5px] leading-relaxed text-ink-2">
      <p>
        A maior foi {rev ? "uma receita" : "uma despesa"} de{" "}
        <Link href={txHref({ year: f.year, tipo: L.tipo, sq: L.sq, ordem: "valor_desc", pagina: 1 })} className="num text-ink underline decoration-transparent underline-offset-[3px] hover:decoration-accent">
          {brlc(L.value)}
        </Link>
        {L.date ? <> em {date(L.date)}</> : null}
        {!f.candidato && L.ballot_name && (
          <>
            {rev ? ", para " : ", da campanha de "}
            <Link href={`/candidatos/${L.year}/${L.candidate_id}`} className="link text-ink">
              {titleName(L.ballot_name)}
            </Link>
          </>
        )}
        {L.name && (
          <>
            {rev ? ", vinda de " : ", paga a "}
            <span className="text-ink">{titleName(L.name)}</span>
          </>
        )}
        {L.description && <> ({L.description.length > 90 ? `${L.description.slice(0, 88).trim()}…` : L.description.toLowerCase()})</>}.
      </p>
      {(supplier || donor || catLabel) && (
        <p>
          {supplier && !f.contraparte && (
            <>
              Quem mais recebeu foi {cpLink(supplier)} (<span className="num text-ink">{brlc(supplier.value)}</span>, {pct(sideTotal("despesa") ? supplier.value / sideTotal("despesa") : 0)} das despesas).{" "}
            </>
          )}
          {donor && !f.contraparte && (
            <>
              Quem mais {donor.kind === "partido" ? "repassou" : "doou"} foi {cpLink(donor)} (<span className="num text-ink">{brlc(donor.value)}</span>).{" "}
            </>
          )}
          {catLabel && mainCat && !f.grupo && !f.categoria && !f.categoria_tse && (
            <>
              {side === "despesa" ? "O principal destino foi " : "A principal origem foi "}
              <Link href={txHref(f, { tipo: side, grupo: mainCat[0], pagina: null })} className="link text-ink" scroll={false}>
                {inSentence(catLabel)}
              </Link>{" "}
              ({pct(sideTotal(side) ? mainCat[1] / sideTotal(side) : 0)}).{" "}
            </>
          )}
          {!f.candidato && h.n_campaigns > 1 && <>As transações são de {num(h.n_campaigns)} campanhas.</>}
        </p>
      )}
    </div>
  );
}

function EmptyState({ f, res, sides }: { f: TxFilters; res: TxResult; sides: { receita: boolean; despesa: boolean } }) {
  if (res.total > 0 && res.page > res.pages) {
    return (
      <Empty>
        Esta página não existe: os filtros atuais têm {num(res.pages)} {res.pages === 1 ? "página" : "páginas"}.{" "}
        <Link className="link text-ink" href={txHref(f, { pagina: res.pages > 1 ? res.pages : null })}>
          Ir para a última página
        </Link>
        .
      </Empty>
    );
  }
  if (!sides.receita && !sides.despesa) {
    return (
      <Empty>
        Os filtros escolhidos não podem ser combinados: um deles vale só para receitas e outro só para despesas. Remova um dos filtros de categoria acima.
      </Empty>
    );
  }
  if (f.q && textWords(f.q).length === 0) {
    return (
      <Empty>
        <p className="font-medium text-ink">Não há o que buscar em “{f.q}”.</p>
        <p className="mt-2">
          A busca por texto ignora números com seis ou mais dígitos, como CPFs, e termos de uma letra só. Para encontrar uma pessoa ou empresa, busque pelo nome
          ou use o campo Doador ou fornecedor; para encontrar uma transação pelo número do TSE, abra os detalhes de uma linha.
        </p>
      </Empty>
    );
  }
  const narrowing = [
    f.q && "a busca por texto",
    (f.de || f.ate) && "o intervalo de datas",
    (f.min != null || f.max != null) && "a faixa de valores",
    f.partido && "o partido",
    f.uf && "o estado",
    f.cargo && "o cargo",
  ].filter(Boolean) as string[];
  return (
    <Empty>
      <p className="font-medium text-ink">Nenhuma transação encontrada com esses filtros.</p>
      <p className="mt-2">
        Tente remover um filtro clicando no × ao lado dele
        {narrowing.length
          ? `, ou ampliar ${narrowing.length > 1 ? `${narrowing.slice(0, -1).join(", ")} ou ${narrowing[narrowing.length - 1]}` : narrowing[0]}`
          : ""}
        . A busca por texto procura palavras inteiras ou partes delas no nome de quem doou ou recebeu e na descrição, sem diferenciar acentos.
        {f.year === 2026 && " Em 2026, as campanhas ainda estão entregando suas prestações: transações recentes podem não ter sido publicadas."}
      </p>
      {(f.candidato || f.tipo || f.sq) && (
        <p className="mt-2">
          <Link className="link text-ink" href={txHref({ year: f.year, ordem: "valor_desc", pagina: 1, candidato: f.candidato })}>
            {f.candidato ? "Ver todas as transações desta candidatura" : `Ver todas as transações de ${f.year}`}
          </Link>
        </p>
      )}
    </Empty>
  );
}
