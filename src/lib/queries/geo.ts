import "server-only";
import { q, q1 } from "../db";
import { UF_NAMES } from "../labels";

/*
 * State and municipality aggregates.
 *
 * Money is attributed to a state through the candidacy (a governor, senator or deputy runs
 * for one state; presidential campaigns are national, uf = 'BR'). The TSE's finance records
 * do not say where each expense took place, so below the state level only votes are shown.
 * Vote tables use TSE municipality codes; mun_xwalk maps them to IBGE codes for the maps.
 */

/** The 26 states and the Distrito Federal. */
export const STATE_UFS = Object.keys(UF_NAMES)
  .filter((u) => u !== "BR" && u !== "ZZ")
  .sort((a, b) => UF_NAMES[a].localeCompare(UF_NAMES[b], "pt-BR"));

export function isStateUf(v: string): boolean {
  return STATE_UFS.includes(v);
}

export interface AreaTotals {
  n_candidates: number;
  n_finance: number;
  n_elected: number;
  revenue: number;
  expense: number;
  revenue_public: number;
  revenue_private: number;
  paid: number;
  public_share: number | null;
}

const TOTAL_COLUMNS = `
  count(*) AS n_candidates,
  count(*) FILTER (WHERE has_finance) AS n_finance,
  count(*) FILTER (WHERE elected) AS n_elected,
  coalesce(sum(revenue), 0) AS revenue,
  coalesce(sum(expense), 0) AS expense,
  coalesce(sum(revenue_public), 0) AS revenue_public,
  coalesce(sum(revenue_private), 0) AS revenue_private,
  coalesce(sum(paid), 0) AS paid,
  CASE WHEN sum(revenue) > 0 THEN sum(revenue_public) / sum(revenue) END AS public_share`;

/* ---------- Brazil overview ---------- */

export interface StateRow extends AreaTotals {
  uf: string;
  top_group: string | null;
  top_group_value: number | null;
  /** Valid votes for governor in the first round (proxy for voters who chose a candidate). */
  gov_votes: number | null;
}

/** One row per UF (including 'BR' for presidential campaigns). */
export async function getStatesOverview(year: number) {
  return q<StateRow>(
    `WITH s AS (
       SELECT uf, ${TOTAL_COLUMNS}
       FROM candidate_summary WHERE year = ? AND NOT is_running_mate GROUP BY uf
     ),
     g AS (SELECT uf, category_group, sum(value) AS v FROM exp_cube WHERE year = ? GROUP BY ALL),
     top AS (SELECT uf, arg_max(category_group, v) AS top_group, max(v)::DOUBLE AS top_group_value FROM g GROUP BY uf),
     gv AS (
       SELECT v.uf, sum(v.valid_votes) AS gov_votes
       FROM vote_mun v JOIN candidate c ON c.year = v.year AND c.id = v.candidate_id
       WHERE v.year = ? AND v.turno = 1 AND c.office_code = 3
       GROUP BY v.uf
     )
     SELECT s.*, top.top_group, top.top_group_value, gv.gov_votes
     FROM s LEFT JOIN top USING (uf) LEFT JOIN gv USING (uf)
     ORDER BY s.uf`,
    [year, year, year],
  );
}

/* ---------- One state ---------- */

export async function getStateTotals(year: number, uf: string) {
  return q1<AreaTotals & { generated_at: string | null; n_revenue_tx: number; n_expense_tx: number }>(
    `SELECT ${TOTAL_COLUMNS},
       coalesce(sum(n_revenue_tx), 0) AS n_revenue_tx, coalesce(sum(n_expense_tx), 0) AS n_expense_tx,
       max(finance_generated_at) AS generated_at
     FROM candidate_summary WHERE year = ? AND uf = ? AND NOT is_running_mate`,
    [year, uf],
  );
}

export async function getStateOffices(year: number, uf: string) {
  return q<AreaTotals & { office_code: number; office: string; n_runoff: number }>(
    `SELECT office_code, any_value(office) AS office, ${TOTAL_COLUMNS},
       count(*) FILTER (WHERE result = '2º TURNO') AS n_runoff
     FROM candidate_summary WHERE year = ? AND uf = ? AND NOT is_running_mate
     GROUP BY office_code ORDER BY office_code`,
    [year, uf],
  );
}

