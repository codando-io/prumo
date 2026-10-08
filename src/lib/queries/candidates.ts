import "server-only";
import { q, q1 } from "../db";
import { normalize } from "./search";

export interface CandidateListFilters {
  year: number;
  uf?: string;
  office?: number;
  party?: string;
  result?: string; // eleito | segundo | nao_eleito | suplente
  q?: string;
  signals?: boolean;
  order?: string;
  page?: number;
}

export const CANDIDATE_ORDERS: Record<string, { label: string; sql: string }> = {
  votos: { label: "Mais votados", sql: "votes DESC, ballot_name" },
  nome: { label: "Nome (A–Z)", sql: "ballot_name" },
  receita: { label: "Maior receita", sql: "revenue DESC, ballot_name" },
  despesa: { label: "Maior despesa", sql: "expense DESC, ballot_name" },
  gasto_voto: { label: "Maior gasto por voto", sql: "expense_per_vote DESC NULLS LAST, ballot_name" },
  publico: { label: "Maior parcela pública", sql: "public_share DESC NULLS LAST, ballot_name" },
  privado: { label: "Maior receita privada", sql: "revenue_private DESC, ballot_name" },
};

export const PAGE_SIZE = 50;

export async function listCandidates(f: CandidateListFilters) {
  const where = ["s.year = ?", "NOT s.is_running_mate"];
  const params: unknown[] = [f.year];
  if (f.uf) {
    where.push("s.uf = ?");
    params.push(f.uf);
  }
  if (f.office) {
    where.push("s.office_code = ?");
    params.push(f.office);
  }
  if (f.party) {
    where.push("s.party = ?");
    params.push(f.party);
  }
  if (f.result === "eleito") where.push("s.elected");
  else if (f.result === "segundo") where.push("s.result = '2º TURNO'");
  else if (f.result === "nao_eleito") where.push("s.result = 'NÃO ELEITO'");
  else if (f.result === "suplente") where.push("s.result = 'SUPLENTE'");
  if (f.signals) where.push("sc.n > 0");
  if (f.q) {
    for (const w of normalize(f.q).split(/\s+/).filter(Boolean).slice(0, 5)) {
      where.push("norm(coalesce(s.ballot_name, '') || ' ' || coalesce(s.name, '')) LIKE ?");
      params.push(`%${w}%`);
    }
  }
  const order = CANDIDATE_ORDERS[f.order ?? ""]?.sql ?? CANDIDATE_ORDERS.votos.sql;
  const page = Math.max(1, f.page ?? 1);
  const base = `FROM candidate_summary s LEFT JOIN signal_count sc ON sc.year = s.year AND sc.candidate_id = s.id WHERE ${where.join(" AND ")}`;
  const [rows, count] = await Promise.all([
    q<{
      id: string;
      year: number;
      ballot_name: string;
      name: string;
      office: string;
      uf: string;
      party: string;
      result: string | null;
      registration_status: string | null;
      votes: number;
      revenue: number;
      revenue_private: number;
      expense: number;
      public_share: number | null;
      expense_per_vote: number | null;
      has_finance: boolean;
      signals: number;
    }>(
      `SELECT s.id, s.year, s.ballot_name, s.name, s.office, s.uf, s.party, s.result, s.registration_status, s.votes, s.revenue, s.revenue_private, s.expense,
         s.public_share, s.expense_per_vote, s.has_finance, coalesce(sc.n, 0) AS signals
       ${base} ORDER BY ${order} LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
      params,
    ),
    q1<{ n: number; n_finance: number; revenue: number; revenue_public: number; expense: number }>(
      `SELECT count(*) AS n, count(*) FILTER (WHERE s.has_finance) AS n_finance, sum(s.revenue) AS revenue, sum(s.revenue_public) AS revenue_public,
         sum(s.expense) AS expense ${base}`,
      params,
    ),
  ]);
  return {
    rows,
    total: count?.n ?? 0,
    withFinance: count?.n_finance ?? 0,
    revenue: count?.revenue ?? 0,
    revenuePublic: count?.revenue_public ?? 0,
    expense: count?.expense ?? 0,
    page,
  };
}

/** Candidacies for the comparison page, keyed "year-id". */
export async function getMany(keys: { year: number; id: string }[]) {
  if (!keys.length) return [];
  const cond = keys.map(() => "(year = ? AND id = ?)").join(" OR ");
  return q<Record<string, unknown> & { year: number; id: string }>(
    `SELECT * FROM candidate_summary WHERE ${cond}`,
    keys.flatMap((k) => [k.year, k.id]),
  );
}
