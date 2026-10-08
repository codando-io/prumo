import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, Suspense } from "react";
import { Container, ResultChip } from "@/components/ui/primitives";
import { Caption, EmptyNote, Fig, PageHeader, SourceLine } from "@/components/ui/editorial";
import { StackBar } from "@/components/charts/BarList";
import { FUNDING_TONE } from "@/components/money/AggregateMoney";
import { CandidatePicker } from "@/components/compare/CandidatePicker";
import { getMany } from "@/lib/queries/candidates";
import { compareHistory, compareSuggestions } from "@/lib/queries/compare";
import { EXPENSE_GROUPS, FUNDING_GROUPS, UF_NAMES } from "@/lib/labels";
import { brl, brlUnit, brlc, num, pct, titleName } from "@/lib/format";
import { dataset } from "@/lib/provenance";

export const metadata: Metadata = {
  title: "Comparar candidaturas",
  description: "Compare lado a lado dados objetivos de campanhas: votos, receitas, despesas, doadores, fornecedores e bens declarados.",
};

const CRUMBS = [{ label: "Explorar" }, { label: "Candidaturas", href: "/candidatos" }, { label: "Comparar" }];
const INTRO = "Até seis campanhas lado a lado, com os números que elas declararam ao TSE. A comparação é descritiva: não dá nota nem indica quem foi “melhor” ou “pior”.";
const MAX = 6;

