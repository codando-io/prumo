import "server-only";
import { q, q1 } from "../db";

/*
 * Party-level aggregates. Everything here sums the accounts of the party's candidacies
 * (candidate_summary, rev_cube, exp_cube, rel_*): the accounts of the party bodies themselves
 * (diretórios) are a different TSE dataset and are not included. Running mates have no
 * accounts of their own and are left out of candidate counts.
 */

/** Siglas change spelling between elections ("PC do B" → "PCDOB"); compare them loosely. */
export function normParty(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}
const NORM_SQL = (col: string) => `upper(replace(strip_accents(${col}), ' ', ''))`;

export interface PartyRow {
  party: string;
  party_name: string;
  party_number: number;
  n_candidates: number;
  n_finance: number;
  n_elected: number;
  /** Candidacies still in a pending second round (result "2º TURNO"). */
  n_runoff: number;
  revenue: number;
  expense: number;
  revenue_public: number;
  public_share: number | null;
  votes_federal: number;
}

const PARTY_COLUMNS = `
  any_value(party_name) AS party_name, any_value(party_number) AS party_number,
  count(*) AS n_candidates,
  count(*) FILTER (WHERE has_finance) AS n_finance,
  count(*) FILTER (WHERE elected) AS n_elected,
  count(*) FILTER (WHERE result = '2º TURNO') AS n_runoff,
  coalesce(sum(revenue), 0) AS revenue,
  coalesce(sum(expense), 0) AS expense,
  coalesce(sum(revenue_public), 0) AS revenue_public,
  CASE WHEN sum(revenue) > 0 THEN sum(revenue_public) / sum(revenue) END AS public_share,
  coalesce(sum(votes) FILTER (WHERE office_code = 6), 0) AS votes_federal`;

/** Every party that had candidacies in the election, alphabetical. */
export async function listParties(year: number) {
  return q<PartyRow>(
    `SELECT party, ${PARTY_COLUMNS}
     FROM candidate_summary WHERE year = ? AND NOT is_running_mate AND party IS NOT NULL
     GROUP BY party ORDER BY party`,
    [year],
  );
}

/** Data generation timestamps for provenance popovers. */
export async function yearMeta(year: number) {
  return (
    (await q1<{ finance_generated_at: string | null; candidates_generated_at: string | null; votes_generated_at: string | null }>(
      `SELECT (SELECT max(generated_at) FROM filing WHERE year = ?) AS finance_generated_at,
         (SELECT max(generated_at) FROM candidate WHERE year = ?) AS candidates_generated_at,
         (SELECT max(generated_at) FROM vote_meta WHERE year = ?) AS votes_generated_at`,
      [year, year, year],
    )) ?? { finance_generated_at: null, candidates_generated_at: null, votes_generated_at: null }
  );
}

/**
 * Resolve a sigla from the URL to the spelling used in each election. Returns one row per
 * election in which a party with that (loosely matched) sigla had candidacies.
 */
export async function resolveParty(sigla: string) {
  return q<{ year: number; party: string; party_name: string; party_number: number; federation_name: string | null }>(
    `SELECT year, party, any_value(party_name) AS party_name, any_value(party_number) AS party_number,
       max(federation_name) AS federation_name
     FROM candidate WHERE party = ? OR ${NORM_SQL("party")} = ?
     GROUP BY year, party ORDER BY year DESC`,
    [sigla, normParty(sigla)],
  );
}

export async function getPartySummary(year: number, party: string) {
  return q1<PartyRow & { generated_at: string | null; revenue_private: number; revenue_estimable: number; paid: number; n_revenue_tx: number; n_expense_tx: number }>(
    `SELECT party, ${PARTY_COLUMNS},
       coalesce(sum(revenue_private), 0) AS revenue_private,
       coalesce(sum(revenue_estimable), 0) AS revenue_estimable,
       coalesce(sum(paid), 0) AS paid,
       coalesce(sum(n_revenue_tx), 0) AS n_revenue_tx,
       coalesce(sum(n_expense_tx), 0) AS n_expense_tx,
       max(finance_generated_at) AS generated_at
     FROM candidate_summary WHERE year = ? AND party = ? AND NOT is_running_mate
     GROUP BY party`,
    [year, party],
  );
}

