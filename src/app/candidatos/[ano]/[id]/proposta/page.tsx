import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Container } from "@/components/ui/primitives";
import { Crumbs, EmptyNote } from "@/components/ui/editorial";
import { candidacyExists } from "@/lib/queries/exists";
import { getCandidate } from "@/lib/queries/candidate";
import {
  TOPIC_LABEL,
  TOPIC_MIN_HITS,
  findInText,
  getProposalFiles,
  getProposalHeadings,
  getProposalPages,
  getProposalTopics,
  getTopicPages,
  type ProposalFile,
  type ProposalPage,
  type Snippet,
} from "@/lib/queries/proposals";
import { UF_NAMES } from "@/lib/labels";
import { dateLong, num, titleName } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/candidatos/[ano]/[id]/proposta">): Promise<Metadata> {
  const { ano, id } = await params;
  const c = await getCandidate(Number(ano), id);
  if (!c) return { title: "Proposta não encontrada" };
  return {
    title: `Proposta de governo — ${titleName(c.ballot_name)} (${c.year})`,
    description: `Leia, busque e navegue pela proposta de governo que ${titleName(c.ballot_name)} entregou ao TSE em ${c.year}, com link para cada página do documento original.`,
  };
}

// Blocking on a cheap existence check lets unknown candidacies return a real 404.
export const instant = false;

export default async function ProposalPage({ params, searchParams }: PageProps<"/candidatos/[ano]/[id]/proposta">) {
  const { ano, id } = await params;
  if (!(await candidacyExists(Number(ano), id))) notFound();
  return (
    <Container className="pb-16">
      <Suspense fallback={<p className="pt-10 text-[15px] text-muted">Abrindo a proposta…</p>}>
        <Reader params={params} searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
const pdfHref = (year: number, f: { file: string }, page?: number) => `/api/proposta/${year}/${f.file}${page ? `#page=${page}` : ""}`;
const anchor = (part: number, page: number) => `p-${part}-${page}`;

/** Paragraphs for reading: lines of a block joined, list items kept on their own line. Words are never changed. */
function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      let out = "";
      for (const l of lines) {
        if (!out) out = l;
        else if (/^([•●▪■◦○➢►✓\-–—*]\s?|\d{1,2}[.)]\s|[a-z][)]\s)/.test(l)) out += `\n${l}`;
        else if (/-$/.test(out) && /^\p{Ll}/u.test(l)) out += l;
        else out += ` ${l}`;
      }
      return out;
    })
    .filter(Boolean);
}

