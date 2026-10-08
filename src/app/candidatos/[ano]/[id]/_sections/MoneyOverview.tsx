import Link from "next/link";
import { Composition, CounterList, type Part, type Tone } from "@/components/money/Composition";
import { FUNDING_TONE } from "@/components/money/AggregateMoney";
import { Fig } from "@/components/ui/editorial";
import type { CandidateSummary, getDonorsByGroup, getSuppliersByGroup } from "@/lib/queries/candidate";
import { EXPENSE_GROUPS, FUNDING_GROUPS, fundingGroupOf } from "@/lib/labels";
import { brlc, num, pct, titleName, inSentence } from "@/lib/format";
import { calculated, officialFinance } from "@/lib/provenance";
import { counterpartHref } from "@/lib/links";


/**
 * The first thing on a profile after the header: how much came in and from where, how much
 * went out and on what — two compositions on one scale, so the relation is visible.
 */
export function MoneyOverview({
  c,
  revCats,
  expCats,
  donorsByGroup,
  suppliersByGroup,
}: {
  c: CandidateSummary;
  revCats: { category: string; nature: string; value: number; n: number }[];
  expCats: { category_group: string; category: string; value: number; n: number }[];
  donorsByGroup: Awaited<ReturnType<typeof getDonorsByGroup>>;
  suppliersByGroup: Awaited<ReturnType<typeof getSuppliersByGroup>>;
}) {
  const year = c.year;
  const tx = (p: string) => `/transacoes?ano=${year}&candidato=${c.id}${p}`;

  const inByGroup = new Map<string, number>();
  for (const r of revCats) inByGroup.set(fundingGroupOf(r.category), (inByGroup.get(fundingGroupOf(r.category)) ?? 0) + r.value);
  const inParts: Part[] = FUNDING_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    value: inByGroup.get(g.key) ?? 0,
    tone: FUNDING_TONE[g.key],
    href: tx(`&tipo=receita&grupo=${g.key}`),
  }));
  const outByGroup = new Map<string, number>();
  for (const r of expCats) outByGroup.set(r.category_group, (outByGroup.get(r.category_group) ?? 0) + r.value);
  const outParts: Part[] = [...outByGroup.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ key: k, label: EXPENSE_GROUPS[k]?.label ?? k, value: v, tone: "spend" as Tone, href: tx(`&tipo=despesa&grupo=${k}`) }));

  const inDetails: Record<string, React.ReactNode> = {};
  for (const g of FUNDING_GROUPS) {
    const rows = donorsByGroup.filter((d) => d.grp === g.key);
    if (!rows.length) continue;
    inDetails[g.key] = (
      <CounterList
        total={c.revenue}
        rows={rows.map((d) => ({
          key: d.key ?? `${g.key}-${d.rk}`,
          label: d.donor_type === "proprio" ? "O próprio candidato" : titleName(d.name) || "Sem identificação",
          value: d.value,
          href: counterpartHref(d, "doador", year),
          note: d.n > 1 ? `${num(d.n)} transferências` : undefined,
        }))}
      />
    );
  }
  const outDetails: Record<string, React.ReactNode> = {};
  for (const [k] of outByGroup) {
    const rows = suppliersByGroup.filter((s) => s.category_group === k);
    if (!rows.length) continue;
    outDetails[k] = (
      <CounterList
        total={c.expense}
        rows={rows.map((s) => ({
          key: s.key ?? `${k}-${s.rk}`,
          label: titleName(s.name) || "Fornecedor não identificado",
          value: s.value,
          href: s.key ? `/fornecedores/${s.key}?ano=${year}` : undefined,
          note: s.n > 1 ? `${num(s.n)} despesas` : undefined,
        }))}
      />
    );
  }

  const scale = Math.max(c.revenue, c.expense);
  const topGroup = outParts[0];
  const spentShare = c.revenue > 0 ? c.expense / c.revenue : null;

  return (
    <div>
      <p className="lede max-w-[72ch] text-[18.5px]">
        Entraram <Fig info={officialFinance(c, "receitas", `Soma das ${num(c.n_revenue_tx)} receitas declaradas, incluindo doações em bens e serviços.`, { label: "Ver as receitas", href: tx("&tipo=receita") })}>{brlc(c.revenue)}</Fig> na campanha,{" "}
        <Fig info={calculated(c, "receitas", "Receitas do Fundo Eleitoral (FEFC) e do Fundo Partidário divididas pela receita total.")}>{pct(c.public_share ?? 0)}</Fig> de dinheiro público. Foram declarados{" "}
        <Fig info={officialFinance(c, "despesas_contratadas", `Soma das ${num(c.n_expense_tx)} despesas declaradas, incluindo doações a outras campanhas. Corresponde ao “Total de Despesas” do DivulgaCandContas.`, { label: "Ver as despesas", href: tx("&tipo=despesa") })}>{brlc(c.expense)}</Fig> em despesas
        {spentShare != null && <> ({pct(spentShare)} do que entrou)</>}
        {c.paid > 0 && (
          <>
            , dos quais <Fig>{brlc(c.paid)}</Fig> já pagos
          </>
        )}
        .
        {topGroup && (
          <>
            {" "}
            O principal destino foi {inSentence(topGroup.label)} (<Fig>{brlc(topGroup.value)}</Fig>)
            {c.top_supplier_name && (
              <>
                , e quem mais recebeu foi{" "}
                <Link href={`/fornecedores/${c.top_supplier_key}?ano=${year}`} className="link text-ink">
                  {titleName(c.top_supplier_name)}
                </Link>{" "}
                (<Fig>{brlc(c.top_supplier_value)}</Fig>)
              </>
            )}
            .
          </>
        )}
      </p>

      <div className="mt-10 grid gap-12 lg:grid-cols-2 lg:gap-0">
        <div className="lg:pr-12">
          <Composition
            title="Dinheiro que entrou"
            total={c.revenue}
            scale={scale}
            groups={[
              { label: "Público", value: c.revenue_public, tone: "public" },
              { label: "Privado", value: c.revenue_private, tone: "private" },
            ]}
            parts={inParts}
            details={inDetails}
            more={
              c.revenue_estimable > 0 ? (
                <span className="text-ink-2">
                  Inclui {brlc(c.revenue_estimable)} em bens e serviços doados (estimáveis), que não passam pela conta bancária.
                </span>
              ) : undefined
            }
          />
        </div>
        <div className="border-accent/40 lg:border-l lg:pl-12">
          <Composition
            title="Dinheiro que saiu"
            total={c.expense}
            scale={scale}
            summary={
              <>
                {num(c.n_expense_tx)} despesas com {num(c.n_suppliers)} {c.n_suppliers === 1 ? "fornecedor" : "fornecedores"}
                {c.expense > c.revenue * 1.05 && <>; despesas acima das receitas declaradas</>}.
              </>
            }
            parts={outParts}
            details={outDetails}
            more={<span className="text-ink-2">Abra uma categoria para ver quem recebeu.</span>}
          />
        </div>
      </div>
    </div>
  );
}
