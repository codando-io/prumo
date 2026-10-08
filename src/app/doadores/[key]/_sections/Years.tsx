import Link from "next/link";
import { Caption, EmptyNote, Fig, Section } from "@/components/ui/editorial";
import { MoneyCell, TopCandidates, YearsTable, type YearRowSpec } from "@/components/entities/tables";
import { yearsText } from "@/components/entities/parts";
import { getTopPerYear, type Entity, type EntityYear } from "@/lib/queries/entities";
import { brlc, num } from "@/lib/format";

/** The donor across the three general elections. */
export async function DonorYears({ e, name, years, focus }: { e: Entity; name: string; years: EntityYear[]; focus: number }) {
  const donorYears = years.filter((y) => y.donated > 0 || y.donated_indirect > 0);
  const link = e.kind === "pf" ? "Doações são ligadas pelo CPF, que não é exibido." : "Doações são ligadas pelo CNPJ.";
  if (donorYears.length <= 1) {
    return (
      <Section id="eleicoes" question="Ao longo das eleições">
        <EmptyNote>
          {donorYears.length === 1
            ? `${name} aparece como doador apenas em ${donorYears[0].year} entre as eleições gerais de 2018, 2022 e 2026.`
            : `${name} não aparece como doador nas eleições gerais de 2018, 2022 e 2026.`}{" "}
          {link}
        </EmptyNote>
      </Section>
    );
  }

  const top = await getTopPerYear(e.key, "donor");
  const supplier = years.some((y) => y.supplied > 0);
  const maxD = Math.max(...years.map((y) => y.donated));
  const maxI = Math.max(...years.map((y) => y.donated_indirect));
  const maxS = Math.max(...years.map((y) => y.supplied));
  const count = (v: number) => (v > 0 ? <span className="tnum text-ink">{num(v)}</span> : <span className="text-muted">—</span>);
  const rows: YearRowSpec<EntityYear>[] = [
    { label: "Doado a candidaturas", render: (y) => <MoneyCell v={y.donated} max={maxD} color="var(--private)" /> },
    { label: "Doações", render: (y) => count(y.n_donations) },
    { label: "Candidaturas apoiadas", render: (y) => count(y.n_candidates_donated) },
    { label: "Partidos", render: (y) => count(y.n_parties_donated) },
    { label: "Estados", render: (y) => count(y.n_ufs_donated) },
    { label: "Principais candidaturas", render: (y) => <TopCandidates items={top.filter((t) => t.year === y.year)} year={y.year} /> },
    { label: "Doações indiretas", render: (y) => <MoneyCell v={y.donated_indirect} max={maxI} color="var(--private)" /> },
  ];
  if (supplier)
    rows.push({
      label: "Contratado por campanhas",
      render: (y) =>
        y.supplied > 0 ? (
          <Link href={`/fornecedores/${e.key}?ano=${y.year}`} className="block no-underline hover:opacity-80">
            <MoneyCell v={y.supplied} max={maxS} color="var(--spend)" />
          </Link>
        ) : (
          <span className="text-muted">—</span>
        ),
    });

  const withDirect = donorYears.filter((y) => y.donated > 0);
  const first = withDirect[0];
  const last = withDirect[withDirect.length - 1];

  return (
    <Section
      id="eleicoes"
      question="Ao longo das eleições"
      lede={
        <>
          {name} aparece como doador em {yearsText(donorYears.map((y) => y.year))}, somando <Fig>{brlc(e.donated)}</Fig> em doações diretas
          {e.donated_indirect > 0 && (
            <>
              {" "}
              e <Fig>{brlc(e.donated_indirect)}</Fig> em doações indiretas
            </>
          )}
          {withDirect.length >= 2 && (
            <>
              : de <Fig>{brlc(first.donated)}</Fig> em {first.year} a <Fig>{brlc(last.donated)}</Fig> em {last.year}, em valores da época
            </>
          )}
          .
        </>
      }
    >
      <YearsTable
        data={years}
        focus={focus}
        rows={rows}
        hrefFor={(y) => `/doadores/${e.key}?ano=${y}`}
        sections={[
          { before: "Doado a candidaturas", title: "Doações diretas" },
          { before: "Doações indiretas", title: "Por meio de partidos e vaquinhas" },
          ...(supplier ? [{ before: "Contratado por campanhas", title: "Como fornecedor de campanhas" }] : []),
        ]}
      />
      <Caption>
        {e.kind === "pf" ? "Registros ligados pelo mesmo CPF, que não é exibido." : "Registros ligados pelo mesmo CNPJ."} Valores de cada eleição em reais da época, sem
        correção pela inflação. Clique em um ano para ver os detalhes.
      </Caption>
    </Section>
  );
}
