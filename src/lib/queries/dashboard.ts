import "server-only";
import { q, q1 } from "../db";

export interface DashFilters {
  year: number;
  uf?: string;
  office?: number;
  party?: string;
}

/** WHERE clause over a table that has (year, uf, office_code, party) columns, plus params. */
function where(f: DashFilters, alias = "") {
  const a = alias ? `${alias}.` : "";
  const parts = [`${a}year = ?`];
  const params: unknown[] = [f.year];
  if (f.uf) {
    parts.push(`${a}uf = ?`);
    params.push(f.uf);
  }
  if (f.office) {
    parts.push(`${a}office_code = ?`);
    params.push(f.office);
  }
  if (f.party) {
    parts.push(`${a}party = ?`);
    params.push(f.party);
  }
  return { sql: parts.join(" AND "), params };
}

export async function totals(f: DashFilters) {
  const w = where(f, "s");
  return q1<{
    n_candidates: number;
    n_finance: number;
    n_elected: number;
    revenue: number;
    expense: number;
    paid: number;
    revenue_public: number;
    revenue_private: number;
    revenue_estimable: number;
    avg_expense: number;
    median_expense: number;
    n_revenue_tx: number;
    n_expense_tx: number;
    votes: number;
    generated_at: string | null;
  }>(
    `SELECT count(*) AS n_candidates,
       count(*) FILTER (WHERE has_finance) AS n_finance,
       count(*) FILTER (WHERE elected) AS n_elected,
       sum(revenue) AS revenue, sum(expense) AS expense, sum(paid) AS paid,
       sum(revenue_public) AS revenue_public, sum(revenue_private) AS revenue_private, sum(revenue_estimable) AS revenue_estimable,
       avg(expense) FILTER (WHERE has_finance) AS avg_expense,
       median(expense) FILTER (WHERE has_finance) AS median_expense,
       sum(n_revenue_tx) AS n_revenue_tx, sum(n_expense_tx) AS n_expense_tx,
       sum(votes) AS votes,
       max(finance_generated_at) AS generated_at
     FROM candidate_summary s WHERE ${w.sql} AND NOT s.is_running_mate`,
    w.params,
  );
}

export async function counterpartCounts(f: DashFilters) {
  const w = where(f, "c");
  const [d, s] = await Promise.all([
    q1<{ n: number; n_pf: number }>(
      `SELECT count(DISTINCT r.key) AS n, count(DISTINCT r.key) FILTER (WHERE r.donor_type = 'pf') AS n_pf
       FROM rel_donation r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id WHERE ${w.sql.replaceAll("c.year", "r.year")}`,
      w.params,
    ),
    q1<{ n: number }>(
      `SELECT count(DISTINCT r.key) AS n FROM rel_supply r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id WHERE ${w.sql.replaceAll("c.year", "r.year")}`,
      w.params,
    ),
  ]);
  return { donors: d?.n ?? 0, donorsPf: d?.n_pf ?? 0, suppliers: s?.n ?? 0 };
}

export async function revenueByCategory(f: DashFilters) {
  const w = where(f);
  return q<{ category: string; value: number; n: number }>(
    `SELECT category, sum(value) AS value, sum(n) AS n FROM rev_cube WHERE ${w.sql} GROUP BY 1 ORDER BY 2 DESC`,
    w.params,
  );
}

export async function expenseByGroup(f: DashFilters) {
  const w = where(f);
  return q<{ category_group: string; value: number; n: number }>(
    `SELECT category_group, sum(value) AS value, sum(n) AS n FROM exp_cube WHERE ${w.sql} GROUP BY 1 ORDER BY 2 DESC`,
    w.params,
  );
}

export async function daily(f: DashFilters) {
  const w = where(f);
  return q<{ date: string; expense: number; revenue: number }>(
    `WITH d AS (
       SELECT date, value AS expense, 0 AS revenue FROM exp_daily WHERE ${w.sql}
       UNION ALL
       SELECT date, 0, value FROM rev_daily WHERE ${w.sql}
     ) SELECT date, sum(expense)::DOUBLE AS expense, sum(revenue)::DOUBLE AS revenue FROM d GROUP BY date ORDER BY date`,
    [...w.params, ...w.params],
  );
}

export async function byOffice(f: DashFilters) {
  const w = where(f, "s");
  return q<{ office_code: number; office: string; n: number; n_finance: number; revenue: number; expense: number; revenue_public: number; median_expense: number }>(
    `SELECT office_code, any_value(office) AS office, count(*) AS n, count(*) FILTER (WHERE has_finance) AS n_finance,
       sum(revenue) AS revenue, sum(expense) AS expense, sum(revenue_public) AS revenue_public,
       median(expense) FILTER (WHERE has_finance) AS median_expense
     FROM candidate_summary s WHERE ${w.sql} AND NOT s.is_running_mate GROUP BY 1 ORDER BY 1`,
    w.params,
  );
}

export async function byState(f: DashFilters) {
  const w = where({ ...f, uf: undefined }, "s");
  return q<{ uf: string; n: number; revenue: number; expense: number; revenue_public: number }>(
    `SELECT uf, count(*) AS n, sum(revenue) AS revenue, sum(expense) AS expense, sum(revenue_public) AS revenue_public
     FROM candidate_summary s WHERE ${w.sql} AND NOT s.is_running_mate GROUP BY 1 ORDER BY 1`,
    w.params,
  );
}

