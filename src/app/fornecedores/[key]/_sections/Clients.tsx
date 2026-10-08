import Link from "next/link";
import { Fig, Section, SourceLine } from "@/components/ui/editorial";
import { CampaignTable } from "@/components/entities/tables";
import { lcFirst } from "@/components/entities/parts";
import { entityCalc, entityOfficial } from "@/components/entities/sources";
import type { SupplyRow } from "@/lib/queries/entities";
import { CURRENT_YEAR, EXPENSE_GROUPS } from "@/lib/labels";
import { brlc, num, pct, titleName } from "@/lib/format";

/**
 * Which campaigns contracted this supplier, and how concentrated its electoral revenue is: the
 * share column is each campaign's part of everything the supplier was contracted for that year.
 */
export function Clients({
  name,
  entityKey,
  year,
  total,
  nSupplies,
  nCandidates,
  paid,
  generatedAt,
  supplies,
}: {
  name: string;
  entityKey: string;
  year: number;
  total: number;
  nSupplies: number;
  nCandidates: number;
  paid: number;
  generatedAt: string | null;
  supplies: SupplyRow[];
}) {
  const tx = `/transacoes?ano=${year}&contraparte=${entityKey}&tipo=despesa`;
  const share = (v: number) => (total > 0 ? v / total : 0);
  const top1 = supplies[0];
  const top5 = supplies.slice(0, 5).reduce((s, r) => s + r.value, 0);
  const candidate = (s: SupplyRow) => (
    <Link href={`/candidatos/${year}/${s.candidate_id}`} className="link text-ink">
      {titleName(s.ballot_name)}
    </Link>
  );

  return (
    <Section
      id="campanhas"
      question="Quem contratou?"
      lede={
        <>
          {nCandidates === 1 && top1 ? (
            <>Todo o valor veio da campanha de {candidate(top1)}. </>
          ) : (
            top1 && (
              <>
                A campanha que mais contratou foi a de {candidate(top1)}, com{" "}
                <Fig info={entityCalc("despesas_contratadas", year, generatedAt, "Valor contratado por esta campanha dividido por tudo o que o fornecedor recebeu de campanhas na eleição.")}>
                  {pct(share(top1.value))}
                </Fig>{" "}
                do valor
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
          <Fig info={entityOfficial("despesas_contratadas", year, generatedAt, "Número de despesas distintas (identificador SQ_DESPESA do TSE) com este fornecedor.", { label: "Ver as despesas", href: tx })}>
            {num(nSupplies)}
          </Fig>{" "}
          {nSupplies === 1 ? "despesa" : "despesas"}
          {nSupplies > 1 && (
            <>
              , em média <Fig>{brlc(total / nSupplies)}</Fig>
            </>
          )}
          .{" "}
          {paid > 0 ? (
            <>
              Dos <Fig>{brlc(total)}</Fig> contratados,{" "}
              <Fig
                info={entityOfficial(
                  "despesas_pagas",
                  year,
                  generatedAt,
                  "Soma dos pagamentos que as campanhas registraram para essas despesas (arquivo de despesas pagas, ligado às despesas pelo identificador SQ_DESPESA). Pagamentos podem ser registrados depois; a diferença não indica, por si só, dívida ou irregularidade.",
                )}
              >
                {brlc(paid)}
              </Fig>{" "}
              ({pct(paid / total)}) aparecem como pagos.
            </>
          ) : (
            "Nenhum pagamento a essas despesas aparece registrado até agora."
          )}
        </>
      }
      source={
        <>
          <SourceLine
            label="TSE, despesas contratadas e pagas pelas campanhas"
            info={entityOfficial(
              "despesas_contratadas",
              year,
              generatedAt,
              `Despesas declaradas pelas campanhas em que ${name} aparece como fornecedor, com os pagamentos registrados para cada uma.`,
              { label: "Ver as despesas", href: tx },
            )}
            links={[{ label: "Ver as despesas uma a uma", href: `${tx}&ordem=valor_desc` }]}
          />
          {year === CURRENT_YEAR && <p className="mt-1 text-[13.5px] text-muted">A campanha de {CURRENT_YEAR} ainda está em curso: os valores mudam a cada nova prestação.</p>}
        </>
      }
    >
      <CampaignTable
        year={year}
        total={nCandidates}
        head="Campanha"
        noun="campanhas"
        noteOnPhones={false}
        nLabel="Despesas"
        shareLabels={["Do total do fornecedor", "Das despesas da campanha"]}
        txHref={(id) => `${tx}&candidato=${id}`}
        allTx={`${tx}&ordem=valor_desc`}
        rows={supplies.map((s) => ({
          id: s.candidate_id,
          name: s.ballot_name,
          office: s.office,
          uf: s.uf,
          party: s.party,
          value: s.value,
          n: s.n,
          note: EXPENSE_GROUPS[s.main_group] ? `principalmente ${lcFirst(EXPENSE_GROUPS[s.main_group].label)}` : undefined,
          shares: [share(s.value), s.candidate_expense > 0 ? s.value / s.candidate_expense : null],
        }))}
      />
    </Section>
  );
}
