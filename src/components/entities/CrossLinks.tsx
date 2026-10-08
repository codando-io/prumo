import Link from "next/link";
import type { Candidacy, Entity } from "@/lib/queries/entities";
import { brlc, titleName } from "@/lib/format";
import { yearsText } from "./parts";

/**
 * Neutral notes linking a counterparty to its other roles in the data: the same CPF as a
 * candidate, a campaign's own bank account, or the other side (donor ↔ supplier).
 */
export function CrossLinks({
  e,
  role,
  year,
  candidacies,
  owner,
}: {
  e: Entity;
  role: "doador" | "fornecedor";
  year: number;
  candidacies: Candidacy[];
  owner?: Candidacy;
}) {
  const notes: React.ReactNode[] = [];
  const name = titleName(e.name) || "Esta pessoa ou organização";

  if (candidacies.length > 0) {
    const years = [...new Set(candidacies.map((c) => c.year))];
    notes.push(
      <>
        Esta pessoa também foi candidata em {yearsText(years)}:{" "}
        {candidacies.map((c, i) => (
          <span key={`${c.year}-${c.id}`}>
            {i > 0 && "; "}
            <Link className="link text-ink" href={`/candidatos/${c.year}/${c.id}`}>
              {titleName(c.ballot_name)}
            </Link>
            , {c.office}
            {c.uf !== "BR" ? ` (${c.uf})` : ""}, {c.party}, {c.year}
          </span>
        ))}
        . A ligação usa o CPF informado ao TSE, que não é exibido.
      </>,
    );
  }

  if (owner) {
    notes.push(
      <>
        Este CNPJ é a conta bancária da campanha de{" "}
        <Link className="link text-ink" href={`/candidatos/${owner.year}/${owner.id}`}>
          {titleName(owner.ballot_name)}
        </Link>{" "}
        ({owner.office}
        {owner.uf !== "BR" ? `, ${owner.uf}` : ""}, {owner.party}, {owner.year}). Repasses entre campanhas aparecem como doações de um lado e despesas do outro.
      </>,
    );
  }

  if (role === "doador" && e.supplied > 0) {
    const ys = e.supplier_years ?? [];
    notes.push(
      <>
        {name} também aparece como fornecedor: campanhas contrataram {brlc(e.supplied)}{ys.length ? ` em ${yearsText(ys)}` : ""}.{" "}
        <Link className="link text-ink" href={`/fornecedores/${e.key}?ano=${ys.includes(year) ? year : (ys[ys.length - 1] ?? year)}`}>
          Ver o perfil de fornecedor
        </Link>
        .
      </>,
    );
  }

  if (role === "fornecedor" && (e.donated > 0 || e.donated_indirect > 0)) {
    const ys = e.donor_years ?? [];
    notes.push(
      <>
        {name} também aparece como doador: {e.donated > 0 ? `${brlc(e.donated)} doados diretamente a campanhas` : "nenhuma doação direta"}
        {e.donated_indirect > 0 ? `${e.donated > 0 ? ", mais" : " e"} ${brlc(e.donated_indirect)} em doações indiretas` : ""}
        {ys.length ? ` em ${yearsText(ys)}` : ""}.{" "}
        <Link className="link text-ink" href={`/doadores/${e.key}?ano=${ys.includes(year) ? year : (ys[ys.length - 1] ?? year)}`}>
          Ver o perfil de doador
        </Link>
        .
      </>,
    );
  }

  if (!notes.length) return null;
  return (
    <ul className="mt-6 max-w-[72ch] space-y-2 border-l-2 border-rule-strong py-0.5 pl-4 text-[14.5px] leading-relaxed text-ink-2">
      {notes.map((n, i) => (
        <li key={i}>{n}</li>
      ))}
    </ul>
  );
}
