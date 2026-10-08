import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container, Empty } from "@/components/ui/primitives";
import { search, searchCounts } from "@/lib/queries/search";
import { groupHits, hitFacts, hitKind, hitLabel } from "@/components/search/describe";
import { num } from "@/lib/format";

export const metadata: Metadata = { title: "Busca" };

const TYPES: [string, string][] = [
  ["candidato", "Candidaturas"],
  ["partido", "Partidos"],
  ["fornecedor", "Fornecedores"],
  ["doador", "Doadores"],
  ["estado", "Estados"],
  ["municipio", "Municípios"],
  ["eleicao", "Eleições"],
];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export default function SearchPage({ searchParams }: PageProps<"/busca">) {
  return (
    <Container className="pb-8 pt-8 sm:pt-10">
      <h1 className="title text-ink">Busca</h1>
      <Suspense fallback={<SearchForm term="" />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

function SearchForm({ term, type }: { term: string; type?: string }) {
  return (
    <form action="/busca" role="search" className="mt-6 flex max-w-[720px] gap-3">
      <label htmlFor="q" className="sr-only">
        Buscar
      </label>
      <input
        id="q"
        name="q"
        type="search"
        defaultValue={term}
        autoComplete="off"
        placeholder="Candidato, partido, empresa, CNPJ, doador ou município"
        className="field h-12 w-full min-w-0 text-[17px] placeholder:text-muted"
      />
      {type && <input type="hidden" name="tipo" value={type} />}
      <button type="submit" className="shrink-0 rounded-[6px] border border-rule-strong px-4 text-[15px] text-ink hover:border-accent">
        Buscar
      </button>
    </form>
  );
}

async function Body({ searchParams }: { searchParams: PageProps<"/busca">["searchParams"] }) {
  const sp = await searchParams;
  const term = one(sp.q);
  const type = TYPES.some(([t]) => t === one(sp.tipo)) ? one(sp.tipo) : undefined;

  if (term.length < 2) {
    return (
      <>
        <SearchForm term={term} />
        <p className="lede mt-8 max-w-[64ch]">
          Digite ao menos duas letras. A busca encontra candidaturas pelo nome de urna e pelo nome civil, partidos pela sigla, fornecedores e doadores pelo nome ou
          CNPJ, e qualquer estado ou município.
        </p>
      </>
    );
  }

  const [rows, counts] = await Promise.all([search(term, { perType: type ? 50 : 6, type }), searchCounts(term)]);
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const base = `/busca?q=${encodeURIComponent(term)}`;

  return (
    <>
      <SearchForm term={term} type={type} />
      {total === 0 ? (
        <div className="mt-10">
          <Empty>
            Nada encontrado para “{term}”. Confira a grafia, tente só parte do nome ou busque pelo CNPJ. Candidaturas aparecem pelo nome de urna e pelo nome civil.
          </Empty>
        </div>
      ) : (
        <>
          <nav aria-label="Filtrar por tipo" className="mt-8 border-b border-rule">
            <ul className="-mb-px flex gap-6 overflow-x-auto whitespace-nowrap text-[14.5px]">
              <TypeTab href={base} on={!type} label="Tudo" n={total} />
              {TYPES.filter(([t]) => counts[t]).map(([t, label]) => (
                <TypeTab key={t} href={`${base}&tipo=${t}`} on={type === t} label={label} n={counts[t]} />
              ))}
            </ul>
          </nav>
          <div className="mt-2">
            {groupHits(rows).map((g) => {
              const n = counts[g.type] ?? g.hits.length;
              return (
                <section key={g.type} aria-labelledby={`g-${g.type}`} className="grid gap-x-10 border-b border-rule py-6 last:border-b-0 md:grid-cols-[200px_minmax(0,1fr)]">
                  <h2 id={`g-${g.type}`} className="mb-2 text-[15px] font-semibold text-ink md:mb-0 md:pt-0.5">
                    {g.name}
                    <span className="tnum block text-[13.5px] font-normal text-muted">
                      {n > g.hits.length ? `${num(g.hits.length)} de ${num(n)}` : num(n)}
                    </span>
                  </h2>
                  <div>
                    <ul className="max-w-[760px]">
                      {g.hits.map((h) => (
                        <li key={`${h.type}-${h.year}-${h.key}`}>
                          <Link href={h.href} className="group -mx-3 block rounded-[4px] px-3 py-2.5 no-underline hover:bg-[var(--hover)]">
                            <span className="block text-[16px] font-medium leading-snug text-ink group-hover:underline group-hover:decoration-accent group-hover:underline-offset-[3px]">
                              {hitLabel(h)}
                            </span>
                            <span className="block text-[14px] leading-snug text-ink-2">{hitKind(h)}</span>
                            {hitFacts(h) && <span className="tnum block text-[14px] leading-snug text-muted">{hitFacts(h)}</span>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {!type && n > g.hits.length && (
                      <Link href={`${base}&tipo=${g.type}`} className="action mt-2 inline-block text-[14.5px]">
                        Ver {n > 50 ? "os 50 primeiros" : `todos os ${num(n)}`}
                      </Link>
                    )}
                    {type && n > g.hits.length && (
                      <p className="mt-3 text-[14px] text-muted">
                        Mostrando os {num(g.hits.length)} mais relevantes de {num(n)}. Refine a busca com mais palavras para encontrar os demais.
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function TypeTab({ href, on, label, n }: { href: string; on: boolean; label: string; n: number }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={on ? "page" : undefined}
        className={`block border-b-2 pb-2 no-underline ${on ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
      >
        {label} <span className="tnum text-muted">{num(n)}</span>
      </Link>
    </li>
  );
}
