import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container } from "@/components/ui/primitives";
import { Caption, EmptyNote, Fig, PageHeader, Section, SourceLine } from "@/components/ui/editorial";
import { biggestCampaignChanges, captures, changeSummary, dataStatus, filingStatus, latestFilings, sourceFiles } from "@/lib/queries/meta";
import { q } from "@/lib/db";
import { CURRENT_YEAR, FILING_TYPE } from "@/lib/labels";
import { FAMILY_LABEL } from "@/lib/signals";
import { brlc, date, dateLong, dateTime, num, pct, titleName } from "@/lib/format";

export const metadata: Metadata = {
  title: "Atualizações dos dados",
  description: "Quando os dados do TSE foram publicados, o que mudou entre uma atualização e outra e quais prestações de contas já foram entregues.",
};

const CRUMBS = [{ label: "Sobre os dados", href: "/metodologia" }, { label: "Atualizações" }];
const TITLE = "Atualizações dos dados";

export default function UpdatesPage() {
  return (
    <Container className="pb-8">
      <Suspense fallback={<UpdatesLoading />}>
        <Updates />
      </Suspense>
    </Container>
  );
}

function UpdatesLoading() {
  return (
    <div aria-busy="true">
      <PageHeader crumbs={CRUMBS} title={TITLE} />
      <p className="mt-8 text-[15px] text-muted">Comparando as capturas dos dados…</p>
    </div>
  );
}

const CHANGE_LABEL: Record<string, string> = { added: "incluídas", modified: "alteradas", removed: "removidas" };
const CHANGE_ORDER = ["added", "modified", "removed"];

/** "20261007T040537" -> "2026-10-07T04:05:37" */
const capIso = (id: string) => `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}T${id.slice(9, 11)}:${id.slice(11, 13)}:${id.slice(13, 15)}`;

