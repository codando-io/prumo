import "server-only";
import { q, q1 } from "../db";
import { normalize } from "./search";

/*
 * Donors (doadores) and suppliers (fornecedores): counterparties identified by `key`
 * (j<CNPJ>, f<hash of CPF>, x<hash>). Lists read the precomputed aggregates (entity_year,
 * rel_donation, rel_supply, rel_origin); the expense fact table is only scanned when a list
 * is filtered by spending group or for a single supplier (indexed on supplier_key).
 */

export const PAGE_SIZE = 50;

/* ---------- Shared helpers ---------- */

/** Accent-insensitive name filter (same normalisation as the global search) as a key semi-join. */
function textCond(term: string | undefined, params: unknown[]): string {
  const norm = normalize(term ?? "");
  const words = norm.split(/\s+/).filter((w) => w.length > 0).slice(0, 6);
  if (!words.length) return "";
  const digits = norm.replace(/\D/g, "");
  // A full CNPJ (with or without punctuation) is the key itself.
  if (digits.length === 14 && !/[a-z]/.test(norm)) {
    params.push(`j${digits}`);
    return " AND key = ?";
  }
  let cond = words.map(() => "norm(name) LIKE ?").join(" AND ");
  params.push(...words.map((w) => `%${w}%`));
  if (digits.length >= 8) {
    // part of a CNPJ; CPFs are masked, so only their visible digits can match
    cond = `(${cond}) OR replace(replace(replace(coalesce(doc_display, ''), '.', ''), '/', ''), '-', '') LIKE ?`;
    params.push(`%${digits}%`);
  }
  return ` AND key IN (SELECT key FROM entity WHERE ${cond})`;
}

/** Entity kind filter. Natural persons are exactly the `f…` keys, which avoids a join. */
function kindCond(kind: string | undefined, params: unknown[]): string {
  if (!kind) return "";
  if (kind === "pf") return " AND starts_with(key, 'f')";
  params.push(kind);
  return " AND key IN (SELECT key FROM entity WHERE kind = ?)";
}

/** Filter on the supported/served candidacy (alias c = candidate). */
function candCond(f: { uf?: string; party?: string }, params: unknown[]): string {
  let s = "";
  if (f.uf) {
    s += " AND c.uf = ?";
    params.push(f.uf);
  }
  if (f.party) {
    s += " AND c.party = ?";
    params.push(f.party);
  }
  return s;
}

function placeholders(n: number) {
  return Array.from({ length: n }, () => "?").join(", ");
}

export interface EntityLite {
  key: string;
  kind: string;
  name: string | null;
  doc_display: string | null;
  uf: string | null;
  city: string | null;
  cnae: string | null;
  party: string | null;
  campaign_candidate_id: string | null;
}

async function entitiesByKey(keys: string[]): Promise<Map<string, EntityLite>> {
  if (!keys.length) return new Map();
  const rows = await q<EntityLite>(
    `SELECT key, kind, name, doc_display, uf, city, cnae, party, campaign_candidate_id FROM entity WHERE key IN (${placeholders(keys.length)})`,
    keys,
  );
  return new Map(rows.map((r) => [r.key, r]));
}

/** Parties with candidacies in the election (filter options). */
export async function partiesOf(year: number) {
  const rows = await q<{ party: string }>(`SELECT DISTINCT party FROM candidate WHERE year = ? AND party IS NOT NULL ORDER BY party`, [year]);
  return rows.map((r) => r.party);
}

/** When the TSE generated the finance files for an election (for provenance). */
export async function financeGeneratedAt(year: number) {
  const r = await q1<{ at: string | null }>(`SELECT max(generated_at) AS at FROM filing WHERE year = ?`, [year]);
  return r?.at ?? null;
}

/* ---------- Donor list ---------- */

export type DonorSort = "valor" | "candidatos" | "doacoes" | "indireto";

export interface DonorListFilters {
  year: number;
  kind?: string;
  uf?: string;
  party?: string;
  q?: string;
  sort: DonorSort;
  page: number;
}

export interface DonorListRow extends EntityLite {
  donated: number;
  n_donations: number;
  n_candidates: number;
  n_parties: number;
  donated_indirect: number;
  n_candidates_indirect: number;
}

const DONOR_ORDER: Record<DonorSort, string> = {
  valor: "donated DESC, donated_indirect DESC",
  candidatos: "n_candidates DESC, donated DESC",
  doacoes: "n_donations DESC, donated DESC",
  indireto: "donated_indirect DESC, donated DESC",
};

