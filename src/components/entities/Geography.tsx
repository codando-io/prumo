import { Section, SourceLine, Fig, Caption } from "@/components/ui/editorial";
import { num, pct, plural } from "@/lib/format";
import { ShareTable } from "./tables";
import { inUf, ufLabel } from "./options";
import { entityCalc } from "./sources";

type By = { k: string; value: number; n: number; n_candidates: number }[];

/** "em São Paulo, no Rio de Janeiro e à Presidência" */
function placesText(ufs: string[]) {
  const parts = ufs.map((u) => (u === "BR" ? "à Presidência" : inUf(u)));
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

/**
 * The parties and states of the candidacies on the other side of the money (donor → recipients,
 * supplier → clients). The party is the candidacy's, never the donor's or the supplier's.
 */
export function PartiesAndStates({
  role,
  year,
  total,
  byParty,
  byUf,
  generatedAt,
}: {
  role: "doador" | "fornecedor";
  year: number;
  total: number;
  byParty: By;
  byUf: By;
  generatedAt: string | null;
}) {
  if (!byParty.length && !byUf.length) return null;
  const unit: [string, string] = role === "doador" ? ["candidatura", "candidaturas"] : ["campanha", "campanhas"];
  const who = role === "doador" ? "As candidaturas que receberam" : "As campanhas que contrataram";
  const share = (v: number) => (total > 0 ? v / total : null);
  const topP = byParty[0];
  const tables = byParty.length > 1 || byUf.length > 1;
  const kind = role === "doador" ? "receitas" : "despesas_contratadas";

  return (
    <Section
      id="partidos-estados"
      question="Para quais partidos e estados?"
      lede={
        <>
          {topP &&
            (byParty.length === 1 ? (
              <>
                {who} eram todas do {topP.k}.{" "}
              </>
            ) : (
              <>
                {who} eram de <Fig>{num(byParty.length)}</Fig> partidos; as do {topP.k} ficaram com <Fig>{pct(share(topP.value))}</Fig> do valor.{" "}
              </>
            ))}
          {byUf.length === 1 ? (
            <>{byUf[0].k === "BR" ? "Todas disputavam a Presidência." : `Todas disputavam a eleição ${inUf(byUf[0].k)}.`}</>
          ) : (
            byUf.length > 1 && (
              <>
                Os maiores valores foram para {unit[1]} {placesText(byUf.slice(0, 3).map((u) => u.k))}
                {byUf.length > 3 && <>, de um total de {num(byUf.length)} estados</>}.
              </>
            )
          )}
        </>
      }
      source={
        <SourceLine
          label={role === "doador" ? "TSE, receitas e candidaturas" : "TSE, despesas contratadas e candidaturas"}
          info={entityCalc(
            kind,
            year,
            generatedAt,
            role === "doador"
              ? "Doações somadas pelo partido e pelo estado das candidaturas que receberam. O partido é o da candidatura, não o do doador."
              : "Despesas somadas pelo partido e pelo estado das candidaturas que contrataram. O estado é o da candidatura, não o endereço do fornecedor.",
          )}
        />
      }
    >
      {tables && (
        <>
          <div className="grid gap-12 lg:grid-cols-2">
            {byParty.length > 1 && (
              <div>
                <h3 className="text-[15px] font-semibold text-ink">Por partido da candidatura</h3>
                <div className="mt-3">
                  <ShareTable
                    head="Partido"
                    moreNoun="partidos"
                    rows={byParty.map((p) => ({
                      key: p.k,
                      label: p.k,
                      href: `/partidos/${encodeURIComponent(p.k)}?ano=${year}`,
                      sub: plural(p.n_candidates, unit[0], unit[1]),
                      value: p.value,
                      share: share(p.value),
                    }))}
                  />
                </div>
              </div>
            )}
            {byUf.length > 1 && (
              <div>
                <h3 className="text-[15px] font-semibold text-ink">Por estado da candidatura</h3>
                <div className="mt-3">
                  <ShareTable
                    head="Estado"
                    moreNoun="estados"
                    rows={byUf.map((u) => ({
                      key: u.k,
                      label: ufLabel(u.k),
                      href: u.k === "BR" || u.k === "ZZ" ? undefined : `/estados/${u.k}?ano=${year}`,
                      sub: plural(u.n_candidates, unit[0], unit[1]),
                      value: u.value,
                      share: share(u.value),
                    }))}
                  />
                </div>
              </div>
            )}
          </div>
          <Caption>
            {role === "doador"
              ? "O partido e o estado são os da candidatura que recebeu, não os de quem doou."
              : "O partido e o estado são os da candidatura que contratou, não os do fornecedor."}{" "}
            Candidaturas a presidente aparecem como Brasil.
          </Caption>
        </>
      )}
    </Section>
  );
}
