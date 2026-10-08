import "server-only";
import { q, q1 } from "../db";

export type CandidateSummary = Record<string, unknown> & {
  year: number;
  id: string;
  name: string;
  ballot_name: string;
  social_name: string | null;
  person_id: string | null;
  uf: string;
  ue_name: string;
  office: string;
  office_code: number;
  number: number;
  party: string;
  party_name: string;
  party_number: number;
  federation: string | null;
  federation_name: string | null;
  coalition: string | null;
  coalition_parties: string | null;
  alliance_type: string | null;
  result: string | null;
  elected: boolean;
  is_running_mate: boolean;
  votes: number;
  votes_r1: number;
  votes_r2: number | null;
  valid_votes_r1: number;
  age: number | null;
  gender: string | null;
  education: string | null;
  occupation: string | null;
  race: string | null;
  generated_at: string | null;
  has_finance: boolean;
  filing_type: string | null;
  filing_date: string | null;
  finance_generated_at: string | null;
  revenue: number;
  revenue_public: number;
  revenue_private: number;
  revenue_estimable: number;
  rev_fefc: number;
  rev_fp: number;
  rev_partido: number;
  rev_pf: number;
  rev_proprios: number;
  rev_coletivo: number;
  rev_candidatos: number;
  rev_nao_identificada: number;
  rev_outros: number;
  n_revenue_tx: number;
  n_donors: number;
  n_pf_donors: number;
  n_pf_donations: number;
  pf_avg: number | null;
  pf_median: number | null;
  pf_max: number | null;
  top_donor_key: string | null;
  top_donor_name: string | null;
  top_donor_type: string | null;
  top_donor_value: number | null;
  top_private_key: string | null;
  top_private_name: string | null;
  top_private_value: number | null;
  expense: number;
  paid: number;
  paid_fefc: number;
  paid_fp: number;
  paid_outros: number;
  n_expense_tx: number;
  n_suppliers: number;
  exp_avg: number | null;
  exp_median: number | null;
  exp_max: number | null;
  top_supplier_key: string | null;
  top_supplier_name: string | null;
  top_supplier_value: number | null;
  top_supplier_share: number | null;
  top_category: string | null;
  assets: number;
  n_assets: number;
  expense_per_vote: number | null;
  revenue_per_vote: number | null;
  public_per_vote: number | null;
  private_per_vote: number | null;
  public_share: number | null;
  late_share: number | null;
};

export async function getCandidate(year: number, id: string) {
  return q1<CandidateSummary & { pct_expense: number | null; pct_expense_per_vote: number | null; pct_public_share: number | null; signals: number }>(
    `SELECT s.*, p.pct_expense, p.pct_expense_per_vote, p.pct_public_share, p.pct_revenue,
       coalesce(sc.n, 0) AS signals
     FROM candidate_summary s
     LEFT JOIN candidate_peer p ON p.year = s.year AND p.id = s.id
     LEFT JOIN signal_count sc ON sc.year = s.year AND sc.candidate_id = s.id
     WHERE s.year = ? AND s.id = ?`,
    [year, id],
  );
}

export async function getRunningMates(year: number, id: string) {
  const mates = await q<{ id: string; ballot_name: string; office: string; party: string }>(
    `SELECT c.id, c.ballot_name, c.office, c.party FROM running_mate r JOIN candidate c ON c.year = r.year AND c.id = r.mate_id
     WHERE r.year = ? AND r.head_id = ? ORDER BY c.office_code`,
    [year, id],
  );
  const heads = await q<{ id: string; ballot_name: string; office: string; party: string }>(
    `SELECT c.id, c.ballot_name, c.office, c.party FROM running_mate r JOIN candidate c ON c.year = r.year AND c.id = r.head_id
     WHERE r.year = ? AND r.mate_id = ?`,
    [year, id],
  );
  return { mates, heads };
}

export async function getPeerMedians(year: number, officeCode: number, uf: string) {
  return q<{ national: boolean; uf: string; n: number; revenue: number; expense: number; public_share: number; expense_per_vote: number; revenue_per_vote: number; public_per_vote: number; private_per_vote: number; n_donors: number; n_suppliers: number; votes: number; assets: number }>(
    `SELECT * FROM peer_median WHERE year = ? AND office_code = ? AND (national OR uf = ?) ORDER BY national`,
    [year, officeCode, uf],
  );
}

