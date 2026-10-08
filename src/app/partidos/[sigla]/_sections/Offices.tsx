import Link from "next/link";
import { Caption, EmptyNote, Fig, Section, SourceLine } from "@/components/ui/editorial";
import { officialSum } from "@/components/geo/sources";
import { getPartyOffices } from "@/lib/queries/parties";
import { brlc, num, pct } from "@/lib/format";

const QUESTION = "A que cargos o partido concorreu?";

/** The party's candidacies per office: how many, how many elected, and what they raised and spent. */
export async function OfficesSection({ year, party, generatedAt }: { year: number; party: string; generatedAt: string | null }) {
  const offices = await getPartyOffices(year, party);
  if (!offices.length) {
    return (
      <Section id="cargos" question={QUESTION}>
        <EmptyNote>Não há candidaturas do {party} registradas em {year}.</EmptyNote>
      </Section>
    );
  }

  const q = encodeURIComponent(party);
  const totalExpense = offices.reduce((s, o) => s + o.expense, 0);
  const mostCands = [...offices].sort((a, b) => b.n - a.n)[0];
  const mostSpend = [...offices].sort((a, b) => b.expense - a.expense)[0];
  const lower = (s: string) => s.toLowerCase();

  return (
    <Section
      id="cargos"
      question={QUESTION}
      lede={
        <>
          O {party} apresentou candidaturas a {offices.length === 1 ? "um cargo" : `${num(offices.length)} cargos`} em {year}.
          {offices.length > 1 && (
            <>
              {" "}
              {mostCands.office_code === mostSpend.office_code && totalExpense > 0 ? (
                <>
                  A disputa para {lower(mostCands.office)} reuniu mais candidaturas (<Fig>{num(mostCands.n)}</Fig>) e o maior volume de despesas (
                  <Fig>{brlc(mostSpend.expense)}</Fig>, {pct(mostSpend.expense / totalExpense)} do total).
                </>
              ) : (
                <>
                  A disputa para {lower(mostCands.office)} reuniu mais candidaturas (<Fig>{num(mostCands.n)}</Fig>)
                  {totalExpense > 0 && (
                    <>
                      ; a de {lower(mostSpend.office)}, o maior volume de despesas (<Fig>{brlc(mostSpend.expense)}</Fig>, {pct(mostSpend.expense / totalExpense)} do total)
                    </>
                  )}
                  .
                </>
              )}
            </>
          )}
        </>
      }
      source={
        <SourceLine
          label="TSE, candidaturas e prestações de contas"
          info={officialSum("candidatos", year, generatedAt, "Candidaturas registradas pelo partido (sem vices e suplentes) e as receitas e despesas declaradas por elas.")}
          links={[{ label: "Ver as candidaturas do partido", href: `/candidatos?ano=${year}&partido=${q}` }]}
        />
      }
    >
      <table className="dt">
        <thead>
          <tr>
            <th scope="col">Cargo</th>
            <th scope="col" className="n">
              Candidaturas
            </th>
            <th scope="col" className="n">
              Eleitos
            </th>
            <th scope="col" className="n hidden md:table-cell">
              Receitas
            </th>
            <th scope="col" className="n hidden md:table-cell">
              Dinheiro público
            </th>
            <th scope="col" className="n hidden sm:table-cell">
              Despesas
            </th>
            <th scope="col" className="n hidden lg:table-cell">
              Gasto médio
            </th>
          </tr>
        </thead>
        <tbody>
          {offices.map((o) => (
            <tr key={o.office_code}>
              <td>
                <Link className="e no-underline hover:underline" href={`/candidatos?ano=${year}&partido=${q}&cargo=${o.office_code}`}>
                  {o.office}
                </Link>
              </td>
              <td className="n text-ink">
                {num(o.n)}
                {o.n_finance < o.n && <div className="text-[13.5px] text-muted">{num(o.n_finance)} com prestação</div>}
              </td>
              <td className="n text-ink">
                {num(o.n_elected)}
                {o.n_runoff > 0 && (
                  <div className="text-[13.5px] text-muted">+{num(o.n_runoff)} no 2º turno</div>
                )}
              </td>
              <td className="n s hidden md:table-cell">{brlc(o.revenue)}</td>
              <td className="n s hidden md:table-cell">{brlc(o.revenue_public)}</td>
              <td className="n s hidden sm:table-cell">{brlc(o.expense)}</td>
              <td className="n s hidden lg:table-cell">{o.n_finance ? brlc(o.expense / o.n_finance) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Caption>Gasto médio: total de despesas dividido pelo número de candidaturas do cargo que entregaram prestação de contas.</Caption>
    </Section>
  );
}