/** The filtered donor set as a SELECT with uniform columns (key, donated, n_donations, …). */
function donorBase(f: DonorListFilters, params: unknown[]): string {
  if (!f.uf && !f.party) {
    params.push(f.year);
    const where = `year = ? AND (donated > 0 OR donated_indirect > 0)${kindCond(f.kind, params)}${textCond(f.q, params)}`;
    return `SELECT key, donated::DOUBLE AS donated, n_donations::BIGINT AS n_donations, n_candidates_donated AS n_candidates,
        n_parties_donated AS n_parties, donated_indirect::DOUBLE AS donated_indirect, n_candidates_indirect
      FROM entity_year WHERE ${where}`;
  }
  // Restricted to donations to candidacies in a state and/or of a party: aggregate the edges.
  params.push(f.year);
  const dCond = candCond(f, params);
  params.push(f.year);
  const oCond = candCond(f, params);
  const outer = `${kindCond(f.kind, params)}${textCond(f.q, params)}`;
  return `WITH d AS (
      SELECT r.key, sum(r.value) AS donated, sum(r.n) AS n_donations, count(DISTINCT r.candidate_id) AS n_candidates, count(DISTINCT c.party) AS n_parties
      FROM rel_donation r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id
      WHERE r.year = ?${dCond} GROUP BY r.key
    ), o AS (
      SELECT r.key, sum(r.value) AS donated_indirect, count(DISTINCT r.candidate_id) AS n_candidates_indirect
      FROM rel_origin r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id
      WHERE r.year = ?${oCond} GROUP BY r.key
    ), a AS (
      SELECT coalesce(d.key, o.key) AS key, coalesce(d.donated, 0)::DOUBLE AS donated, coalesce(d.n_donations, 0)::BIGINT AS n_donations,
        coalesce(d.n_candidates, 0) AS n_candidates, coalesce(d.n_parties, 0) AS n_parties,
        coalesce(o.donated_indirect, 0)::DOUBLE AS donated_indirect, coalesce(o.n_candidates_indirect, 0) AS n_candidates_indirect
      FROM d FULL JOIN o ON o.key = d.key
    )
    SELECT * FROM a WHERE true${outer}`;
}

export async function listDonors(f: DonorListFilters) {
  const pp: unknown[] = [];
  const pageSql = `${donorBase(f, pp)} ORDER BY ${DONOR_ORDER[f.sort]}, key LIMIT ? OFFSET ?`;
  pp.push(PAGE_SIZE, (f.page - 1) * PAGE_SIZE);
  const cp: unknown[] = [];
  const countSql = `SELECT count(*) AS n, coalesce(sum(donated), 0)::DOUBLE AS donated, coalesce(sum(donated_indirect), 0)::DOUBLE AS donated_indirect FROM (${donorBase(f, cp)})`;
  const [rows, total] = await Promise.all([
    q<Omit<DonorListRow, keyof EntityLite> & { key: string }>(pageSql, pp),
    q1<{ n: number; donated: number; donated_indirect: number }>(countSql, cp),
  ]);
  const ents = await entitiesByKey(rows.map((r) => r.key));
  return {
    rows: rows.map((r) => ({ ...(ents.get(r.key) ?? emptyEntity(r.key)), ...r }) as DonorListRow),
    total: total ?? { n: 0, donated: 0, donated_indirect: 0 },
  };
}

function emptyEntity(key: string): EntityLite {
  return { key, kind: "desconhecido", name: null, doc_display: null, uf: null, city: null, cnae: null, party: null, campaign_candidate_id: null };
}

/* ---------- Supplier list ---------- */

export type SupplierSort = "valor" | "candidatos" | "partidos";

export interface SupplierListFilters {
  year: number;
  kind?: string;
  group?: string;
  uf?: string;
  party?: string;
  q?: string;
  sort: SupplierSort;
  page: number;
}

export interface SupplierListRow extends EntityLite {
  supplied: number;
  n_supplies: number;
  n_candidates: number;
  n_parties: number;
  main_group: string | null;
}

const SUPPLIER_ORDER: Record<SupplierSort, string> = {
  valor: "supplied DESC",
  candidatos: "n_candidates DESC, supplied DESC",
  partidos: "n_parties DESC, supplied DESC",
};