export async function getPartyOffices(year: number, party: string) {
  return q<{ office_code: number; office: string; n: number; n_finance: number; n_elected: number; n_runoff: number; revenue: number; expense: number; revenue_public: number }>(
    `SELECT office_code, any_value(office) AS office, count(*) AS n,
       count(*) FILTER (WHERE has_finance) AS n_finance,
       count(*) FILTER (WHERE elected) AS n_elected,
       count(*) FILTER (WHERE result = '2º TURNO') AS n_runoff,
       coalesce(sum(revenue), 0) AS revenue, coalesce(sum(expense), 0) AS expense, coalesce(sum(revenue_public), 0) AS revenue_public
     FROM candidate_summary WHERE year = ? AND party = ? AND NOT is_running_mate
     GROUP BY office_code ORDER BY office_code`,
    [year, party],
  );
}

export async function getPartyRevenueByCategory(year: number, party: string) {
  return q<{ category: string; value: number; n: number }>(
    `SELECT category, sum(value)::DOUBLE AS value, sum(n)::BIGINT AS n
     FROM rev_cube WHERE year = ? AND party = ? GROUP BY category ORDER BY value DESC`,
    [year, party],
  );
}

export async function getPartyExpenseByCategory(year: number, party: string) {
  return q<{ category_group: string; category: string; value: number; n: number }>(
    `SELECT category_group, category, sum(value)::DOUBLE AS value, sum(n)::BIGINT AS n
     FROM exp_cube WHERE year = ? AND party = ? GROUP BY ALL ORDER BY value DESC`,
    [year, party],
  );
}

export interface CounterpartRow {
  key: string;
  name: string;
  kind: string | null;
  doc_display: string | null;
  value: number;
  n_campaigns: number;
  main_group?: string | null;
}

/** Suppliers that received the most from the party's campaigns, summed across campaigns. */
export async function getPartyTopSuppliers(year: number, party: string, limit = 10) {
  return q<CounterpartRow>(
    `WITH s AS (
       SELECT r.key, sum(r.value)::DOUBLE AS value, count(DISTINCT r.candidate_id) AS n_campaigns,
         arg_max(r.main_group, r.value) AS main_group
       FROM rel_supply r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id
       WHERE r.year = ? AND c.party = ?
       GROUP BY r.key ORDER BY value DESC LIMIT ?
     )
     SELECT s.*, coalesce(e.name, '(sem nome)') AS name, e.kind, e.doc_display
     FROM s LEFT JOIN entity e ON e.key = s.key ORDER BY s.value DESC`,
    [year, party, limit],
  );
}

/**
 * Private donors to the party's campaigns: people and crowdfunding platforms. Transfers
 * from party bodies and other campaigns, and the candidates' own money, are excluded.
 */
export async function getPartyTopDonors(year: number, party: string, limit = 10) {
  return q<CounterpartRow>(
    `WITH s AS (
       SELECT r.key, sum(r.value)::DOUBLE AS value, count(DISTINCT r.candidate_id) AS n_campaigns
       FROM rel_donation r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id
       LEFT JOIN entity e ON e.key = r.key
       WHERE r.year = ? AND c.party = ? AND r.donor_type NOT IN ('partido', 'candidato', 'proprio')
         AND coalesce(e.kind, '') NOT IN ('partido', 'campanha')
       GROUP BY r.key ORDER BY value DESC LIMIT ?
     )
     SELECT s.*, coalesce(e.name, '(sem nome)') AS name, e.kind, e.doc_display
     FROM s LEFT JOIN entity e ON e.key = s.key ORDER BY s.value DESC`,
    [year, party, limit],
  );
}

/**
 * Party bodies (national, state and municipal diretórios) of this party that transferred
 * money to campaigns in this election. Uses the sigla recorded on each revenue record for the
 * year, so bodies of renamed parties are attributed to the name they had at the time.
 */