export async function getStateRevenueByCategory(year: number, uf: string) {
  return q<{ category: string; value: number; n: number }>(
    `SELECT category, sum(value)::DOUBLE AS value, sum(n)::BIGINT AS n
     FROM rev_cube WHERE year = ? AND uf = ? GROUP BY category ORDER BY value DESC`,
    [year, uf],
  );
}

export async function getStateExpenseByCategory(year: number, uf: string) {
  return q<{ category_group: string; category: string; value: number; n: number }>(
    `SELECT category_group, category, sum(value)::DOUBLE AS value, sum(n)::BIGINT AS n
     FROM exp_cube WHERE year = ? AND uf = ? GROUP BY ALL ORDER BY value DESC`,
    [year, uf],
  );
}

export async function getStateParties(year: number, uf: string) {
  return q<AreaTotals & { party: string; party_name: string }>(
    `SELECT party, any_value(party_name) AS party_name, ${TOTAL_COLUMNS}
     FROM candidate_summary WHERE year = ? AND uf = ? AND NOT is_running_mate AND party IS NOT NULL
     GROUP BY party ORDER BY party`,
    [year, uf],
  );
}

export async function getStateTopCampaigns(year: number, uf: string, limit = 12) {
  return q<{ id: string; ballot_name: string; party: string; office: string; office_code: number; result: string | null; registration_status: string | null; expense: number; revenue: number; votes: number }>(
    `SELECT id, ballot_name, party, office, office_code, result, registration_status, expense, revenue, votes
     FROM candidate_summary
     WHERE year = ? AND uf = ? AND NOT is_running_mate AND expense > 0
     ORDER BY expense DESC, ballot_name LIMIT ?`,
    [year, uf, limit],
  );
}

export interface GeoCounterpart {
  key: string;
  name: string;
  kind: string | null;
  doc_display: string | null;
  value: number;
  n_campaigns: number;
  main_group?: string | null;
}

/** Suppliers of campaigns that ran in this state (summed across those campaigns). */
export async function getStateTopSuppliers(year: number, uf: string, limit = 10) {
  return q<GeoCounterpart>(
    `WITH s AS (
       SELECT r.key, sum(r.value)::DOUBLE AS value, count(DISTINCT r.candidate_id) AS n_campaigns,
         arg_max(r.main_group, r.value) AS main_group
       FROM rel_supply r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id
       WHERE r.year = ? AND c.uf = ?
       GROUP BY r.key ORDER BY value DESC LIMIT ?
     )
     SELECT s.*, coalesce(e.name, '(sem nome)') AS name, e.kind, e.doc_display
     FROM s LEFT JOIN entity e ON e.key = s.key ORDER BY s.value DESC`,
    [year, uf, limit],
  );
}

/** Private donors (people, platforms) to campaigns in this state; party and campaign transfers excluded. */
export async function getStateTopDonors(year: number, uf: string, limit = 10) {
  return q<GeoCounterpart>(
    `WITH s AS (
       SELECT r.key, sum(r.value)::DOUBLE AS value, count(DISTINCT r.candidate_id) AS n_campaigns
       FROM rel_donation r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id
       LEFT JOIN entity e ON e.key = r.key
       WHERE r.year = ? AND c.uf = ? AND r.donor_type NOT IN ('partido', 'candidato', 'proprio')
         AND coalesce(e.kind, '') NOT IN ('partido', 'campanha')
       GROUP BY r.key ORDER BY value DESC LIMIT ?
     )
     SELECT s.*, coalesce(e.name, '(sem nome)') AS name, e.kind, e.doc_display
     FROM s LEFT JOIN entity e ON e.key = s.key ORDER BY s.value DESC`,
    [year, uf, limit],
  );
}

/* ---------- Votes by municipality ---------- */

/** Offices that had a second round in this state (governor) or nationwide (president). */
export async function getRunoffOffices(year: number, uf: string) {
  const rows = await q<{ office_code: number }>(
    `SELECT DISTINCT office_code FROM candidate
     WHERE year = ? AND (uf = ? OR uf = 'BR') AND office_code IN (1, 3) AND votes_r2 IS NOT NULL AND votes_r2 > 0`,
    [year, uf],
  );
  return rows.map((r) => r.office_code);
}

export interface MunVoteRow {
  mun_code: number;
  name: string;
  ibge_code: number | null;
  total: number;
  n_candidates: number;
  leader_id: string;
  leader_name: string;
  leader_party: string;
  leader_votes: number;
  leader_share: number | null;
}

/**
 * Per municipality, for one office and round: nominal votes for that office's candidates and
 * the candidate who received the most of them.
 */
