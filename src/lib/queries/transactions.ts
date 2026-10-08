import "server-only";
import { q, q1 } from "../db";
import { CURRENT_YEAR, EXPENSE_GROUPS, FUNDING_GROUPS, OFFICES, REVENUE_CATEGORY, UF_NAMES, YEARS, type Year } from "../labels";
import { normalize } from "./search";

/*
 * Transaction explorer: one row per transaction (TSE `SQ_RECEITA` / `SQ_DESPESA`), with its line
 * items summed. Revenues are grouped by (year, candidate_id, sq) over `revenue`, contracted
 * expenses by (year, candidate_id, sq) over `expense`. Inside one `sq` every line shares the
 * date, counterparty and category (only value and description vary), so every filter except
 * value range and text search is pushed below the GROUP BY; those two apply to the whole
 * transaction (HAVING).
 *
 * Every user value travels as a positional `?` parameter. The only text spliced into SQL is
 * code-owned: column names, the whitelisted ORDER BY clauses and literal labels.
 *
 * Privacy: `donor_doc` / `supplier_doc` (raw CPFs) are never selected. The counterparty document
 * is `entity.doc_display` (masked for people). CPF-shaped numbers are masked in free text too:
 * campaigns often type the payee's CPF into descriptions and document numbers, and sole-trader
 * company names (MEI) usually end with the owner's CPF.
 */

export const PAGE_SIZE = 50;
export const CSV_MAX_ROWS = 200_000;
const ITEMS_SHOWN = 12;

export type TxTipo = "receita" | "despesa";
export type TxOrder = "valor_desc" | "valor_asc" | "data_desc" | "data_asc";

export const TX_ORDERS: { key: TxOrder; label: string }[] = [
  { key: "valor_desc", label: "Maior valor" },
  { key: "valor_asc", label: "Menor valor" },
  { key: "data_desc", label: "Mais recentes" },
  { key: "data_asc", label: "Mais antigas" },
];

export interface TxFilters {
  year: Year;
  tipo?: TxTipo;
  candidato?: string;
  contraparte?: string;
  /** Revenue category key (REVENUE_CATEGORY). */
  categoria?: string;
  /** Funding group (FUNDING_GROUPS) or expense group (EXPENSE_GROUPS) key. */
  grupo?: string;
  /** Official TSE expense category, verbatim. */
  categoria_tse?: string;
  partido?: string;
  uf?: string;
  cargo?: number;
  de?: string;
  ate?: string;
  min?: number;
  max?: number;
  sq?: string;
  q?: string;
  ordem: TxOrder;
  pagina: number;
}

/** Query-string keys, in the order they are written to URLs. */
export const TX_PARAM_KEYS = [
  "ano",
  "tipo",
  "candidato",
  "contraparte",
  "categoria",
  "grupo",
  "categoria_tse",
  "partido",
  "uf",
  "cargo",
  "de",
  "ate",
  "min",
  "max",
  "sq",
  "q",
  "ordem",
  "pagina",
] as const;
export type TxParamKey = (typeof TX_PARAM_KEYS)[number];

const FUNDING_KEYS = new Set<string>(FUNDING_GROUPS.map((g) => g.key));
const OFFICE_CODES = new Set(OFFICES.map((o) => o.code));

export const isFundingGroup = (g: string | undefined) => !!g && FUNDING_KEYS.has(g);
export const isExpenseGroup = (g: string | undefined) => !!g && g in EXPENSE_GROUPS;

/** Revenue categories that make up a funding group ("outras" = candidatos, nao_identificada, outros). */
export function categoriesOfGroup(group: string): string[] {
  return Object.entries(REVENUE_CATEGORY)
    .filter(([, v]) => v.group === group)
    .map(([k]) => k);
}

/* ---------- Parsing ---------- */

type Input = URLSearchParams | Record<string, string | string[] | undefined>;

function reader(input: Input) {
  return (k: string): string | undefined => {
    const raw = input instanceof URLSearchParams ? input.get(k) : input[k];
    const s = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    return s ? s : undefined;
  };
}