/* ---------- Funding ---------- */

export async function getRevenueByCategory(year: number, id: string) {
  return q<{ category: string; nature: string; value: number; n: number }>(
    `SELECT category, nature, sum(value)::DOUBLE AS value, count(DISTINCT sq) AS n
     FROM revenue WHERE year = ? AND candidate_id = ? GROUP BY ALL ORDER BY value DESC`,
    [year, id],
  );
}

export async function getTopDonors(year: number, id: string, limit = 12) {
  return q<{
    key: string;
    name: string;
    donor_type: string;
    kind: string | null;
    doc_display: string | null;
    value: number;
    public_value: number;
    n: number;
    main_category: string;
    other_candidates: number;
    party: string | null;
    campaign_candidate_id: string | null;
  }>(
    `SELECT r.key, coalesce(e.name, '(sem nome)') AS name, r.donor_type, e.kind, e.doc_display, r.value::DOUBLE AS value,
       coalesce(r.public_value, 0)::DOUBLE AS public_value, r.n, r.main_category, e.party, e.campaign_candidate_id,
       (SELECT count(DISTINCT candidate_id) - 1 FROM rel_donation x WHERE x.year = r.year AND x.key = r.key) AS other_candidates
     FROM rel_donation r LEFT JOIN entity e ON e.key = r.key
     WHERE r.year = ? AND r.candidate_id = ?
     ORDER BY r.value DESC LIMIT ?`,
    [year, id, limit],
  );
}

const DONATION_BINS = [
  { lo: 0, hi: 100, label: "até R$ 100" },
  { lo: 100, hi: 500, label: "R$ 100–500" },
  { lo: 500, hi: 1000, label: "R$ 500–1 mil" },
  { lo: 1000, hi: 5000, label: "R$ 1–5 mil" },
  { lo: 5000, hi: 10000, label: "R$ 5–10 mil" },
  { lo: 10000, hi: 50000, label: "R$ 10–50 mil" },
  { lo: 50000, hi: 1e15, label: "acima de R$ 50 mil" },
];

/** Distribution of individual (pessoa física) donation sizes — per transaction. */
export async function getDonationHistogram(year: number, id: string) {
  const rows = await q<{ bin: number; n: number; value: number }>(
    `WITH tx AS (SELECT sq, sum(value)::DOUBLE AS v FROM revenue WHERE year = ? AND candidate_id = ? AND category = 'pf' GROUP BY sq)
     SELECT CASE ${DONATION_BINS.map((b, i) => `WHEN v < ${b.hi} THEN ${i}`).join(" ")} END AS bin, count(*) AS n, sum(v) AS value
     FROM tx GROUP BY 1 ORDER BY 1`,
    [year, id],
  );
  return DONATION_BINS.map((b, i) => {
    const r = rows.find((x) => x.bin === i);
    return { label: b.label, n: r?.n ?? 0, value: r?.value ?? 0 };
  });
}

/* ---------- Spending ---------- */

export async function getExpenseByCategory(year: number, id: string) {
  return q<{ category_group: string; category: string; value: number; n: number; n_suppliers: number }>(
    `SELECT category_group, category, sum(value)::DOUBLE AS value, count(DISTINCT sq) AS n, count(DISTINCT supplier_key) AS n_suppliers
     FROM expense WHERE year = ? AND candidate_id = ? GROUP BY ALL ORDER BY value DESC`,
    [year, id],
  );
}

export async function getTopSuppliers(year: number, id: string, limit = 12, group?: string) {
  return q<{
    key: string;
    name: string;
    kind: string | null;
    doc_display: string | null;
    cnae: string | null;
    value: number;
    n: number;
    main_group: string;
    main_category: string;
    other_campaigns: number;
  }>(
    `WITH s AS (
       SELECT supplier_key AS key, sum(value)::DOUBLE AS value, count(DISTINCT sq) AS n,
         arg_max(category_group, value) AS main_group, arg_max(category, value) AS main_category
       FROM expense WHERE year = ? AND candidate_id = ? AND supplier_key IS NOT NULL ${group ? "AND category_group = ?" : ""}
       GROUP BY 1 ORDER BY value DESC LIMIT ?
     )
     SELECT s.*, coalesce(e.name, '(sem nome)') AS name, e.kind, e.doc_display, e.cnae,
       (SELECT count(DISTINCT candidate_id) - 1 FROM rel_supply x WHERE x.year = ? AND x.key = s.key) AS other_campaigns
     FROM s LEFT JOIN entity e ON e.key = s.key ORDER BY s.value DESC`,
    group ? [year, id, group, limit, year] : [year, id, limit, year],
  );
}

