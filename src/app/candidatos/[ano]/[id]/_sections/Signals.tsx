import Link from "next/link";
import { Section } from "@/components/ui/editorial";
import { getSignals, type CandidateSummary } from "@/lib/queries/candidate";
import { FAMILY_LABEL, describeSignal } from "@/lib/signals";

/**
 * "Sinais nos dados": patterns computed with fixed public rules. Presented as an annotated
 * list — a neutral label, the fact in one sentence, the usual explanation, and where to look.
 */
export async function SignalsSection({ c }: { c: CandidateSummary }) {
  const signals = await getSignals(c.year, c.id);
  return (
    <Section
      id="padroes"
      question="O que chama atenção nos dados?"
      lede={
        signals.length === 0 ? (
          "Nenhum dos padrões que o Prumo calcula aparece nesta campanha. Isso descreve apenas essas regras; não é um selo de aprovação."
        ) : (
          <>
            Padrões calculados automaticamente, com as mesmas regras para todas as campanhas. São pontos de partida para explorar os dados, não indícios de
            irregularidade.{" "}
            <Link href="/metodologia#padroes" className="link text-ink-2">
              Como são calculados
            </Link>
            .
          </>
        )
      }
    >
      {signals.length > 0 && (
        <ol className="border-t border-rule">
          {signals.map((s, i) => {
            const t = describeSignal(s, { year: c.year, id: c.id, office: c.office, revenue: c.revenue, expense: c.expense });
            return (
              <li key={`${s.code}-${i}`} className="grid gap-x-10 gap-y-2 border-b border-rule py-6 md:grid-cols-[180px_minmax(0,1fr)]">
                <div className="text-[14px] text-ink-2">
                  <span className="font-medium text-ink">{FAMILY_LABEL[s.family]}</span>
                  <span className="block text-muted">{t.title}</span>
                </div>
                <div className="max-w-[72ch]">
                  <p className="text-[17px] leading-relaxed text-ink">{t.body}</p>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{t.context}</p>
                  <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[14.5px]">
                    {t.evidence && (
                      <Link href={t.evidence.href} className="link text-ink">
                        {t.evidence.label} →
                      </Link>
                    )}
                    {t.ref && (
                      <Link href={t.ref.href} className="action">
                        {t.ref.label}
                      </Link>
                    )}
                    <details className="text-[14px] text-muted">
                      <summary className="cursor-pointer list-none hover:text-ink [&::-webkit-details-marker]:hidden">Regra usada</summary>
                      <p className="mt-2 max-w-[64ch] leading-relaxed">{t.rule}</p>
                    </details>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}