export default function ComparePage({ searchParams }: PageProps<"/comparar">) {
  return (
    <Container className="pb-8">
      <Suspense fallback={<CompareLoading />}>
        <Comparison searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

function CompareLoading() {
  return (
    <div aria-busy="true">
      <PageHeader crumbs={CRUMBS} title="Comparar candidaturas" lede={INTRO} />
      <p className="mt-10 text-[15px] text-muted">Carregando a comparação…</p>
    </div>
  );
}

type Row = Record<string, unknown> & { year: number; id: string };

const v = (r: Row, k: string) => (typeof r[k] === "number" ? (r[k] as number) : null);
const s = (r: Row, k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");
const key = (r: Row) => `${r.year}-${r.id}`;

/** "a presidente em 2022" / "a governador por São Paulo em 2022 e 2026" — null when offices or states differ. */
function commonScope(rows: Row[]) {
  const offices = new Set(rows.map((r) => s(r, "office")));
  const ufs = new Set(rows.map((r) => s(r, "uf")));
  if (offices.size > 1 || ufs.size > 1) return null;
  const uf = s(rows[0], "uf");
  const years = [...new Set(rows.map((r) => r.year))].sort();
  const when = years.length === 1 ? `em ${years[0]}` : `em ${years.slice(0, -1).join(", ")} e ${years[years.length - 1]}`;
  return { text: `a ${s(rows[0], "office").toLowerCase()}${uf !== "BR" ? ` por ${UF_NAMES[uf] ?? uf}` : ""} ${when}`, years: years.length };
}

async function Comparison({ searchParams }: { searchParams: PageProps<"/comparar">["searchParams"] }) {
  const sp = await searchParams;
  const raw = ([] as string[]).concat(sp.c ?? []).flatMap((x) => x.split(","));
  const keys = [...new Set(raw.map((x) => x.trim()))]
    .map((x) => x.match(/^(\d{4})-(\d{5,14})$/))
    .filter(Boolean)
    .slice(0, MAX)
    .map((m) => ({ year: Number(m![1]), id: m![2] }));
  const found = await getMany(keys);
  const rows = keys.map((k) => found.find((r) => r.year === k.year && r.id === k.id)).filter(Boolean) as Row[];
  const current = rows.map(key);

  if (!rows.length) {
    const suggestions = await compareSuggestions();
    return (
      <>
        <PageHeader crumbs={CRUMBS} title="Comparar candidaturas" lede={INTRO} />
        <div className="mt-8">
          <CandidatePicker current={[]} />
        </div>
        <div className="mt-8">
          <EmptyNote>
            {keys.length ? "As candidaturas do endereço não foram encontradas. " : "Nenhuma candidatura selecionada. "}
            Busque pelo nome acima, use “Comparar com outras candidaturas” na página de uma candidatura, ou marque candidaturas na{" "}
            <Link className="link text-ink" href="/candidatos">
              lista de candidaturas
            </Link>
            .
          </EmptyNote>
        </div>
        {suggestions.length > 0 && (
          <nav aria-labelledby="sugestoes" className="mt-12 max-w-[620px]">
            <h2 id="sugestoes" className="text-[15px] font-semibold text-ink">
              Para começar
            </h2>
            <ul className="mt-2 border-t border-rule">
              {suggestions.map((x) => (
                <li key={x.keys.join(",")} className="border-b border-rule">
                  <Link href={`/comparar?c=${x.keys.join(",")}`} className="group block py-2.5 no-underline">
                    <span className="block text-[16px] font-medium text-ink group-hover:underline group-hover:decoration-accent group-hover:underline-offset-[3px]">
                      {x.names.map(titleName).join(" e ")}
                      {x.label ? ` ${x.label}` : ""}
                    </span>
                    <span className="block text-[14px] text-ink-2">{x.context}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </>
    );
  }

  const history = await compareHistory([...new Set(rows.map((r) => s(r, "person_id")).filter(Boolean))]);
  const scope = commonScope(rows);
  const n = rows.length;
  const without = (k: string) => {
    const rest = current.filter((c) => c !== k);
    return rest.length ? `/comparar?c=${rest.join(",")}` : "/comparar";
  };
  // One scale for every money bar, so revenue and spending read against each other across columns.
  const scale = Math.max(1, ...rows.flatMap((r) => [v(r, "revenue") ?? 0, v(r, "expense") ?? 0]));

  const lede =
    n === 1 ? (
      <>
        Uma candidatura escolhida: {titleName(s(rows[0], "ballot_name"))}. Adicione outras pelo nome para ver os números lado a lado.
      </>
    ) : (
      <>
        Comparando <Fig>{num(n)}</Fig> candidaturas {scope ? scope.text : "de cargos ou estados diferentes"}.{" "}
        {!scope
          ? "Valores absolutos refletem, sobretudo, o tamanho do eleitorado e do cargo; as linhas por voto ajudam a comparar escalas diferentes."
          : scope.years > 1
            ? "Valores em reais da época, sem correção pela inflação."
            : "A comparação é descritiva: não dá nota nem indica quem foi “melhor” ou “pior”."}
      </>
    );

  const noFinance = <span className="text-muted">sem prestação de contas</span>;
  const money = (r: Row, k: string) => (r.has_finance ? <span title={brl(v(r, k))}>{brlc(v(r, k))}</span> : noFinance);
  const fin = (r: Row, node: React.ReactNode) => (r.has_finance ? node : <span className="text-muted">—</span>);

  const groups: { title: string; note?: string; lines: { label: string; help?: string; render: (r: Row) => React.ReactNode }[] }[] = [
    {
      title: "Eleição",
      lines: [
        { label: "Resultado", render: (r) => <ResultChip result={(r.result as string | null) ?? null} year={r.year} registration={(r.registration_status as string | null) ?? null} /> },
        { label: "Votos", help: "último turno disputado", render: (r) => <span className="text-ink">{num(v(r, "votes"))}</span> },
      ],
    },
    {
      title: "Dinheiro que entrou",
      lines: [
        {
          label: "Receitas",
          render: (r) =>
            r.has_finance ? (
              <>
                <span className="font-medium text-ink" title={brl(v(r, "revenue"))}>
                  {brlc(v(r, "revenue"))}
                </span>
                <MoneyStrip
                  total={v(r, "revenue") ?? 0}
                  scale={scale}
                  parts={FUNDING_GROUPS.map((g) => ({
                    key: g.key,
                    label: g.label,
                    color: `var(--${FUNDING_TONE[g.key]})`,
                    value: g.key === "outras" ? (v(r, "rev_candidatos") ?? 0) + (v(r, "rev_nao_identificada") ?? 0) + (v(r, "rev_outros") ?? 0) : (v(r, `rev_${g.key}`) ?? 0),
                  }))}
                  coarse={[
                    { key: "public", label: "Dinheiro público", color: "var(--public)", value: v(r, "revenue_public") ?? 0 },
                    { key: "private", label: "Dinheiro privado", color: "var(--private)", value: v(r, "revenue_private") ?? 0 },
                  ]}
                />
              </>
            ) : (
              noFinance
            ),
        },
        { label: "Dinheiro público", help: "Fundo Eleitoral e Fundo Partidário", render: (r) => money(r, "revenue_public") },
        { label: "Dinheiro privado", help: "pessoas, recursos próprios, partido e outros", render: (r) => money(r, "revenue_private") },
        { label: "Parcela pública", render: (r) => fin(r, <span className="text-ink">{v(r, "public_share") != null ? pct(v(r, "public_share")) : "—"}</span>) },
        { label: "Doadores", render: (r) => fin(r, num(v(r, "n_donors"))) },
        { label: "Doação média", help: "pessoas físicas", render: (r) => fin(r, brl(v(r, "pf_avg"))) },
        { label: "Maior doação", help: "pessoa física", render: (r) => fin(r, <span title={brl(v(r, "pf_max"))}>{brlc(v(r, "pf_max"))}</span>) },
      ],
    },
    {
      title: "Dinheiro que saiu",
      lines: [
        {
          label: "Despesas",
          render: (r) => {
            if (!r.has_finance) return noFinance;
            const parts = Object.entries(EXPENSE_GROUPS)
              .map(([k, g]) => ({ key: k, label: g.label, value: v(r, `exp_${k}`) ?? 0, color: "var(--spend)" }))
              .sort((a, b) => b.value - a.value);
            return (
              <>
                <span className="font-medium text-ink" title={brl(v(r, "expense"))}>
                  {brlc(v(r, "expense"))}
                </span>
                <MoneyStrip total={v(r, "expense") ?? 0} scale={scale} parts={parts} coarse={[{ key: "spend", label: "Despesas", color: "var(--spend)", value: v(r, "expense") ?? 0 }]} />
              </>
            );
          },
        },
        {
          label: "Maiores destinos",
          render: (r) => {
            const total = v(r, "expense") ?? 0;
            const top = Object.entries(EXPENSE_GROUPS)
              .map(([k, g]) => ({ k, label: g.label, value: v(r, `exp_${k}`) ?? 0 }))
              .filter((x) => x.value > 0)
              .sort((a, b) => b.value - a.value)
              .slice(0, 3);
            if (!r.has_finance || !top.length) return <span className="text-muted">—</span>;
            return (
              <ul className="space-y-1">
                {top.map((x) => (
                  <li key={x.k} className="leading-snug">
                    <Link href={`/transacoes?ano=${r.year}&candidato=${r.id}&tipo=despesa&grupo=${x.k}`} className="action">
                      {x.label}
                    </Link>
                    <span className="block text-[13.5px] text-muted">
                      <span className="text-ink-2">{brlc(x.value)}</span>, {pct(total ? x.value / total : 0)}
                    </span>
                  </li>
                ))}
              </ul>
            );
          },
        },
        { label: "Fornecedores", render: (r) => fin(r, num(v(r, "n_suppliers"))) },
        {
          label: "Maior fornecedor",
          render: (r) =>
            r.top_supplier_key ? (
              <>
                <Link className="link text-ink" href={`/fornecedores/${r.top_supplier_key}?ano=${r.year}`}>
                  {titleName(s(r, "top_supplier_name"))}
                </Link>
                <span className="block text-[13.5px] text-muted">
                  {brlc(v(r, "top_supplier_value"))}, {pct(v(r, "top_supplier_share") ?? 0)} das despesas
                </span>
              </>
            ) : (
              <span className="text-muted">—</span>
            ),
        },
      ],
    },
    {
      title: "Por voto",
      note: "Valores de campanha divididos pelos votos do último turno disputado.",
      lines: [
        { label: "Despesas por voto", render: (r) => <span className="text-ink">{brlUnit(v(r, "expense_per_vote"))}</span> },
        { label: "Receitas por voto", render: (r) => brlUnit(v(r, "revenue_per_vote")) },
        { label: "Dinheiro público por voto", render: (r) => brlUnit(v(r, "public_per_vote")) },
        { label: "Dinheiro privado por voto", render: (r) => brlUnit(v(r, "private_per_vote")) },
      ],
    },
    {
      title: "Patrimônio e outras eleições",
      lines: [
        { label: "Bens declarados", help: "patrimônio pessoal, não é dinheiro de campanha", render: (r) => <span title={brl(v(r, "assets"))}>{brlc(v(r, "assets"))}</span> },
        {
          label: "Outras eleições",
          help: "despesas declaradas, 2018–2026",
          render: (r) => {
            const h = history.filter((x) => x.person_id === r.person_id && x.year !== r.year);
            if (!h.length) return <span className="text-muted">nenhuma</span>;
            return (
              <ul className="space-y-1">
                {h.map((x) => (
                  <li key={`${x.year}-${x.id}`} className="leading-snug">
                    <Link href={`/candidatos/${x.year}/${x.id}`} className="action">
                      <span className="tnum">{x.year}</span>, {x.office}
                      {x.uf !== "BR" ? ` (${x.uf})` : ""}
                    </Link>
                    <span className="block text-[13.5px] text-muted">{x.has_finance ? brlc(x.expense) : "sem prestação de contas"}</span>
                  </li>
                ))}
              </ul>
            );
          },
        },
      ],
    },
  ];

  return (
    <>
      <PageHeader crumbs={CRUMBS} title="Comparar candidaturas" lede={lede} />
      <div className="mt-8">
        <CandidatePicker current={current} />
      </div>

      {/* Phones: each measure's label sits on its own line above the values, so the columns get the full width. */}
      <div className="-mx-4 mt-6 overflow-x-auto px-4 sm:mx-0 sm:mt-10 sm:px-0 lg:overflow-visible">
        <table
          className="dt tnum min-w-[calc(var(--cols)*128px)] sm:min-w-[calc(200px+var(--cols)*168px)] lg:max-w-[calc(220px+var(--cols)*280px)]"
          style={{ "--cols": n } as React.CSSProperties}
        >
          <caption className="sr-only">Comparação de {num(n)} candidaturas</caption>
          <thead>
            <tr>
              <th scope="col" className="hidden w-[200px] sm:table-cell">
                <span className="sr-only">Medida</span>
              </th>
              {rows.map((r, i) => {
                const name = titleName(s(r, "ballot_name"));
                return (
                  <th key={key(r)} scope="col" className={`whitespace-normal align-bottom ${i === 0 ? "max-sm:pl-0" : ""}`}>
                    <Link href={`/candidatos/${r.year}/${r.id}`} className="block text-[15.5px] font-medium leading-snug text-ink no-underline hover:underline hover:decoration-accent hover:underline-offset-[3px]">
                      {name}
                    </Link>
                    <span className="mt-0.5 block text-[13.5px] font-normal leading-snug text-ink-2">
                      {s(r, "office")}
                      {r.uf !== "BR" ? ` (${r.uf})` : ""}, {s(r, "party")}, {r.year}
                    </span>
                    <Link href={without(key(r))} scroll={false} className="action mt-1 inline-block text-[13.5px] font-normal" aria-label={`Remover ${name} da comparação`}>
                      Remover
                    </Link>
                  </th>
                );
              })}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.title}>
              <tr>
                <th scope="colgroup" colSpan={n + 1} className="border-rule-strong bg-transparent pb-2 pt-9 text-[15px] font-semibold text-ink">
                  {g.title}
                  {g.note && <span className="ml-2 text-[13.5px] font-normal text-muted">{g.note}</span>}
                </th>
              </tr>
              {g.lines.map((l) => (
                <Fragment key={l.label}>
                  <tr className="sm:hidden">
                    <td colSpan={n} className="border-b-0 pb-0 pt-3 text-[13.5px] text-muted">
                      {l.label}
                      {l.help && <>, {l.help}</>}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" className="hidden text-ink-2 sm:table-cell">
                      {l.label}
                      {l.help && <span className="block text-[13px] leading-snug text-muted">{l.help}</span>}
                    </th>
                    {rows.map((r, i) => (
                      <td key={key(r)} className={`text-ink-2 max-sm:pt-1 ${i === 0 ? "max-sm:pl-0" : ""}`}>
                        {l.render(r)}
                      </td>
                    ))}
                  </tr>
                </Fragment>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <div className="mt-8">
        <SourceLine
          label="TSE, candidaturas, prestações de contas e bens declarados"
          info={{ kind: "oficial", what: "Registro de candidaturas, votação, prestações de contas e bens declarados, como publicados no Portal de Dados Abertos do TSE.", dataset: dataset("receitas", rows[0].year) }}
          links={current.length === 1 ? [{ label: "Ver as transações", href: `/transacoes?ano=${rows[0].year}&candidato=${rows[0].id}` }] : []}
        />
        <Caption>
          Métricas por voto dividem valores de campanha pelos votos do último turno disputado e não estabelecem relação de causa entre dinheiro e resultado. As
          barras usam a mesma escala em todas as colunas: azul é dinheiro público, laranja é privado, cinza é o que foi gasto.
        </Caption>
      </div>
    </>
  );
}

type StripPart = { key: string; label: string; value: number; color: string };

/**
 * A thin money bar on the comparison's shared scale. Short bars drop their breakdown (to public /
 * private, then to one mark) so a small campaign reads as one clean line, not a row of slivers.
 */
function MoneyStrip({ total, scale, parts, coarse }: { total: number; scale: number; parts: StripPart[]; coarse: StripPart[] }) {
  if (total <= 0) return null;
  const ratio = Math.min(1, total / scale);
  const px = ratio * 200;
  const main = [...coarse].sort((a, b) => b.value - a.value)[0];
  const shown = px >= 90 ? parts : px >= 24 ? coarse : [{ ...main, label: "Total", value: total }];
  return (
    <div className="mt-1.5 w-full max-w-[200px]">
      <div style={{ width: `${Math.max(1.5, ratio * 100)}%` }}>
        <StackBar height={6} parts={shown} />
      </div>
    </div>
  );
}
