import Link from "next/link";
import { Section, Caption, EmptyNote } from "@/components/ui/editorial";
import { ResultChip } from "@/components/ui/primitives";
import { getHistory, getHistoryTop, type CandidateSummary } from "@/lib/queries/candidate";
import { brlc, num, pct, titleName } from "@/lib/format";

export async function HistorySection({ c }: { c: CandidateSummary }) {
  const history = (await getHistory(c.person_id, c.year, c.id)).filter((h) => !h.is_running_mate || h.id === c.id);
  const tops = c.person_id && history.length > 1 ? await getHistoryTop(c.person_id) : { donors: [], suppliers: [] };
  const name = titleName(c.ballot_name);

  if (history.length <= 1) {
    return (
      <Section id="historico" question="E nas outras eleições?">
        <EmptyNote>
          Não encontramos outra candidatura de {name} nas eleições gerais de 2018, 2022 e 2026. As candidaturas são ligadas pelo CPF informado ao TSE, que não é exibido.
        </EmptyNote>
      </Section>
    );
  }

  const maxMoney = Math.max(...history.map((h) => Math.max(h.revenue, h.expense)), 1);
  const maxAssets = Math.max(...history.map((h) => h.assets), 1);
  type H = (typeof history)[number];
  const rows: { label: string; render: (h: H) => React.ReactNode }[] = [
    { label: "Cargo", render: (h) => `${h.office}${h.uf !== "BR" ? ` (${h.uf})` : ""}` },
    { label: "Partido", render: (h) => h.party },
    { label: "Resultado", render: (h) => <ResultChip result={h.result} year={h.year} registration={h.registration_status} /> },
    { label: "Votos", render: (h) => <span className="tnum">{num(h.votes)}</span> },
    {
      label: "Receitas",
      render: (h) =>
        h.has_finance ? (
          <MoneyBar v={h.revenue} max={maxMoney} parts={[{ v: h.revenue_public, color: "var(--public)" }, { v: h.revenue - h.revenue_public, color: "var(--private)" }]} />
        ) : (
          <span className="text-muted">sem prestação</span>
        ),
    },
    {
      label: "Despesas",
      render: (h) => (h.has_finance ? <MoneyBar v={h.expense} max={maxMoney} parts={[{ v: h.expense, color: "var(--spend)" }]} /> : <span className="text-muted">—</span>),
    },
    {
      label: "Público e privado",
      render: (h) =>
        h.has_finance && h.revenue > 0 ? (
          <span className="tnum text-ink-2">
            {pct(h.revenue_public / h.revenue)} público, {pct(h.revenue_private / h.revenue)} privado
          </span>
        ) : (
          "—"
        ),
    },
    { label: "Maiores doadores", render: (h) => <TopList items={tops.donors.filter((d) => d.year === h.year)} hrefBase="/doadores" year={h.year} /> },
    { label: "Maiores fornecedores", render: (h) => <TopList items={tops.suppliers.filter((d) => d.year === h.year)} hrefBase="/fornecedores" year={h.year} /> },
  ];

  const sorted = [...history].sort((a, b) => a.year - b.year);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const withMoney = sorted.filter((h) => h.has_finance);

  return (
    <Section
      id="historico"
      question="E nas outras eleições?"
      lede={
        <>
          {name} disputou {history.length} eleições gerais entre {first.year} e {last.year}
          {withMoney.length >= 2 && (
            <>
              . As receitas foram de {brlc(withMoney[0].revenue)} em {withMoney[0].year} a {brlc(withMoney[withMoney.length - 1].revenue)} em {withMoney[withMoney.length - 1].year}
            </>
          )}
          . O patrimônio declarado aparece à parte: não é dinheiro de campanha.
        </>
      }
    >
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[640px] border-collapse text-[14.5px]">
          <thead>
            <tr className="border-b border-rule-strong">
              <th scope="col" className="w-[170px] pb-2 text-left text-[13.5px] font-normal text-muted">
                Eleição
              </th>
              {history.map((h) => (
                <th key={h.year} scope="col" className="pb-2 text-left">
                  {h.id === c.id && h.year === c.year ? (
                    <span className="tnum font-serif text-[22px] font-medium text-ink">{h.year}</span>
                  ) : (
                    <Link href={`/candidatos/${h.year}/${h.id}`} className="link tnum font-serif text-[22px] font-medium">
                      {h.year}
                    </Link>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-rule align-top">
                <th scope="row" className="py-2.5 pr-4 text-left text-[13.5px] font-normal text-muted">
                  {r.label}
                </th>
                {history.map((h) => (
                  <td key={h.year} className="py-2.5 pr-6">
                    {r.render(h)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="align-top">
              <th scope="row" className="pb-2.5 pr-4 pt-6 text-left text-[13.5px] font-normal text-muted">
                Bens declarados
                <span className="block text-[13px]">patrimônio pessoal</span>
              </th>
              {history.map((h) => (
                <td key={h.year} className="pb-2.5 pr-6 pt-6">
                  <MoneyBar v={h.assets} max={maxAssets} parts={[{ v: h.assets, color: "var(--muted)" }]} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <Caption>
        Candidaturas ligadas pelo mesmo CPF nos registros do TSE. Nas receitas, azul é dinheiro público e laranja, privado. Bens são declarados pelo próprio candidato, em
        geral pelo valor de aquisição, e não pelo valor de mercado; variações não indicam, por si só, enriquecimento ou irregularidade.
      </Caption>
    </Section>
  );
}

function MoneyBar({ v, max, parts }: { v: number; max: number; parts: { v: number; color: string }[] }) {
  const w = Math.max(1, (v / max) * 100);
  return (
    <div className="min-w-[120px]">
      <div className="tnum font-medium text-ink">{brlc(v)}</div>
      <div className="mt-1 flex h-[5px] w-full max-w-[160px] gap-[2px]" aria-hidden="true">
        <div className="flex h-full gap-[2px]" style={{ width: `${w}%` }}>
          {parts
            .filter((p) => p.v > 0)
            .map((p, i) => (
              <div key={i} className="h-full first:rounded-l-[1px] last:rounded-r-[3px]" style={{ flexGrow: p.v, flexBasis: 0, background: p.color }} />
            ))}
        </div>
      </div>
    </div>
  );
}

function TopList({ items, hrefBase, year }: { items: { key: string; name: string; value: number }[]; hrefBase: string; year: number }) {
  if (!items.length) return <span className="text-muted">—</span>;
  return (
    <ol className="space-y-1 text-[13.5px]">
      {items.map((i) => (
        <li key={i.key} className="leading-snug">
          <Link className="link text-ink" href={`${hrefBase}/${i.key}?ano=${year}`}>
            {titleName(i.name)}
          </Link>{" "}
          <span className="tnum text-muted">{brlc(i.value)}</span>
        </li>
      ))}
    </ol>
  );
}
