import Link from "next/link";
import { Fig, Section, SourceLine } from "@/components/ui/editorial";
import { CampaignTable } from "@/components/entities/tables";
import { entityCalc, entityOfficial } from "@/components/entities/sources";
import type { DonationRow, DonationTotals } from "@/lib/queries/entities";
import { CURRENT_YEAR } from "@/lib/labels";
import { brlc, num, pct, titleName } from "@/lib/format";

/** Who received this donor's money in one election, with each donation's weight on both sides. */
export function Recipients({
  name,
  kind,
  entityKey,
  year,
  total,
  nDonations,
  nCandidates,
  totals,
  generatedAt,
  donations,
}: {
  name: string;
  kind: string;
  entityKey: string;
  year: number;
  total: number;
  nDonations: number;
  nCandidates: number;
  totals: DonationTotals;
  generatedAt: string | null;
  donations: DonationRow[];
}) {
  const tx = `/transacoes?ano=${year}&contraparte=${entityKey}&tipo=receita`;
  const note = (d: DonationRow) =>
    d.donor_type === "proprio" ? "recursos próprios" : d.public_value > 0 ? "inclui repasse de fundo público" : d.main_category === "coletivo" && kind !== "plataforma" ? "via financiamento coletivo" : undefined;
  const share = (v: number) => (total > 0 ? v / total : 0);
  const top1 = donations[0];
  const top5 = donations.slice(0, 5).reduce((s, r) => s + r.value, 0);
  const ownOnly = totals.own_value > 0 && Math.abs(totals.own_value - totals.value) < 0.01;
  const estimable = totals.value - totals.financial_value;
  const passesOn = kind === "partido" || kind === "campanha" || kind === "plataforma";
  const candidate = (d: DonationRow) => (
    <Link href={`/candidatos/${year}/${d.candidate_id}`} className="link text-ink">
      {titleName(d.ballot_name)}
    </Link>
  );

  return (
    <Section
      id="quem-recebeu"
      question={passesOn ? "Para quem repassou?" : "Para quem doou?"}
      lede={
        <>
          {nCandidates === 1 && top1 ? (
            <>Todas as doações diretas foram para a campanha de {candidate(top1)}. </>
          ) : (
            top1 && (
              <>
                A candidatura que mais recebeu foi a de {candidate(top1)}, com{" "}
                <Fig info={entityCalc("receitas", year, generatedAt, "Valor recebido por esta candidatura dividido por tudo o que o doador doou diretamente na eleição.")}>
                  {pct(share(top1.value))}
                </Fig>{" "}
                do total
                {nCandidates > 5 && (
                  <>
                    ; as cinco maiores somam <Fig>{pct(share(top5))}</Fig>
                  </>
                )}
                .{" "}
              </>
            )
          )}
          Foram{" "}
          <Fig
            info={entityOfficial("receitas", year, generatedAt, "Número de receitas distintas (identificador SQ_RECEITA do TSE) em que este doador aparece. Uma doação pode ter mais de um item.", {
              label: "Ver as doações",
              href: tx,
            })}
          >
            {num(nDonations)}
          </Fig>{" "}
          {nDonations === 1 ? "doação" : "doações"}
          {nDonations > 1 && (
            <>
              , em média <Fig>{brlc(total / nDonations)}</Fig>
            </>
          )}
          .
          {ownOnly ? (
            " Todo o valor foi registrado como recursos próprios: dinheiro aplicado na própria campanha."
          ) : totals.public_value > 0 ? (
            <>
              {" "}
              Desse total, <Fig>{brlc(totals.public_value)}</Fig> ({pct(totals.public_value / totals.value)}) são dinheiro público do Fundo Eleitoral e do Fundo
              Partidário repassado às candidaturas.
            </>
          ) : (
            estimable > 0.005 && (
              <>
                {" "}
                <Fig>{brlc(estimable)}</Fig> foram doados em bens e serviços, estimáveis em dinheiro.
              </>
            )
          )}
        </>
      }
      source={
        <>
          <SourceLine
            label="TSE, receitas das campanhas"
            info={entityOfficial("receitas", year, generatedAt, `Receitas declaradas pelas campanhas em que ${name} aparece como doador.`, { label: "Ver as doações", href: tx })}
            links={[{ label: "Ver as doações uma a uma", href: `${tx}&ordem=valor_desc` }]}
          />
          {year === CURRENT_YEAR && <p className="mt-1 text-[13.5px] text-muted">A campanha de {CURRENT_YEAR} ainda está em curso: os valores mudam a cada nova prestação.</p>}
        </>
      }
    >
      <CampaignTable
        year={year}
        total={nCandidates}
        head="Candidatura"
        noun="candidaturas"
        nLabel="Doações"
        shareLabels={["Do total doado", "Das receitas da campanha"]}
        txHref={(id) => `${tx}&candidato=${id}`}
        allTx={`${tx}&ordem=valor_desc`}
        rows={donations.map((d) => ({
          id: d.candidate_id,
          name: d.ballot_name,
          office: d.office,
          uf: d.uf,
          party: d.party,
          value: d.value,
          n: d.n,
          note: note(d),
          shares: [total > 0 ? d.value / total : null, d.candidate_revenue > 0 ? d.value / d.candidate_revenue : null],
        }))}
      />
    </Section>
  );
}
