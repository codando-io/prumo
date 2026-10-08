import Link from "next/link";
import { Section, SourceLine, Fig } from "@/components/ui/editorial";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { BrazilMap } from "@/components/charts/BrazilMap";
import { MunicipalityMap } from "@/components/charts/MunicipalityMap";
import { getVotesByPlace, type CandidateSummary } from "@/lib/queries/candidate";
import { UF_NAMES } from "@/lib/labels";
import { num, pct, titleName } from "@/lib/format";
import { dataset } from "@/lib/provenance";

export async function VotesSection({ c }: { c: CandidateSummary }) {
  if (!c.votes) return null;
  const round = c.votes_r2 != null ? 2 : 1;
  const rows = await getVotesByPlace(c.year, c.id, c.office_code, round);
  if (!rows.length) return null;
  const national = c.uf === "BR";
  const total = rows.reduce((s, r) => s + r.votes, 0);
  const office = c.office.toLowerCase();

  const byUf = national
    ? Object.values(
        rows.reduce<Record<string, { uf: string; votes: number; total: number }>>((acc, r) => {
          const a = (acc[r.uf] ??= { uf: r.uf, votes: 0, total: 0 });
          a.votes += r.votes;
          a.total += r.total;
          return acc;
        }, {}),
      ).sort((a, b) => b.votes - a.votes)
    : [];
  const places = national
    ? byUf.map((s) => ({ key: s.uf, name: UF_NAMES[s.uf] ?? s.uf, votes: s.votes, share: s.total ? s.votes / s.total : 0, href: s.uf === "ZZ" ? undefined : `/estados/${s.uf}?ano=${c.year}` }))
    : rows.map((r) => ({ key: `${r.uf}-${r.mun_code}`, name: titleName(r.mun_name), votes: r.votes, share: r.total ? r.votes / r.total : 0, href: `/estados/${r.uf}/${r.mun_code}?ano=${c.year}` }));
  const best = [...places].filter((p) => p.votes >= 200).sort((a, b) => b.share - a.share)[0];
  const top = places[0];
  const concentration = places.slice(0, 5).reduce((s, p) => s + p.votes, 0) / total;

  const list = (
    <div>
      <table className="dt">
        <thead>
          <tr>
            <th scope="col">{national ? "Estado" : "Município"}</th>
            <th scope="col" className="n">
              Votos
            </th>
            <th scope="col" className="n">
              Dos votos da candidatura
            </th>
            <th scope="col" className="n">
              Dos votos para {office} no lugar
            </th>
          </tr>
        </thead>
        <tbody>
          {places.slice(0, 15).map((p) => (
            <tr key={p.key}>
              <td>{p.href ? <Link href={p.href} className="e no-underline hover:underline">{p.name}</Link> : <span className="e">{p.name}</span>}</td>
              <td className="n text-ink">{num(p.votes)}</td>
              <td className="n s">{pct(p.votes / total)}</td>
              <td className="n s">{pct(p.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {places.length > 15 && (
        <details className="mt-3">
          <summary className="action cursor-pointer list-none text-[14.5px] [&::-webkit-details-marker]:hidden">Ver os {num(places.length)} lugares</summary>
          <table className="dt mt-3">
            <tbody>
              {places.slice(15).map((p) => (
                <tr key={p.key}>
                  <td>{p.href ? <Link href={p.href} className="e no-underline hover:underline">{p.name}</Link> : <span className="e">{p.name}</span>}</td>
                  <td className="n text-ink">{num(p.votes)}</td>
                  <td className="n s">{pct(p.votes / total)}</td>
                  <td className="n s">{pct(p.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );

  const map = (
    <div className="max-w-[760px]">
      <p className="mb-2 text-[14.5px] text-ink-2">
        Parcela dos votos para {office} que foi para {titleName(c.ballot_name)} em cada {national ? "estado" : "município"}. Mais escuro, maior a parcela.
      </p>
      {national ? (
        <BrazilMap
          data={byUf.filter((s) => s.uf !== "ZZ").map((s) => ({ uf: s.uf, value: s.total ? s.votes / s.total : null, note: `${num(s.votes)} votos` }))}
          format="pct"
          label={`Parcela dos votos para ${office}`}
          hrefTemplate={`/estados/{uf}?ano=${c.year}`}
          height={440}
          ariaLabel="Mapa da parcela dos votos por estado"
        />
      ) : (
        <MunicipalityMap
          uf={c.uf}
          data={rows.filter((r) => r.ibge_code).map((r) => ({ ibge: r.ibge_code!, tse: r.mun_code, name: titleName(r.mun_name), value: r.total ? r.votes / r.total : null, note: `${num(r.votes)} votos` }))}
          format="pct"
          label={`Parcela dos votos para ${office}`}
          hrefTemplate={`/estados/${c.uf}/{tse}?ano=${c.year}`}
          height={440}
          ariaLabel="Mapa da parcela dos votos por município"
        />
      )}
    </div>
  );

  return (
    <Section
      id="votos"
      question="Onde estavam os votos?"
      lede={
        <>
          <Fig>{num(total)}</Fig> votos {round === 2 ? "no 2º turno" : ""} em {num(places.length)} {national ? "estados e no exterior" : `municípios de ${UF_NAMES[c.uf] ?? c.uf}`}.{" "}
          {top && (
            <>
              {top.name} deu mais votos (<Fig>{num(top.votes)}</Fig>, {pct(top.votes / total)} do total)
            </>
          )}
          {best && best.key !== top?.key && (
            <>
              ; a maior parcela local foi em {best.name}, onde {pct(best.share)} dos votos para {office} foram para a candidatura
            </>
          )}
          .{!national && places.length > 5 && <> Os cinco municípios com mais votos somam {pct(concentration)} do total.</>}
        </>
      }
      source={<SourceLine label="TSE, votação nominal por município e zona" info={{ kind: "oficial", what: "Votos nominais recebidos em cada município, somando todas as zonas eleitorais.", dataset: dataset("votacao", c.year) }} />}
    >
      <ViewToggle
        label="Formas de ver os votos"
        views={[
          { key: "lista", label: "Lista", node: list },
          { key: "mapa", label: "Mapa", node: map },
        ]}
      />
    </Section>
  );
}