function supplierBase(f: SupplierListFilters, params: unknown[]): string {
  if (f.group) {
    // Exact amounts within one spending group come from the expense lines themselves.
    params.push(f.year, f.group);
    const cc = candCond(f, params);
    const inner = `SELECT e.supplier_key AS key, sum(e.value)::DOUBLE AS supplied, count(DISTINCT e.sq) AS n_supplies,
        count(DISTINCT e.candidate_id) AS n_candidates, count(DISTINCT c.party) AS n_parties
      FROM expense e JOIN candidate c ON c.year = e.year AND c.id = e.candidate_id
      WHERE e.year = ? AND e.category_group = ? AND e.supplier_key IS NOT NULL${cc}
      GROUP BY e.supplier_key`;
    return `SELECT * FROM (${inner}) WHERE true${kindCond(f.kind, params)}${textCond(f.q, params)}`;
  }
  if (f.uf || f.party) {
    params.push(f.year);
    const cc = candCond(f, params);
    const inner = `SELECT r.key, sum(r.value)::DOUBLE AS supplied, sum(r.n)::BIGINT AS n_supplies,
        count(DISTINCT r.candidate_id) AS n_candidates, count(DISTINCT c.party) AS n_parties
      FROM rel_supply r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id
      WHERE r.year = ?${cc} GROUP BY r.key`;
    return `SELECT * FROM (${inner}) WHERE true${kindCond(f.kind, params)}${textCond(f.q, params)}`;
  }
  params.push(f.year);
  return `SELECT key, supplied::DOUBLE AS supplied, n_supplies::BIGINT AS n_supplies, n_candidates_supplied AS n_candidates, n_parties_supplied AS n_parties
    FROM entity_year WHERE year = ? AND supplied > 0${kindCond(f.kind, params)}${textCond(f.q, params)}`;
}

export async function listSuppliers(f: SupplierListFilters) {
  const pp: unknown[] = [];
  const pageSql = `${supplierBase(f, pp)} ORDER BY ${SUPPLIER_ORDER[f.sort]}, key LIMIT ? OFFSET ?`;
  pp.push(PAGE_SIZE, (f.page - 1) * PAGE_SIZE);
  const cp: unknown[] = [];
  const countSql = `SELECT count(*) AS n, coalesce(sum(supplied), 0)::DOUBLE AS supplied FROM (${supplierBase(f, cp)})`;
  const [rows, total] = await Promise.all([
    q<{ key: string; supplied: number; n_supplies: number; n_candidates: number; n_parties: number }>(pageSql, pp),
    q1<{ n: number; supplied: number }>(countSql, cp),
  ]);
  const keys = rows.map((r) => r.key);
  const [ents, groups] = await Promise.all([
    entitiesByKey(keys),
    keys.length
      ? q<{ key: string; main_group: string }>(
          `SELECT supplier_key AS key, arg_max(category_group, v) AS main_group FROM (
             SELECT supplier_key, category_group, sum(value) AS v FROM expense
             WHERE year = ? AND supplier_key IN (${placeholders(keys.length)}) GROUP BY ALL
           ) GROUP BY 1`,
          [f.year, ...keys],
        )
      : Promise.resolve([]),
  ]);
  const g = new Map(groups.map((x) => [x.key, x.main_group]));
  return {
    rows: rows.map((r) => ({ ...(ents.get(r.key) ?? emptyEntity(r.key)), ...r, main_group: g.get(r.key) ?? null }) as SupplierListRow),
    total: total ?? { n: 0, supplied: 0 },
  };
}

/* ---------- Entity profile ---------- */

export interface Entity extends EntityLite {
  campaign_year: number | null;
  person_id: string | null;
  donated: number;
  n_donations: number;
  donated_indirect: number;
  n_donations_indirect: number;
  supplied: number;
  n_supplies: number;
  donor_years: number[] | null;
  supplier_years: number[] | null;
}

export async function getEntity(key: string) {
  return q1<Entity>(
    `SELECT e.*, coalesce(t.donated, 0)::DOUBLE AS donated, coalesce(t.n_donations, 0)::BIGINT AS n_donations,
       coalesce(t.donated_indirect, 0)::DOUBLE AS donated_indirect, coalesce(t.n_donations_indirect, 0)::BIGINT AS n_donations_indirect,
       coalesce(t.supplied, 0)::DOUBLE AS supplied, coalesce(t.n_supplies, 0)::BIGINT AS n_supplies, t.donor_years, t.supplier_years
     FROM entity e LEFT JOIN entity_total t ON t.key = e.key WHERE e.key = ?`,
    [key],
  );
}

export interface EntityYear {
  year: number;
  donated: number;
  n_donations: number;
  n_candidates_donated: number;
  n_parties_donated: number;
  n_ufs_donated: number;
  donated_indirect: number;
  n_donations_indirect: number;
  n_candidates_indirect: number;
  supplied: number;
  n_supplies: number;
  n_candidates_supplied: number;
  n_parties_supplied: number;
  n_ufs_supplied: number;
}

