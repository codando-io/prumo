import "server-only";
import { q } from "../db";
import { CURRENT_YEAR, YEARS } from "../labels";

/** Other elections of the people being compared (2018–2026), to show each one's history. */
export async function compareHistory(personIds: string[]) {
  if (!personIds.length) return [];
  return q<{ person_id: string; year: number; id: string; office: string; uf: string; expense: number; has_finance: boolean }>(
    `SELECT person_id, year, id, office, uf, expense, has_finance FROM candidate_summary
     WHERE person_id IN (${personIds.map(() => "?").join(",")}) AND NOT is_running_mate ORDER BY year`,
    personIds,
  );
}

export interface CompareSuggestion {
  keys: string[];
  names: string[];
  /** Words after the names ("em 2022 e em 2026"), when the pair is one person twice. */
  label?: string;
  context: string;
}

/**
 * Ready-made comparisons for the empty page: the two most voted campaigns for president and for
 * governor of São Paulo in the last two elections, and the most voted presidential candidate of
 * the current election against their own previous campaign.
 */
export async function compareSuggestions(): Promise<CompareSuggestion[]> {
  const years = [CURRENT_YEAR, YEARS.find((y) => y < CURRENT_YEAR) ?? CURRENT_YEAR];
  const [pairs, again] = await Promise.all([
    q<{ year: number; office_code: number; office: string; uf: string; id: string; ballot_name: string; rk: number }>(
      `SELECT year, office_code, office, uf, id, ballot_name,
         row_number() OVER (PARTITION BY year, office_code, uf ORDER BY votes DESC) AS rk
       FROM candidate_summary
       WHERE NOT is_running_mate AND has_finance AND votes > 0 AND year IN (?, ?)
         AND (office_code = 1 OR (office_code = 3 AND uf = 'SP'))
       QUALIFY rk <= 2
       ORDER BY year DESC, office_code, rk`,
      years,
    ),
    q<{ name: string; id_now: string; office_now: string; id_before: string; year_before: number; office_before: string }>(
      `SELECT a.ballot_name AS name, a.id AS id_now, a.office AS office_now, b.id AS id_before, b.year AS year_before, b.office AS office_before
       FROM candidate_summary a
       JOIN candidate_summary b ON b.person_id = a.person_id AND b.year < a.year AND NOT b.is_running_mate AND b.has_finance
       WHERE a.year = ? AND a.office_code = 1 AND NOT a.is_running_mate AND a.has_finance AND a.votes > 0
       ORDER BY b.office_code = a.office_code DESC, a.votes DESC, b.year DESC LIMIT 1`,
      [years[0]],
    ),
  ]);

  const out: CompareSuggestion[] = [];
  const groups = new Map<string, typeof pairs>();
  for (const r of pairs) {
    const k = `${r.year}-${r.office_code}-${r.uf}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    const r = rows[0];
    out.push({
      keys: rows.map((x) => `${x.year}-${x.id}`),
      names: rows.map((x) => x.ballot_name),
      context: `${r.office}${r.uf !== "BR" ? ` (${r.uf})` : ""}, ${r.year}`,
    });
  }
  const a = again[0];
  if (a) {
    out.splice(1, 0, {
      keys: [`${a.year_before}-${a.id_before}`, `${years[0]}-${a.id_now}`],
      names: [a.name],
      label: `em ${a.year_before} e em ${years[0]}`,
      context: a.office_before === a.office_now ? a.office_now : `${a.office_before} em ${a.year_before}, ${a.office_now} em ${years[0]}`,
    });
  }
  return out;
}