async function Reader({ params, searchParams }: { params: PageProps<"/candidatos/[ano]/[id]/proposta">["params"]; searchParams: PageProps<"/candidatos/[ano]/[id]/proposta">["searchParams"] }) {
  const [{ ano, id }, sp] = await Promise.all([params, searchParams]);
  const year = Number(ano);
  const [c, files] = await Promise.all([getCandidate(year, id), getProposalFiles(year, id)]);
  if (!c) notFound();
  const name = titleName(c.ballot_name);
  const base = `/candidatos/${year}/${id}/proposta`;
  const profile = `/candidatos/${year}/${id}`;

  const header = (
    <header className="pt-8 sm:pt-10">
      <Crumbs
        items={[
          { label: `Eleições ${year}`, href: `/?ano=${year}` },
          ...(c.uf !== "BR" ? [{ label: UF_NAMES[c.uf] ?? c.uf, href: `/estados/${c.uf}?ano=${year}` }] : []),
          { label: name, href: profile },
          { label: "Proposta de governo" },
        ]}
      />
      <h1 className="title mt-5 text-ink">Proposta de governo</h1>
    </header>
  );

  if (!files.length) {
    return (
      <>
        {header}
        <div className="mt-6">
          <EmptyNote>
            O TSE não publicou proposta de governo para {name} em {year}. Só candidaturas a presidente e a governador entregam esse documento.{" "}
            <Link href={profile} className="link">
              Voltar à candidatura
            </Link>
          </EmptyNote>
        </div>
      </>
    );
  }

  const term = one(sp.q);
  const topic = one(sp.tema);
  const partParam = Number(one(sp.arquivo)) || 1;
  const readable = files.filter((f) => !f.unreadable);
  const current = files.find((f) => f.part === partParam) ?? files[0];
  const [pages, headings, topics, topicPages] = await Promise.all([
    getProposalPages(year, id),
    getProposalHeadings(year, id),
    getProposalTopics(year, id),
    topic && TOPIC_LABEL[topic] ? getTopicPages(year, id, topic) : Promise.resolve([]),
  ]);
  const totalPages = files.reduce((s, f) => s + f.pages, 0);
  const ocrPages = files.reduce((s, f) => s + f.ocr_pages, 0);
  const emptyPages = files.reduce((s, f) => s + f.empty_pages, 0);
  const multi = files.length > 1;
  const fileLabel = (part: number) => (multi ? `arquivo ${part}, ` : "");
  const published = files.map((f) => f.source_modified).filter(Boolean).sort()[0];

  return (
    <>
      {header}
      <div className="mt-4 max-w-[820px]">
        <p className="lede">
          Documento oficial que {name} ({c.party}) entregou ao TSE ao registrar a candidatura a {c.office.toLowerCase()}
          {c.uf !== "BR" ? ` por ${UF_NAMES[c.uf] ?? c.uf}` : ""} em {year}: {num(totalPages)} {totalPages === 1 ? "página" : "páginas"}
          {multi ? ` em ${files.length} arquivos` : ""}. O Prumo mostra o texto do PDF e um índice para navegar nele; o conteúdo da proposta não é alterado.
        </p>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[14px]">
          {readable.map((f) => (
            <li key={f.part}>
              <a href={pdfHref(year, f)} target="_blank" rel="noreferrer" className="action">
                {multi ? `PDF original, arquivo ${f.part}` : "Abrir o PDF original"} <span aria-hidden="true">↗</span>
              </a>
            </li>
          ))}
          <li>
            <Link href={profile} className="action">
              Candidatura de {name}
            </Link>
          </li>
          <li>
            <a href={files[0].source_url} className="action" rel="noreferrer">
              Arquivo do TSE (zip) <span aria-hidden="true">↗</span>
            </a>
          </li>
        </ul>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
          Fonte: TSE, propostas de governo (dados abertos)
          {published ? `, arquivo publicado em ${dateLong(published.slice(0, 10))}` : ""}. Nome do arquivo no TSE: {files.map((f) => f.original_name).join(", ")}.
          {ocrPages > 0 && ` ${num(ocrPages)} ${ocrPages === 1 ? "página digitalizada foi lida" : "páginas digitalizadas foram lidas"} por reconhecimento de texto (OCR) e podem conter erros.`}
          {emptyPages > 0 && ` ${num(emptyPages)} ${emptyPages === 1 ? "página não tem" : "páginas não têm"} texto legível: veja no PDF.`}
        </p>
      </div>

      {readable.length === 0 ? (
        <div className="mt-10">
          <EmptyNote>
            O arquivo publicado pelo TSE está corrompido e não pôde ser aberto, nem pelo Prumo. Ele pode ser baixado do{" "}
            <a href={files[0].source_url} className="link">
              arquivo original do TSE
            </a>{" "}
            para conferência.
          </EmptyNote>
        </div>
      ) : (
        <div className="mt-10 grid gap-x-14 gap-y-10 border-t border-rule-strong pt-8 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-[84px] lg:max-h-[calc(100vh-100px)] lg:self-start lg:overflow-y-auto lg:pr-2" aria-label="Índice Prumo">
            <form action={base} method="get" role="search">
              <label htmlFor="q" className="text-[14px] font-semibold text-ink">
                Buscar na proposta
              </label>
              <div className="mt-2 flex gap-2">
                <input id="q" name="q" type="search" defaultValue={term} placeholder="Ex.: imposto, creche, polícia" className="field h-10 w-full min-w-0 text-[15px] placeholder:text-muted" />
                <button type="submit" className="shrink-0 rounded-[6px] border border-rule-strong px-3 text-[14px] text-ink hover:border-accent">
                  Buscar
                </button>
              </div>
            </form>

            <div className="mt-8 border-l-2 border-accent pl-4">
              <h2 className="text-[14px] font-semibold text-accent">Índice Prumo</h2>
              <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
                Gerado pelo Prumo para ajudar a navegar. Não resume nem interpreta a proposta.{" "}
                <Link href="/metodologia#propostas" className="link">
                  Como funciona
                </Link>
              </p>

              {topics.length > 0 && (
                <>
                  <h3 className="mt-5 text-[13.5px] font-medium text-ink">Temas por palavras-chave</h3>
                  <ul className="mt-2 space-y-1 text-[14.5px]">
                    {topics.map((t) => (
                      <li key={t.topic} className="flex items-baseline justify-between gap-3">
                        <Link
                          href={`${base}?tema=${t.topic}`}
                          className={`border-b no-underline ${topic === t.topic ? "border-accent text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
                        >
                          {t.label}
                        </Link>
                        <span className="tnum shrink-0 text-[13px] text-muted">
                          {num(t.pages)} {t.pages === 1 ? "pág." : "págs."}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {headings.length > 0 && (
                <>
                  <h3 className="mt-6 text-[13.5px] font-medium text-ink">Títulos encontrados no documento</h3>
                  <ol className="mt-2 space-y-1.5 text-[14px] leading-snug">
                    {headings.slice(0, 80).map((h) => (
                      <li key={`${h.part}-${h.ord}`} className={`flex items-baseline justify-between gap-3 ${h.level > 1 ? "pl-3" : ""}`}>
                        <Link href={`${base}?arquivo=${h.part}#${anchor(h.part, h.page)}`} className="min-w-0 text-ink-2 no-underline hover:text-ink hover:underline hover:decoration-accent">
                          {sentenceCase(h.text)}
                        </Link>
                        <span className="tnum shrink-0 text-[13px] text-muted">
                          {multi ? `${h.part}·` : ""}
                          {h.page}
                        </span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </div>

            <nav aria-label="Páginas" className="mt-8">
              <h2 className="text-[14px] font-semibold text-ink">Páginas{multi ? ` do arquivo ${current.part}` : ""}</h2>
              <ol className="mt-2 flex flex-wrap gap-x-1 gap-y-1 text-[13.5px]">
                {Array.from({ length: current.pages }, (_, i) => i + 1).map((p) => (
                  <li key={p}>
                    <Link href={`${base}?arquivo=${current.part}#${anchor(current.part, p)}`} className="tnum inline-block min-w-[2.1rem] py-0.5 text-center text-ink-2 no-underline hover:text-ink hover:underline hover:decoration-accent">
                      {p}
                    </Link>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>

          <div className="min-w-0">
            {term ? (
              <SearchResults term={term} pages={pages} files={files} year={year} base={base} multi={multi} fileLabel={fileLabel} headings={headings} />
            ) : topic && TOPIC_LABEL[topic] ? (
              <TopicResults topic={topic} rows={topicPages} pages={pages} files={files} year={year} base={base} fileLabel={fileLabel} />
            ) : (
              <Document pages={pages.filter((p) => p.part === current.part)} file={current} files={files} year={year} base={base} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Headings detected in capitals read better in sentence case; the text itself is unchanged otherwise. */
function sentenceCase(s: string) {
  const letters = s.replace(/[^\p{L}]/gu, "");
  if (letters !== letters.toUpperCase()) return s;
  const lower = s.toLocaleLowerCase("pt-BR");
  return lower.replace(/\p{L}/u, (ch) => ch.toLocaleUpperCase("pt-BR"));
}

function Highlight({ s }: { s: Snippet }) {
  return (
    <>
      {s.before}
      <mark className="bg-[color-mix(in_srgb,var(--accent)_28%,transparent)] px-0.5 text-ink">{s.match}</mark>
      {s.after}
    </>
  );
}

function ResultLinks({ year, base, file, page }: { year: number; base: string; file: ProposalFile; page: number }) {
  return (
    <span className="flex flex-wrap gap-x-4 text-[14px]">
      <Link href={`${base}?arquivo=${file.part}#${anchor(file.part, page)}`} className="action">
        Ler a página
      </Link>
      <a href={pdfHref(year, file, page)} target="_blank" rel="noreferrer" className="action">
        Página {page} no PDF original <span aria-hidden="true">↗</span>
      </a>
    </span>
  );
}

function SearchResults({
  term,
  pages,
  files,
  year,
  base,
  multi,
  fileLabel,
  headings,
}: {
  term: string;
  pages: ProposalPage[];
  files: ProposalFile[];
  year: number;
  base: string;
  multi: boolean;
  fileLabel: (part: number) => string;
  headings: { part: number; page: number; text: string }[];
}) {
  // The section a page belongs to: the last title detected on or before it (Índice Prumo).
  const sectionOf = (part: number, page: number) => [...headings].reverse().find((h) => h.part === part && h.page <= page)?.text;
  const results = pages.map((p) => ({ p, ...findInText(p.text, term) })).filter((r) => r.count > 0);
  const total = results.reduce((s, r) => s + r.count, 0);
  const fileOf = (part: number) => files.find((f) => f.part === part)!;
  return (
    <section aria-labelledby="busca">
      <div className="border-l-2 border-accent pl-4">
        <p className="text-[13.5px] text-accent">Busca do Prumo no texto extraído</p>
        <h2 id="busca" className="question mt-1 text-ink">
          {total === 0 ? `Nenhuma ocorrência de “${term}”` : `“${term}” aparece ${num(total)} ${total === 1 ? "vez" : "vezes"} em ${num(results.length)} ${results.length === 1 ? "página" : "páginas"}`}
        </h2>
        <p className="mt-2 text-[14.5px] text-ink-2">
          Busca sem diferenciar acentos e maiúsculas{multi ? ", em todos os arquivos da proposta" : ""}. Páginas digitalizadas sem texto legível não entram na busca.{" "}
          <Link href={base} className="link">
            Voltar ao documento
          </Link>
        </p>
      </div>
      {total === 0 ? (
        <p className="mt-8 max-w-[64ch] text-[15px] text-ink-2">Tente outra palavra, só o começo dela (“tribut” encontra tributo e tributária) ou um sinônimo.</p>
      ) : (
        <ol className="mt-8 border-t border-rule">
          {results.map((r) => (
            <li key={`${r.p.part}-${r.p.page}`} className="border-b border-rule py-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h3 className="text-[15px] font-semibold text-ink">
                  {fileLabel(r.p.part)}página {r.p.page}
                  <span className="ml-2 font-normal text-muted">
                    {num(r.count)} {r.count === 1 ? "ocorrência" : "ocorrências"}
                    {r.p.ocr ? ", texto lido por OCR" : ""}
                  </span>
                </h3>
                <ResultLinks year={year} base={base} file={fileOf(r.p.part)} page={r.p.page} />
              </div>
              {sectionOf(r.p.part, r.p.page) && (
                <p className="mt-1 text-[13.5px] text-muted">Seção (título detectado): {sentenceCase(sectionOf(r.p.part, r.p.page)!)}</p>
              )}
              <ul className="mt-2 space-y-2 font-serif text-[16.5px] leading-relaxed text-ink-2">
                {r.snippets.map((s, i) => (
                  <li key={i}>
                    <Highlight s={s} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function TopicResults({
  topic,
  rows,
  pages,
  files,
  year,
  base,
  fileLabel,
}: {
  topic: string;
  rows: { part: number; page: number; hits: number }[];
  pages: ProposalPage[];
  files: ProposalFile[];
  year: number;
  base: string;
  fileLabel: (part: number) => string;
}) {
  const fileOf = (part: number) => files.find((f) => f.part === part)!;
  const label = TOPIC_LABEL[topic];
  return (
    <section aria-labelledby="tema">
      <div className="border-l-2 border-accent pl-4">
        <p className="text-[13.5px] text-accent">Índice Prumo · tema por palavras-chave</p>
        <h2 id="tema" className="question mt-1 text-ink">
          {label}: {num(rows.length)} {rows.length === 1 ? "página" : "páginas"}
        </h2>
        <p className="mt-2 max-w-[68ch] text-[14.5px] leading-relaxed text-ink-2">
          Páginas com pelo menos {TOPIC_MIN_HITS} termos da lista pública deste tema, das que têm mais termos para as que têm menos. É um atalho de leitura, não uma
          classificação do conteúdo.{" "}
          <Link href={`/metodologia#propostas`} className="link">
            Ver os termos
          </Link>{" "}
          ·{" "}
          <Link href={base} className="link">
            Voltar ao documento
          </Link>
        </p>
      </div>
      <ol className="mt-8 border-t border-rule">
        {rows.map((r) => {
          const p = pages.find((x) => x.part === r.part && x.page === r.page);
          const preview = p ? paragraphs(p.text).find((x) => x.length > 80) ?? paragraphs(p.text)[0] : null;
          return (
            <li key={`${r.part}-${r.page}`} className="border-b border-rule py-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h3 className="text-[15px] font-semibold text-ink">
                  {fileLabel(r.part)}página {r.page}
                  <span className="ml-2 font-normal text-muted">
                    {num(r.hits)} termos do tema{p?.ocr ? ", texto lido por OCR" : ""}
                  </span>
                </h3>
                <ResultLinks year={year} base={base} file={fileOf(r.part)} page={r.page} />
              </div>
              {preview && <p className="mt-2 line-clamp-3 font-serif text-[16.5px] leading-relaxed text-ink-2">{preview}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Document({ pages, file, files, year, base }: { pages: ProposalPage[]; file: ProposalFile; files: ProposalFile[]; year: number; base: string }) {
  return (
    <article aria-label="Documento oficial">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <p className="text-[14px] font-semibold text-ink">Documento oficial</p>
          <p className="mt-1 max-w-[68ch] text-[14px] leading-relaxed text-muted">
            Texto extraído do PDF entregue ao TSE, página por página. As quebras de linha foram ajustadas para leitura; as palavras são as do original.
          </p>
        </div>
        {files.length > 1 && (
          <nav aria-label="Arquivos da proposta" className="flex flex-wrap gap-x-5 text-[14.5px]">
            {files.map((f) => (
              <Link
                key={f.part}
                href={`${base}?arquivo=${f.part}`}
                aria-current={f.part === file.part ? "page" : undefined}
                className={`border-b pb-0.5 no-underline ${f.part === file.part ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
              >
                Arquivo {f.part} <span className="text-muted">({num(f.pages)} p.)</span>
              </Link>
            ))}
          </nav>
        )}
      </div>
      {file.unreadable ? (
        <div className="mt-8">
          <EmptyNote>Este arquivo foi publicado corrompido pelo TSE e não pôde ser aberto.</EmptyNote>
        </div>
      ) : (
        <div className="mt-6">
          {pages.map((p) => (
            <section key={p.page} id={anchor(p.part, p.page)} aria-label={`Página ${p.page}`} className="scroll-mt-24 border-t border-rule py-6">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-[13.5px] text-muted">
                <span className="tnum">
                  Página {p.page} de {file.pages}
                  {p.ocr ? " · texto lido por OCR, pode conter erros" : ""}
                </span>
                <a href={pdfHref(year, file, p.page)} target="_blank" rel="noreferrer" className="action">
                  Ver no PDF original <span aria-hidden="true">↗</span>
                </a>
              </div>
              {p.n_chars < 40 ? (
                <p className="mt-3 text-[15px] text-muted">Esta página não tem texto legível (é uma imagem ou está em branco). Veja a página no PDF original.</p>
              ) : (
                <div className="mt-3 max-w-[70ch] space-y-3 font-serif text-[17.5px] leading-[1.7] text-ink [overflow-wrap:anywhere]">
                  {paragraphs(p.text).map((para, i) => (
                    <p key={i} className="whitespace-pre-line">
                      {para}
                    </p>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </article>
  );
}
