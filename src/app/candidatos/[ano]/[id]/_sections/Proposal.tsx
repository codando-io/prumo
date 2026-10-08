import Link from "next/link";
import { Section, SourceLine } from "@/components/ui/editorial";
import { getProposalFiles, getProposalTopics } from "@/lib/queries/proposals";
import type { CandidateSummary } from "@/lib/queries/candidate";
import { dateLong, num, titleName } from "@/lib/format";

/** "O que a candidatura propôs?": the official plan, and the Índice Prumo to navigate it. */
export async function ProposalSection({ c }: { c: CandidateSummary }) {
  const [files, topics] = await Promise.all([getProposalFiles(c.year, c.id), getProposalTopics(c.year, c.id)]);
  if (!files.length) return null;
  const name = titleName(c.ballot_name);
  const reader = `/candidatos/${c.year}/${c.id}/proposta`;
  const pages = files.reduce((s, f) => s + f.pages, 0);
  const readable = files.filter((f) => !f.unreadable);
  const max = Math.max(...topics.map((t) => t.pages), 1);
  const published = files.map((f) => f.source_modified).filter(Boolean).sort()[0];

  return (
    <Section
      id="proposta"
      question="O que a candidatura propôs?"
      lede={
        readable.length ? (
          <>
            {name} entregou ao TSE uma proposta de governo de {num(pages)} {pages === 1 ? "página" : "páginas"}
            {files.length > 1 ? `, em ${files.length} arquivos` : ""}. Leia o texto no Prumo, busque uma palavra ou abra cada página no PDF original.
          </>
        ) : (
          <>O TSE publicou a proposta de governo de {name}, mas o arquivo está corrompido e não pôde ser aberto.</>
        )
      }
      source={
        <SourceLine
          label={`TSE, proposta de governo${published ? `, publicada em ${dateLong(published.slice(0, 10))}` : ""}`}
          links={readable.length ? [{ label: "Ler a proposta", href: reader }] : [{ label: "Arquivo do TSE", href: files[0].source_url }]}
        />
      }
    >
      {readable.length > 0 && (
        <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div>
            <form action={reader} method="get" role="search">
              <label htmlFor="proposta-q" className="text-[15px] font-semibold text-ink">
                Buscar na proposta
              </label>
              <div className="mt-2 flex max-w-[440px] gap-2">
                <input id="proposta-q" name="q" type="search" placeholder="Ex.: imposto, creche, polícia" className="field h-10 w-full min-w-0 text-[15px] placeholder:text-muted" />
                <button type="submit" className="shrink-0 rounded-[6px] border border-rule-strong px-3 text-[14px] text-ink hover:border-accent">
                  Buscar
                </button>
              </div>
            </form>
            <ul className="mt-5 space-y-1 text-[14.5px]">
              <li>
                <Link href={reader} className="link">
                  Ler a proposta completa no Prumo
                </Link>
              </li>
              {readable.map((f) => (
                <li key={f.part}>
                  <a href={`/api/proposta/${c.year}/${f.file}`} target="_blank" rel="noreferrer" className="action">
                    {files.length > 1 ? `PDF original, arquivo ${f.part}` : "PDF original"} ({num(f.pages)} p.) <span aria-hidden="true">↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
          {topics.length > 0 && (
            <div className="border-l-2 border-accent pl-5">
              <h3 className="text-[14px] font-semibold text-accent">Índice Prumo</h3>
              <p className="mt-1 max-w-[62ch] text-[14px] leading-relaxed text-ink-2">
                Temas encontrados por palavras-chave, para navegar no documento. Mostra onde cada assunto aparece, não o que foi proposto.
              </p>
              <table className="dt mt-3">
                <thead>
                  <tr>
                    <th scope="col">Tema</th>
                    <th scope="col" className="n">
                      Páginas
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topics.map((t) => (
                    <tr key={t.topic}>
                      <td>
                        <Link href={`${reader}?tema=${t.topic}`} className="e no-underline hover:underline">
                          {t.label}
                        </Link>
                        <div className="mt-1 h-[4px] max-w-[240px]" aria-hidden="true">
                          <div className="h-full rounded-r-[2px] bg-[var(--muted)]" style={{ width: `${Math.max(2, (t.pages / max) * 100)}%` }} />
                        </div>
                      </td>
                      <td className="n text-ink">{num(t.pages)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
