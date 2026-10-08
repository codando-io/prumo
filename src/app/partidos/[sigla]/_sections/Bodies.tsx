import Link from "next/link";
import { EmptyNote, Fig, Section, SourceLine } from "@/components/ui/editorial";
import { calculation, officialSum } from "@/components/geo/sources";
import { getPartyBodies } from "@/lib/queries/parties";
import { UF_NAMES } from "@/lib/labels";
import { brlc, num, others, pct, plural, titleName } from "@/lib/format";

const SPHERE: Record<string, string> = {
  Nacional: "Diretório nacional",
  "Federal (Estadual/Distrital)": "Diretório estadual",
  Municipal: "Diretório municipal",
  Zonal: "Diretório zonal",
};

const QUESTION = "Quais órgãos partidários repassaram dinheiro?";
const SHOWN = 12;

/** Party bodies (diretórios) that transferred money to campaigns, and how much. */
export async function BodiesSection({ year, party, generatedAt }: { year: number; party: string; generatedAt: string | null }) {
  const bodies = await getPartyBodies(year, party);

  if (!bodies.length) {
    return (
      <Section id="orgaos" question={QUESTION}>
        <EmptyNote>Nenhuma receita das campanhas em {year} aparece como repasse de um órgão do {party}.</EmptyNote>
      </Section>
    );
  }

  const total = bodies.reduce((s, b) => s + b.value, 0);
  const pub = bodies.reduce((s, b) => s + b.public_value, 0);
  const other = bodies.reduce((s, b) => s + b.other_party_value, 0);
  const nOther = bodies.filter((b) => b.n_other_party > 0).length;
  const national = bodies.filter((b) => b.sphere === "Nacional").reduce((s, b) => s + b.value, 0);
  const txRevenue = `/transacoes?ano=${year}&partido=${encodeURIComponent(party)}&tipo=receita&ordem=valor_desc`;

  const sub = (b: (typeof bodies)[number]) => {
    const parts = [SPHERE[b.sphere ?? ""] ?? "Órgão partidário"];
    if (b.uf && b.uf !== "BR" && b.sphere !== "Nacional") parts.push(UF_NAMES[b.uf] ?? b.uf);
    if (b.doc_display) parts.push(`CNPJ ${b.doc_display}`);
    if (b.n_other_party > 0) parts.push(`${b.n_other_party === 1 ? "1 candidatura" : `${num(b.n_other_party)} candidaturas`} de outro partido`);
    return parts.join(", ");
  };

  const row = (b: (typeof bodies)[number]) => (
    <tr key={b.key}>
      <td>
        <Link href={`/doadores/${b.key}?ano=${year}`} className="e no-underline hover:underline">
          {titleName(b.name)}
        </Link>
        <div className="s text-[13.5px]">{sub(b)}</div>
      </td>
      <td className="n s hidden sm:table-cell">{num(b.n_candidates)}</td>
      <td className="n s hidden md:table-cell">{b.value > 0 ? pct(b.public_value / b.value) : "—"}</td>
      <td className="n text-ink">{brlc(b.value)}</td>
      <td className="n s">{total > 0 ? pct(b.value / total) : "—"}</td>
    </tr>
  );

  const head = (
    <thead>
      <tr>
        <th scope="col">Órgão</th>
        <th scope="col" className="n hidden sm:table-cell">
          Candidaturas
        </th>
        <th scope="col" className="n hidden md:table-cell">
          % público
        </th>
        <th scope="col" className="n">
          Repassou
        </th>
        <th scope="col" className="n">
          Do total
        </th>
      </tr>
    </thead>
  );

  const rest = bodies.slice(SHOWN);

  return (
    <Section
      id="orgaos"
      question={QUESTION}
      lede={
        <>
          O dinheiro dos fundos públicos chega às campanhas pelos órgãos do partido: o diretório nacional e os diretórios estaduais e municipais. Em {year},{" "}
          <Fig>{num(bodies.length)}</Fig> {bodies.length === 1 ? `órgão do ${party} repassou` : `órgãos do ${party} repassaram`}{" "}
          <Fig
            info={officialSum("receitas", year, generatedAt, `Soma das receitas das campanhas cujo doador é um órgão do ${party}, segundo a sigla do doador registrada em cada receita.`, {
              label: "Ver as receitas do partido, das maiores para as menores",
              href: txRevenue,
            })}
          >
            {brlc(total)}
          </Fig>{" "}
          a campanhas,{" "}
          <Fig info={calculation("receitas", year, generatedAt, "Parte dos repasses classificada como Fundo Eleitoral (FEFC) ou Fundo Partidário, dividida pelo total repassado.")}>
            {pct(total ? pub / total : 0)}
          </Fig>{" "}
          de fundos públicos.{" "}
          {national > 0 ? (
            <>
              O diretório nacional respondeu por{" "}
              <Fig info={calculation("receitas", year, generatedAt, "Repasses feitos pelo órgão de direção nacional, divididos pelo total repassado pelos órgãos do partido.")}>
                {pct(national / total)}
              </Fig>{" "}
              desse valor.
            </>
          ) : (
            "Nenhum repasse veio do diretório nacional."
          )}
          {other > 0 && (
            <>
              {" "}
              Desse total,{" "}
              <Fig
                info={officialSum(
                  "receitas",
                  year,
                  generatedAt,
                  "Repasses de órgãos do partido a candidaturas registradas por outro partido, como acontece entre partidos coligados ou da mesma federação.",
                )}
              >
                {brlc(other)}
              </Fig>{" "}
              foram para candidaturas de outros partidos ({plural(nOther, "órgão", "órgãos")}), como acontece entre partidos coligados ou da
              mesma federação.
            </>
          )}
        </>
      }
      source={
        <SourceLine
          label="TSE, receitas das candidaturas"
          info={officialSum("receitas", year, generatedAt, "Receitas das campanhas em que o doador é um órgão partidário, com o CNPJ e a esfera do órgão.")}
          links={[{ label: "Ver as receitas, das maiores para as menores", href: txRevenue }]}
        />
      }
    >
      <table className="dt">
        {head}
        <tbody>{bodies.slice(0, SHOWN).map(row)}</tbody>
      </table>
      {rest.length > 0 && (
        <details className="mt-3">
          <summary className="action cursor-pointer list-none text-[14.5px] [&::-webkit-details-marker]:hidden">
            Ver {others(rest.length, "órgão", "órgãos")} ({brlc(rest.reduce((s, b) => s + b.value, 0))})
          </summary>
          <table className="dt mt-1">
            <tbody>{rest.map(row)}</tbody>
          </table>
        </details>
      )}
    </Section>
  );
}
