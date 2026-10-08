import Link from "next/link";
import { Fig, Section, SourceLine } from "@/components/ui/editorial";
import { AggregateMoney } from "@/components/money/AggregateMoney";
import { calculation, officialSum } from "@/components/geo/sources";
import { counterpartCounts, donorsByGroup, expenseByGroup, revenueByCategory, suppliersByGroup, totals, type DashFilters } from "@/lib/queries/dashboard";
import { getPartyExpenseByCategory } from "@/lib/queries/parties";
import { EXPENSE_GROUPS, FUNDING_GROUPS, REVENUE_CATEGORY, fundingGroupOf } from "@/lib/labels";
import { brlc, dateLong, num, numc, pct } from "@/lib/format";

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Private funding groups, as they read after "a maior parcela veio de". */
const PRIVATE_SOURCE: Record<string, string> = {
  pf: "doações de pessoas físicas",
  partido: "recursos privados repassados pelo partido",
  proprios: "recursos dos próprios candidatos",
  coletivo: "financiamento coletivo",
  outras: "outras fontes",
};

/** Money in and money out of all the party's campaigns, with the official categories one click away. */
export async function MoneySection({ year, party, generatedAt }: { year: number; party: string; generatedAt: string | null }) {
  const f: DashFilters = { year, party };
  const [t, counts, rev, exp, donors, suppliers, expCats] = await Promise.all([
    totals(f),
    counterpartCounts(f),
    revenueByCategory(f),
    expenseByGroup(f),
    donorsByGroup(f, 5),
    suppliersByGroup(f, 5),
    getPartyExpenseByCategory(year, party),
  ]);
  if (!t) return null;

  const q = new URLSearchParams({ ano: String(year), partido: party }).toString();
  const tx = `/transacoes?${q}`;
  const gen = t.generated_at ?? generatedAt;

  // The largest private source and the largest spending group, for the sentence that opens the section.
  const byGroup = new Map<string, number>();
  for (const r of rev) byGroup.set(fundingGroupOf(r.category), (byGroup.get(fundingGroupOf(r.category)) ?? 0) + r.value);
  const topPrivate = FUNDING_GROUPS.filter((g) => !g.public)
    .map((g) => ({ label: PRIVATE_SOURCE[g.key] ?? lowerFirst(g.label), value: byGroup.get(g.key) ?? 0 }))
    .sort((a, b) => b.value - a.value)[0];
  const topSpend = exp[0];
  const revRows = rev.filter((r) => r.value > 0);
  const expRows = expCats.filter((r) => r.value > 0);

  return (
    <Section
      id="dinheiro"
      question="De onde veio e para onde foi o dinheiro das campanhas?"
      lede={
        <>
          {topPrivate && topPrivate.value > 0 && (
            <>
              Entre os recursos privados, a maior parcela veio de {topPrivate.label} (<Fig>{brlc(topPrivate.value)}</Fig>
              {t.revenue_private > 0 ? `, ${pct(topPrivate.value / t.revenue_private)} do dinheiro privado` : ""}).{" "}
            </>
          )}
          {topSpend && t.expense > 0 && (
            <>
              O maior grupo de despesas foi {lowerFirst(EXPENSE_GROUPS[topSpend.category_group]?.label ?? topSpend.category_group)}, com{" "}
              <Fig>{pct(topSpend.value / t.expense)}</Fig> do total.{" "}
            </>
          )}
          {t.median_expense != null && (
            <>
              Uma campanha típica do {party} gastou{" "}
              <Fig info={calculation("despesas_contratadas", year, gen, "Mediana das despesas entre as campanhas do partido com prestação publicada. A média é puxada para cima pelas campanhas maiores.")}>
                {brlc(t.median_expense)}
              </Fig>
              .
            </>
          )}
        </>
      }
      source={
        <SourceLine
          label={`TSE, prestações das candidaturas publicadas até ${dateLong(gen?.slice(0, 10))}`}
          info={officialSum("receitas", year, gen, "Receitas e despesas declaradas pelas campanhas do partido, como publicadas no Portal de Dados Abertos do TSE.")}
          links={[
            { label: "Ver as transações", href: tx },
            { label: "Baixar CSV", href: `/api/transacoes?${q}&formato=csv` },
          ]}
        />
      }
    >
      <AggregateMoney
        year={year}
        txQuery={q}
        revenue={t.revenue}
        expense={t.expense}
        revenuePublic={t.revenue_public}
        revenuePrivate={t.revenue_private}
        revenueEstimable={t.revenue_estimable}
        revCats={rev}
        expGroups={exp}
        donors={donors}
        suppliers={suppliers}
        inSummary={
          <>
            {numc(counts.donors)} {counts.donors === 1 ? "doador" : "doadores"}, entre eles {numc(counts.donorsPf)} pessoas físicas.
          </>
        }
        outSummary={
          <>
            {numc(t.n_expense_tx)} despesas com {numc(counts.suppliers)} fornecedores; {brlc(t.paid)} já pagos.
          </>
        }
      />

      {(revRows.length > 0 || expRows.length > 0) && (
        <details className="mt-12 border-t border-rule pt-4">
          <summary className="action cursor-pointer list-none text-[14.5px] [&::-webkit-details-marker]:hidden">
            Ver as categorias oficiais do TSE ({num(revRows.length)} de receita, {num(expRows.length)} de despesa)
          </summary>
          <div className="mt-6 grid gap-x-16 gap-y-12 lg:grid-cols-2">
            <div>
              <h3 className="text-[15px] font-semibold text-ink">Receitas</h3>
              <table className="dt mt-3">
                <thead>
                  <tr>
                    <th scope="col">Categoria</th>
                    <th scope="col" className="n hidden sm:table-cell">
                      Registros
                    </th>
                    <th scope="col" className="n">
                      Valor
                    </th>
                    <th scope="col" className="n">
                      Da receita
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {revRows.map((r) => {
                    const meta = REVENUE_CATEGORY[r.category];
                    return (
                      <tr key={r.category}>
                        <td>
                          <Link href={`${tx}&tipo=receita&categoria=${r.category}`} className="e no-underline hover:underline">
                            {meta?.label ?? r.category}
                          </Link>
                          {meta?.help && <div className="s text-[13.5px] leading-snug">{meta.help}</div>}
                        </td>
                        <td className="n s hidden sm:table-cell">{num(r.n)}</td>
                        <td className="n text-ink">{brlc(r.value)}</td>
                        <td className="n s">{pct(t.revenue ? r.value / t.revenue : 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-ink">Despesas</h3>
              <table className="dt mt-3">
                <thead>
                  <tr>
                    <th scope="col">Categoria do TSE</th>
                    <th scope="col" className="n hidden sm:table-cell">
                      Registros
                    </th>
                    <th scope="col" className="n">
                      Valor
                    </th>
                    <th scope="col" className="n">
                      Das despesas
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {expRows.map((r) => (
                    <tr key={`${r.category_group}-${r.category}`}>
                      <td>
                        <Link href={`${tx}&tipo=despesa&categoria_tse=${encodeURIComponent(r.category)}`} className="e no-underline hover:underline">
                          {r.category}
                        </Link>
                        <div className="s text-[13.5px]">{EXPENSE_GROUPS[r.category_group]?.label ?? r.category_group}</div>
                      </td>
                      <td className="n s hidden sm:table-cell">{num(r.n)}</td>
                      <td className="n text-ink">{brlc(r.value)}</td>
                      <td className="n s">{pct(t.expense ? r.value / t.expense : 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      )}
    </Section>
  );
}
