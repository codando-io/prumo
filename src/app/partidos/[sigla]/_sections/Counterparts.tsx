import Link from "next/link";
import { Fig, Section, SourceLine } from "@/components/ui/editorial";
import { calculation, officialSum } from "@/components/geo/sources";
import { getPartyTopDonors, getPartyTopSuppliers, type CounterpartRow } from "@/lib/queries/parties";
import { DONOR_TYPE, ENTITY_KIND, EXPENSE_GROUPS } from "@/lib/labels";
import { brlc, num, pct, titleName } from "@/lib/format";

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Who received the most from the party's campaigns, and who gave the most to them (summed across campaigns). */
export async function CounterpartsSection({
  year,
  party,
  expense,
  revenue,
  generatedAt,
}: {
  year: number;
  party: string;
  expense: number;
  revenue: number;
  generatedAt: string | null;
}) {
  const [suppliers, donors] = await Promise.all([getPartyTopSuppliers(year, party, 12), getPartyTopDonors(year, party, 12)]);
  const txBase = `/transacoes?ano=${year}&partido=${encodeURIComponent(party)}`;
  const top3 = suppliers.slice(0, 3).reduce((s, x) => s + x.value, 0);

  return (
    <Section
      id="fornecedores"
      question="Quem mais recebeu das campanhas, e quem mais doou a elas?"
      lede={
        <>
          Somando todas as campanhas do {party}
          {suppliers.length >= 3 && expense > 0 ? (
            <>
              , os três fornecedores que mais receberam ficaram com{" "}
              <Fig info={calculation("despesas_contratadas", year, generatedAt, "Soma do que os três maiores fornecedores receberam das campanhas do partido, dividida pelo total de despesas.")}>
                {pct(top3 / expense)}
              </Fig>{" "}
              das despesas
            </>
          ) : (
            ", estes são os maiores fornecedores e doadores privados"
          )}
          . Uma mesma empresa pode atender campanhas de vários partidos.
        </>
      }
      source={
        <SourceLine
          label="TSE, receitas e despesas das candidaturas"
          info={officialSum("despesas_contratadas", year, generatedAt, "Despesas e receitas declaradas pelas campanhas do partido, somadas por CPF ou CNPJ da contraparte.")}
        />
      }
    >
      <div className="grid gap-x-16 gap-y-12 lg:grid-cols-2">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Fornecedores</h3>
          <p className="mt-1 text-[14.5px] text-ink-2">Soma das despesas de todas as campanhas do partido. CPFs aparecem mascarados.</p>
          <CounterTable
            rows={suppliers}
            year={year}
            total={expense}
            role="fornecedor"
            empty="Nenhum fornecedor identificado."
            sub={(s) =>
              [ENTITY_KIND[s.kind ?? ""] ?? "Fornecedor", s.main_group ? lowerFirst(EXPENSE_GROUPS[s.main_group]?.label ?? s.main_group) : null].filter(Boolean).join(", ")
            }
            head={{ name: "Fornecedor", value: "Recebeu", share: "Das despesas" }}
          />
          <Link className="action mt-3 inline-block text-[14.5px]" href={`${txBase}&tipo=despesa&ordem=valor_desc`}>
            Ver as maiores despesas
          </Link>
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Doadores privados</h3>
          <p className="mt-1 text-[14.5px] text-ink-2">
            Pessoas e plataformas de financiamento coletivo. Não inclui repasses de partidos e de outras campanhas nem recursos dos próprios candidatos.
          </p>
          <CounterTable
            rows={donors}
            year={year}
            total={revenue}
            role="doador"
            empty="Nenhuma doação privada registrada."
            sub={(d) =>
              [ENTITY_KIND[d.kind ?? ""] ?? DONOR_TYPE[d.kind ?? ""] ?? "Doador", d.kind === "plataforma" && d.doc_display ? `CNPJ ${d.doc_display}` : null].filter(Boolean).join(", ")
            }
            head={{ name: "Doador", value: "Doou", share: "Da receita" }}
          />
          <Link className="action mt-3 inline-block text-[14.5px]" href={`${txBase}&tipo=receita&categoria=pf&ordem=valor_desc`}>
            Ver as maiores doações de pessoas físicas
          </Link>
        </div>
      </div>
    </Section>
  );
}

function CounterTable({
  rows,
  year,
  total,
  role,
  empty,
  sub,
  head,
}: {
  rows: CounterpartRow[];
  year: number;
  total: number;
  role: "fornecedor" | "doador";
  empty: string;
  sub: (r: CounterpartRow) => string;
  head: { name: string; value: string; share: string };
}) {
  if (!rows.length) return <p className="mt-3 text-[15px] text-muted">{empty}</p>;
  const base = role === "fornecedor" ? "/fornecedores" : "/doadores";
  return (
    <table className="dt mt-3">
      <thead>
        <tr>
          <th scope="col">{head.name}</th>
          <th scope="col" className="n hidden sm:table-cell">
            Campanhas
          </th>
          <th scope="col" className="n">
            {head.value}
          </th>
          <th scope="col" className="n">
            {head.share}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>
              <Link href={`${base}/${r.key}?ano=${year}`} className="e no-underline hover:underline">
                {titleName(r.name)}
              </Link>
              <div className="s text-[13.5px]">{sub(r)}</div>
            </td>
            <td className="n s hidden sm:table-cell">{num(r.n_campaigns)}</td>
            <td className="n text-ink">{brlc(r.value)}</td>
            <td className="n s">{total > 0 ? pct(r.value / total) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
