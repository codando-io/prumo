import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container, ResultChip } from "@/components/ui/primitives";
import { PageHeader, SourceLine, YearTabs, Caption, EmptyNote, Fig } from "@/components/ui/editorial";
import { TOPIC_LABEL, listProposals, searchProposals } from "@/lib/queries/proposals";
import { UF_NAMES, parseYear } from "@/lib/labels";
import { num, titleName } from "@/lib/format";

export const metadata: Metadata = {
  title: "Propostas de governo",
  description: "As propostas de governo que as candidaturas a presidente e a governador entregaram ao TSE: leia, busque um tema em todas elas e abra cada página do documento original.",
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export default function ProposalsPage({ searchParams }: PageProps<"/propostas">) {
  return (
    <Container className="pb-16">
      <Suspense fallback={<p className="pt-10 text-[15px] text-muted">Carregando as propostas…</p>}>
        <Body searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Body({ searchParams }: { searchParams: PageProps<"/propostas">["searchParams"] }) {
  const sp = await searchParams;
  const year = parseYear(sp.ano);
  const term = one(sp.q);
  const cargo = one(sp.cargo) === "1" ? 1 : one(sp.cargo) === "3" ? 3 : undefined;
  const uf = one(sp.uf).toUpperCase();
  const ufOk = UF_NAMES[uf] && uf !== "BR" && uf !== "ZZ" ? uf : undefined;

  const [list, results] = await Promise.all([listProposals(year, { office: cargo, uf: ufOk }), term.length >= 3 ? searchProposals(term, year) : Promise.resolve(null)]);
  const all = await (cargo || ufOk ? listProposals(year) : Promise.resolve(list));
  const nPres = all.filter((r) => r.office_code === 1).length;
  const nGov = all.filter((r) => r.office_code === 3).length;
  const pages = all.reduce((s, r) => s + r.pages, 0);
  const params = { q: term || undefined, cargo: cargo ? String(cargo) : undefined, uf: ufOk };
  const qs = (extra: Record<string, string | undefined>) => {
    const u = new URLSearchParams({ ano: String(year) });
    for (const [k, v] of Object.entries({ ...params, ...extra })) if (v) u.set(k, v);
    return `/propostas?${u.toString()}`;
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Explorar" }, { label: "Propostas de governo" }]}
        title="Propostas de governo"
        lede={
          all.length ? (
            <>
              Em {year}, <Fig>{num(nPres)}</Fig> candidaturas a presidente e <Fig>{num(nGov)}</Fig> a governador entregaram ao TSE uma proposta de governo, somando{" "}
              {num(pages)} páginas. Busque um assunto em todas elas ou abra uma proposta para ler e navegar por página.
            </>
          ) : (
            `Nenhuma proposta de governo de ${year} foi carregada nesta base.`
          )
        }
        aside={<YearTabs path="/propostas" params={params} year={year} />}
      />
      <div className="mt-3">
        <SourceLine label="TSE, propostas de governo (dados abertos), documentos originais em PDF" />
      </div>

      <form action="/propostas" method="get" role="search" className="mt-8 flex max-w-[720px] gap-3">
        <input type="hidden" name="ano" value={year} />
        <label htmlFor="q" className="sr-only">
          Buscar em todas as propostas
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={term}
          placeholder="Buscar em todas as propostas: reforma tributária, creche, segurança…"
          className="field h-12 w-full min-w-0 text-[17px] placeholder:text-muted"
        />
        <button type="submit" className="shrink-0 rounded-[6px] border border-rule-strong px-4 text-[15px] text-ink hover:border-accent">
          Buscar
        </button>
      </form>

      {results && (
        <section aria-labelledby="busca" className="section">
          <div className="border-l-2 border-accent pl-4">
            <p className="text-[13.5px] text-accent">Busca do Prumo no texto extraído</p>
            <h2 id="busca" className="question mt-1 text-ink">
              {results.length === 0
                ? `Nenhuma proposta de ${year} menciona “${term}”`
                : `“${term}” aparece em ${num(results.length)} ${results.length === 1 ? "proposta" : "propostas"} de ${year}`}
            </h2>
            <p className="mt-2 max-w-[70ch] text-[14.5px] leading-relaxed text-ink-2">
              Contagem de ocorrências da expressão, sem diferenciar acentos e maiúsculas. Mencionar mais um termo não significa propor mais sobre o assunto: documentos
              têm tamanhos e estilos diferentes. Abra cada proposta para ler as passagens.
            </p>
          </div>
          {results.length > 0 && (
            <table className="dt mt-6">
              <thead>
                <tr>
                  <th scope="col">Candidatura</th>
                  <th scope="col" className="hidden md:table-cell">
                    Resultado
                  </th>
                  <th scope="col" className="n">
                    Páginas
                  </th>
                  <th scope="col" className="n">
                    Ocorrências
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.candidate_id}>
                    <td>
                      <Link href={`/candidatos/${r.year}/${r.candidate_id}/proposta?q=${encodeURIComponent(term)}`} className="e no-underline hover:underline">
                        {titleName(r.ballot_name)}
                      </Link>
                      <div className="s text-[13.5px]">
                        {r.office}
                        {r.uf !== "BR" ? ` (${r.uf})` : ""}, {r.party}
                      </div>
                    </td>
                    <td className="hidden text-[14px] md:table-cell">
                      <ResultChip result={r.result} year={r.year} />
                    </td>
                    <td className="n s">{num(r.pages)}</td>
                    <td className="n text-ink">{num(r.hits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <section aria-labelledby="lista" className="section">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
          <h2 id="lista" className="question text-ink">
            Quem entregou proposta?
          </h2>
          <nav aria-label="Filtrar por cargo" className="flex flex-wrap gap-x-5 text-[14.5px]">
            {[
              { key: undefined, label: "Todas" },
              { key: "1", label: "Presidente" },
              { key: "3", label: "Governador" },
            ].map((o) => (
              <Link
                key={o.label}
                href={qs({ cargo: o.key, uf: o.key === "1" ? undefined : ufOk })}
                scroll={false}
                className={`border-b pb-0.5 no-underline ${String(cargo ?? "") === (o.key ?? "") ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
              >
                {o.label}
              </Link>
            ))}
          </nav>
        </div>
        {cargo !== 1 && (
          <form action="/propostas" method="get" className="mt-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="ano" value={year} />
            {term && <input type="hidden" name="q" value={term} />}
            {cargo && <input type="hidden" name="cargo" value={cargo} />}
            <label className="flex flex-col gap-1 text-[13px] text-muted">
              Estado
              <select name="uf" defaultValue={ufOk ?? ""} className="field h-9 px-2 text-[14px]">
                <option value="">Todos</option>
                {Object.entries(UF_NAMES)
                  .filter(([k]) => k !== "BR" && k !== "ZZ")
                  .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </select>
            </label>
            <button type="submit" className="h-9 rounded-[6px] border border-rule-strong px-3 text-[14px] text-ink hover:border-accent">
              Filtrar
            </button>
          </form>
        )}
        {list.length === 0 ? (
          <div className="mt-6">
            <EmptyNote>Nenhuma proposta encontrada com esses filtros.</EmptyNote>
          </div>
        ) : (
          <table className="dt mt-6">
            <thead>
              <tr>
                <th scope="col">Candidatura</th>
                <th scope="col" className="hidden lg:table-cell">
                  Temas mais presentes (Índice Prumo)
                </th>
                <th scope="col" className="hidden md:table-cell">
                  Resultado
                </th>
                <th scope="col" className="n">
                  Páginas
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.candidate_id}>
                  <td>
                    <Link href={`/candidatos/${r.year}/${r.candidate_id}/proposta`} className="e no-underline hover:underline">
                      {titleName(r.ballot_name)}
                    </Link>
                    <div className="s text-[13.5px]">
                      {r.office}
                      {r.uf !== "BR" ? ` (${r.uf})` : ""}, {r.party}
                      {r.parts > 1 ? `, ${r.parts} arquivos` : ""}
                    </div>
                  </td>
                  <td className="s hidden text-[14px] lg:table-cell">{(r.topics ?? []).map((t) => TOPIC_LABEL[t] ?? t).join(", ") || "—"}</td>
                  <td className="hidden text-[14px] md:table-cell">
                    <ResultChip result={r.result} year={r.year} registration={r.registration_status} />
                  </td>
                  <td className="n">
                    {r.unreadable ? (
                      <span className="s">arquivo corrompido</span>
                    ) : (
                      <>
                        <span className="text-ink">{num(r.pages)}</span>
                        {r.empty_pages + r.ocr_pages > 0 && (
                          <div className="s text-[13px]">{r.ocr_pages ? `${num(r.ocr_pages)} por OCR` : `${num(r.empty_pages)} sem texto`}</div>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Caption>
          Só candidaturas a presidente e a governador entregam proposta de governo. Os temas são do Índice Prumo (palavras-chave), um atalho de navegação, não uma
          classificação do conteúdo.{" "}
          <Link href="/metodologia#propostas" className="link">
            Como funciona
          </Link>
        </Caption>
      </section>
    </>
  );
}