function parseDate(s: string | undefined): string | undefined {
  if (!s) return undefined;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let y: number, mo: number, d: number;
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else return undefined;
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12) return undefined;
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  if (d < 1 || d > dim) return undefined;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "1.234,56", "R$ 1234,56", "1234.56" or "1.000" (pt-BR thousands) -> number. */
export function parseMoney(s: string | undefined): number | undefined {
  if (!s) return undefined;
  let t = s.replace(/[R$\s]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n < 1e12 ? n : undefined;
}

/**
 * Reads the explorer's query string into a validated filter set. Invalid values are dropped
 * (the page shows only the filters actually applied). A `grupo`/`categoria`/`categoria_tse`
 * that belongs to the other side of an explicit `tipo` is dropped too, so switching `tipo`
 * never leaves a stale, contradictory filter behind.
 */
export function parseTxFilters(input: Input): TxFilters {
  const get = reader(input);
  const yearRaw = Number(get("ano"));
  const year = ((YEARS as readonly number[]).includes(yearRaw) ? yearRaw : CURRENT_YEAR) as Year;
  const f: TxFilters = { year, ordem: "valor_desc", pagina: 1 };

  const tipo = get("tipo");
  if (tipo === "receita" || tipo === "despesa") f.tipo = tipo;

  const cand = get("candidato");
  if (cand && /^\d{1,15}$/.test(cand)) f.candidato = cand;
  const cp = get("contraparte");
  if (cp && /^[jfx][0-9a-z]{6,24}$/i.test(cp)) f.contraparte = cp.toLowerCase();

  const cat = get("categoria");
  if (cat && cat in REVENUE_CATEGORY) f.categoria = cat;
  const grupo = get("grupo");
  if (grupo && (isFundingGroup(grupo) || isExpenseGroup(grupo))) f.grupo = grupo;
  const tse = get("categoria_tse");
  if (tse && tse.length <= 160) f.categoria_tse = tse;

  if (f.tipo === "receita") {
    delete f.categoria_tse;
    if (isExpenseGroup(f.grupo)) delete f.grupo;
  } else if (f.tipo === "despesa") {
    delete f.categoria;
    if (isFundingGroup(f.grupo)) delete f.grupo;
  }

  const partido = get("partido")?.toUpperCase();
  if (partido && partido.length <= 30 && /^[\p{L}\p{N} .-]+$/u.test(partido)) f.partido = partido;
  const uf = get("uf")?.toUpperCase();
  if (uf && uf in UF_NAMES) f.uf = uf;
  const cargo = Number(get("cargo"));
  if (OFFICE_CODES.has(cargo)) f.cargo = cargo;

  f.de = parseDate(get("de"));
  f.ate = parseDate(get("ate"));
  if (f.de && f.ate && f.de > f.ate) [f.de, f.ate] = [f.ate, f.de];
  f.min = parseMoney(get("min"));
  f.max = parseMoney(get("max"));
  if (f.min != null && f.max != null && f.min > f.max) [f.min, f.max] = [f.max, f.min];

  const sq = get("sq");
  if (sq && /^\d{1,20}$/.test(sq)) f.sq = sq;
  const text = get("q");
  if (text) f.q = text.slice(0, 100);

  const ordem = get("ordem");
  if (ordem && TX_ORDERS.some((o) => o.key === ordem)) f.ordem = ordem as TxOrder;
  const pagina = Math.floor(Number(get("pagina")));
  if (Number.isFinite(pagina) && pagina > 1) f.pagina = Math.min(pagina, 100_000);

  for (const k of Object.keys(f) as (keyof TxFilters)[]) if (f[k] === undefined) delete f[k];
  return f;
}

function moneyParam(n: number) {
  return String(Math.round(n * 100) / 100);
}

/** Canonical query-string entries for a filter set (defaults omitted, `ano` always present). */
export function txParams(f: TxFilters, override: Partial<Record<TxParamKey, string | number | null>> = {}): [TxParamKey, string][] {
  const base: Partial<Record<TxParamKey, string>> = {
    ano: String(f.year),
    tipo: f.tipo,
    candidato: f.candidato,
    contraparte: f.contraparte,
    categoria: f.categoria,
    grupo: f.grupo,
    categoria_tse: f.categoria_tse,
    partido: f.partido,
    uf: f.uf,
    cargo: f.cargo != null ? String(f.cargo) : undefined,
    de: f.de,
    ate: f.ate,
    min: f.min != null ? moneyParam(f.min) : undefined,
    max: f.max != null ? moneyParam(f.max) : undefined,
    sq: f.sq,
    q: f.q,
    ordem: f.ordem !== "valor_desc" ? f.ordem : undefined,
    pagina: f.pagina > 1 ? String(f.pagina) : undefined,
  };
  for (const [k, v] of Object.entries(override) as [TxParamKey, string | number | null][]) base[k] = v == null ? undefined : String(v);
  return TX_PARAM_KEYS.filter((k) => base[k]).map((k) => [k, base[k]!]);
}

/** `/transacoes?…` (or another path) for a filter set, with optional overrides; `null` removes a key. */
export function txHref(f: TxFilters, override: Partial<Record<TxParamKey, string | number | null>> = {}, path = "/transacoes") {
  return `${path}?${new URLSearchParams(txParams(f, override)).toString()}`;
}

/** Which sides a filter set can match. Side-specific filters (category, group) exclude the other side. */
export function txSides(f: TxFilters): { receita: boolean; despesa: boolean } {
  const revOnly = !!f.categoria || isFundingGroup(f.grupo);
  const expOnly = !!f.categoria_tse || isExpenseGroup(f.grupo);
  return {
    receita: (!f.tipo || f.tipo === "receita") && !expOnly,
    despesa: (!f.tipo || f.tipo === "despesa") && !revOnly,
  };
}

/** Normalised search words. Long digit runs are dropped: a CPF typed into the search must not find anyone. */
export function textWords(text: string | undefined): string[] {
  if (!text) return [];
  return normalize(text)
    .split(/\s+/)
    .filter((w) => w.length >= 2 && (w.match(/\d/g)?.length ?? 0) < 6)
    .slice(0, 5);
}

/* ---------- SQL ---------- */

// Whitelisted ORDER BY clauses; `p` is the alias of the grouped rows.
const ORDER_SQL: Record<TxOrder, (p: string) => string> = {
  valor_desc: (p) => `${p}value DESC, ${p}date DESC NULLS LAST, ${p}tipo, ${p}sq`,
  valor_asc: (p) => `${p}value ASC, ${p}date DESC NULLS LAST, ${p}tipo, ${p}sq`,
  data_desc: (p) => `${p}date DESC NULLS LAST, ${p}value DESC, ${p}tipo, ${p}sq`,
  data_asc: (p) => `${p}date ASC NULLS LAST, ${p}value DESC, ${p}tipo, ${p}sq`,
};

// CPF-shaped numbers (11 digits, optionally punctuated) inside free text, masked like
// entity.doc_display (***.456.789-**). Applied twice so adjacent numbers are both caught.
const CPF_RE = "(^|[^0-9])([0-9]{3})[.]?([0-9]{3})[.]?([0-9]{3})-?([0-9]{2})([^0-9]|$)";
const maskCpf = (e: string) => `regexp_replace(regexp_replace(${e}, '${CPF_RE}', '\\1***.\\3.\\4-**\\6', 'g'), '${CPF_RE}', '\\1***.\\3.\\4-**\\6', 'g')`;
// For CSV cells: one line, and no leading = + - @ that a spreadsheet would run as a formula.
const csvText = (e: string) => `(CASE WHEN regexp_matches(${e}, '^[=+@-]') THEN '''' || ${e} ELSE ${e} END)`;
const oneLine = (e: string) => `nullif(trim(regexp_replace(${e}, '\\s+', ' ', 'g')), '')`;

/** The grouped-transaction CTE for one side, with filters pushed down. Appends its params to P in order. */
function sideCte(f: TxFilters, tipo: TxTipo, P: unknown[]) {
  const rev = tipo === "receita";
  const where = ["year = ?"];
  P.push(f.year);
  if (f.candidato) {
    where.push("candidate_id = ?");
    P.push(f.candidato);
  }
  if (f.sq) {
    where.push("sq = ?");
    P.push(f.sq);
  }
  if (f.contraparte) {
    where.push(rev ? "donor_key = ?" : "supplier_key = ?");
    P.push(f.contraparte);
  }
  if (f.de) {
    where.push("date >= ?::DATE");
    P.push(f.de);
  }
  if (f.ate) {
    where.push("date <= ?::DATE");
    P.push(f.ate);
  }
  if (rev) {
    if (f.categoria) {
      where.push("category = ?");
      P.push(f.categoria);
    }
    if (f.grupo) {
      const cats = categoriesOfGroup(f.grupo);
      where.push(`category IN (${cats.map(() => "?").join(", ")})`);
      P.push(...cats);
    }
  } else {
    if (f.grupo) {
      where.push("category_group = ?");
      P.push(f.grupo);
    }
    if (f.categoria_tse) {
      where.push("category = ?");
      P.push(f.categoria_tse);
    }
  }
  if (f.partido || f.uf || f.cargo) {
    const c = ["year = ?"];
    P.push(f.year);
    if (f.partido) {
      c.push("party = ?");
      P.push(f.partido);
    }
    if (f.uf) {
      c.push("uf = ?");
      P.push(f.uf);
    }
    if (f.cargo) {
      c.push("office_code = ?");
      P.push(f.cargo);
    }
    where.push(`candidate_id IN (SELECT id FROM candidate_summary WHERE ${c.join(" AND ")})`);
  }
  const having: string[] = [];
  if (f.min != null) {
    having.push("sum(value) >= ?");
    P.push(f.min);
  }
  if (f.max != null) {
    having.push("sum(value) <= ?");
    P.push(f.max);
  }
  const words = textWords(f.q);
  // A text that leaves nothing searchable (e.g. only a CPF) matches nothing rather than everything.
  if (f.q && !words.length) having.push("false");
  if (words.length) {
    // A transaction matches when one of its lines has every word in the counterparty name or description.
    // (One word: two short LIKEs are cheapest; several words: one normalised haystack per line,
    // which DuckDB computes once. ~0.4–0.5 s over the 2.2M expense lines of 2022.)
    const name = rev ? "donor_name" : "supplier_name";
    if (words.length === 1) {
      having.push(`bool_or(strip_accents(lower(coalesce(${name}, ''))) LIKE ? OR strip_accents(lower(coalesce(description, ''))) LIKE ?)`);
      P.push(`%${words[0]}%`, `%${words[0]}%`);
    } else {
      const hay = `strip_accents(lower(coalesce(${name}, '') || ' ' || coalesce(description, '')))`;
      having.push(`bool_or(${words.map(() => `${hay} LIKE ?`).join(" AND ")})`);
      for (const w of words) P.push(`%${w}%`);
    }
  }
  return `${rev ? "r" : "e"} AS (
    SELECT '${tipo}' AS tipo, year, candidate_id, sq, sum(value) AS value, count(*)::INTEGER AS lines, min(date) AS date,
      any_value(${rev ? "donor_key" : "supplier_key"}) AS ckey, any_value(${rev ? "category" : "category_group"}) AS cgroup
    FROM ${rev ? "revenue" : "expense"}
    WHERE ${where.join(" AND ")}
    GROUP BY year, candidate_id, sq
    ${having.length ? `HAVING ${having.join(" AND ")}` : ""}
  )`;
}

/** CTEs `u` (all matching transactions) — or null when the filters cannot match any side. */
function groupedCtes(f: TxFilters, P: unknown[]) {
  const sides = txSides(f);
  const ctes: string[] = [];
  const parts: string[] = [];
  if (sides.receita) {
    ctes.push(sideCte(f, "receita", P));
    parts.push("SELECT * FROM r");
  }
  if (sides.despesa) {
    ctes.push(sideCte(f, "despesa", P));
    parts.push("SELECT * FROM e");
  }
  if (!parts.length) return null;
  ctes.push(`u AS MATERIALIZED (${parts.join(" UNION ALL ")})`);
  return { ctes, sides };
}

/** Detail CTEs (`d`, `pay`) for the rows in `page`. */
function detailCtes(f: TxFilters, sides: { receita: boolean; despesa: boolean }, mode: "page" | "csv", P: unknown[]) {
  const desc = (ord: string) =>
    mode === "page"
      ? `list({'value': x.value::DOUBLE, 'description': ${maskCpf("x.description")}} ORDER BY x.${ord})[1:${ITEMS_SHOWN}] AS items,
         min_by(${maskCpf("x.description")}, x.${ord}) FILTER (WHERE x.description IS NOT NULL) AS description`
      : `string_agg(DISTINCT ${oneLine(maskCpf("x.description"))}, ' | ') AS description`;
  const parts: string[] = [];
  const ctes: string[] = [];
  if (sides.receita) {
    P.push(f.year);
    ctes.push(`rd AS (
      SELECT 'receita' AS tipo, x.candidate_id, x.sq,
        any_value(x.donor_key) AS key, any_value(x.donor_name) AS line_name, any_value(x.donor_type) AS donor_type,
        any_value(x.category) AS category, NULL::VARCHAR AS category_group,
        any_value(x.fund) AS fund, any_value(x.nature) AS nature, any_value(x.kind) AS form, any_value(x.origin) AS origin,
        any_value(x.estimable_nature) AS estimable,
        any_value(${maskCpf("x.receipt")}) AS receipt, any_value(${maskCpf("x.document")}) AS document,
        NULL::VARCHAR AS doc_type, NULL::VARCHAR AS doc_number,
        any_value(x.filing_type) AS filing_type, any_value(x.filing_date) AS filing_date,
        ${desc("rid")}
      FROM revenue x SEMI JOIN page p ON p.tipo = 'receita' AND p.candidate_id = x.candidate_id AND p.sq = x.sq
      WHERE x.year = ?
      GROUP BY x.candidate_id, x.sq
    )`);
    parts.push("SELECT * FROM rd");
  }
  if (sides.despesa) {
    P.push(f.year);
    ctes.push(`ed AS (
      SELECT 'despesa' AS tipo, x.candidate_id, x.sq,
        any_value(x.supplier_key) AS key, any_value(x.supplier_name) AS line_name, NULL::VARCHAR AS donor_type,
        any_value(x.category) AS category, any_value(x.category_group) AS category_group,
        NULL::VARCHAR AS fund, NULL::VARCHAR AS nature, NULL::VARCHAR AS form, NULL::VARCHAR AS origin,
        NULL::VARCHAR AS estimable,
        NULL::VARCHAR AS receipt, NULL::VARCHAR AS document,
        any_value(x.doc_type) AS doc_type, any_value(${maskCpf("x.doc_number")}) AS doc_number,
        any_value(x.filing_type) AS filing_type, any_value(x.filing_date) AS filing_date,
        ${desc("eid")}
      FROM expense x SEMI JOIN page p ON p.tipo = 'despesa' AND p.candidate_id = x.candidate_id AND p.sq = x.sq
      WHERE x.year = ?
      GROUP BY x.candidate_id, x.sq
    )`);
    parts.push("SELECT * FROM ed");
    // Payments ("despesas pagas") are linked to the contracted expense by (year, sq).
    P.push(f.year);
    ctes.push(`pay AS (
      SELECT 'despesa' AS tipo, x.sq, sum(x.value)::DOUBLE AS paid, string_agg(DISTINCT x.fund, ', ' ORDER BY x.fund) AS paid_funds,
        count(*)::INTEGER AS n_payments, max(x.date) AS last_paid
      FROM payment x SEMI JOIN page p ON p.tipo = 'despesa' AND p.sq = x.sq
      WHERE x.year = ?
      GROUP BY x.sq
    )`);
  } else {
    ctes.push(
      `pay AS (SELECT NULL::VARCHAR AS tipo, NULL::VARCHAR AS sq, NULL::DOUBLE AS paid, NULL::VARCHAR AS paid_funds, NULL::INTEGER AS n_payments, NULL::DATE AS last_paid WHERE false)`,
    );
  }
  ctes.push(`d AS (${parts.join(" UNION ALL ")})`);
  return ctes;
}

/* ---------- Page query ---------- */

export interface TxItem {
  value: number;
  description: string | null;
}

export interface TxRow {
  tipo: TxTipo;
  year: number;
  sq: string;
  candidate_id: string;
  date: string | null;
  value: number;
  lines: number;
  ballot_name: string | null;
  office: string | null;
  office_code: number | null;
  uf: string | null;
  party: string | null;
  key: string | null;
  name: string | null;
  kind: string | null;
  doc_display: string | null;
  donor_type: string | null;
  entity_party: string | null;
  campaign_candidate_id: string | null;
  campaign_year: number | null;
  category: string | null;
  category_group: string | null;
  description: string | null;
  items: TxItem[];
  fund: string | null;
  nature: string | null;
  form: string | null;
  origin: string | null;
  estimable: string | null;
  receipt: string | null;
  document: string | null;
  doc_type: string | null;
  doc_number: string | null;
  filing_type: string | null;
  filing_date: string | null;
  paid: number | null;
  paid_funds: string | null;
  n_payments: number | null;
  last_paid: string | null;
}

export interface TxTotals {
  /** Transactions matching the filters. */
  total: number;
  /** Sum of their values (receitas and despesas added together; see `receitas`/`despesas`). */
  value: number;
  receitas: { n: number; value: number };
  despesas: { n: number; value: number };
}

export interface TxResult extends TxTotals {
  page: number;
  pageSize: number;
  pages: number;
  rows: TxRow[];
}

const TOT_SQL = `SELECT count(*) AS n, coalesce(sum(value), 0)::DOUBLE AS v,
    count(*) FILTER (WHERE tipo = 'receita') AS n_r, coalesce(sum(value) FILTER (WHERE tipo = 'receita'), 0)::DOUBLE AS v_r,
    count(*) FILTER (WHERE tipo = 'despesa') AS n_d, coalesce(sum(value) FILTER (WHERE tipo = 'despesa'), 0)::DOUBLE AS v_d
  FROM u`;
type TotRow = { n: number; v: number; n_r: number; v_r: number; n_d: number; v_d: number };
const EMPTY_TOTALS: TxTotals = { total: 0, value: 0, receitas: { n: 0, value: 0 }, despesas: { n: 0, value: 0 } };
const toTotals = (t: TotRow): TxTotals => ({ total: t.n, value: t.v, receitas: { n: t.n_r, value: t.v_r }, despesas: { n: t.n_d, value: t.v_d } });

/** Count and value of the filtered set, overall and per side. */
export async function getTransactionTotals(f: TxFilters): Promise<TxTotals> {
  const P: unknown[] = [];
  const g = groupedCtes(f, P);
  if (!g) return EMPTY_TOTALS;
  const t = await q1<TotRow>(`WITH ${g.ctes.join(",\n")} ${TOT_SQL}`, P);
  return t ? toTotals(t) : EMPTY_TOTALS;
}

/** One page of transactions plus the count and value of the whole filtered set. */
export async function getTransactions(f: TxFilters, pageSize = PAGE_SIZE): Promise<TxResult> {
  const P: unknown[] = [];
  const g = groupedCtes(f, P);
  const page = f.pagina;
  if (!g) return { ...EMPTY_TOTALS, page, pageSize, pages: 0, rows: [] };
  const ctes = [...g.ctes];
  ctes.push(`tot AS (${TOT_SQL})`);
  ctes.push(`page AS MATERIALIZED (SELECT * FROM u ORDER BY ${ORDER_SQL[f.ordem]("")} LIMIT ? OFFSET ?)`);
  P.push(pageSize, (page - 1) * pageSize);
  ctes.push(...detailCtes(f, g.sides, "page", P));
  const rows = await q<TxRow & TotRow>(
    `WITH ${ctes.join(",\n")}
     SELECT p.tipo, p.year, p.sq, p.candidate_id, p.date, p.value::DOUBLE AS value, p.lines,
       c.ballot_name, c.office, c.office_code, c.uf, c.party,
       d.key, ${maskCpf("coalesce(ent.name, d.line_name)")} AS name, ent.kind, ent.doc_display, d.donor_type,
       ent.party AS entity_party, ent.campaign_candidate_id, ent.campaign_year,
       d.category, d.category_group, d.description, d.items,
       d.fund, d.nature, d.form, d.origin, d.estimable, d.receipt, d.document, d.doc_type, d.doc_number,
       d.filing_type, d.filing_date,
       pay.paid, pay.paid_funds, pay.n_payments, pay.last_paid,
       tot.*
     FROM page p
     CROSS JOIN tot
     LEFT JOIN d ON d.tipo = p.tipo AND d.candidate_id = p.candidate_id AND d.sq = p.sq
     LEFT JOIN candidate_summary c ON c.year = p.year AND c.id = p.candidate_id
     LEFT JOIN entity ent ON ent.key = d.key
     LEFT JOIN pay ON pay.tipo = p.tipo AND pay.sq = p.sq
     ORDER BY ${ORDER_SQL[f.ordem]("p.")}`,
    P,
  );
  // A page past the end returns no rows (and so no totals): count separately.
  const t = rows.length ? toTotals(rows[0]) : page > 1 ? await getTransactionTotals(f) : EMPTY_TOTALS;
  return {
    ...t,
    page,
    pageSize,
    pages: Math.ceil(t.total / pageSize),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    rows: rows.map(({ n, v, n_r, v_r, n_d, v_d, ...r }) => ({ ...r, items: r.items ?? [] })),
  };
}

/* ---------- CSV export ---------- */

/** Column order of the CSV export (documented on /transacoes). */
export const CSV_COLUMNS = [
  "ano",
  "tipo",
  "sq",
  "data",
  "valor",
  "candidato_id",
  "candidato",
  "cargo",
  "uf",
  "partido",
  "contraparte",
  "contraparte_doc",
  "categoria",
  "grupo",
  "descricao",
  "documento",
  "prestacao",
  "prestacao_data",
  "fundo",
  "valor_pago",
  "natureza",
  "itens",
] as const;

function labelValues(P: unknown[]) {
  const rows: [string, string][] = [];
  for (const [k, v] of Object.entries(REVENUE_CATEGORY)) {
    rows.push([`rc:${k}`, v.label], [`rg:${k}`, FUNDING_GROUPS.find((g) => g.key === v.group)?.label ?? v.group]);
  }
  for (const [k, v] of Object.entries(EXPENSE_GROUPS)) rows.push([`eg:${k}`, v.label]);
  for (const r of rows) P.push(...r);
  return `lbl AS (SELECT * FROM (VALUES ${rows.map(() => "(?, ?)").join(", ")}) AS t(k, label))`;
}

/**
 * Writes every matching transaction (up to CSV_MAX_ROWS, in the chosen order) to `filePath` as
 * CSV: `;`-separated, header row, decimal comma, ISO dates. Uses DuckDB's COPY so large exports
 * never pass through JS memory. `filePath` is generated by the caller, never user input.
 */
export async function exportTransactionsCsv(f: TxFilters, filePath: string): Promise<number> {
  if (!/^[\w./:\\-]+$/.test(filePath)) throw new Error("unsafe export path");
  const P: unknown[] = [];
  const g = groupedCtes(f, P);
  const ctes = g
    ? [...g.ctes]
    : [
        `u AS (SELECT NULL::VARCHAR AS tipo, NULL::INTEGER AS year, NULL::VARCHAR AS candidate_id, NULL::VARCHAR AS sq, NULL::DECIMAL(38,2) AS value, NULL::INTEGER AS lines, NULL::DATE AS date WHERE false)`,
      ];
  ctes.push(`page AS MATERIALIZED (SELECT * FROM u ORDER BY ${ORDER_SQL[f.ordem]("")} LIMIT ?)`);
  P.push(CSV_MAX_ROWS);
  ctes.push(...detailCtes(f, g?.sides ?? { receita: true, despesa: false }, "csv", P));
  ctes.push(labelValues(P));
  const money = (e: string) => `replace(CAST(${e} AS DECIMAL(18,2))::VARCHAR, '.', ',')`;
  const sql = `COPY (
    WITH ${ctes.join(",\n")}
    SELECT p.year AS ano, p.tipo, p.sq, p.date AS data, ${money("p.value")} AS valor,
      p.candidate_id AS candidato_id, c.ballot_name AS candidato, c.office AS cargo, c.uf, c.party AS partido,
      ${csvText(oneLine(maskCpf("coalesce(ent.name, d.line_name)")))} AS contraparte, ent.doc_display AS contraparte_doc,
      CASE p.tipo WHEN 'receita' THEN coalesce(l1.label, d.category) ELSE d.category END AS categoria,
      coalesce(l2.label, d.category_group) AS grupo,
      ${csvText("d.description")} AS descricao,
      ${csvText(
        oneLine(`CASE p.tipo WHEN 'receita' THEN concat_ws(' / ', 'Recibo ' || d.receipt, 'Documento ' || d.document)
        ELSE concat_ws(' ', d.doc_type, d.doc_number) END`),
      )} AS documento,
      d.filing_type AS prestacao, d.filing_date AS prestacao_data,
      CASE p.tipo WHEN 'receita' THEN d.fund ELSE pay.paid_funds END AS fundo,
      ${money("pay.paid")} AS valor_pago,
      CASE d.nature WHEN 'FINANCEIRO' THEN 'Financeiro' WHEN 'ESTIMAVEL' THEN 'Estimável' END AS natureza,
      p.lines AS itens
    FROM page p
    LEFT JOIN d ON d.tipo = p.tipo AND d.candidate_id = p.candidate_id AND d.sq = p.sq
    LEFT JOIN candidate_summary c ON c.year = p.year AND c.id = p.candidate_id
    LEFT JOIN entity ent ON ent.key = d.key
    LEFT JOIN pay ON pay.tipo = p.tipo AND pay.sq = p.sq
    LEFT JOIN lbl l1 ON l1.k = 'rc:' || d.category
    LEFT JOIN lbl l2 ON l2.k = CASE p.tipo WHEN 'receita' THEN 'rg:' || d.category ELSE 'eg:' || d.category_group END
    ORDER BY ${ORDER_SQL[f.ordem]("p.")}
  ) TO '${filePath}' (FORMAT csv, HEADER true, DELIMITER ';', QUOTE '"')`;
  const r = await q<{ Count: number }>(sql, P);
  return Number(r[0]?.Count ?? 0);
}

/* ---------- Highlights of the filtered set ---------- */

export interface TxHighlights {
  n_campaigns: number;
  /** The single largest transaction. */
  largest: { tipo: TxTipo; year: number; candidate_id: string; sq: string; value: number; date: string | null; ballot_name: string | null; name: string | null; key: string | null; description: string | null } | null;
  /** Largest counterparty on each side (donor for receitas, supplier for despesas). */
  top: { tipo: TxTipo; key: string; name: string | null; kind: string | null; party: string | null; campaign_candidate_id: string | null; value: number; n: number }[];
  /** Value by revenue category / expense group, per side. */
  cats: { tipo: TxTipo; cat: string | null; value: number }[];
}

/**
 * What stands out in the filtered set — the largest transaction, who received or gave the most,
 * the main category — computed over the same CTEs as the table, so it always matches it.
 */
export async function getTransactionHighlights(f: TxFilters): Promise<TxHighlights | null> {
  const P: unknown[] = [];
  const g = groupedCtes(f, P);
  if (!g) return null;
  const row = await q1<{
    n_campaigns: number;
    big: { tipo: TxTipo; year: number; candidate_id: string; sq: string; value: number; date: string | null; ckey: string | null } | null;
    tops: { tipo: TxTipo; key: string; value: number; n: number }[] | null;
    cats: { tipo: TxTipo; cat: string | null; value: number }[] | null;
  }>(
    `WITH ${g.ctes.join(",\n")}
     SELECT
       (SELECT count(DISTINCT candidate_id) FROM u)::INTEGER AS n_campaigns,
       (SELECT arg_max({'tipo': tipo, 'year': year, 'candidate_id': candidate_id, 'sq': sq, 'value': value::DOUBLE, 'date': date::VARCHAR, 'ckey': ckey}, value) FROM u) AS big,
       (SELECT list({'tipo': tipo, 'key': ckey, 'value': v, 'n': n}) FROM (
          SELECT tipo, ckey, sum(value)::DOUBLE AS v, count(*)::INTEGER AS n FROM u WHERE ckey IS NOT NULL GROUP BY tipo, ckey
          QUALIFY row_number() OVER (PARTITION BY tipo ORDER BY v DESC) = 1)) AS tops,
       (SELECT list({'tipo': tipo, 'cat': cgroup, 'value': v}) FROM (SELECT tipo, cgroup, sum(value)::DOUBLE AS v FROM u GROUP BY tipo, cgroup)) AS cats`,
    P,
  );
  if (!row || !row.big) return null;
  const big = row.big;
  const keys = [...new Set([...(row.tops ?? []).map((t) => t.key), big.ckey].filter((k): k is string => !!k))];
  const [ents, ctx] = await Promise.all([
    keys.length
      ? q<{ key: string; name: string | null; kind: string | null; party: string | null; campaign_candidate_id: string | null }>(
          `SELECT key, ${maskCpf("name")} AS name, kind, party, campaign_candidate_id FROM entity WHERE key IN (${keys.map(() => "?").join(", ")})`,
          keys,
        )
      : Promise.resolve([]),
    q1<{ ballot_name: string | null; description: string | null; line_name: string | null }>(
      `SELECT (SELECT ballot_name FROM candidate_summary WHERE year = ? AND id = ?) AS ballot_name,
         ${maskCpf("min_by(description, value) FILTER (WHERE description IS NOT NULL)")} AS description,
         ${maskCpf(`any_value(${big.tipo === "receita" ? "donor_name" : "supplier_name"})`)} AS line_name
       FROM ${big.tipo === "receita" ? "revenue" : "expense"} WHERE year = ? AND candidate_id = ? AND sq = ?`,
      [big.year, big.candidate_id, big.year, big.candidate_id, big.sq],
    ),
  ]);
  const ent = new Map(ents.map((e) => [e.key, e]));
  return {
    n_campaigns: row.n_campaigns,
    largest: {
      tipo: big.tipo,
      year: big.year,
      candidate_id: big.candidate_id,
      sq: big.sq,
      value: big.value,
      date: big.date,
      ballot_name: ctx?.ballot_name ?? null,
      name: (big.ckey && ent.get(big.ckey)?.name) || ctx?.line_name || null,
      key: big.ckey,
      description: ctx?.description ?? null,
    },
    top: (row.tops ?? []).map((t) => ({ ...t, name: ent.get(t.key)?.name ?? null, kind: ent.get(t.key)?.kind ?? null, party: ent.get(t.key)?.party ?? null, campaign_candidate_id: ent.get(t.key)?.campaign_candidate_id ?? null })),
    cats: row.cats ?? [],
  };
}

/* ---------- Context for the explorer page ---------- */

export interface TxCandidate {
  year: number;
  id: string;
  ballot_name: string;
  office: string;
  uf: string;
  party: string;
  is_running_mate: boolean;
}

export interface TxCounterparty {
  key: string;
  name: string | null;
  kind: string | null;
  doc_display: string | null;
  party: string | null;
  campaign_candidate_id: string | null;
  campaign_year: number | null;
}

export async function getTxCandidate(year: number, id: string) {
  return q1<TxCandidate>(`SELECT year, id, ballot_name, office, uf, party, is_running_mate FROM candidate_summary WHERE year = ? AND id = ?`, [year, id]);
}

export async function getTxCounterparty(key: string) {
  return q1<TxCounterparty>(
    `SELECT key, ${maskCpf("name")} AS name, kind, doc_display, party, campaign_candidate_id, campaign_year FROM entity WHERE key = ?`,
    [key],
  );
}

/** When the TSE generated the finance files for a year (max over filings). */
export async function getFinanceGeneratedAt(year: number) {
  return (await q1<{ at: string | null }>(`SELECT max(generated_at) AS at FROM filing WHERE year = ?`, [year]))?.at ?? null;
}

/** Options for the filter selects. */
export async function getTxOptions(year: number) {
  const [parties, categories] = await Promise.all([
    q<{ party: string }>(`SELECT DISTINCT party FROM candidate_summary WHERE year = ? AND party IS NOT NULL ORDER BY party`, [year]),
    q<{ category: string; category_group: string }>(
      `SELECT category, any_value(category_group) AS category_group FROM exp_cube WHERE year = ? AND category IS NOT NULL GROUP BY category ORDER BY category`,
      [year],
    ),
  ]);
  return { parties: parties.map((p) => p.party), categories };
}