export async function getLargestExpenses(year: number, id: string, limit = 8) {
  return q<{ sq: string; date: string; value: number; supplier_key: string | null; supplier_name: string | null; category: string; description: string | null; lines: number }>(
    `SELECT sq, min(date) AS date, sum(value)::DOUBLE AS value, any_value(supplier_key) AS supplier_key, any_value(supplier_name) AS supplier_name,
       any_value(category) AS category, any_value(description) AS description, count(*) AS lines
     FROM expense WHERE year = ? AND candidate_id = ? GROUP BY sq ORDER BY value DESC LIMIT ?`,
    [year, id, limit],
  );
}

/** Daily contracted expenses and revenues within the election year. */
export async function getDaily(year: number, id: string) {
  return q<{ date: string; expense: number; revenue: number }>(
    `WITH d AS (
       SELECT date, sum(value)::DOUBLE AS expense, 0::DOUBLE AS revenue FROM expense WHERE year = ? AND candidate_id = ? GROUP BY date
       UNION ALL
       SELECT date, 0, sum(value)::DOUBLE FROM revenue WHERE year = ? AND candidate_id = ? GROUP BY date
     )
     SELECT date, sum(expense) AS expense, sum(revenue) AS revenue FROM d
     WHERE date BETWEEN make_date(?, 1, 1) AND make_date(?, 12, 31)
     GROUP BY date ORDER BY date`,
    [year, id, year, id, year, year],
  );
}

/* ---------- Money flow (Sankey) ---------- */

export interface FlowLink {
  source: string;
  target: string;
  value: number;
}

/**
 * revenue category → fund account (FEFC / Fundo Partidário / Outros recursos), from the
 * fund the TSE records on each revenue; account → spending group, from each payment's
 * recorded fund; spending group → top suppliers. In-kind donations end in their own node,
 * and money received but not (yet) paid out ends in "Saldo / ainda não pago".
 */
export async function getFlow(year: number, id: string) {
  const inLinks = await q<{ category: string; fund: string | null; nature: string; value: number }>(
    `SELECT category, fund, nature, sum(value)::DOUBLE AS value FROM revenue WHERE year = ? AND candidate_id = ? GROUP BY ALL`,
    [year, id],
  );
  const outLinks = await q<{ fund: string; category_group: string; value: number }>(
    `SELECT p.fund, e.category_group, sum(p.value)::DOUBLE AS value
     FROM payment p
     JOIN (SELECT DISTINCT sq, category_group FROM expense WHERE year = ? AND candidate_id = ?) e ON e.sq = p.sq
     WHERE p.year = ? AND p.candidate_id = ? GROUP BY ALL`,
    [year, id, year, id],
  );
  const supLinks = await q<{ category_group: string; supplier_key: string; name: string; value: number; rk: number }>(
    `WITH x AS (
       SELECT e.category_group, e.supplier_key, any_value(e.supplier_name) AS name, sum(p.value)::DOUBLE AS value
       FROM payment p
       JOIN (SELECT DISTINCT sq, category_group, supplier_key, supplier_name FROM expense WHERE year = ? AND candidate_id = ?) e ON e.sq = p.sq
       WHERE p.year = ? AND p.candidate_id = ? GROUP BY ALL
     )
     SELECT *, row_number() OVER (PARTITION BY category_group ORDER BY value DESC) AS rk FROM x`,
    [year, id, year, id],
  );
  return { inLinks, outLinks, supLinks };
}

/* ---------- History & assets ---------- */

