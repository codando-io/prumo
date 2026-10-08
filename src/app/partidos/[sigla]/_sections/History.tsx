import Link from "next/link";
import { Caption, EmptyNote, Section } from "@/components/ui/editorial";
import { getPartyHistory } from "@/lib/queries/parties";
import { CURRENT_YEAR, YEARS } from "@/lib/labels";
import { brlc, num, pct } from "@/lib/format";

const QUESTION = "E nas outras eleições?";

/** The same party's totals in each election covered (2018, 2022, 2026), one row per election. */
export async function PartyHistorySection({ sigla, year }: { sigla: string; year: number }) {
  const rows = await getPartyHistory(sigla);
  const byYear = new Map(rows.map((r) => [r.year, r]));
  const years = [...YEARS].sort((a, b) => b - a);
  const missing = years.filter((y) => !byYear.has(y)).sort((a, b) => a - b);
  const covered = [...YEARS].sort((a, b) => a - b);
  const list = (ys: number[]) => (ys.length > 1 ? `${ys.slice(0, -1).join(", ")} e ${ys[ys.length - 1]}` : String(ys[0] ?? ""));

  if (rows.length === 0 || (rows.length === 1 && rows[0].year === year)) {
    return (
      <Section id="historico" question={QUESTION}>
        <EmptyNote>
          Entre as eleições gerais cobertas pelo Prumo ({list(covered)}), só há candidaturas com a sigla {sigla} em {year}. Partidos que mudaram de nome ou se fundiram
          aparecem com a sigla de cada época.
        </EmptyNote>
      </Section>
    );
  }

  const present = rows.map((r) => r.year).sort((a, b) => a - b);
  const renamed = rows.some((r) => r.party !== sigla);

  return (
    <Section
      id="historico"
      question={QUESTION}
      lede={
        <>
          O {sigla} teve candidaturas em {present.length === YEARS.length ? `todas as ${YEARS.length}` : `${num(present.length)} das ${YEARS.length}`} eleições gerais
          cobertas pelo Prumo{present.length < YEARS.length ? ` (${list(present)})` : ""}. Os valores estão em reais da época, sem correção pela inflação
          {byYear.has(CURRENT_YEAR) ? `, e os de ${CURRENT_YEAR} ainda mudam a cada prestação de contas publicada` : ""}.
        </>
      }
    >
      <table className="dt">
        <thead>
          <tr>
            <th scope="col">Eleição</th>
            <th scope="col" className="n hidden sm:table-cell">
              Candidaturas
            </th>
            <th scope="col" className="n">
              Eleitos
            </th>
            <th scope="col" className="n hidden md:table-cell">
              Receitas
            </th>
            <th scope="col" className="n">
              Dinheiro público
            </th>
            <th scope="col" className="n">
              Despesas
            </th>
            <th scope="col" className="n hidden lg:table-cell">
              Votos dep. federal
            </th>
          </tr>
        </thead>
        <tbody>
          {years.map((y) => {
            const r = byYear.get(y);
            if (!r) {
              return (
                <tr key={y}>
                  <th scope="row">
                    <span className="tnum text-muted">{y}</span>
                    <div className="text-[13.5px] text-muted">sem candidaturas com esta sigla</div>
                  </th>
                  <td className="n s hidden sm:table-cell">—</td>
                  <td className="n s">—</td>
                  <td className="n s hidden md:table-cell">—</td>
                  <td className="n s">—</td>
                  <td className="n s">—</td>
                  <td className="n s hidden lg:table-cell">—</td>
                </tr>
              );
            }
            const current = y === year;
            const note = [current ? "esta página" : null, r.party !== sigla ? `como ${r.party}` : null].filter(Boolean).join(", ");
            return (
              <tr key={y}>
                <th scope="row">
                  {current ? (
                    <span className="tnum e">{y}</span>
                  ) : (
                    <Link href={`/partidos/${encodeURIComponent(r.party)}?ano=${y}`} className="e tnum no-underline hover:underline">
                      {y}
                    </Link>
                  )}
                  {note && <div className="s text-[13.5px]">{note}</div>}
                </th>
                <td className="n s hidden sm:table-cell">{num(r.n_candidates)}</td>
                <td className="n text-ink">
                  {num(r.n_elected)}
                  {r.n_runoff > 0 && <div className="text-[13.5px] text-muted">+{num(r.n_runoff)} no 2º turno</div>}
                </td>
                <td className="n s hidden md:table-cell">{brlc(r.revenue)}</td>
                <td className="n s">
                  {brlc(r.revenue_public)}
                  <div className="text-[13.5px] text-muted">{r.public_share == null ? "—" : `${pct(r.public_share)} das receitas`}</div>
                </td>
                <td className="n text-ink">{brlc(r.expense)}</td>
                <td className="n s hidden lg:table-cell">{r.votes_federal ? num(r.votes_federal) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Caption>
        As eleições são ligadas pela sigla{renamed ? " (com pequenas variações de grafia, como PC do B e PCDOB)" : ""}. Partidos que mudaram de nome ou se fundiram
        aparecem com a sigla de cada época{missing.length ? `; não há candidaturas com esta sigla em ${list(missing)}` : ""}. Votos: votos nominais dados aos candidatos
        do partido a deputado federal.
      </Caption>
    </Section>
  );
}
