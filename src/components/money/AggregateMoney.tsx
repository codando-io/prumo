import Link from "next/link";
import { Composition, CounterList, type Part, type Tone } from "@/components/money/Composition";
import type { donorsByGroup as DonorsByGroup, suppliersByGroup as SuppliersByGroup } from "@/lib/queries/dashboard";
import { EXPENSE_GROUPS, FUNDING_GROUPS, fundingGroupOf } from "@/lib/labels";
import { brlc, num, titleName } from "@/lib/format";
import { counterpartHref } from "@/lib/links";

export const FUNDING_TONE: Record<string, Tone> = {
  fefc: "public",
  fp: "public-2",
  pf: "private",
  proprios: "private-2",
  partido: "private-3",
  coletivo: "private-4",
  outras: "private-4",
};

/**
 * Money in and money out of many campaigns at once (an election, a state, a party): two
 * compositions on one scale; each category opens into the donors or suppliers behind it.
 */
export function AggregateMoney({
  year,
  txQuery,
  revenue,
  expense,
  revenuePublic,
  revenuePrivate,
  revenueEstimable,
  revCats,
  expGroups,
  expCategories = [],
  donors,
  suppliers,
  inSummary,
  outSummary,
}: {
  year: number;
  /** Query string (without "?") with the scope's filters, for links into /transacoes. */
  txQuery: string;
  revenue: number;
  expense: number;
  revenuePublic: number;
  revenuePrivate: number;
  revenueEstimable?: number;
  revCats: { category: string; value: number }[];
  expGroups: { category_group: string; value: number }[];
  /** Official TSE expense categories inside each group, listed under its suppliers when given. */
  expCategories?: { category_group: string; category: string; value: number }[];
  donors: Awaited<ReturnType<typeof DonorsByGroup>>;
  suppliers: Awaited<ReturnType<typeof SuppliersByGroup>>;
  inSummary?: React.ReactNode;
  outSummary?: React.ReactNode;
}) {
  const tx = (p: string) => `/transacoes?${txQuery}${p}`;
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
  for (const r of expGroups) outByGroup.set(r.category_group, (outByGroup.get(r.category_group) ?? 0) + r.value);
  const outParts: Part[] = [...outByGroup.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ key: k, label: EXPENSE_GROUPS[k]?.label ?? k, value: v, tone: "spend" as Tone, href: tx(`&tipo=despesa&grupo=${k}`) }));

  const inDetails: Record<string, React.ReactNode> = {};
  for (const g of FUNDING_GROUPS) {
    const rows = donors.filter((d) => d.grp === g.key);
    if (!rows.length) continue;
    inDetails[g.key] = (
      <CounterList
        total={revenue}
        rows={rows.map((d) => ({
          key: d.key,
          label: titleName(d.name) || "Sem identificação",
          value: d.value,
          href: counterpartHref(d, "doador", year),
          note: `${num(d.n_candidates)} ${d.n_candidates === 1 ? "campanha" : "campanhas"}`,
        }))}
      />
    );
  }
  const outDetails: Record<string, React.ReactNode> = {};
  for (const [k] of outByGroup) {
    const rows = suppliers.filter((s) => s.category_group === k);
    const cats = expCategories.filter((c) => c.category_group === k).sort((a, b) => b.value - a.value);
    if (!rows.length && cats.length < 2) continue;
    outDetails[k] = (
      <>
        {rows.length > 0 && (
          <CounterList
            total={expense}
            rows={rows.map((s) => ({
              key: s.key,
              label: titleName(s.name) || "Fornecedor não identificado",
              value: s.value,
              href: `/fornecedores/${s.key}?ano=${year}`,
              note: `${num(s.n_campaigns)} ${s.n_campaigns === 1 ? "campanha" : "campanhas"}`,
            }))}
          />
        )}
        {cats.length > 1 && (
          <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
            Categorias do TSE:{" "}
            {cats.map((c, i) => (
              <span key={c.category}>
                {i > 0 && "; "}
                <Link href={tx(`&tipo=despesa&categoria_tse=${encodeURIComponent(c.category)}`)} className="link">
                  {c.category}
                </Link>{" "}
                <span className="tnum text-muted">{brlc(c.value)}</span>
              </span>
            ))}
            .
          </p>
        )}
      </>
    );
  }
  const scale = Math.max(revenue, expense);

  return (
    <div className="grid gap-12 lg:grid-cols-2 lg:gap-0">
      <div className="lg:pr-12">
        <Composition
          title="Dinheiro que entrou"
          total={revenue}
          scale={scale}
          summary={inSummary}
          groups={[
            { label: "Público", value: revenuePublic, tone: "public" },
            { label: "Privado", value: revenuePrivate, tone: "private" },
          ]}
          parts={inParts}
          details={inDetails}
          more={
            revenueEstimable && revenueEstimable > 0 ? (
              <span className="text-ink-2">Inclui {brlc(revenueEstimable)} em bens e serviços doados (estimáveis), que não passam pela conta bancária.</span>
            ) : undefined
          }
        />
      </div>
      <div className="border-accent/40 lg:border-l lg:pl-12">
        <Composition
          title="Dinheiro que saiu"
          total={expense}
          scale={scale}
          summary={outSummary}
          parts={outParts}
          details={outDetails}
          more={<span className="text-ink-2">Abra uma categoria para ver quem recebeu.</span>}
        />
      </div>
    </div>
  );
}