export async function getHistory(personId: string | null, year: number, id: string) {
  return q<{
    year: number;
    id: string;
    ballot_name: string;
    office: string;
    office_code: number;
    uf: string;
    party: string;
    result: string | null;
    votes: number;
    revenue: number;
    expense: number;
    revenue_public: number;
    revenue_private: number;
    assets: number;
    has_finance: boolean;
    is_running_mate: boolean;
    registration_status: string | null;
  }>(
    personId
      ? `SELECT year, id, ballot_name, office, office_code, uf, party, result, registration_status, votes, revenue, expense, revenue_public, revenue_private, assets, has_finance, is_running_mate
         FROM candidate_summary WHERE person_id = ? ORDER BY year`
      : `SELECT year, id, ballot_name, office, office_code, uf, party, result, registration_status, votes, revenue, expense, revenue_public, revenue_private, assets, has_finance, is_running_mate
         FROM candidate_summary WHERE year = ? AND id = ?`,
    personId ? [personId] : [year, id],
  );
}

export async function getHistoryTop(personId: string) {
  const donors = await q<{ year: number; key: string; name: string; value: number; rk: number }>(
    `SELECT * FROM (
       SELECT r.year, r.key, e.name, r.value::DOUBLE AS value, row_number() OVER (PARTITION BY r.year ORDER BY r.value DESC) AS rk
       FROM rel_donation r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id LEFT JOIN entity e ON e.key = r.key
       WHERE c.person_id = ?
     ) WHERE rk <= 3 ORDER BY year, rk`,
    [personId],
  );
  const suppliers = await q<{ year: number; key: string; name: string; value: number; rk: number }>(
    `SELECT * FROM (
       SELECT r.year, r.key, e.name, r.value::DOUBLE AS value, row_number() OVER (PARTITION BY r.year ORDER BY r.value DESC) AS rk
       FROM rel_supply r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id LEFT JOIN entity e ON e.key = r.key
       WHERE c.person_id = ?
     ) WHERE rk <= 3 ORDER BY year, rk`,
    [personId],
  );
  return { donors, suppliers };
}

export async function getAssets(year: number, id: string) {
  return q<{ ord: number; type: string; description: string | null; value: number; category: string }>(
    `SELECT ord, type, description, value::DOUBLE AS value, category FROM asset WHERE year = ? AND candidate_id = ? ORDER BY value DESC`,
    [year, id],
  );
}

export async function getAssetHistory(personId: string) {
  return q<{ year: number; category: string; value: number }>(
    `SELECT a.year, a.category, sum(a.value)::DOUBLE AS value
     FROM asset a JOIN candidate c ON c.year = a.year AND c.id = a.candidate_id
     WHERE c.person_id = ? GROUP BY ALL ORDER BY a.year`,
    [personId],
  );
}

/* ---------- Signals ---------- */

export interface SignalRow {
  code: string;
  family: string;
  metric: number | null;
  threshold: number | null;
  peer_pct: number | null;
  ref_key: string | null;
  ref_name: string | null;
  ref_value: number | null;
  ref_count: number | null;
  strength: number;
}

export async function getSignals(year: number, id: string) {
  return q<SignalRow>(
    `SELECT code, family, metric, threshold, peer_pct, ref_key, ref_name, ref_value, ref_count, strength
     FROM signal WHERE year = ? AND candidate_id = ?
     ORDER BY CASE family WHEN 'concentracao' THEN 0 WHEN 'tempo' THEN 1 WHEN 'mudanca' THEN 2 WHEN 'consistencia' THEN 3 ELSE 4 END, strength DESC`,
    [year, id],
  );
}

/* ---------- Peers (for descriptive per-vote comparison) ---------- */

export async function getPeers(year: number, officeCode: number, uf: string) {
  const national = officeCode === 1;
  return q<{ id: string; ballot_name: string; party: string; votes: number; expense: number; expense_per_vote: number; elected: boolean }>(
    `SELECT id, ballot_name, party, votes, expense, expense_per_vote, elected FROM candidate_summary
     WHERE year = ? AND office_code = ? ${national ? "" : "AND uf = ?"} AND NOT is_running_mate AND votes > 0 AND expense > 0`,
    national ? [year, officeCode] : [year, officeCode, uf],
  );
}

/* ---------- Data changes for this campaign ---------- */