export async function getPartyBodies(year: number, party: string) {
  return q<{
    key: string;
    name: string;
    doc_display: string | null;
    uf: string | null;
    sphere: string | null;
    value: number;
    public_value: number;
    n_candidates: number;
    n_other_party: number;
    other_party_value: number;
  }>(
    `WITH b AS (
       SELECT r.donor_key AS key, mode(r.donor_party_sphere) AS sphere, mode(r.donor_uf) AS uf,
         sum(r.value)::DOUBLE AS value,
         coalesce(sum(r.value) FILTER (WHERE r.is_public), 0)::DOUBLE AS public_value,
         count(DISTINCT r.candidate_id) AS n_candidates,
         count(DISTINCT r.candidate_id) FILTER (WHERE c.party <> r.donor_party) AS n_other_party,
         coalesce(sum(r.value) FILTER (WHERE c.party <> r.donor_party), 0)::DOUBLE AS other_party_value
       FROM revenue r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id
       WHERE r.year = ? AND r.donor_type = 'partido' AND r.donor_party = ? AND r.donor_key IS NOT NULL
       GROUP BY r.donor_key
     )
     SELECT b.*, coalesce(e.name, '(sem nome)') AS name, e.doc_display, coalesce(b.uf, e.uf) AS uf
     FROM b LEFT JOIN entity e ON e.key = b.key ORDER BY b.value DESC`,
    [year, party],
  );
}

export async function getPartyDistribution(year: number, party: string) {
  return q1<{ n_candidates: number; public_total: number; gini_public: number | null; top10_share_public: number | null; n_with_public: number }>(
    `SELECT n_candidates, public_total, gini_public, top10_share_public, n_with_public
     FROM party_distribution WHERE year = ? AND party = ?`,
    [year, party],
  );
}

export async function getPartyTopPublic(year: number, party: string, limit = 20) {
  return q<{ id: string; ballot_name: string; office: string; office_code: number; uf: string; result: string | null; registration_status: string | null; revenue_public: number; revenue: number }>(
    `SELECT id, ballot_name, office, office_code, uf, result, registration_status, revenue_public, revenue
     FROM candidate_summary
     WHERE year = ? AND party = ? AND NOT is_running_mate AND revenue_public > 0
     ORDER BY revenue_public DESC, ballot_name LIMIT ?`,
    [year, party, limit],
  );
}

const PUBLIC_BINS = [
  { lo: 0, hi: 1e4, label: "até R$ 10 mil" },
  { lo: 1e4, hi: 5e4, label: "R$ 10–50 mil" },
  { lo: 5e4, hi: 2e5, label: "R$ 50–200 mil" },
  { lo: 2e5, hi: 1e6, label: "R$ 200 mil–1 mi" },
  { lo: 1e6, hi: 3e6, label: "R$ 1–3 mi" },
  { lo: 3e6, hi: 1e15, label: "acima de R$ 3 mi" },
];

/** How many of the party's candidacies received how much public money (FEFC + Fundo Partidário). */
export async function getPartyPublicHistogram(year: number, party: string) {
  const rows = await q<{ bin: number; n: number; value: number }>(
    `SELECT CASE WHEN revenue_public <= 0 THEN -1 ${PUBLIC_BINS.map((b, i) => `WHEN revenue_public < ${b.hi} THEN ${i}`).join(" ")} END AS bin,
       count(*) AS n, coalesce(sum(revenue_public), 0)::DOUBLE AS value
     FROM candidate_summary WHERE year = ? AND party = ? AND NOT is_running_mate
     GROUP BY 1 ORDER BY 1`,
    [year, party],
  );
  return [{ label: "nenhum dinheiro público" }, ...PUBLIC_BINS].map((b, i) => {
    const r = rows.find((x) => x.bin === i - 1);
    return { label: b.label, n: r?.n ?? 0, value: r?.value ?? 0 };
  });
}

/** Totals of the same party (loosely matched sigla) in every election covered. */
export async function getPartyHistory(sigla: string) {
  return q<PartyRow & { year: number }>(
    `SELECT year, party, ${PARTY_COLUMNS}
     FROM candidate_summary WHERE NOT is_running_mate AND (party = ? OR ${NORM_SQL("party")} = ?)
     GROUP BY year, party ORDER BY year`,
    [sigla, normParty(sigla)],
  );
}