/** Role statistics per election, oldest first. */
export async function getEntityYears(key: string) {
  return q<EntityYear>(
    `SELECT year, donated::DOUBLE AS donated, n_donations::BIGINT AS n_donations, n_candidates_donated, n_parties_donated, n_ufs_donated,
       donated_indirect::DOUBLE AS donated_indirect, n_donations_indirect::BIGINT AS n_donations_indirect, n_candidates_indirect,
       supplied::DOUBLE AS supplied, n_supplies::BIGINT AS n_supplies, n_candidates_supplied, n_parties_supplied, n_ufs_supplied
     FROM entity_year WHERE key = ? ORDER BY year`,
    [key],
  );
}

export interface Candidacy {
  year: number;
  id: string;
  ballot_name: string;
  office: string;
  uf: string;
  party: string;
  result: string | null;
  is_running_mate: boolean;
}

/** Candidacies of the same person (CPF hash), for a neutral cross-link. */
export async function getCandidacies(personId: string | null) {
  if (!personId) return [];
  return q<Candidacy>(
    `SELECT year, id, ballot_name, office, uf, party, result, is_running_mate FROM candidate_summary WHERE person_id = ? ORDER BY year`,
    [personId],
  );
}

/** The candidacy that owns a campaign bank account (entity kind 'campanha'). */
export async function getCampaignOwner(year: number | null, id: string | null) {
  if (!year || !id) return undefined;
  return q1<Candidacy>(`SELECT year, id, ballot_name, office, uf, party, result, is_running_mate FROM candidate_summary WHERE year = ? AND id = ?`, [year, id]);
}

/* ---------- Donor profile ---------- */

export interface DonationRow {
  candidate_id: string;
  ballot_name: string;
  office: string;
  uf: string;
  party: string;
  result: string | null;
  candidate_revenue: number;
  donor_type: string;
  value: number;
  public_value: number;
  financial_value: number;
  n: number;
  main_category: string;
  first_date: string | null;
  last_date: string | null;
}

/** Direct donations of one donor in one election, per candidacy (largest first). */
export async function getDonations(key: string, year: number, limit = 300) {
  return q<DonationRow>(
    `SELECT r.candidate_id, c.ballot_name, c.office, c.uf, c.party, c.result, c.revenue::DOUBLE AS candidate_revenue, r.donor_type,
       r.value::DOUBLE AS value, coalesce(r.public_value, 0)::DOUBLE AS public_value, r.financial_value::DOUBLE AS financial_value, r.n,
       r.main_category, r.first_date, r.last_date
     FROM rel_donation r JOIN candidate_summary c ON c.year = r.year AND c.id = r.candidate_id
     WHERE r.key = ? AND r.year = ?
     ORDER BY r.value DESC, r.candidate_id LIMIT ?`,
    [key, year, limit],
  );
}

export interface DonationTotals {
  value: number;
  public_value: number;
  financial_value: number;
  n: number;
  n_candidates: number;
  own_value: number;
}

export async function getDonationTotals(key: string, year: number) {
  return q1<DonationTotals>(
    `SELECT coalesce(sum(value), 0)::DOUBLE AS value, coalesce(sum(public_value), 0)::DOUBLE AS public_value,
       coalesce(sum(financial_value), 0)::DOUBLE AS financial_value, coalesce(sum(n), 0)::BIGINT AS n, count(*) AS n_candidates,
       coalesce(sum(value) FILTER (WHERE donor_type = 'proprio'), 0)::DOUBLE AS own_value
     FROM rel_donation WHERE key = ? AND year = ?`,
    [key, year],
  );
}

/** Direct donations grouped by the party or the state of the supported candidacies. */
export async function getDonationsBy(key: string, year: number, by: "party" | "uf") {
  return q<{ k: string; value: number; n: number; n_candidates: number }>(
    `SELECT c.${by === "party" ? "party" : "uf"} AS k, sum(r.value)::DOUBLE AS value, sum(r.n)::BIGINT AS n, count(*) AS n_candidates
     FROM rel_donation r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id
     WHERE r.key = ? AND r.year = ? GROUP BY 1 ORDER BY value DESC`,
    [key, year],
  );
}

export interface IndirectRow {
  candidate_id: string;
  ballot_name: string | null;
  office: string | null;
  uf: string | null;
  party: string | null;
  via_key: string;
  via_name: string | null;
  via_type: string;
  value: number;
  n: number;
}