/** "a, b e c" */
function listPt(items: string[]) {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

const signed = (v: number) => (v > 0 ? `+${brlc(v)}` : brlc(v));

type Summary = Awaited<ReturnType<typeof changeSummary>>[number];
type CampaignChange = Awaited<ReturnType<typeof biggestCampaignChanges>>[number];

async function Updates() {
  const [status, summary, biggest, filings, latest, files, caps, changeSignals] = await Promise.all([
    dataStatus(),
    changeSummary(),
    biggestCampaignChanges(300),
    filingStatus(CURRENT_YEAR),
    latestFilings(CURRENT_YEAR, 12),
    sourceFiles(),
    captures(),
    q<{ year: number; n: number }>(`SELECT year, count(DISTINCT candidate_id) AS n FROM signal WHERE family = 'mudanca' GROUP BY year ORDER BY year DESC`),
  ]);

  // Every capture, newest first, with the one it was compared to.
  const entries = [...caps]
    .sort((a, b) => b.capture_id.localeCompare(a.capture_id))
    .map((c) => {
      const prev = caps
        .filter((p) => p.year === c.year && p.capture_id < c.capture_id)
        .sort((a, b) => b.capture_id.localeCompare(a.capture_id))[0];
      const rows = summary.filter((s) => s.year === c.year && s.to_capture === c.capture_id);
      const camps = biggest.filter((b) => b.year === c.year && b.to_capture === c.capture_id);
      return { ...c, prev: rows[0]?.from_capture ?? prev?.capture_id ?? null, rows, camps };
    });
  const newest = entries[0];
  const count = (rows: Summary[], change: string) => rows.filter((r) => r.change === change).reduce((s, r) => s + r.n, 0);

  const totalCand = filings.reduce((s, f) => s + f.n, 0);
  const withFiling = filings.filter((f) => f.filing_type).reduce((s, f) => s + f.n, 0);
  const commonest = filings.find((f) => f.filing_type);
  const signalsNow = changeSignals.reduce((s, r) => s + r.n, 0);

  return (
    <>
      <PageHeader
        crumbs={CRUMBS}
        title={TITLE}
        lede={
          <>
            A cada publicação do TSE, o Prumo guarda uma captura das contas de campanha e compara as transações, uma a uma, com a captura anterior.{" "}
            {!newest ? (
              "Ainda não há nenhuma captura guardada."
            ) : !newest.prev ? (
              <>
                A mais recente corresponde à publicação de <Fig>{dateTime(newest.generated_at)}</Fig>, com as contas de {newest.year}; como é a primeira captura dessa
                eleição, ainda não há o que comparar.
              </>
            ) : newest.rows.length === 0 ? (
              <>
                A mais recente, de <Fig>{dateTime(newest.generated_at)}</Fig> (contas de {newest.year}), não trouxe mudanças em receitas ou despesas.
              </>
            ) : (
              <>
                A mais recente, de <Fig>{dateTime(newest.generated_at)}</Fig> (contas de {newest.year}), trouxe <Fig>{num(count(newest.rows, "added"))}</Fig>{" "}
                transações incluídas, <Fig>{num(count(newest.rows, "modified"))}</Fig> alteradas e <Fig>{num(count(newest.rows, "removed"))}</Fig> removidas.
              </>
            )}
          </>
        }
      />

      <Section
        id="mudancas"
        question="O que mudou a cada publicação?"
        lede={
          <>
            Da captura mais recente para a mais antiga, com as campanhas cujos totais mais mudaram. Quando a variação é grande, a página da candidatura mostra o
            sinal “{FAMILY_LABEL.mudanca}”
            {signalsNow > 0 ? (
              <>
                , que hoje aparece em <Fig>{num(signalsNow)}</Fig> {signalsNow === 1 ? "campanha" : "campanhas"}.
              </>
            ) : (
              "."
            )}
          </>
        }
        source={<SourceLine label="Comparação do Prumo entre capturas dos arquivos do TSE" links={[{ label: "Como o sinal é calculado", href: "/metodologia#padroes" }]} />}
      >
        {entries.length === 0 ? (
          <EmptyNote>Nenhuma captura foi guardada ainda. Depois da primeira atualização da base, as publicações do TSE aparecem aqui.</EmptyNote>
        ) : (
          <ol className="border-t border-rule">
            {entries.map((e) => (
              <li key={`${e.year}-${e.capture_id}`} className="grid gap-x-10 gap-y-3 border-b border-rule py-7 md:grid-cols-[200px_minmax(0,1fr)]">
                <div>
                  <h3 className="font-serif text-[22px] font-medium leading-tight text-ink">{dateLong(e.generated_at)}</h3>
                  <p className="mt-1 text-[14px] text-ink-2">
                    {e.generated_at?.slice(11, 16)}, contas de {e.year}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="max-w-[72ch] text-[16px] leading-relaxed text-ink">{entrySentence(e.year, e.prev, e.rows)}</p>
                  {e.camps.length > 0 && <CampaignTable rows={e.camps} />}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section
        id="publicacoes"
        question="Quando o TSE publicou os dados de cada eleição?"
        lede={
          <>
            Datas e horários como publicados pelo TSE, no horário de Brasília. A base do Prumo foi gerada em <Fig>{dateTime(status.built_at)}</Fig>.
          </>
        }
      >
        <table className="dt">
          <thead>
            <tr>
              <th scope="col">Eleição</th>
              <th scope="col" className="n">
                Contas de campanha
              </th>
              <th scope="col" className="n hidden md:table-cell">
                Candidaturas
              </th>
              <th scope="col" className="n hidden md:table-cell">
                Votação
              </th>
              <th scope="col" className="n hidden sm:table-cell">
                Capturas
              </th>
              <th scope="col" className="n hidden sm:table-cell">
                Transações com mudança
              </th>
            </tr>
          </thead>
          <tbody>
            {status.elections.map((e) => (
              <tr key={e.year}>
                <td>
                  <Link href={`/?ano=${e.year}`} className="e no-underline hover:underline">
                    {e.year}
                  </Link>
                </td>
                <td className="n text-ink">{dateTime(e.finance_generated_at)}</td>
                <td className="n s hidden md:table-cell">{dateTime(e.candidates_generated_at)}</td>
                <td className="n s hidden md:table-cell">{dateTime(e.votes_generated_at)}</td>
                <td className="n s hidden sm:table-cell">{num(e.captures)}</td>
                <td className="n s hidden sm:table-cell">{num(e.changes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section
        id="entregas"
        question={`Quantas campanhas de ${CURRENT_YEAR} já prestaram contas?`}
        lede={
          <>
            <Fig>{num(withFiling)}</Fig> das {num(totalCand)} candidaturas de {CURRENT_YEAR} já têm alguma prestação publicada
            {commonest?.filing_type ? <>; a mais comum é {(FILING_TYPE[commonest.filing_type] ?? commonest.filing_type).toLowerCase()}</> : ""}. Durante a campanha há
            relatórios financeiros (a cada doação recebida, em até 72 horas) e uma prestação parcial; a final vem depois da eleição. Os dados abertos trazem só a
            prestação mais recente de cada campanha.
          </>
        }
      >
        <div className="grid gap-x-12 gap-y-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">Prestação mais recente de cada candidatura</h3>
            <table className="dt mt-3">
              <thead>
                <tr>
                  <th scope="col">Prestação</th>
                  <th scope="col" className="n">
                    Candidaturas
                  </th>
                  <th scope="col" className="n">
                    Do total
                  </th>
                </tr>
              </thead>
              <tbody>
                {filings.map((f) => (
                  <tr key={f.filing_type ?? "nenhuma"}>
                    <td className={f.filing_type ? "e" : "s"}>{f.filing_type ? (FILING_TYPE[f.filing_type] ?? f.filing_type) : "Nenhuma prestação publicada"}</td>
                    <td className="n text-ink">{num(f.n)}</td>
                    <td className="n s">{pct(totalCand ? f.n / totalCand : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-ink">Entregas mais recentes</h3>
            {latest.length === 0 ? (
              <div className="mt-3">
                <EmptyNote>Nenhuma prestação de contas de {CURRENT_YEAR} foi publicada ainda.</EmptyNote>
              </div>
            ) : (
              <table className="dt mt-3">
                <thead>
                  <tr>
                    <th scope="col">Candidatura</th>
                    <th scope="col" className="hidden sm:table-cell">
                      Prestação
                    </th>
                    <th scope="col" className="n">
                      Entregue em
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {latest.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/candidatos/${CURRENT_YEAR}/${c.id}`} className="e no-underline hover:underline">
                          {titleName(c.ballot_name)}
                        </Link>
                        <div className="s text-[13.5px]">
                          {c.office}
                          {c.uf !== "BR" ? ` (${c.uf})` : ""}, {c.party}
                          <span className="sm:hidden">; {(FILING_TYPE[c.filing_type] ?? c.filing_type).toLowerCase()}</span>
                        </div>
                      </td>
                      <td className="s hidden sm:table-cell">{FILING_TYPE[c.filing_type] ?? c.filing_type}</td>
                      <td className="n text-ink">{date(c.filing_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Section>

      <Section id="arquivos" question="Quais arquivos do TSE estão nesta base?" lede="As versões dos arquivos do Portal de Dados Abertos do TSE usadas para montar o Prumo.">
        <table className="dt">
          <thead>
            <tr>
              <th scope="col">Arquivo</th>
              <th scope="col" className="n">
                Modificado no TSE
              </th>
              <th scope="col" className="n hidden md:table-cell">
                Baixado pelo Prumo
              </th>
              <th scope="col" className="n hidden sm:table-cell">
                Tamanho
              </th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.url}>
                <td className="break-all">
                  <a className="e no-underline hover:underline" href={f.url} rel="noreferrer">
                    {f.file}
                  </a>
                </td>
                <td className="n text-ink">{dateTime(f.last_modified)}</td>
                <td className="n s hidden md:table-cell">{dateTime(f.downloaded_at)}</td>
                <td className="n s hidden sm:table-cell">{f.content_length ? `${num(Math.round(f.content_length / 1e6))} MB` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Caption>
          Horários em UTC, como informados pelo servidor do TSE. Para atualizar a base, o Prumo verifica a data de modificação de cada arquivo e só baixa o que mudou
          (comando <code className="font-mono text-[13px] text-ink-2">npm run data:update</code>).
        </Caption>
      </Section>
    </>
  );
}

function entrySentence(year: number, prev: string | null, rows: Summary[]) {
  if (!prev) return `Primeira captura guardada das contas de ${year}: é a referência para comparar as próximas publicações do TSE.`;
  const since = `Em relação à captura de ${dateTime(capIso(prev))}`;
  if (rows.length === 0) return `${since}, nenhuma receita ou despesa mudou.`;
  const parts = (["revenue", "expense"] as const)
    .map((kind) => {
      const byChange = rows
        .filter((r) => r.kind === kind)
        .sort((a, b) => CHANGE_ORDER.indexOf(a.change) - CHANGE_ORDER.indexOf(b.change))
        .map((r) => `${num(r.n)} ${CHANGE_LABEL[r.change] ?? r.change} (${signed(r.delta)})`);
      return byChange.length ? `${kind === "revenue" ? "receitas" : "despesas"}: ${listPt(byChange)}` : null;
    })
    .filter(Boolean);
  return `${since}, ${parts.join("; ")}.`;
}

function CampaignTable({ rows }: { rows: CampaignChange[] }) {
  const head = rows.slice(0, 10);
  const rest = rows.slice(10);
  const body = (list: CampaignChange[]) =>
    list.map((b) => (
      <tr key={b.candidate_id}>
        <td>
          <Link className="e no-underline hover:underline" href={`/candidatos/${b.year}/${b.candidate_id}#dados`}>
            {titleName(b.ballot_name)}
          </Link>
          <div className="s text-[13.5px]">
            {b.office}
            {b.uf !== "BR" ? ` (${b.uf})` : ""}, {b.party}
            {b.old_filing_type !== b.new_filing_type && <>; nova prestação: {(FILING_TYPE[b.new_filing_type ?? ""] ?? b.new_filing_type ?? "removida").toLowerCase()}</>}
          </div>
        </td>
        <BeforeAfter before={b.old_revenue} after={b.new_revenue} />
        <BeforeAfter before={b.old_expense} after={b.new_expense} />
      </tr>
    ));
  const thead = (
    <thead>
      <tr>
        <th scope="col">Campanha</th>
        <th scope="col" className="n">
          Receitas, antes → depois
        </th>
        <th scope="col" className="n">
          Despesas, antes → depois
        </th>
      </tr>
    </thead>
  );
  return (
    <div className="mt-5">
      <table className="dt">
        {thead}
        <tbody>{body(head)}</tbody>
      </table>
      {rest.length > 0 && (
        <details className="mt-3">
          <summary className="action cursor-pointer list-none text-[14.5px] [&::-webkit-details-marker]:hidden">Ver outras {num(rest.length)} campanhas</summary>
          <table className="dt mt-3">
            {thead}
            <tbody>{body(rest)}</tbody>
          </table>
        </details>
      )}
    </div>
  );
}

function BeforeAfter({ before, after }: { before: number | null; after: number | null }) {
  const same = (before ?? 0) === (after ?? 0);
  return (
    <td className="n whitespace-normal sm:whitespace-nowrap">
      <span className="s whitespace-nowrap">{brlc(before ?? 0)} →</span> <span className={`whitespace-nowrap ${same ? "s" : "text-ink"}`}>{brlc(after ?? 0)}</span>
    </td>
  );
}
