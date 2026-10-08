import Link from "next/link";
import { Section, SourceLine, Fig, Caption, EmptyNote } from "@/components/ui/editorial";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { MunicipalityMap } from "@/components/charts/MunicipalityMap";
import { calculation } from "@/components/geo/sources";
import { getRunoffOffices, getStateMunicipalVotes, type MunVoteRow } from "@/lib/queries/geo";
import { OFFICES, UF_NAMES } from "@/lib/labels";
import { num, pct, titleName } from "@/lib/format";

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v) as string | undefined;

/** Underlined text tabs that navigate (GET links, so the choice lives in the URL). */
function LinkTabs({ label, options, active }: { label: string; options: { key: string; label: string; href: string }[]; active: string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[14.5px]">
      <span className="text-muted">{label}</span>
      {options.map((o) => (
        <Link
          key={o.key}
          href={o.href}
          scroll={false}
          aria-current={o.key === active ? "true" : undefined}
          className={`border-b pb-0.5 no-underline ${o.key === active ? "border-accent text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Votes by municipality for one office. The TSE records where votes were cast, not where money
 * was spent, so geography below the state is about votes. Metric on the map: in each
 * municipality, the share of the office's nominal votes that went to the most-voted candidate.
 */
export async function VotesMapSection({ year, uf, cargo, turno, votesGeneratedAt }: { year: number; uf: string; cargo: unknown; turno: unknown; votesGeneratedAt: string | null }) {
  const offices = [1, 3, 5, 6, uf === "DF" ? 8 : 7];
  const requested = Number(first(cargo));
  const office = offices.includes(requested) ? requested : 3;
  const runoffOffices = await getRunoffOffices(year, uf);
  const hasRunoff = runoffOffices.includes(office);
  const round = hasRunoff && first(turno) === "2" ? 2 : 1;
  const rows = await getStateMunicipalVotes(year, uf, office, round);

  const name = UF_NAMES[uf];
  const officeLabel = OFFICES.find((o) => o.code === office)?.label ?? "";
  const base = `/estados/${uf}?ano=${year}`;
  const hrefOf = (c: number, t?: number) => `${base}${c !== 3 ? `&cargo=${c}` : ""}${t === 2 ? "&turno=2" : ""}#votos`;

  const mapped = rows.filter((r) => r.ibge_code != null);
  const shares = mapped.map((r) => r.leader_share).filter((v): v is number => v != null);
  const lo = shares.length ? Math.max(0, Math.floor(Math.min(...shares) * 10) / 10) : 0;
  const hi = shares.length ? Math.min(1, Math.ceil(Math.max(...shares) * 10) / 10) : 1;
  const total = rows.reduce((s, r) => s + r.total, 0);
  const metricWhat =
    "Em cada município, os votos nominais do candidato mais votado ali divididos pelo total de votos nominais dados a candidatos a esse cargo no município. Não inclui votos de legenda, brancos e nulos.";

  // How many municipalities each candidate led (the map's tooltips, as a sentence).
  const leaders = new Map<string, { name: string; party: string; n: number }>();
  for (const r of rows) {
    const x = leaders.get(r.leader_id) ?? { name: r.leader_name, party: r.leader_party, n: 0 };
    x.n += 1;
    leaders.set(r.leader_id, x);
  }
  const leaderList = [...leaders.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 3);
  const ranked = [...rows].sort((a, b) => b.total - a.total);
  const scope = `${officeLabel.toLowerCase()}${hasRunoff ? `, ${round}º turno` : ""}`;

  const row = (r: MunVoteRow) => (
    <tr key={r.mun_code}>
      <td>
        <Link className="e no-underline hover:underline" href={`/estados/${uf}/${r.mun_code}?ano=${year}`}>
          {titleName(r.name)}
        </Link>
      </td>
      <td className="n s">{num(r.total)}</td>
      <td>
        <Link className="link text-ink" href={`/candidatos/${year}/${r.leader_id}`}>
          {titleName(r.leader_name)}
        </Link>{" "}
        <span className="s text-[13.5px]">{r.leader_party}</span>
      </td>
      <td className="n text-ink">{r.leader_share == null ? "—" : pct(r.leader_share)}</td>
    </tr>
  );
  const head = (
    <thead>
      <tr>
        <th scope="col">Município</th>
        <th scope="col" className="n">
          Votos para o cargo
        </th>
        <th scope="col">Mais votado ali</th>
        <th scope="col" className="n">
          Parcela
        </th>
      </tr>
    </thead>
  );

  return (
    <Section
      id="votos"
      question="Onde estavam os votos?"
      lede={
        rows.length ? (
          <>
            <Fig info={calculation("votacao", year, votesGeneratedAt, metricWhat)}>{num(total)}</Fig> votos nominais para {scope} em {num(rows.length)} municípios de {name}.{" "}
            {leaderList.length > 0 && (
              <>
                {titleName(leaderList[0][1].name)} ({leaderList[0][1].party}) foi o mais votado em {num(leaderList[0][1].n)} {leaderList[0][1].n === 1 ? "município" : "municípios"}
                {leaderList[1] && (
                  <>
                    ; {titleName(leaderList[1][1].name)} ({leaderList[1][1].party}), em {num(leaderList[1][1].n)}
                  </>
                )}
                .
              </>
            )}{" "}
            O TSE registra onde cada voto foi dado, mas não onde cada despesa foi feita.
          </>
        ) : (
          `O TSE registra onde cada voto foi dado, mas não onde cada despesa foi feita.`
        )
      }
      source={<SourceLine label="TSE, votação nominal por município e zona" info={calculation("votacao", year, votesGeneratedAt, metricWhat)} />}
    >
      <div className="space-y-2">
        <LinkTabs label="Cargo" active={String(office)} options={offices.map((c) => ({ key: String(c), label: OFFICES.find((o) => o.code === c)?.label ?? String(c), href: hrefOf(c) }))} />
        {hasRunoff && (
          <LinkTabs
            label="Turno"
            active={String(round)}
            options={[
              { key: "1", label: "1º turno", href: hrefOf(office, 1) },
              { key: "2", label: "2º turno", href: hrefOf(office, 2) },
            ]}
          />
        )}
      </div>

      <div className="mt-8">
        {!rows.length ? (
          <EmptyNote>Ainda não há votos registrados para {officeLabel.toLowerCase()} nesta base.</EmptyNote>
        ) : (
          <ViewToggle
            label="Formas de ver os votos"
            views={[
              {
                key: "lista",
                label: "Lista",
                node: (
                  <div>
                    <table className="dt">
                      {head}
                      <tbody>{ranked.slice(0, 20).map(row)}</tbody>
                    </table>
                    {ranked.length > 20 && (
                      <details className="mt-3">
                        <summary className="action cursor-pointer list-none text-[14.5px] [&::-webkit-details-marker]:hidden">Ver os {num(ranked.length)} municípios</summary>
                        <table className="dt mt-3">
                          {head}
                          <tbody>{ranked.slice(20).map(row)}</tbody>
                        </table>
                      </details>
                    )}
                    <Caption>Ordenados pelo número de votos para o cargo. A parcela é a fatia desses votos que ficou com o mais votado no município.</Caption>
                  </div>
                ),
              },
              {
                key: "mapa",
                label: "Mapa",
                node: (
                  <div className="max-w-[820px]">
                    <p className="mb-2 max-w-[72ch] text-[14.5px] leading-relaxed text-ink-2">
                      Parcela dos votos para {scope} que ficou com o candidato mais votado em cada município. Mais escuro, votação mais concentrada em um nome; mais claro,
                      mais dividida. A cor não indica o candidato nem o partido. Clique em um município para abri-lo.
                    </p>
                    <MunicipalityMap
                      uf={uf}
                      data={mapped.map((r) => ({
                        ibge: r.ibge_code!,
                        tse: r.mun_code,
                        name: r.name,
                        value: r.leader_share,
                        note: `Mais votado: ${titleName(r.leader_name)} (${r.leader_party}), ${num(r.leader_votes)} de ${num(r.total)} votos`,
                      }))}
                      format="pct"
                      label="Parcela do mais votado"
                      hrefTemplate={`/estados/${uf}/{tse}?ano=${year}`}
                      domain={[lo, hi]}
                      height={uf === "DF" ? 280 : "clamp(320px, 92vw, 480px)"}
                    />
                  </div>
                ),
              },
            ]}
          />
        )}
      </div>
      <Caption>
        Votos nominais do {office === 1 || office === 3 ? `${round}º turno` : "turno único"}, por município de votação. {office === 1 ? "Votos dados no exterior não aparecem. " : ""}
        {office === 5 && (year === 2018 || year === 2026) ? "Nesta eleição cada eleitor escolheu dois nomes para o Senado; a parcela é sobre o total de votos dados ao cargo. " : ""}
        {office === 6 || office === 7 || office === 8 ? "Em disputas para deputado, com muitos candidatos, as parcelas costumam ser baixas. " : ""}
      </Caption>
    </Section>
  );
}
