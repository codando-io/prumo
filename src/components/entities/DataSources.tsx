import Link from "next/link";
import { Section } from "@/components/ui/editorial";
import { cdnFile } from "@/lib/labels";
import { plural } from "@/lib/format";

/** "De onde vêm estes números?" for a donor or supplier profile: transactions per election and the original TSE files. */
export function DataSources({
  entityKey,
  role,
  years,
  focus,
}: {
  entityKey: string;
  role: "doador" | "fornecedor";
  years: { year: number; n: number }[];
  focus: number;
}) {
  const tipo = role === "doador" ? "receita" : "despesa";
  const kind = role === "doador" ? "receitas" : "despesas_contratadas";
  const files = years.map((y) => ({ year: y.year, f: cdnFile(kind, y.year), paid: role === "fornecedor" ? cdnFile("despesas_pagas", y.year) : null }));
  return (
    <Section
      id="dados"
      question="De onde vêm estes números?"
      lede={
        role === "doador"
          ? "Das receitas que as campanhas declararam ao TSE em que este CPF ou CNPJ aparece como doador. Cada doação pode ser conferida na lista de transações."
          : "Das despesas que as campanhas declararam ao TSE em que este CPF ou CNPJ aparece como fornecedor. Cada despesa pode ser conferida na lista de transações."
      }
    >
      <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Registros {role === "doador" ? "deste doador" : "deste fornecedor"}</h3>
          <ul className="mt-3 space-y-2.5 text-[14.5px]">
            {years.map((y) => (
              <li key={y.year}>
                <Link className="link" href={`/transacoes?ano=${y.year}&contraparte=${entityKey}&tipo=${tipo}`}>
                  {role === "doador" ? `Doações de ${y.year}` : `Despesas de ${y.year}`}
                </Link>{" "}
                <span className="tnum text-muted">({plural(y.n, "registro", "registros")})</span>
              </li>
            ))}
            <li>
              <Link className="link" href={`/conexoes?no=e:${entityKey}&ano=${focus}`}>
                Seguir as conexões em {focus}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Arquivos de origem</h3>
          {files.length === 0 ? (
            <p className="mt-2 text-[14.5px] text-ink-2">Sem registros nas prestações de contas de 2018, 2022 e 2026.</p>
          ) : (
            <ul className="mt-3 divide-y divide-rule border-y border-rule text-[14px]">
              {files.map((f) => (
                <li key={f.year} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-ink">
                      {role === "doador" ? "Receitas" : "Despesas"} {f.year}
                    </span>
                    <a className="action" href={f.f.zip} rel="noreferrer">
                      zip <span aria-hidden="true">↗</span>
                    </a>
                  </div>
                  <div className="break-all text-muted">{f.f.file}</div>
                  {f.paid && <div className="break-all text-muted">{f.paid.file} (despesas pagas, no mesmo arquivo zip)</div>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
            O Prumo corrige apenas a codificação dos arquivos (de Latin-1 para UTF-8). Nenhum valor é alterado. CPFs são substituídos por um código e exibidos
            mascarados; CNPJs são públicos. Veja a{" "}
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