/** "Doador originário": money given to a party or crowdfunding platform and passed on to campaigns. */
export async function getIndirect(key: string, year: number, limit = 200) {
  const [rows, vias] = await Promise.all([
    q<IndirectRow>(
      `SELECT r.candidate_id, c.ballot_name, c.office, c.uf, c.party, r.via_key, coalesce(v.name, r.via_name) AS via_name, r.via_type,
         r.value::DOUBLE AS value, r.n
       FROM rel_origin r LEFT JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id LEFT JOIN entity v ON v.key = r.via_key
       WHERE r.key = ? AND r.year = ? ORDER BY r.value DESC, r.candidate_id LIMIT ?`,
      [key, year, limit],
    ),
    q<{ via_key: string; via_name: string | null; via_type: string; via_kind: string | null; via_party: string | null; value: number; n: number; n_candidates: number }>(
      `SELECT r.via_key, coalesce(any_value(v.name), any_value(r.via_name)) AS via_name, any_value(r.via_type) AS via_type,
         any_value(v.kind) AS via_kind, any_value(v.party) AS via_party,
         sum(r.value)::DOUBLE AS value, sum(r.n)::BIGINT AS n, count(DISTINCT r.candidate_id) AS n_candidates
       FROM rel_origin r LEFT JOIN entity v ON v.key = r.via_key
       WHERE r.key = ? AND r.year = ? GROUP BY r.via_key ORDER BY value DESC`,
      [key, year],
    ),
  ]);
  return { rows, vias };
}

/** Top candidacies per election for the year-by-year table. */
export async function getTopPerYear(key: string, role: "donor" | "supplier", perYear = 3) {
  const table = role === "donor" ? "rel_donation" : "rel_supply";
  return q<{ year: number; candidate_id: string; ballot_name: string; value: number; rk: number }>(
    `SELECT * FROM (
       SELECT r.year, r.candidate_id, c.ballot_name, r.value::DOUBLE AS value,
         row_number() OVER (PARTITION BY r.year ORDER BY r.value DESC, r.candidate_id) AS rk
       FROM ${table} r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id
       WHERE r.key = ?
     ) WHERE rk <= ? ORDER BY year, rk`,
    [key, perYear],
  );
}

/* ---------- Supplier profile ---------- */

export interface SupplyRow {
  candidate_id: string;
  ballot_name: string;
  office: string;
  uf: string;
  party: string;
  result: string | null;
  candidate_expense: number;
  value: number;
  n: number;
  main_group: string;
  main_category: string;
  first_date: string | null;
  last_date: string | null;
}

/** Campaigns that contracted one supplier in one election (largest first). */
export async function getSupplies(key: string, year: number, limit = 300) {
  return q<SupplyRow>(
    `SELECT r.candidate_id, c.ballot_name, c.office, c.uf, c.party, c.result, c.expense::DOUBLE AS candidate_expense,
       r.value::DOUBLE AS value, r.n, r.main_group, r.main_category, r.first_date, r.last_date
     FROM rel_supply r JOIN candidate_summary c ON c.year = r.year AND c.id = r.candidate_id
     WHERE r.key = ? AND r.year = ?
     ORDER BY r.value DESC, r.candidate_id LIMIT ?`,
    [key, year, limit],
  );
}

export async function getSuppliesBy(key: string, year: number, by: "party" | "uf") {
  return q<{ k: string; value: number; n: number; n_candidates: number }>(
    `SELECT c.${by === "party" ? "party" : "uf"} AS k, sum(r.value)::DOUBLE AS value, sum(r.n)::BIGINT AS n, count(*) AS n_candidates
     FROM rel_supply r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id
     WHERE r.key = ? AND r.year = ? GROUP BY 1 ORDER BY value DESC`,
    [key, year],
  );
}

/** Contracted expenses of one supplier by spending group and official TSE category. */
export async function getSupplyCategories(key: string, year: number) {
  return q<{ category_group: string; category: string; value: number; n: number; n_candidates: number }>(
    `SELECT category_group, category, sum(value)::DOUBLE AS value, count(DISTINCT sq) AS n, count(DISTINCT candidate_id) AS n_candidates
     FROM expense WHERE supplier_key = ? AND year = ? GROUP BY ALL ORDER BY value DESC`,
    [key, year],
  );
}

/** Payments recorded against this supplier's contracted expenses, per election (payment ↔ expense by year + sq). */
export async function getSupplierPaid(key: string) {
  return q<{ year: number; paid: number; n_paid: number }>(
    `SELECT p.year, sum(p.value)::DOUBLE AS paid, count(DISTINCT p.sq) AS n_paid
     FROM payment p SEMI JOIN (SELECT DISTINCT year, sq FROM expense WHERE supplier_key = ?) e ON e.year = p.year AND e.sq = p.sq
     GROUP BY 1 ORDER BY 1`,
    [key],
  );
}
