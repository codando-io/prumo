import { Section, SourceLine, Fig, EmptyNote, Caption } from "@/components/ui/editorial";
import { getAssetHistory, getAssets, type CandidateSummary } from "@/lib/queries/candidate";
import { ASSET_CATEGORY } from "@/lib/labels";
import { brl, brlc, num, pct, titleName, inSentence } from "@/lib/format";
import { officialRecord } from "@/lib/provenance";

export async function AssetsSection({ c }: { c: CandidateSummary }) {
  const [assets, history] = await Promise.all([getAssets(c.year, c.id), c.person_id ? getAssetHistory(c.person_id) : Promise.resolve([])]);
  const total = assets.reduce((s, a) => s + a.value, 0);
  const byCat = [...assets.reduce((m, a) => m.set(a.category, (m.get(a.category) ?? 0) + a.value), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);
  const years = [...new Set(history.map((h) => h.year))].sort();
  const prior = years.filter((y) => y !== c.year).map((y) => ({ y, v: history.filter((h) => h.year === y).reduce((s, h) => s + h.value, 0) }));
  const source = officialRecord(c, "bens", "Soma dos valores declarados no registro de candidatura (arquivo de bens de candidatos).");
  const name = titleName(c.ballot_name);

  if (assets.length === 0) {
    return (
      <Section id="bens" question="Que bens foram declarados?">
        <EmptyNote>Nenhum bem declarado nesta candidatura. A declaração de bens é feita pelo próprio candidato no registro da candidatura.</EmptyNote>
      </Section>
    );
  }

  const top = assets.length > 12 ? assets.slice(0, 12) : assets;
  const rest = assets.length > 12 ? assets.slice(12) : [];
  const itemRow = (a: (typeof assets)[number]) => (
    <tr key={a.ord}>
      <td>
        <span className="e">{a.type}</span>
        {a.description && <div className="s text-[13.5px]">{a.description}</div>}
      </td>
      <td className="n text-ink">{brl(a.value)}</td>
      <td className="n s hidden sm:table-cell">{pct(total ? a.value / total : 0)}</td>
    </tr>
  );

  return (
    <Section
      id="bens"
      question="Que bens foram declarados?"
      lede={
        <>
          {name} declarou <Fig info={source}>{brlc(total)}</Fig> em {num(assets.length)} {assets.length === 1 ? "bem" : "bens"} ao registrar a candidatura
          {byCat[0] && byCat.length > 1 && (
            <>
              , {pct(byCat[0][1] / total)} em {inSentence(ASSET_CATEGORY[byCat[0][0]] ?? byCat[0][0])}
            </>
          )}
          {prior.length > 0 && (
            <>
              . Em {prior.map((p, i) => (
                <span key={p.y}>
                  {i > 0 && (i === prior.length - 1 ? " e em " : ", em ")}
                  {p.y}, <Fig>{brlc(p.v)}</Fig>
                </span>
              ))}
            </>
          )}
          . É patrimônio pessoal, separado das contas de campanha.
        </>
      }
      source={<SourceLine label="TSE, bens de candidatos" info={source} />}
    >
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Por tipo de bem</h3>
          <table className="dt mt-3">
            <tbody>
              {byCat.map(([k, v]) => (
                <tr key={k}>
                  <td>
                    <span className="e">{ASSET_CATEGORY[k] ?? k}</span>
                    <div className="mt-1 h-[4px] max-w-[220px]" aria-hidden="true">
                      <div className="h-full rounded-r-[2px] bg-[var(--muted)]" style={{ width: `${Math.max(1, (v / byCat[0][1]) * 100)}%` }} />
                    </div>
                  </td>
                  <td className="n text-ink">{brlc(v)}</td>
                  <td className="n s">{pct(total ? v / total : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {prior.length > 0 && <Caption>Valores nominais, sem correção pela inflação, como declarados em cada eleição.</Caption>}
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Itens declarados</h3>
          <table className="dt mt-3">
            <thead>
              <tr>
                <th scope="col">Tipo e descrição</th>
                <th scope="col" className="n">
                  Valor
                </th>
                <th scope="col" className="n hidden sm:table-cell">
                  Do total
                </th>
              </tr>
            </thead>
            <tbody>{top.map(itemRow)}</tbody>
          </table>
          {rest.length > 0 && (
            <details className="mt-3">
              <summary className="action cursor-pointer list-none text-[14.5px] [&::-webkit-details-marker]:hidden">Ver os outros {num(rest.length)} itens</summary>
              <table className="dt mt-3">
                <tbody>{rest.map(itemRow)}</tbody>
              </table>
            </details>
          )}
        </div>
      </div>
    </Section>
  );
}
