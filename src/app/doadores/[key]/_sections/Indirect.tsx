import Link from "next/link";
import { Fig, Section, SourceLine } from "@/components/ui/editorial";
import { More, ShareTable } from "@/components/entities/tables";
import { entityOfficial } from "@/components/entities/sources";
import type { IndirectRow } from "@/lib/queries/entities";
import { ENTITY_KIND } from "@/lib/labels";
import { brlc, num, pct, plural, titleName } from "@/lib/format";

const VIA_LABEL: Record<string, string> = {
  partido: "Órgão partidário",
  plataforma: "Plataforma de financiamento coletivo",
  candidato: "Outra campanha",
};

const TOP = 12;

/** "Doador originário": money given to a party or crowdfunding platform and passed on to campaigns. */
export function Indirect({
  name,
  year,
  total,
  nCandidates,
  rows,
  vias,
  generatedAt,
}: {
  name: string;
  year: number;
  total: number;
  nCandidates: number;
  rows: IndirectRow[];
  vias: { via_key: string; via_name: string | null; via_type: string; via_kind: string | null; value: number; n: number; n_candidates: number }[];
  generatedAt: string | null;
}) {
  const share = (v: number) => (total > 0 ? v / total : null);
  const topVia = vias[0];
  const table = (items: IndirectRow[]) => (
    <table className="dt">
      <thead>
        <tr>
          <th scope="col">Candidatura</th>
          <th scope="col" className="n">
            Valor
          </th>
          <th scope="col" className="n">
            Do total
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((r) => (
          <tr key={`${r.candidate_id}-${r.via_key}`}>
            <td>
              {r.ballot_name ? (
                <Link href={`/candidatos/${year}/${r.candidate_id}`} className="e no-underline hover:underline">
                  {titleName(r.ballot_name)}
                </Link>
              ) : (
                <span className="e">Candidatura não identificada</span>
              )}
              <div className="s text-[13.5px]">
                {r.office ? `${r.office}${r.uf && r.uf !== "BR" ? ` (${r.uf})` : ""}, ${r.party}, ` : ""}
                via {titleName(r.via_name) || "intermediário sem nome"}
              </div>
            </td>
            <td className="n text-ink">{brlc(r.value)}</td>
            <td className="n s">{pct(share(r.value))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <Section
      id="indiretas"
      question="Por onde o dinheiro passou?"
      lede={
        <>
          Em {year}, <Fig>{brlc(total)}</Fig> doados por {name} a partidos ou plataformas de financiamento coletivo chegaram a <Fig>{num(nCandidates)}</Fig>{" "}
          {nCandidates === 1 ? "candidatura" : "candidaturas"}
          {topVia && vias.length > 1 && (
            <>
              , por meio de {num(vias.length)} intermediários; o principal foi {titleName(topVia.via_name) || "um intermediário sem nome"} (<Fig>{pct(share(topVia.value))}</Fig>)
            </>
          )}
          {topVia && vias.length === 1 && <>, por meio de {titleName(topVia.via_name) || "um intermediário sem nome"}</>}. A campanha informa ao TSE quem doou na origem;
          esses valores já aparecem como doações do partido ou da plataforma.
        </>
      }
      source={
        <SourceLine
          label="TSE, receitas das campanhas, doador originário"
          info={entityOfficial(
            "receitas",
            year,
            generatedAt,
            "Soma das receitas em que a campanha informou esta pessoa como doador originário: o valor foi doado a um partido ou a uma plataforma de financiamento coletivo e depois repassado à campanha. Já está contado como doação do intermediário.",
          )}
        />
      }
    >
      <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Quem recebeu a doação e repassou</h3>
          <div className="mt-3">
            <ShareTable
              head="Intermediário"
              moreNoun="intermediários"
              rows={vias.map((v) => ({
                key: v.via_key,
                label: titleName(v.via_name) || "(sem nome)",
                href: `/doadores/${v.via_key}?ano=${year}`,
                sub: `${ENTITY_KIND[v.via_kind ?? ""] ?? VIA_LABEL[v.via_type] ?? "Intermediário"}, repassou a ${plural(v.n_candidates, "candidatura", "candidaturas")}`,
                value: v.value,
                share: share(v.value),
              }))}
            />
          </div>
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Candidaturas que receberam</h3>
          <div className="mt-3">
            {table(rows.slice(0, TOP))}
            {rows.length > TOP && <More label={`Ver os outros ${num(rows.length - TOP)} repasses`}>{table(rows.slice(TOP))}</More>}
          </div>
        </div>
      </div>
    </Section>
  );
}
