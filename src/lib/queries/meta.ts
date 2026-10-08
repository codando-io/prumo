import "server-only";
import { q, q1 } from "../db";

export interface ElectionStatus {
  year: number;
  label: string;
  round1: string;
  round2: string;
  finance_generated_at: string | null;
  candidates_generated_at: string | null;
  votes_generated_at: string | null;
  captures: number;
  changes: number;
}

export async function dataStatus(): Promise<{ elections: ElectionStatus[]; built_at: string | null }> {
  const elections = await q<ElectionStatus>(`
    SELECT e.year, e.label, e.round1, e.round2,
      (SELECT max(generated_at) FROM filing f WHERE f.year = e.year) AS finance_generated_at,
      (SELECT max(generated_at) FROM candidate c WHERE c.year = e.year) AS candidates_generated_at,
      (SELECT max(generated_at) FROM vote_meta v WHERE v.year = e.year) AS votes_generated_at,
      (SELECT count(*) FROM capture k WHERE k.year = e.year) AS captures,
      (SELECT count(*) FROM change_log l WHERE l.year = e.year) AS changes
    FROM election e ORDER BY e.year DESC`);
  const b = await q1<{ built_at: string }>(`SELECT built_at FROM build_info`);
  return { elections, built_at: b?.built_at ?? null };
}

export async function electionStatus(year: number) {
  return (await dataStatus()).elections.find((e) => e.year === year);
}

export interface SourceFile {
  url: string;
  file: string;
  last_modified: string | null;
  content_length: number | null;
  downloaded_at: string | null;
}

export async function sourceFiles(): Promise<SourceFile[]> {
  return q<SourceFile>(`SELECT * FROM source_file ORDER BY url`);
}

export async function captures() {
  return q<{ year: number; capture_id: string; generated_at: string; is_current: boolean }>(`SELECT * FROM capture ORDER BY year DESC, capture_id DESC`);
}

export async function changeSummary() {
  return q<{ year: number; from_capture: string; to_capture: string; kind: string; change: string; n: number; delta: number }>(
    `SELECT year, from_capture, to_capture, kind, change, count(*) AS n, sum(coalesce(new_value, 0) - coalesce(old_value, 0))::DOUBLE AS delta
     FROM change_log GROUP BY ALL ORDER BY year DESC, to_capture DESC, kind, change`,
  );
}

export async function biggestCampaignChanges(limit = 20) {
  return q<{
    year: number;
    to_capture: string;
    candidate_id: string;
    ballot_name: string;
    office: string;
    uf: string;
    party: string;
    old_filing_type: string | null;
    new_filing_type: string | null;
    old_revenue: number | null;
    new_revenue: number | null;
    old_expense: number | null;
    new_expense: number | null;
  }>(
    `SELECT ch.year, ch.to_capture, ch.candidate_id, c.ballot_name, c.office, c.uf, c.party,
       ch.old_filing_type, ch.new_filing_type, ch.old_revenue, ch.new_revenue, ch.old_expense, ch.new_expense
     FROM campaign_change ch JOIN candidate c ON c.year = ch.year AND c.id = ch.candidate_id
     ORDER BY abs(coalesce(ch.new_revenue, 0) - coalesce(ch.old_revenue, 0)) + abs(coalesce(ch.new_expense, 0) - coalesce(ch.old_expense, 0)) DESC
     LIMIT ?`,
    [limit],
  );
}

export async function filingStatus(year: number) {
  return q<{ filing_type: string | null; n: number }>(
    `SELECT f.filing_type, count(*) AS n FROM candidate c LEFT JOIN filing f ON f.year = c.year AND f.candidate_id = c.id
     WHERE c.year = ? AND NOT c.is_running_mate GROUP BY 1 ORDER BY 2 DESC`,
    [year],
  );
}

export async function latestFilings(year: number, limit = 12) {
  return q<{ id: string; ballot_name: string; office: string; uf: string; party: string; filing_type: string; filing_date: string; revenue: number; expense: number }>(
    `SELECT id, ballot_name, office, uf, party, filing_type, filing_date, revenue, expense FROM candidate_summary
     WHERE year = ? AND has_finance AND NOT is_running_mate ORDER BY filing_date DESC, expense DESC LIMIT ?`,
    [year, limit],
  );
}
