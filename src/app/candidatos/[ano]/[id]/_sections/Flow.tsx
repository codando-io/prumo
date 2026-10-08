import { Section, Caption } from "@/components/ui/editorial";
import { FlowChart, type FlowEdge, type FlowNode } from "@/components/charts/FlowChart";
import { getFlow, type CandidateSummary } from "@/lib/queries/candidate";
import { EXPENSE_GROUPS, FUNDING_GROUPS, fundingGroupOf } from "@/lib/labels";
import { brlc, titleName } from "@/lib/format";

const ACCOUNT_LABEL: Record<string, string> = {
  FEFC: "Conta do Fundo Eleitoral",
  FP: "Conta do Fundo Partidário",
  OUTROS: "Conta de outros recursos",
};

export async function FlowSection({ c }: { c: CandidateSummary }) {
  const { inLinks, outLinks, supLinks } = await getFlow(c.year, c.id);
  const nodes = new Map<string, FlowNode>();
  const links: FlowEdge[] = [];
  const add = (n: FlowNode) => nodes.has(n.id) || nodes.set(n.id, n);
  const link = (source: string, target: string, value: number) => value > 0.5 && links.push({ source, target, value });
  const txBase = `/transacoes?ano=${c.year}&candidato=${c.id}`;

  // 1. Revenue groups → accounts (or straight to "bens e serviços" when in-kind).
  const accIn = new Map<string, number>();
  for (const r of inLinks) {
    const g = fundingGroupOf(r.category);
    const meta = FUNDING_GROUPS.find((x) => x.key === g)!;
    add({ id: `in:${g}`, label: meta.label, colorKey: `fund:${g}`, depth: 0, href: `${txBase}&tipo=receita&grupo=${g}` });
    if (r.nature !== "FINANCEIRO") {
      add({ id: "inkind", label: "Doações em bens e serviços", colorKey: "sink", depth: 1 });
      link(`in:${g}`, "inkind", r.value);
    } else {
      const acc = r.fund ?? "OUTROS";
      add({ id: `acc:${acc}`, label: ACCOUNT_LABEL[acc], colorKey: "account", depth: 1 });
      link(`in:${g}`, `acc:${acc}`, r.value);
      accIn.set(acc, (accIn.get(acc) ?? 0) + r.value);
    }
  }

  // 2. Accounts → spending groups (payments, by the fund each payment records).
  const accOut = new Map<string, number>();
  for (const r of outLinks) {
    const acc = r.fund ?? "OUTROS";
    add({ id: `acc:${acc}`, label: ACCOUNT_LABEL[acc], colorKey: "account", depth: 1 });
    add({ id: `g:${r.category_group}`, label: EXPENSE_GROUPS[r.category_group]?.label ?? r.category_group, colorKey: "spend", depth: 2, href: `${txBase}&tipo=despesa&grupo=${r.category_group}` });
    link(`acc:${acc}`, `g:${r.category_group}`, r.value);
    accOut.set(acc, (accOut.get(acc) ?? 0) + r.value);
  }

  // Balance each account honestly: unspent money, or payments without matching revenue.
  for (const acc of new Set([...accIn.keys(), ...accOut.keys()])) {
    const diff = (accIn.get(acc) ?? 0) - (accOut.get(acc) ?? 0);
    if (diff > 1) {
      add({ id: "unpaid", label: "Saldo ou ainda não pago", colorKey: "sink", depth: 2 });
      link(`acc:${acc}`, "unpaid", diff);
    } else if (diff < -1) {
      add({ id: "gap", label: "Pagamentos acima das receitas registradas", colorKey: "sink", depth: 0 });
      link("gap", `acc:${acc}`, -diff);
    }
  }

  // 3. Spending groups → top suppliers (4 per group, the rest folded).
  const rest = new Map<string, number>();
  for (const s of supLinks) {
    if (s.rk <= 4 && s.supplier_key) {
      add({ id: `s:${s.supplier_key}`, label: titleName(s.name) || "(sem nome)", colorKey: "supplier", depth: 3, href: `/fornecedores/${s.supplier_key}?ano=${c.year}` });
      link(`g:${s.category_group}`, `s:${s.supplier_key}`, s.value);
    } else {
      rest.set(s.category_group, (rest.get(s.category_group) ?? 0) + s.value);
    }
  }
  for (const [g, v] of rest) {
    add({ id: `o:${g}`, label: "Outros fornecedores", colorKey: "supplier", depth: 3, href: `${txBase}&tipo=despesa&grupo=${g}` });
    link(`g:${g}`, `o:${g}`, v);
  }

  const n = nodes.size;
  if (links.length < 2) return null;
  const height = Math.min(900, Math.max(380, n * 22));

  return (
    <Section
      id="fluxo"
      question="Por onde o dinheiro passou?"
      lede="Da origem, pela conta bancária em que entrou, até a categoria de gasto e o fornecedor que recebeu. Passe o cursor sobre um caminho para ver o valor; clique em um ponto para abrir as transações."
    >
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="min-w-[760px]">
          <FlowChart nodes={[...nodes.values()]} links={links} height={height} />
        </div>
      </div>
      <Caption>
        Cada receita registra o fundo de origem e cada pagamento, a conta de onde saiu. Doações em bens e serviços (estimáveis) não passam pela conta bancária. A etapa
        de fornecedores usa os valores pagos ({brlc(c.paid)}), que podem ser menores que o total de despesas ({brlc(c.expense)}).
      </Caption>
    </Section>
  );
}