export async function getStateMunicipalVotes(year: number, uf: string, officeCode: number, turno: number) {
  return q<MunVoteRow>(
    `WITH v AS (
       SELECT v.mun_code, any_value(v.mun_name) AS mun_name, v.candidate_id, sum(v.votes) AS votes
       FROM vote_mun v JOIN candidate c ON c.year = v.year AND c.id = v.candidate_id
       WHERE v.year = ? AND v.uf = ? AND v.turno = ? AND c.office_code = ?
       GROUP BY v.mun_code, v.candidate_id
     ),
     m AS (
       SELECT mun_code, any_value(mun_name) AS mun_name, sum(votes) AS total,
         count(*) FILTER (WHERE votes > 0) AS n_candidates,
         arg_max(candidate_id, votes) AS leader_id, max(votes) AS leader_votes
       FROM v GROUP BY mun_code
     )
     SELECT m.mun_code, coalesce(x.ibge_name, m.mun_name) AS name, x.ibge_code, m.total, m.n_candidates,
       m.leader_id, c.ballot_name AS leader_name, c.party AS leader_party, m.leader_votes,
       CASE WHEN m.total > 0 THEN m.leader_votes / m.total END AS leader_share
     FROM m
     LEFT JOIN mun_xwalk x ON x.uf = ? AND x.tse_code = m.mun_code
     LEFT JOIN candidate c ON c.year = ? AND c.id = m.leader_id
     ORDER BY name`,
    [year, uf, turno, officeCode, uf, year],
  );
}

/** Every municipality of the state with its TSE and IBGE codes (for lists and the locator map). */
export async function getStateMunicipalities(uf: string) {
  return q<{ tse_code: number; name: string; ibge_code: number }>(
    `SELECT tse_code, ibge_name AS name, ibge_code FROM mun_xwalk WHERE uf = ? ORDER BY ibge_name`,
    [uf],
  );
}

/* ---------- One municipality ---------- */

export async function getMunicipality(uf: string, tseCode: number) {
  const x = await q1<{ tse_code: number; tse_name: string; ibge_code: number | null; ibge_name: string | null }>(
    `SELECT tse_code, tse_name, ibge_code, ibge_name FROM mun_xwalk WHERE uf = ? AND tse_code = ?`,
    [uf, tseCode],
  );
  if (x) return x;
  return q1<{ tse_code: number; tse_name: string; ibge_code: number | null; ibge_name: string | null }>(
    `SELECT mun_code AS tse_code, any_value(mun_name) AS tse_name, NULL::INT AS ibge_code, NULL AS ibge_name
     FROM vote_mun WHERE uf = ? AND mun_code = ? GROUP BY mun_code`,
    [uf, tseCode],
  );
}

export interface MunCandidateRow {
  candidate_id: string;
  turno: number;
  votes: number;
  office_code: number;
  office: string;
  ballot_name: string;
  party: string;
  cand_uf: string;
  result: string | null;
  registration_status: string | null;
  candidate_votes: number | null;
  office_total: number;
  n_candidates: number;
  rk: number;
}

/** Most-voted candidates in the municipality, per office and round (top `limit` each). */
export async function getMunicipalityVotes(year: number, uf: string, tseCode: number, limit = 10) {
  return q<MunCandidateRow>(
    `WITH v AS (
       SELECT candidate_id, turno, sum(votes) AS votes FROM vote_mun
       WHERE year = ? AND uf = ? AND mun_code = ? GROUP BY ALL
     ),
     j AS (
       SELECT v.candidate_id, v.turno, v.votes, c.office_code, c.office, c.ballot_name, c.party, c.uf AS cand_uf,
         c.result, c.registration_status,
         CASE WHEN v.turno = 2 THEN c.votes_r2 ELSE c.votes_r1 END AS candidate_votes,
         sum(v.votes) OVER (PARTITION BY c.office_code, v.turno) AS office_total,
         count(*) FILTER (WHERE v.votes > 0) OVER (PARTITION BY c.office_code, v.turno) AS n_candidates,
         row_number() OVER (PARTITION BY c.office_code, v.turno ORDER BY v.votes DESC, c.ballot_name) AS rk
       FROM v JOIN candidate c ON c.year = ? AND c.id = v.candidate_id
     )
     SELECT * FROM j WHERE rk <= ? AND votes > 0 ORDER BY office_code, turno DESC, rk`,
    [year, uf, tseCode, year, limit],
  );
}
