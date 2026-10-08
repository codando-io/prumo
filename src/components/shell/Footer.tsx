import Link from "next/link";
import { Suspense } from "react";
import { dataStatus } from "@/lib/queries/meta";
import { CURRENT_YEAR } from "@/lib/labels";
import { dateTime } from "@/lib/format";

/*
 * Quiet colophon: what Prumo is, where to go next, and where the numbers come from.
 * Link groups mirror the main navigation (kept here because NavLinks is a client module).
 */

const GROUPS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "Explorar",
    links: [
      { label: `Eleições ${CURRENT_YEAR}`, href: "/" },
      { label: "Candidaturas", href: "/candidatos" },
      { label: "Partidos", href: "/partidos" },
      { label: "Estados", href: "/estados" },
      { label: "Propostas de governo", href: "/propostas" },
      { label: "Busca", href: "/busca" },
    ],
  },
  {
    title: "Seguir o dinheiro",
    links: [
      { label: "Transações", href: "/transacoes" },
      { label: "Fornecedores", href: "/fornecedores" },
      { label: "Doadores", href: "/doadores" },
      { label: "Empresas", href: "/empresas" },
      { label: "Conexões", href: "/conexoes" },
    ],
  },
  {
    title: "Sobre os dados",
    links: [
      { label: "Metodologia", href: "/metodologia" },
      { label: "Fontes e arquivos", href: "/metodologia#fontes" },
      { label: "Atualizações dos dados", href: "/atualizacoes" },
      { label: "Dados abertos do TSE", href: "https://dadosabertos.tse.jus.br/", external: true },
    ],
  },
];

async function Freshness() {
  const { elections, built_at } = await dataStatus();
  const parts = elections.filter((e) => e.finance_generated_at).map((e) => `${e.year}, ${dateTime(e.finance_generated_at)}`);
  return (
    <p className="text-[13px] leading-relaxed text-muted">
      {parts.length > 0 && <>Publicação do TSE usada para as contas de cada eleição: {parts.join("; ")}. </>}
      Base do Prumo gerada em {dateTime(built_at)}.
    </p>
  );
}

export function Footer() {
  return (
    <footer className="mt-24 border-t border-rule">
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-12 pt-10 sm:px-6">
        <div className="grid gap-x-12 gap-y-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="max-w-[44ch]">
            <Link href="/" className="font-serif text-[22px] font-medium leading-none tracking-tight text-ink no-underline">
              Prumo
            </Link>
            <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
              Um explorador independente das prestações de contas eleitorais publicadas pelo TSE, sem vínculo com o tribunal, partidos ou candidaturas, e que não
              faz juízo sobre a legalidade de nenhuma conta.
            </p>
          </div>
          <nav aria-label="Rodapé" className="grid grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-3">
            {GROUPS.map((g) => (
              <div key={g.title}>
                <h2 className="text-[13.5px] font-medium text-ink">{g.title}</h2>
                <ul className="mt-2 space-y-1.5 text-[14px]">
                  {g.links.map((l) => (
                    <li key={l.href}>
                      {l.external ? (
                        <a href={l.href} target="_blank" rel="noreferrer" className="action">
                          {l.label} <span aria-hidden="true">↗</span>
                        </a>
                      ) : (
                        <Link href={l.href} className="action">
                          {l.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-10 space-y-1 border-t border-rule pt-5">
          <p className="text-[13px] text-muted">
            Fonte:{" "}
            <a href="https://dadosabertos.tse.jus.br/" target="_blank" rel="noreferrer" className="action">
              Portal de Dados Abertos do TSE
            </a>
            . Toda página leva ao registro original; se algo não conferir com a fonte, vale a fonte.
          </p>
          <Suspense fallback={<p className="text-[13px] text-muted">Verificando a data da última publicação…</p>}>
            <Freshness />
          </Suspense>
        </div>
      </div>
    </footer>
  );
}
