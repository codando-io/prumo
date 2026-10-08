import Link from "next/link";
import { Section, Caption, Fig, EmptyNote } from "@/components/ui/editorial";
import { PeerScatter } from "@/components/charts/PeerScatter";
import { getPeerMedians, getPeers, type CandidateSummary } from "@/lib/queries/candidate";
import { UF_NAMES } from "@/lib/labels";
import { brlUnit, num, titleName } from "@/lib/format";
import { calculated } from "@/lib/provenance";

export async function CompareSection({ c }: { c: CandidateSummary }) {
  if (!c.votes || !c.expense) {
    return (
      <Section id="comparacao" question="Quanto custou cada voto?">
        <EmptyNote>
          {c.votes ? "A campanha não registrou despesas" : "Não há votos registrados para esta candidatura"}, então as métricas por voto não se aplicam.
        </EmptyNote>
      </Section>
    );
  }
  const [medians, peers] = await Promise.all([getPeerMedians(c.year, c.office_code, c.uf), getPeers(c.year, c.office_code, c.uf)]);
  const local = medians.find((m) => !m.national && m.uf === c.uf);
  const national = medians.find((m) => m.national);
  const ref = local ?? national;
  const scope = c.office_code === 1 ? "no Brasil" : `em ${UF_NAMES[c.uf] ?? c.uf}`;
  const office = c.office.toLowerCase();
  const name = titleName(c.ballot_name);

  const rows = [
    { label: "Despesas por voto", v: c.expense_per_vote, m: ref?.expense_per_vote, what: "Total de despesas ÷ votos recebidos no último turno disputado." },
    { label: "Receitas por voto", v: c.revenue_per_vote, m: ref?.revenue_per_vote, what: "Receitas totais ÷ votos recebidos no último turno disputado." },
    { label: "Dinheiro público por voto", v: c.public_per_vote, m: ref?.public_per_vote, what: "Receitas do Fundo Eleitoral e do Fundo Partidário ÷ votos." },
    { label: "Dinheiro privado por voto", v: c.private_per_vote, m: ref?.private_per_vote, what: "Receitas de fontes privadas ÷ votos." },
  ];
  const ratio = c.expense_per_vote != null && ref?.expense_per_vote ? c.expense_per_vote / ref.expense_per_vote : null;

  return (
    <Section
      id="comparacao"
      question="Quanto custou cada voto?"
      lede={
        <>
          A campanha gastou <Fig info={calculated(c, "despesas_contratadas", rows[0].what)}>{brlUnit(c.expense_per_vote)}</Fig> para cada voto recebido
          {ref?.expense_per_vote != null && (
            <>
              ; a mediana das campanhas a {office} {scope} foi de <Fig>{brlUnit(ref.expense_per_vote)}</Fig>
              {ratio != null && ratio >= 1.15 && <> ({ratio.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} vezes mais)</>}
              {ratio != null && ratio <= 0.87 && <> (menos do que a mediana)</>}
            </>
          )}
          . São medidas descritivas: não avaliam eficiência nem explicam por que alguém venceu ou perdeu.
        </>
      }
    >
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <table className="dt">
            <thead>
              <tr>
                <th scope="col">Por voto</th>
                <th scope="col" className="n">
                  {name}
                </th>
                <th scope="col" className="n">
                  Mediana {scope}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row" className="font-normal text-ink-2">
                    {r.label}
                  </th>
                  <td className="n text-ink">{brlUnit(r.v)}</td>
                  <td className="n s">{brlUnit(r.m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Caption>
            Votos do último turno disputado. A mediana considera as campanhas a {office} {scope} com votos e despesas registrados.
          </Caption>
        </div>
        {peers.length > 2 && (
          <div>
            <h3 className="text-[15px] font-semibold text-ink">
              {num(peers.length)} campanhas a {office} {scope}
            </h3>
            <p className="mt-1 text-[14.5px] text-ink-2">
              Votos no eixo horizontal e despesas no vertical, em escala logarítmica. O ponto destacado é {name}; clique em outro para abrir a campanha.
            </p>
            <div className="mt-4">
              <PeerScatter peers={peers} currentId={c.id} year={c.year} />
            </div>
            <p className="mt-3 text-[14.5px]">
              <Link className="link" href={`/comparar?c=${c.year}-${c.id}`}>
                Comparar lado a lado com outras candidaturas
              </Link>
            </p>
          </div>
        )}
      </div>
    </Section>
  );
}
