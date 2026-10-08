import Link from "next/link";
import { Caption, EmptyNote, Fig, Section } from "@/components/ui/editorial";
import { MoneyCell, TopCandidates, YearsTable, type YearRowSpec } from "@/components/entities/tables";
import { yearsText } from "@/components/entities/parts";
import { getTopPerYear, type Entity, type EntityYear } from "@/lib/queries/entities";
import { brlc, num, pct } from "@/lib/format";

/** The supplier across the three general elections. */
export async function SupplierYears({
  e,
  name,
  years,
  focus,
  paid,
}: {
  e: Entity;
  name: string;
  years: EntityYear[];
  focus: number;
  paid: { year: number; paid: number }[];
}) {
  const supplierYears = years.filter((y) => y.supplied > 0);
  const link = e.kind === "pf" ? "Os registros são ligados pelo CPF, que não é exibido." : "Os registros são ligados pelo CNPJ.";
  if (supplierYears.length <= 1) {
    return (
      <Section id="eleicoes" question="Ao longo das eleições">
        <EmptyNote>
          {supplierYears.length === 1
            ? `${name} aparece como fornecedor de campanhas apenas em ${supplierYears[0].year} entre as eleições gerais de 2018, 2022 e 2026.`
            : `${name} não aparece como fornecedor nas eleições gerais de 2018, 2022 e 2026.`}{" "}
          {link}
        </EmptyNote>
      </Section>
    );
  }

  const top = await getTopPerYear(e.key, "supplier");
  const donor = years.some((y) => y.donated > 0 || y.donated_indirect > 0);
  const paidOf = (year: number) => paid.find((p) => p.year === year)?.paid ?? 0;
  const maxS = Math.max(...years.map((y) => y.supplied));
  const maxD = Math.max(...years.map((y) => y.donated));
  const count = (v: number) => (v > 0 ? <span className="tnum text-ink">{num(v)}</span> : <span className="text-muted">—</span>);
  const rows: YearRowSpec<EntityYear>[] = [
    { label: "Contratado por campanhas", render: (y) => <MoneyCell v={y.supplied} max={maxS} color="var(--spend)" /> },
    {
      label: "Pago",
      render: (y) =>
        y.supplied > 0 ? (
          <span className="tnum text-ink">
            {brlc(paidOf(y.year))} <span className="text-muted">({pct(paidOf(y.year) / y.supplied)})</span>
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    { label: "Despesas", render: (y) => count(y.n_supplies) },
    { label: "Campanhas", render: (y) => count(y.n_candidates_supplied) },
    { label: "Partidos", render: (y) => count(y.n_parties_supplied) },
    { label: "Estados", render: (y) => count(y.n_ufs_supplied) },
    { label: "Maiores clientes", render: (y) => <TopCandidates items={top.filter((t) => t.year === y.year)} year={y.year} /> },
  ];
  if (donor)
    rows.push({
      label: "Doado a candidaturas",
      render: (y) =>
        y.donated > 0 ? (
          <Link href={`/doadores/${e.key}?ano=${y.year}`} className="block no-underline hover:opacity-80">
            <MoneyCell v={y.donated} max={maxD} color="var(--private)" />
          </Link>
        ) : (
          <span className="text-muted">—</span>
        ),
    });

  const first = supplierYears[0];
  const last = supplierYears[supplierYears.length - 1];

  return (
    <Section
      id="eleicoes"
      question="Ao longo das eleições"
      lede={
        <>
          {name} aparece como fornecedor de campanhas em {yearsText(supplierYears.map((y) => y.year))}, com <Fig>{brlc(e.supplied)}</Fig> contratados no total: de{" "}
          <Fig>{brlc(first.supplied)}</Fig> em {first.year} a <Fig>{brlc(last.supplied)}</Fig> em {last.year}, em valores da época.
        </>
      }
    >
      <YearsTable
        data={years}
        focus={focus}
        rows={rows}
        hrefFor={(y) => `/fornecedores/${e.key}?ano=${y}`}
        sections={[
          { before: "Contratado por campanhas", title: "Como fornecedor" },
          ...(donor ? [{ before: "Doado a candidaturas", title: "Como doador" }] : []),
        ]}
      />
      <Caption>{link} Valores de cada eleição em reais da época, sem correção pela inflação. Clique em um ano para ver os detalhes.</Caption>
    </Section>
  );
}
