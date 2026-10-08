import Link from "next/link";
import { Section, SourceLine, Fig } from "@/components/ui/editorial";
import { getDonationHistogram, getTopDonors, type CandidateSummary } from "@/lib/queries/candidate";
import { DONOR_TYPE, ENTITY_KIND } from "@/lib/labels";
import { brl, brlc, num, pct, titleName } from "@/lib/format";
import { calculated, officialFinance } from "@/lib/provenance";
import { counterpartHref } from "@/lib/links";

type Donor = Awaited<ReturnType<typeof getTopDonors>>[number];

export async function FundingSection({ c }: { c: CandidateSummary }) {
  const [donors, hist] = await Promise.all([getTopDonors(c.year, c.id, 40), c.n_pf_donations > 0 ? getDonationHistogram(c.year, c.id) : Promise.resolve([])]);
  const tx = `/transacoes?ano=${c.year}&candidato=${c.id}&tipo=receita`;
  const isTransfer = (d: Donor) => d.donor_type === "partido" || d.donor_type === "candidato" || d.kind === "partido" || d.kind === "campanha";
  const transfers = donors.filter(isTransfer).slice(0, 6);
  const privates = donors.filter((d) => !isTransfer(d)).slice(0, 12);

  return (
    <Section
      id="origem"
      question="De onde veio o dinheiro?"
      lede={
        <>
          <Fig>{pct(c.public_share ?? 0)}</Fig> da receita veio dos fundos públicos (Fundo Eleitoral e Fundo Partidário), que chegam às campanhas por meio dos partidos. O
          restante, <Fig>{brlc(c.revenue_private)}</Fig>, veio de {num(c.n_donors)} {c.n_donors === 1 ? "origem identificada" : "origens identificadas"}
          {c.n_pf_donations > 0 && (
            <>
              , entre elas {num(c.n_pf_donations)} doações de pessoas físicas: metade de até{" "}
              <Fig info={calculated(c, "receitas", "Mediana das doações de pessoas físicas (itens de uma mesma doação somados).")}>{brl(c.pf_median)}</Fig>, e a maior de <Fig>{brlc(c.pf_max)}</Fig>
            </>
          )}
          .
        </>
      }
      source={<SourceLine label="TSE, receitas da campanha" info={officialFinance(c, "receitas", "Cada receita declarada pela campanha, com o CPF ou CNPJ de quem transferiu o dinheiro.")} links={[{ label: "Ver as receitas", href: `${tx}&ordem=valor_desc` }]} />}
    >
      <div className="grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Repasses de partidos e de outras campanhas</h3>
          <p className="mt-1 text-[14.5px] text-ink-2">É por aqui que chega o dinheiro dos fundos públicos.</p>
          <DonorTable rows={transfers} c={c} empty="Nenhum repasse registrado." />
          <h3 className="mt-10 text-[15px] font-semibold text-ink">Doadores privados</h3>
          <p className="mt-1 text-[14.5px] text-ink-2">Pessoas, recursos do próprio candidato e plataformas de financiamento coletivo. CPFs aparecem mascarados.</p>
          <DonorTable rows={privates} c={c} empty="Nenhuma doação privada registrada." />
          <Link href={`${tx}&ordem=valor_desc`} className="action mt-4 inline-block text-[14.5px]">
            Ver todas as {num(c.n_revenue_tx)} receitas
          </Link>
        </div>
        {hist.some((h) => h.n > 0) && (
          <div>
            <h3 className="text-[15px] font-semibold text-ink">Tamanho das doações de pessoas físicas</h3>
            <p className="mt-1 text-[14.5px] text-ink-2">
              Muitas doações pequenas ou poucas grandes? Média de <Fig>{brl(c.pf_avg)}</Fig>.
            </p>
            <table className="dt mt-4">
              <thead>
                <tr>
                  <th scope="col">Valor da doação</th>
                  <th scope="col" className="n">
                    Doações
                  </th>
                  <th scope="col" className="n">
                    Soma
                  </th>
                </tr>
              </thead>
              <tbody>
                {hist.map((h) => (
                  <tr key={h.label}>
                    <th scope="row" className="s">
                      {h.label}
                    </th>
                    <td className="n">
                      <span className="text-ink">{num(h.n)}</span>
                      <span aria-hidden="true" className="ml-3 inline-block h-2 align-middle" style={{ width: `${Math.max(h.n ? 2 : 0, (h.n / Math.max(...hist.map((x) => x.n), 1)) * 64)}px`, background: "var(--private)" }} />
                    </td>
                    <td className="n s">{h.value ? brlc(h.value) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Link href={`${tx}&categoria=pf&ordem=valor_desc`} className="action mt-3 inline-block text-[14.5px]">
              Ver as doações de pessoas físicas
            </Link>
          </div>
        )}
      </div>
    </Section>
  );
}

function DonorTable({ rows, c, empty }: { rows: Donor[]; c: CandidateSummary; empty: string }) {
  if (!rows.length) return <p className="mt-3 text-[15px] text-muted">{empty}</p>;
  return (
    <table className="dt mt-3">
      <thead>
        <tr>
          <th scope="col">Origem</th>
          <th scope="col" className="n">
            Valor
          </th>
          <th scope="col" className="n">
            Da receita
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => {
          const href = counterpartHref(d, "doador", c.year);
          const kind = d.donor_type === "proprio" ? "O próprio candidato" : ENTITY_KIND[d.kind ?? ""] ?? DONOR_TYPE[d.donor_type] ?? "";
          const label = d.donor_type === "proprio" ? titleName(c.name) : titleName(d.name);
          return (
            <tr key={d.key}>
              <td>
                {href ? (
                  <Link href={href} className="e no-underline hover:underline">
                    {label}
                  </Link>
                ) : (
                  <span className="e">{label}</span>
                )}
                <div className="text-[13.5px] text-muted">
                  {[
                    kind,
                    d.public_value > 0 ? "repassou dinheiro público" : d.doc_display && d.kind !== "pf" ? d.doc_display : null,
                    d.other_candidates > 0 && d.kind !== "partido" ? `doou também a ${num(d.other_candidates)} ${d.other_candidates === 1 ? "outra candidatura" : "outras candidaturas"}` : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </div>
              </td>
              <td className="n text-ink">{brlc(d.value)}</td>
              <td className="n s">{pct(c.revenue ? d.value / c.revenue : 0)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