export async function getCampaignChanges(year: number, id: string) {
  const campaign = await q<{ from_capture: string; to_capture: string; old_filing_type: string | null; new_filing_type: string | null; old_filing_date: string | null; new_filing_date: string | null; old_revenue: number | null; new_revenue: number | null; old_expense: number | null; new_expense: number | null }>(
    `SELECT * EXCLUDE (year, candidate_id) FROM campaign_change WHERE year = ? AND candidate_id = ? ORDER BY to_capture DESC`,
    [year, id],
  );
  const tx = await q<{ to_capture: string; kind: string; change: string; n: number; delta: number }>(
    `SELECT to_capture, kind, change, count(*) AS n, sum(coalesce(new_value, 0) - coalesce(old_value, 0))::DOUBLE AS delta
     FROM change_log WHERE year = ? AND candidate_id = ? GROUP BY ALL ORDER BY to_capture DESC`,
    [year, id],
  );
  return { campaign, tx };
}

/** Top suppliers inside each spending group (for category → supplier drill-down). */
export async function getSuppliersByGroup(year: number, id: string, perGroup = 5) {
  return q<{ category_group: string; key: string | null; name: string | null; value: number; n: number; rk: number }>(
    `WITH s AS (
       SELECT category_group, supplier_key AS key, any_value(supplier_name) AS name, sum(value)::DOUBLE AS value, count(DISTINCT sq) AS n
       FROM expense WHERE year = ? AND candidate_id = ? GROUP BY category_group, supplier_key
     )
     SELECT *, row_number() OVER (PARTITION BY category_group ORDER BY value DESC) AS rk FROM s
     QUALIFY rk <= ? ORDER BY category_group, rk`,
    [year, id, perGroup],
  );
}

/**
 * Votes by municipality in the candidate's last round, with the candidate's share of all
 * nominal votes for the same office in each municipality. IBGE codes come from mun_xwalk.
 */
export async function getVotesByPlace(year: number, id: string, officeCode: number, round: number) {
  return q<{ uf: string; mun_code: number; mun_name: string; ibge_code: number | null; votes: number; total: number }>(
    `WITH v AS (
       SELECT uf, mun_code, any_value(mun_name) AS mun_name, sum(votes)::BIGINT AS votes
       FROM vote_mun WHERE year = ? AND candidate_id = ? AND turno = ? AND mun_code IS NOT NULL GROUP BY uf, mun_code
     ),
     tot AS (
       SELECT vm.uf, vm.mun_code, sum(vm.votes)::BIGINT AS total
       FROM vote_mun vm JOIN candidate c ON c.year = vm.year AND c.id = vm.candidate_id
       WHERE vm.year = ? AND c.office_code = ? AND vm.turno = ?
         AND (vm.uf, vm.mun_code) IN (SELECT uf, mun_code FROM v)
       GROUP BY ALL
     )
     SELECT v.uf, v.mun_code, v.mun_name, x.ibge_code, v.votes, tot.total
     FROM v JOIN tot USING (uf, mun_code) LEFT JOIN mun_xwalk x ON x.uf = v.uf AND x.tse_code = v.mun_code
     WHERE v.votes > 0
     ORDER BY v.votes DESC`,
    [year, id, round, year, officeCode, round],
  );
}

/** Main counterparties inside each funding group (for money-in rows that expand). */
export async function getDonorsByGroup(year: number, id: string, perGroup = 5) {
  return q<{ grp: string; key: string | null; name: string | null; donor_type: string; kind: string | null; party: string | null; campaign_candidate_id: string | null; value: number; n: number; rk: number }>(
    `WITH d AS (
       SELECT CASE WHEN category IN ('fefc','fp','pf','partido','proprios','coletivo') THEN category ELSE 'outras' END AS grp,
         donor_key AS key, any_value(donor_name) AS name, any_value(donor_type) AS donor_type,
         sum(value)::DOUBLE AS value, count(DISTINCT sq) AS n
       FROM revenue WHERE year = ? AND candidate_id = ? GROUP BY 1, 2
     )
     SELECT d.*, e.kind, e.party, e.campaign_candidate_id, row_number() OVER (PARTITION BY grp ORDER BY value DESC) AS rk
     FROM d LEFT JOIN entity e ON e.key = d.key
     QUALIFY rk <= ? ORDER BY grp, rk`,
    [year, id, perGroup],
  );
}