export async function topCampaigns(f: DashFilters, limit = 10) {
  const w = where(f, "s");
  return q<{ id: string; year: number; ballot_name: string; office: string; uf: string; party: string; expense: number; revenue: number; votes: number; result: string | null }>(
    `SELECT id, year, ballot_name, office, uf, party, expense, revenue, votes, result
     FROM candidate_summary s WHERE ${w.sql} AND NOT s.is_running_mate AND s.expense > 0 ORDER BY expense DESC LIMIT ?`,
    [...w.params, limit],
  );
}

export async function topSuppliers(f: DashFilters, limit = 8) {
  const w = where(f, "c");
  return q<{ key: string; name: string; kind: string; value: number; n_campaigns: number; n_parties: number }>(
    `SELECT r.key, any_value(e.name) AS name, any_value(e.kind) AS kind, sum(r.value)::DOUBLE AS value,
       count(DISTINCT r.candidate_id) AS n_campaigns, count(DISTINCT c.party) AS n_parties
     FROM rel_supply r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id LEFT JOIN entity e ON e.key = r.key
     WHERE ${w.sql.replaceAll("c.year", "r.year")} GROUP BY r.key ORDER BY value DESC LIMIT ?`,
    [...w.params, limit],
  );
}

export async function topPrivateDonors(f: DashFilters, limit = 8) {
  const w = where(f, "c");
  return q<{ key: string; name: string; kind: string; value: number; n_candidates: number; n_parties: number }>(
    `SELECT r.key, any_value(e.name) AS name, any_value(e.kind) AS kind, sum(r.value)::DOUBLE AS value,
       count(DISTINCT r.candidate_id) AS n_candidates, count(DISTINCT c.party) AS n_parties
     FROM rel_donation r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id LEFT JOIN entity e ON e.key = r.key
     WHERE ${w.sql.replaceAll("c.year", "r.year")} AND r.donor_type IN ('pf', 'pj') GROUP BY r.key ORDER BY value DESC LIMIT ?`,
    [...w.params, limit],
  );
}

export async function filterOptions(year: number) {
  const parties = await q<{ party: string; party_name: string }>(
    `SELECT party, any_value(party_name) AS party_name FROM candidate WHERE year = ? AND party IS NOT NULL GROUP BY 1 ORDER BY 1`,
    [year],
  );
  const ufs = await q<{ uf: string }>(`SELECT DISTINCT uf FROM candidate WHERE year = ? ORDER BY 1`, [year]);
  return { parties, ufs: ufs.map((u) => u.uf) };
}

export async function featured(year: number) {
  return q<{ id: string; ballot_name: string; office: string; uf: string; party: string }>(
    `SELECT id, ballot_name, office, uf, party FROM candidate_summary
     WHERE year = ? AND NOT is_running_mate AND office_code IN (1, 3) AND has_finance
     ORDER BY votes DESC LIMIT 6`,
    [year],
  );
}

/** Top suppliers inside each expense group, across the campaigns of a scope. */
export async function suppliersByGroup(f: DashFilters, perGroup = 5) {
  const w = where(f, "c");
  return q<{ category_group: string; key: string; name: string | null; kind: string | null; value: number; n_campaigns: number; rk: number }>(
    `WITH s AS (
       SELECT e.category_group, e.supplier_key AS key, sum(e.value)::DOUBLE AS value, count(DISTINCT e.candidate_id)::INT AS n_campaigns
       FROM expense e JOIN candidate c ON c.year = e.year AND c.id = e.candidate_id
       WHERE ${w.sql} AND e.supplier_key IS NOT NULL GROUP BY 1, 2
     )
     SELECT s.*, en.name, en.kind, row_number() OVER (PARTITION BY category_group ORDER BY value DESC) AS rk
     FROM s LEFT JOIN entity en ON en.key = s.key
     QUALIFY rk <= ? ORDER BY category_group, rk`,
    [...w.params, perGroup],
  );
}

/** Top donors inside each funding group, across the campaigns of a scope. */
export async function donorsByGroup(f: DashFilters, perGroup = 5) {
  const w = where(f, "c");
  return q<{
    grp: string;
    key: string;
    name: string | null;
    donor_type: string | null;
    kind: string | null;
    party: string | null;
    campaign_candidate_id: string | null;
    value: number;
    n_candidates: number;
    rk: number;
  }>(
    `WITH d AS (
       SELECT CASE WHEN r.category IN ('fefc','fp','pf','partido','proprios','coletivo') THEN r.category ELSE 'outras' END AS grp,
         r.donor_key AS key, any_value(r.donor_type) AS donor_type,
         sum(r.value)::DOUBLE AS value, count(DISTINCT r.candidate_id)::INT AS n_candidates
       FROM revenue r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id
       WHERE ${w.sql} AND r.donor_key IS NOT NULL GROUP BY 1, 2
     )
     SELECT d.*, e.name, e.kind, e.party, e.campaign_candidate_id, row_number() OVER (PARTITION BY grp ORDER BY value DESC) AS rk
     FROM d LEFT JOIN entity e ON e.key = d.key
     QUALIFY rk <= ? ORDER BY grp, rk`,
    [...w.params, perGroup],
  );
}
