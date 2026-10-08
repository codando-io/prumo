import Link from "next/link";
import { Section, SourceLine, Fig } from "@/components/ui/editorial";
import { DailyChart } from "@/components/charts/DailyChart";
import { getDaily, getLargestExpenses, getTopSuppliers, type CandidateSummary } from "@/lib/queries/candidate";
import { EXPENSE_GROUPS, ENTITY_KIND } from "@/lib/labels";

const FROM_FUND: Record<string, string> = { FEFC: "do Fundo Eleitoral", FP: "do Fundo Partidário", OUTROS: "de outros recursos" };
import { brl, brlc, date, num, pct, titleName } from "@/lib/format";
import { calculated, officialFinance } from "@/lib/provenance";
import { q1 } from "@/lib/db";

export async function SpendingSection({ c }: { c: CandidateSummary }) {
  const [suppliers, largest, daily, election] = await Promise.all([
    getTopSuppliers(c.year, c.id, 12),
    getLargestExpenses(c.year, c.id, 8),
    getDaily(c.year, c.id),
    q1<{ round1: string; round2: string }>(`SELECT round1, round2 FROM election WHERE year = ?`, [c.year]),
  ]);
  const tx = `/transacoes?ano=${c.year}&candidato=${c.id}&tipo=despesa`;
  const marks = [{ date: election!.round1, label: "1º turno" }];
  if (c.votes_r2 != null || c.result === "2º TURNO") marks.push({ date: election!.round2, label: "2º turno" });
  const funds = [
    { k: "FEFC", v: c.paid_fefc },
    { k: "FP", v: c.paid_fp },
    { k: "OUTROS", v: c.paid_outros },
  ].filter((x) => x.v > 0);
  const top3 = suppliers.slice(0, 3).reduce((s, x) => s + x.value, 0);

  return (
    <Section
      id="destino"
      question="Para onde foi o dinheiro?"
      lede={
        <>
          A campanha declarou {num(c.n_expense_tx)} despesas com {num(c.n_suppliers)} {c.n_suppliers === 1 ? "fornecedor" : "fornecedores"}.{" "}
          {suppliers.length >= 3 && (
            <>
              Os três que mais receberam ficaram com <Fig info={calculated(c, "despesas_contratadas", "Soma do que os três maiores fornecedores receberam, dividida pelo total de despesas.")}>{pct(c.expense ? top3 / c.expense : 0)}</Fig> do total.{" "}
            </>
          )}
          Metade das despesas foi de até <Fig>{brl(c.exp_median)}</Fig>; a maior, de <Fig>{brlc(c.exp_max)}</Fig>.
          {funds.length > 0 && (
            <>
              {" "}
              Os pagamentos saíram {funds.map((f, i) => (
                <span key={f.k}>
                  {i > 0 && (i === funds.length - 1 ? " e " : ", ")}
                  {FROM_FUND[f.k]} (<Fig>{brlc(f.v)}</Fig>)
                </span>
              ))}
              .
            </>
          )}
        </>
      }
      source={<SourceLine label="TSE, despesas da campanha" info={officialFinance(c, "despesas_contratadas", "Cada despesa declarada pela campanha, com o fornecedor e a categoria oficial do TSE.")} links={[{ label: "Ver as despesas", href: `${tx}&ordem=valor_desc` }]} />}
    >
      <h3 className="text-[15px] font-semibold text-ink">Quem mais recebeu</h3>
      <table className="dt mt-3">
        <thead>
          <tr>
            <th scope="col">Fornecedor</th>
            <th scope="col" className="hidden md:table-cell">
              Principalmente
            </th>
            <th scope="col" className="n hidden sm:table-cell">
              Despesas
            </th>
            <th scope="col" className="n">
              Valor
            </th>
            <th scope="col" className="n">
              Do total
            </th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((s) => (
            <tr key={s.key}>
              <td>
                <Link href={`/fornecedores/${s.key}?ano=${c.year}`} className="e no-underline hover:underline">
                  {titleName(s.name)}
                </Link>
                <div className="text-[13.5px] text-muted">
                  {ENTITY_KIND[s.kind ?? ""] ?? ""}
                  {s.other_campaigns > 0 && <> · atende também {s.other_campaigns === 1 ? "outra campanha" : `outras ${num(s.other_campaigns)} campanhas`}</>}
                </div>
              </td>
              <td className="s hidden md:table-cell">{EXPENSE_GROUPS[s.main_group]?.label}</td>
              <td className="n s hidden sm:table-cell">
                <Link href={`${tx}&contraparte=${s.key}`} className="action">
                  {num(s.n)}
                </Link>
              </td>
              <td className="n text-ink">{brlc(s.value)}</td>
              <td className="n s">{pct(c.expense ? s.value / c.expense : 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">As maiores despesas</h3>
          <p className="mt-1 text-[14.5px] text-ink-2">Como descritas pela campanha.</p>
          <ol className="mt-3 border-t border-rule">
            {largest.map((e) => (
              <li key={e.sq} className="border-b border-rule">
                <Link href={`${tx}&sq=${e.sq}`} className="grid grid-cols-[1fr_auto] gap-x-4 py-2.5 no-underline hover:bg-[var(--hover)]">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium text-ink">{titleName(e.supplier_name) || "Fornecedor não identificado"}</span>
                    <span className="block truncate text-[13.5px] text-muted">
                      {date(e.date)}, {e.description || e.category}
                    </span>
                  </span>
                  <span className="tnum text-[15px] font-medium text-ink">{brlc(e.value)}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
        {daily.length > 1 && (
          <div>
            <h3 className="text-[15px] font-semibold text-ink">Quando o dinheiro foi gasto</h3>
            <p className="mb-3 mt-1 text-[14.5px] text-ink-2">
              Pela data registrada em cada despesa{c.year === 2026 ? "; as semanas mais recentes ainda podem receber lançamentos" : ""}.
            </p>
            <DailyChart data={daily} marks={marks} height={260} />
          </div>
        )}
      </div>
    </Section>
  );
}
