import Link from "next/link";
import { Section } from "@/components/ui/editorial";
import { getCampaignChanges, type CandidateSummary } from "@/lib/queries/candidate";
import { FILING_TYPE, cdnFile, tseCandidateUrl } from "@/lib/labels";
import { brlc, dateLong, dateTime, num } from "@/lib/format";

export async function DataSection({ c }: { c: CandidateSummary }) {
  const changes = await getCampaignChanges(c.year, c.id);
  const files = [
    { label: "Candidaturas", f: cdnFile("candidatos", c.year), at: c.generated_at },
    { label: "Receitas", f: cdnFile("receitas", c.year), at: c.finance_generated_at },
    { label: "Despesas contratadas", f: cdnFile("despesas_contratadas", c.year), at: c.finance_generated_at },
    { label: "Despesas pagas", f: cdnFile("despesas_pagas", c.year), at: c.finance_generated_at },
    { label: "Bens declarados", f: cdnFile("bens", c.year), at: null },
    { label: "Votação", f: cdnFile("votacao", c.year), at: null },
  ];
  const tx = `/transacoes?ano=${c.year}&candidato=${c.id}`;

  return (
    <Section
      id="dados"
      question="De onde vêm estes números?"
      lede="Dos arquivos abaixo, publicados pelo TSE no Portal de Dados Abertos. Cada transação pode ser conferida e baixada."
    >
      <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Registros desta campanha</h3>
          <ul className="mt-3 space-y-2.5 text-[14.5px]">
            <li>
              <Link className="link" href={tx}>
                Explorar as {num(c.n_revenue_tx + c.n_expense_tx)} transações
              </Link>
            </li>
            <li>
              <a className="link" href={`/api/transacoes?ano=${c.year}&candidato=${c.id}&formato=csv`}>
                Baixar receitas e despesas (CSV)
              </a>
            </li>
            <li>
              <a className="link" href={tseCandidateUrl(c.year, c.uf, c.id)} target="_blank" rel="noreferrer">
                Página oficial no DivulgaCandContas <span aria-hidden="true">↗</span>
              </a>
            </li>
          </ul>
          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[14px]">
            <dt className="text-muted">Identificador TSE</dt>
            <dd className="tnum">{c.id}</dd>
            {c.has_finance && (
              <>
                <dt className="text-muted">Prestação considerada</dt>
                <dd>
                  {FILING_TYPE[c.filing_type ?? ""] ?? c.filing_type}, entregue em {dateLong(c.filing_date)}
                </dd>
              </>
            )}
            <dt className="text-muted">Contas publicadas em</dt>
            <dd>{dateTime(c.finance_generated_at)}</dd>
            <dt className="text-muted">Candidatura publicada em</dt>
            <dd>{dateTime(c.generated_at)}</dd>
          </dl>

          <h3 className="mt-10 text-[15px] font-semibold text-ink">Mudanças desde a primeira captura</h3>
          {changes.campaign.length === 0 && changes.tx.length === 0 ? (
            <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
              Nenhuma mudança registrada nas capturas feitas pelo Prumo. A cada atualização do TSE, comparamos as transações uma a uma e mostramos aqui o que foi
              incluído, alterado ou removido.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-rule border-y border-rule text-[14px]">
              {changes.campaign.map((ch) => (
                <li key={ch.to_capture} className="py-2.5">
                  <div className="font-medium">Atualização de {dateTime(captureIso(ch.to_capture))}</div>
                  <div className="text-ink-2">
                    {ch.old_filing_type !== ch.new_filing_type && (
                      <>
                        Nova prestação: {FILING_TYPE[ch.new_filing_type ?? ""] ?? ch.new_filing_type ?? "removida"}.{" "}
                      </>
                    )}
                    Receitas {brlc(ch.old_revenue)} → {brlc(ch.new_revenue)}; despesas {brlc(ch.old_expense)} → {brlc(ch.new_expense)}.
                  </div>
                  <div className="text-[13px] text-muted">
                    {changes.tx
                      .filter((t) => t.to_capture === ch.to_capture)
                      .map((t) => `${num(t.n)} ${t.kind === "revenue" ? "receitas" : "despesas"} ${t.change === "added" ? "incluídas" : t.change === "removed" ? "removidas" : "alteradas"}`)
                      .join(", ")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Arquivos de origem</h3>
          <ul className="mt-3 divide-y divide-rule border-y border-rule text-[14px]">
            {files.map((f) => (
              <li key={f.label} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-ink">{f.label}</span>
                  <a className="action" href={f.f.zip} rel="noreferrer">
                    zip <span aria-hidden="true">↗</span>
                  </a>
                </div>
                <div className="break-all text-muted">{f.f.file}</div>
                {f.at && <div className="text-ink-2">Gerado pelo TSE em {dateTime(f.at)}</div>}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            O Prumo corrige apenas a codificação dos arquivos (de Latin-1 para UTF-8). Nenhum valor é alterado. Categorias agrupadas e métricas calculadas estão
            descritas na{" "}
            <Link className="link" href="/metodologia">
              metodologia
            </Link>
            .
          </p>
        </div>
      </div>
    </Section>
  );
}

function captureIso(id: string) {
  return `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}T${id.slice(9, 11)}:${id.slice(11, 13)}:${id.slice(13, 15)}`;
}
