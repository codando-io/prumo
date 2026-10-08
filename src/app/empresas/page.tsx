import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Container } from "@/components/ui/primitives";
import { PageHeader, EmptyNote, Caption } from "@/components/ui/editorial";
import { search } from "@/lib/queries/search";
import { companyExists, formatCnpj, onlyDigits } from "@/lib/queries/company";
import { hitFacts } from "@/components/search/describe";
import { titleName } from "@/lib/format";

export const metadata: Metadata = {
  title: "Empresas",
  description: "Dados públicos das empresas que aparecem nas prestações de contas eleitorais: cadastro na Receita Federal, sócios, contratos públicos e cadastros de sanções.",
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export default function CompaniesPage({ searchParams }: PageProps<"/empresas">) {
  return (
    <Container className="pb-16">
      <PageHeader
        crumbs={[{ label: "Seguir o dinheiro" }, { label: "Empresas" }]}
        title="Empresas"
        lede="Toda empresa que aparece numa prestação de contas tem uma página com os dados públicos ligados ao seu CNPJ: cadastro na Receita Federal, sócios, atuação nas eleições, contratos com órgãos públicos e registros em cadastros de sanções, cada um com a fonte."
      />
      <Suspense fallback={null}>
        <Results searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/empresas">["searchParams"] }) {
  const term = one((await searchParams).q);
  const digits = onlyDigits(term);
  if (digits.length === 14 && (await companyExists(digits))) redirect(`/empresas/${digits}`);
  const hits = term.length >= 2 ? (await search(term, { perType: 25 })).filter((h) => (h.type === "fornecedor" || h.type === "doador") && /^j\d{14}$/.test(h.key)) : [];
  const unique = [...new Map(hits.map((h) => [h.key, h])).values()];

  return (
    <>
      <form action="/empresas" method="get" role="search" className="mt-8 flex max-w-[720px] gap-3">
        <label htmlFor="q" className="sr-only">
          Nome ou CNPJ
        </label>
        <input id="q" name="q" type="search" defaultValue={term} placeholder="Nome da empresa ou CNPJ" className="field h-12 w-full min-w-0 text-[17px] placeholder:text-muted" />
        <button type="submit" className="shrink-0 rounded-[6px] border border-rule-strong px-4 text-[15px] text-ink hover:border-accent">
          Buscar
        </button>
      </form>
      {term.length >= 2 && (
        <div className="mt-8">
          {unique.length === 0 ? (
            <EmptyNote>
              {digits.length === 14
                ? `O CNPJ ${formatCnpj(digits)} não aparece nas prestações de contas nem no recorte da Receita Federal carregado no Prumo.`
                : `Nenhuma empresa encontrada para “${term}”. Tente parte do nome ou o CNPJ.`}
            </EmptyNote>
          ) : (
            <table className="dt">
              <tbody>
                {unique.map((h) => (
                  <tr key={h.key}>
                    <td>
                      <Link href={`/empresas/${h.key.slice(1)}`} className="e no-underline hover:underline">
                        {titleName(h.label)}
                      </Link>
                      <div className="s tnum text-[13.5px]">CNPJ {formatCnpj(h.key.slice(1))}</div>
                    </td>
                    <td className="s text-[14px]">{hitFacts(h)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      <Caption>
        Para listas ordenadas por valor, veja os{" "}
        <Link href="/fornecedores" className="link">
          fornecedores
        </Link>{" "}
        e os{" "}
        <Link href="/doadores" className="link">
          doadores
        </Link>
        . Como o Prumo junta as fontes:{" "}
        <Link href="/metodologia#enriquecimento" className="link">
          metodologia
        </Link>
        .
      </Caption>
    </>
  );
}
