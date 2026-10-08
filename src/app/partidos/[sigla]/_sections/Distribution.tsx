import Link from "next/link";
import { Caption, EmptyNote, Fig, Section, SourceLine } from "@/components/ui/editorial";
import { calculation, officialSum } from "@/components/geo/sources";
import { getPartyDistribution, getPartyPublicHistogram, getPartyTopPublic } from "@/lib/queries/parties";
import { CURRENT_YEAR, resultLabel } from "@/lib/labels";
import { brlc, num, pct, titleName } from "@/lib/format";

const QUESTION = "Como o dinheiro público foi distribuído?";
const SHOWN = 10;

/** How the party's public money (FEFC + Fundo Partidário) was split among its candidacies. */
export async function DistributionSection({ year, party, generatedAt }: { year: number; party: string; generatedAt: string | null }) {
  const [d, top, hist] = await Promise.all([getPartyDistribution(year, party), getPartyTopPublic(year, party, 20), getPartyPublicHistogram(year, party)]);

  if (!d || !d.public_total) {
    return (
      <Section id="distribuicao" question={QUESTION}>
        <EmptyNote>
          Nenhuma candidatura do {party} registrou receitas do Fundo Eleitoral ou do Fundo Partidário em {year}
          {year === CURRENT_YEAR ? " até a data desta base" : ""}.
        </EmptyNote>
      </Section>
    );
  }

  const nTop = Math.max(1, Math.ceil(d.n_candidates * 0.1));
  const withPublic = d.n_with_public;
  const txPublic = `/transacoes?ano=${year}&partido=${encodeURIComponent(party)}&tipo=receita&grupo=fefc&ordem=valor_desc`;
  const gini = d.gini_public == null ? null : d.gini_public.toFixed(2).replace(".", ",");
  const giniWords =
    d.gini_public == null
      ? null
      : d.gini_public >= 0.8
        ? "muito concentrada"
        : d.gini_public >= 0.6
          ? "concentrada"
          : d.gini_public >= 0.4
            ? "moderadamente concentrada"
            : "relativamente equilibrada";
  const maxBin = Math.max(1, ...hist.map((h) => h.n));

  const topRow = (c: (typeof top)[number]) => (
    <tr key={c.id}>
      <td>
        <Link href={`/candidatos/${year}/${c.id}`} className="e no-underline hover:underline">
          {titleName(c.ballot_name)}
        </Link>
        <div className="s text-[13.5px]">
          {c.office}
          {c.uf !== "BR" ? ` (${c.uf})` : ""}, {resultLabel(c.result, year, c.registration_status).label.toLowerCase()}
        </div>
      </td>
      <td className="n text-ink">{brlc(c.revenue_public)}</td>
      <td className="n s">{pct(c.revenue_public / d.public_total)}</td>
    </tr>
  );

  return (
    <Section
      id="distribuicao"
      question={QUESTION}
      lede={
        <>
          Cada partido decide como repartir o Fundo Eleitoral e o Fundo Partidário entre suas candidaturas. No {party},{" "}
          {withPublic === d.n_candidates ? (
            <>
              todas as <Fig>{num(d.n_candidates)}</Fig> candidaturas receberam
            </>
          ) : (
            <>
              <Fig
                info={calculation(
                  "receitas",
                  year,
                  generatedAt,
                  "Candidaturas com alguma receita de fundo público, de um total que inclui as que ainda não prestaram contas (contadas como zero).",
                )}
              >
                {num(withPublic)}
              </Fig>{" "}
              de {num(d.n_candidates)} candidaturas {withPublic === 1 ? "recebeu" : "receberam"}
            </>
          )}{" "}
          alguma parte dos{" "}
          <Fig info={officialSum("receitas", year, generatedAt, "Soma das receitas do Fundo Eleitoral (FEFC) e do Fundo Partidário registradas pelas candidaturas do partido.")}>
            {brlc(d.public_total)}
          </Fig>
          . As {num(nTop)} que mais receberam (10% das candidaturas) ficaram com{" "}
          <Fig
            info={calculation(
              "receitas",
              year,
              generatedAt,
              "Ordenamos as candidaturas do partido pelo dinheiro público recebido e somamos o que recebeu o primeiro décimo da lista. Se o dinheiro fosse dividido igualmente, essa parcela seria 10%.",
            )}
          >
            {pct(d.top10_share_public ?? 0)}
          </Fig>{" "}
          do total
          {gini && (
            <>
              ; o índice de Gini da divisão é{" "}
              <Fig
                info={calculation(
                  "receitas",
                  year,
                  generatedAt,
                  "Medida de desigualdade de 0 a 1: 0 quando todas as candidaturas recebem o mesmo valor, 1 quando uma só recebe tudo. Calculada sobre o dinheiro público de todas as candidaturas do partido, inclusive as que receberam zero. A faixa descritiva é uma convenção do Prumo.",
                )}
              >
                {gini}
              </Fig>
              {giniWords ? ` (divisão ${giniWords})` : ""}
            </>
          )}
          .
        </>
      }
      source={
        <SourceLine
          label="TSE, receitas das candidaturas"
          info={officialSum("receitas", year, generatedAt, "Receitas do Fundo Eleitoral e do Fundo Partidário declaradas por cada candidatura do partido.")}
          links={[{ label: "Ver os repasses do Fundo Eleitoral", href: txPublic }]}
        />
      }
    >
      <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Quem mais recebeu</h3>
          <p className="mt-1 text-[14.5px] text-ink-2">Fundo Eleitoral e Fundo Partidário somados, e a fatia de cada candidatura no total distribuído.</p>
          <table className="dt mt-3">
            <thead>
              <tr>
                <th scope="col">Candidatura</th>
                <th scope="col" className="n">
                  Recebeu
                </th>
                <th scope="col" className="n">
                  Do total
                </th>
              </tr>
            </thead>
            <tbody>{top.slice(0, SHOWN).map(topRow)}</tbody>
          </table>
          {top.length > SHOWN && (
            <details className="mt-3">
              <summary className="action cursor-pointer list-none text-[14.5px] [&::-webkit-details-marker]:hidden">
                Ver as {num(top.length)} que mais receberam
              </summary>
              <table className="dt mt-1">
                <tbody>{top.slice(SHOWN).map(topRow)}</tbody>
              </table>
            </details>
          )}
        </div>

        <div>
          <h3 className="text-[15px] font-semibold text-ink">Quantas candidaturas receberam quanto</h3>
          <p className="mt-1 text-[14.5px] text-ink-2">Candidaturas do partido por faixa de dinheiro público recebido em {year}.</p>
          <table className="dt mt-3">
            <thead>
              <tr>
                <th scope="col">Recebeu</th>
                <th scope="col" className="n">
                  Candidaturas
                </th>
                <th scope="col" className="n">
                  Soma
                </th>
              </tr>
            </thead>
            <tbody>
              {hist.map((h, i) => (
                <tr key={h.label}>
                  <th scope="row">
                    <span className="text-ink">{i === 0 ? "Nenhum valor" : h.label.charAt(0).toUpperCase() + h.label.slice(1)}</span>
                    {i === 0 && h.n > 0 && <div className="text-[13.5px] text-muted">inclui quem ainda não prestou contas</div>}
                  </th>
                  <td className="n">
                    <span className="text-ink">{num(h.n)}</span>
                    <span aria-hidden="true" className="ml-3 inline-block w-14 align-middle">
                      <span className="block h-2" style={{ width: `${Math.max(h.n ? 2 : 0, (h.n / maxBin) * 56)}px`, background: i === 0 ? "var(--muted)" : "var(--public)" }} />
                    </span>
                  </td>
                  <td className="n s">
                    {h.value > 0 ? (
                      <>
                        {brlc(h.value)}
                        <div className="text-[13.5px] text-muted">{pct(h.value / d.public_total)} do total</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Caption>Os limites de gastos variam por cargo e por estado, o que explica parte das diferenças entre candidaturas.</Caption>
        </div>
      </div>

      <Caption>
        O índice de Gini resume, num número só, o quanto o dinheiro ficou concentrado em poucas candidaturas. Valores perto de 1 são comuns quando o partido lança muitas
        candidaturas e concentra os recursos em algumas delas. Não há um valor certo ou errado: a legislação fixa apenas percentuais mínimos para candidaturas de mulheres
        e de pessoas negras, que esta página não verifica.
      </Caption>
    </Section>
  );
}
