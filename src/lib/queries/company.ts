import "server-only";
import { q, q1 } from "../db";

/*
 * Company profile: one CNPJ, enriched with official open data (Receita Federal CNPJ register,
 * CGU sanction lists, PNCP contracts) next to its electoral activity in TSE records.
 * Tables are described in docs/ENRICHMENT.md; every query tolerates a database built before the
 * enrichment existed (missing tables → empty results).
 */

/** Whether an (enrichment) table exists in the current database; memoised by q(). */
export async function hasTable(name: string) {
  const r = await q<{ n: number }>(`SELECT count(*)::INT AS n FROM information_schema.tables WHERE table_name = ?`, [name]);
  return (r[0]?.n ?? 0) > 0;
}

export const onlyDigits = (s: string) => s.replace(/\D/g, "");
export const formatCnpj = (c: string) => (c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c);

export interface CompanyRegistry {
  cnpj: string;
  cnpj_basico: string;
  matriz: boolean;
  razao_social: string | null;
  nome_fantasia: string | null;
  situacao: string | null;
  data_situacao: string | null;
  motivo_situacao: string | null;
  data_inicio: string | null;
  cnae_principal: string | null;
  cnae_principal_desc: string | null;
  cnaes_secundarias: string[] | null;
  uf: string | null;
  municipio: string | null;
  ibge_code: number | null;
  situacao_especial: string | null;
  data_situacao_especial: string | null;
  natureza: string | null;
  natureza_code: string | null;
  capital_social: number | null;
  porte: string | null;
  ente_federativo: string | null;
  in_tse: boolean;
  source_month: string | null;
  opcao_simples: boolean | null;
  data_opcao_simples: string | null;
  data_exclusao_simples: string | null;
  opcao_mei: boolean | null;
  data_opcao_mei: string | null;
  data_exclusao_mei: string | null;
  /** True when this exact CNPJ was not loaded and the head office is shown instead. */
  via_matriz: boolean;
}

/** Registry data for a CNPJ (this establishment, or the head office when only the company is known). */
export async function getCompanyRegistry(cnpj: string): Promise<CompanyRegistry | null> {
  if (!(await hasTable("rf_establishment"))) return null;
  const sql = (where: string) => `
    SELECT e.cnpj, e.cnpj_basico, e.matriz, c.razao_social, e.nome_fantasia, e.situacao, e.data_situacao::VARCHAR AS data_situacao,
      e.motivo_situacao, e.data_inicio::VARCHAR AS data_inicio, e.cnae_principal, e.cnae_principal_desc, e.cnaes_secundarias,
      e.uf, coalesce(im.name, e.municipio) AS municipio, e.ibge_code, e.situacao_especial, e.data_situacao_especial::VARCHAR AS data_situacao_especial,
      c.natureza, c.natureza_code, c.capital_social, c.porte, c.ente_federativo, c.in_tse, c.source_month,
      s.opcao_simples, s.data_opcao_simples::VARCHAR AS data_opcao_simples, s.data_exclusao_simples::VARCHAR AS data_exclusao_simples,
      s.opcao_mei, s.data_opcao_mei::VARCHAR AS data_opcao_mei, s.data_exclusao_mei::VARCHAR AS data_exclusao_mei
    FROM rf_establishment e JOIN rf_company c ON c.cnpj_basico = e.cnpj_basico
    LEFT JOIN rf_simples s ON s.cnpj_basico = e.cnpj_basico
    LEFT JOIN ibge_mun im ON im.ibge_code = e.ibge_code
    WHERE ${where} LIMIT 1`;
  const own = await q1<Omit<CompanyRegistry, "via_matriz">>(sql("e.cnpj = ?"), [cnpj]);
  if (own) return { ...own, via_matriz: false };
  const head = await q1<Omit<CompanyRegistry, "via_matriz">>(sql("e.cnpj_basico = ? AND e.matriz"), [cnpj.slice(0, 8)]);
  return head ? { ...head, via_matriz: true } : null;
}

export async function getCnaeLabels(codes: string[]) {
  if (!codes.length || !(await hasTable("rf_cnae"))) return [];
  return q<{ code: string; description: string }>(`SELECT code, description FROM rf_cnae WHERE code IN (${codes.map(() => "?").join(",")}) ORDER BY code`, codes);
}

/* ---------- Electoral activity (TSE) ---------- */

export interface ElectoralYear {
  year: number;
  supplied: number;
  n_candidates_supplied: number;
  n_parties_supplied: number;
  donated: number;
  n_candidates_donated: number;
  donated_indirect: number;
}

export async function getElectoralYears(key: string) {
  return q<ElectoralYear>(
    `SELECT year, supplied::DOUBLE AS supplied, n_candidates_supplied, n_parties_supplied,
       donated::DOUBLE AS donated, n_candidates_donated, donated_indirect::DOUBLE AS donated_indirect
     FROM entity_year WHERE key = ? ORDER BY year`,
    [key],
  );
}

export async function getEntityBasics(key: string) {
  return q1<{ key: string; name: string | null; kind: string | null; party: string | null; campaign_candidate_id: string | null; uf: string | null; city: string | null }>(
    `SELECT key, name, kind, party, campaign_candidate_id, uf, city FROM entity WHERE key = ?`,
    [key],
  );
}

/** Campaigns this CNPJ was paid by, across elections. */
export async function getClientCampaigns(key: string, limit = 12) {
  return q<{ year: number; candidate_id: string; ballot_name: string; office: string; uf: string; party: string; value: number; n: number }>(
    `SELECT r.year, r.candidate_id, c.ballot_name, c.office, c.uf, c.party, r.value::DOUBLE AS value, r.n
     FROM rel_supply r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id
     WHERE r.key = ? ORDER BY r.value DESC LIMIT ?`,
    [key, limit],
  );
}

export async function getClientTotals(key: string) {
  return q1<{ campaigns: number; candidates: number; parties: number; elections: number; value: number; n: number; first_year: number | null; last_year: number | null }>(
    `SELECT count(DISTINCT (r.year, r.candidate_id))::INT AS campaigns, count(DISTINCT coalesce(c.person_id, r.candidate_id))::INT AS candidates,
       count(DISTINCT c.party)::INT AS parties, count(DISTINCT r.year)::INT AS elections, coalesce(sum(r.value), 0)::DOUBLE AS value,
       coalesce(sum(r.n), 0)::INT AS n, min(r.year) AS first_year, max(r.year) AS last_year
     FROM rel_supply r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id WHERE r.key = ?`,
    [key],
  );
}

export async function getClientParties(key: string, limit = 8) {
  return q<{ party: string; value: number; campaigns: number }>(
    `SELECT c.party, sum(r.value)::DOUBLE AS value, count(DISTINCT (r.year, r.candidate_id))::INT AS campaigns
     FROM rel_supply r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id
     WHERE r.key = ? GROUP BY c.party ORDER BY value DESC LIMIT ?`,
    [key, limit],
  );
}

export async function getSupplyCategories(key: string) {
  return q<{ category_group: string; value: number; n: number }>(
    `SELECT category_group, sum(value)::DOUBLE AS value, count(DISTINCT sq)::INT AS n FROM expense WHERE supplier_key = ? GROUP BY 1 ORDER BY value DESC`,
    [key],
  );
}

/** Donations made by this CNPJ (party bodies, campaign accounts, companies before 2015). */
export async function getDonationTotals(key: string) {
  return q1<{ campaigns: number; value: number; elections: number }>(
    `SELECT count(DISTINCT (year, candidate_id))::INT AS campaigns, coalesce(sum(value), 0)::DOUBLE AS value, count(DISTINCT year)::INT AS elections
     FROM rel_donation WHERE key = ?`,
    [key],
  );
}

/** Other establishments of the same company that also appear in TSE records. */
export async function getSiblingEstablishments(cnpj: string) {
  return q<{ key: string; name: string | null; supplied: number; donated: number }>(
    `SELECT e.key, any_value(n.name) AS name, sum(e.supplied)::DOUBLE AS supplied, sum(e.donated)::DOUBLE AS donated
     FROM entity_year e LEFT JOIN entity n ON n.key = e.key
     WHERE starts_with(e.key, ?) AND e.key <> ? GROUP BY e.key ORDER BY sum(e.supplied) + sum(e.donated) DESC LIMIT 20`,
    [`j${cnpj.slice(0, 8)}`, `j${cnpj}`],
  );
}

/* ---------- Partners (QSA) ---------- */

export interface Partner {
  partner_key: string;
  partner_type: string;
  name: string;
  doc_masked: string | null;
  partner_cnpj_basico: string | null;
  qualificacao: string | null;
  data_entrada: string | null;
  faixa_etaria: string | null;
  pais: string | null;
}

export async function getPartners(basico: string) {
  if (!(await hasTable("rf_partner"))) return [];
  return q<Partner>(
    `SELECT partner_key, partner_type, name, doc_masked, partner_cnpj_basico, qualificacao, data_entrada::VARCHAR AS data_entrada, faixa_etaria, pais
     FROM rf_partner WHERE cnpj_basico = ? ORDER BY data_entrada NULLS LAST, name`,
    [basico],
  );
}

export interface PossibleMatch {
  partner_key: string;
  tse_kind: "candidato" | "doador" | "fornecedor";
  tse_key: string;
  basis: string;
  label: string | null;
  href: string | null;
  context: string | null;
}

/** POSSIBLE matches between partners and TSE persons; never presented as confirmed. */
export async function getPossibleMatches(partnerKeys: string[]): Promise<PossibleMatch[]> {
  if (!partnerKeys.length || !(await hasTable("person_match"))) return [];
  const ph = partnerKeys.map(() => "?").join(",");
  const rows = await q<{ partner_key: string; tse_kind: PossibleMatch["tse_kind"]; tse_key: string; basis: string }>(
    `SELECT DISTINCT partner_key, tse_kind, tse_key, basis FROM person_match WHERE partner_key IN (${ph})`,
    partnerKeys,
  );
  const out: PossibleMatch[] = [];
  for (const r of rows) {
    if (r.tse_kind === "candidato") {
      const c = await q1<{ year: number; id: string; ballot_name: string; office: string; uf: string; party: string }>(
        `SELECT year, id, ballot_name, office, uf, party FROM candidate_summary WHERE person_id = ? ORDER BY year DESC LIMIT 1`,
        [r.tse_key],
      );
      out.push({ ...r, label: c?.ballot_name ?? null, href: c ? `/candidatos/${c.year}/${c.id}` : null, context: c ? `candidatura a ${c.office.toLowerCase()}${c.uf !== "BR" ? ` (${c.uf})` : ""}, ${c.party}, ${c.year}` : null });
    } else {
      const e = await q1<{ name: string | null }>(`SELECT name FROM entity WHERE key = ?`, [r.tse_key]);
      out.push({
        ...r,
        label: e?.name ?? null,
        href: r.tse_kind === "doador" ? `/doadores/${r.tse_key}` : `/fornecedores/${r.tse_key}`,
        context: r.tse_kind === "doador" ? "doador de campanhas" : "fornecedor de campanhas",
      });
    }
  }
  return out;
}

/** Other companies where the same partners appear (Receita register). */
export async function getPartnerCompanies(partnerKeys: string[], excludeBasico: string) {
  if (!partnerKeys.length || !(await hasTable("rf_partner"))) return [];
  const ph = partnerKeys.map(() => "?").join(",");
  return q<{
    partner_key: string;
    cnpj_basico: string;
    razao_social: string | null;
    qualificacao: string | null;
    data_entrada: string | null;
    in_tse: boolean | null;
    matriz_cnpj: string | null;
    situacao: string | null;
    uf: string | null;
    municipio: string | null;
    cnae: string | null;
  }>(
    `SELECT p.partner_key, p.cnpj_basico, c.razao_social, p.qualificacao, p.data_entrada::VARCHAR AS data_entrada, c.in_tse,
       m.cnpj AS matriz_cnpj, m.situacao, m.uf, coalesce(im.name, m.municipio) AS municipio, m.cnae_principal_desc AS cnae
     FROM rf_partner p LEFT JOIN rf_company c ON c.cnpj_basico = p.cnpj_basico
     LEFT JOIN rf_establishment m ON m.cnpj_basico = p.cnpj_basico AND m.matriz
     LEFT JOIN ibge_mun im ON im.ibge_code = m.ibge_code
     WHERE p.partner_key IN (${ph}) AND p.cnpj_basico <> ?
     ORDER BY c.in_tse DESC NULLS LAST, c.razao_social LIMIT 200`,
    [...partnerKeys, excludeBasico],
  );
}

/** Companies where this company is itself a partner. */
export async function getHoldings(basico: string) {
  if (!(await hasTable("rf_partner"))) return [];
  return q<{ cnpj_basico: string; razao_social: string | null; qualificacao: string | null; data_entrada: string | null; matriz_cnpj: string | null; situacao: string | null }>(
    `SELECT p.cnpj_basico, c.razao_social, p.qualificacao, p.data_entrada::VARCHAR AS data_entrada, m.cnpj AS matriz_cnpj, m.situacao
     FROM rf_partner p LEFT JOIN rf_company c ON c.cnpj_basico = p.cnpj_basico
     LEFT JOIN rf_establishment m ON m.cnpj_basico = p.cnpj_basico AND m.matriz
     WHERE p.partner_key = ? ORDER BY c.razao_social LIMIT 100`,
    [`j${basico}`],
  );
}

/* ---------- Sanctions ---------- */

export interface SanctionRow {
  source: string;
  record_id: string;
  cnpj: string;
  name: string | null;
  category: string | null;
  start_date: string | null;
  end_date: string | null;
  publication_date: string | null;
  process_number: string | null;
  authority: string | null;
  authority_uf: string | null;
  authority_sphere: string | null;
  legal_basis: string | null;
  scope: string | null;
  fine_value: number | null;
  details: string | null;
  status: string | null;
  file_date: string | null;
  source_url: string | null;
}

export async function getSanctions(basico: string) {
  if (!(await hasTable("sanction"))) return null;
  return q<SanctionRow>(
    `SELECT source, record_id, cnpj, name, category, start_date::VARCHAR AS start_date, end_date::VARCHAR AS end_date,
       publication_date::VARCHAR AS publication_date, process_number, authority, authority_uf, authority_sphere, legal_basis, scope,
       fine_value, details, status, file_date::VARCHAR AS file_date, source_url
     FROM sanction WHERE cnpj_basico = ? ORDER BY start_date DESC NULLS LAST`,
    [basico],
  );
}

/* ---------- Public contracts (PNCP) ---------- */

export interface ContractRow {
  pncp_id: string;
  supplier_cnpj: string;
  orgao_cnpj: string | null;
  orgao_nome: string | null;
  esfera: string | null;
  poder: string | null;
  unidade_nome: string | null;
  uf: string | null;
  municipio: string | null;
  numero_contrato: string | null;
  ano: number | null;
  objeto: string | null;
  tipo_contrato: string | null;
  categoria_processo: string | null;
  valor_global: number | null;
  valor_inicial: number | null;
  data_assinatura: string | null;
  data_vigencia_inicio: string | null;
  data_vigencia_fim: string | null;
  data_publicacao: string | null;
  url: string | null;
}

export async function getContracts(basico: string, limit = 200) {
  if (!(await hasTable("public_contract"))) return null;
  const [rows, totals, orgaos, years] = await Promise.all([
    q<ContractRow>(
      `SELECT pncp_id, supplier_cnpj, orgao_cnpj, orgao_nome, esfera, poder, unidade_nome, uf, municipio, numero_contrato, ano, objeto,
         tipo_contrato, categoria_processo, valor_global, valor_inicial, data_assinatura::VARCHAR AS data_assinatura,
         data_vigencia_inicio::VARCHAR AS data_vigencia_inicio, data_vigencia_fim::VARCHAR AS data_vigencia_fim,
         data_publicacao::VARCHAR AS data_publicacao, url
       FROM public_contract WHERE supplier_cnpj_basico = ? ORDER BY data_assinatura DESC NULLS LAST, valor_global DESC LIMIT ?`,
      [basico, limit],
    ),
    q1<{ n: number; value: number; orgaos: number; first: string | null; last: string | null }>(
      `SELECT count(*)::INT AS n, coalesce(sum(valor_global), 0)::DOUBLE AS value, count(DISTINCT orgao_cnpj)::INT AS orgaos,
         min(data_assinatura)::VARCHAR AS first, max(data_assinatura)::VARCHAR AS last
       FROM public_contract WHERE supplier_cnpj_basico = ?`,
      [basico],
    ),
    q<{ orgao_cnpj: string; orgao_nome: string; esfera: string | null; uf: string | null; n: number; value: number }>(
      `SELECT orgao_cnpj, any_value(orgao_nome) AS orgao_nome, any_value(esfera) AS esfera, any_value(uf) AS uf, count(*)::INT AS n,
         coalesce(sum(valor_global), 0)::DOUBLE AS value
       FROM public_contract WHERE supplier_cnpj_basico = ? GROUP BY orgao_cnpj ORDER BY value DESC LIMIT 12`,
      [basico],
    ),
    q<{ year: number; n: number; value: number; first: string | null }>(
      `SELECT year(data_assinatura) AS year, count(*)::INT AS n, coalesce(sum(valor_global), 0)::DOUBLE AS value, min(data_assinatura)::VARCHAR AS first
       FROM public_contract WHERE supplier_cnpj_basico = ? AND data_assinatura IS NOT NULL GROUP BY 1 ORDER BY 1`,
      [basico],
    ),
  ]);
  return { rows, totals, orgaos, years };
}

/* ---------- Provenance ---------- */

export interface EnrichSource {
  dataset: string;
  label: string | null;
  url: string | null;
  published: string | null;
  coverage_from: string | null;
  coverage_to: string | null;
  retrieved_at: string | null;
  rows: number | null;
}

export async function getEnrichSources(): Promise<Record<string, EnrichSource>> {
  if (!(await hasTable("enrich_source"))) return {};
  const rows = await q<EnrichSource>(
    `SELECT dataset, label, url, published, coverage_from::VARCHAR AS coverage_from, coverage_to::VARCHAR AS coverage_to,
       retrieved_at::VARCHAR AS retrieved_at, rows FROM enrich_source`,
  );
  return Object.fromEntries(rows.map((r) => [r.dataset, r]));
}

/** Whether a 14-digit CNPJ is known at all (TSE entity or Receita register). */
export async function companyExists(cnpj: string) {
  // Placeholders like 00000000000000 appear in declared records but identify no one.
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const tse = await q1<{ n: number }>(`SELECT count(*)::INT AS n FROM entity WHERE key = ?`, [`j${cnpj}`]);
  if (tse?.n) return true;
  if (!(await hasTable("rf_establishment"))) return false;
  const rf = await q1<{ n: number }>(`SELECT count(*)::INT AS n FROM rf_establishment WHERE cnpj = ? OR (cnpj_basico = ? AND matriz)`, [cnpj, cnpj.slice(0, 8)]);
  return Boolean(rf?.n);
}

/** First-round date of each election, for placing electoral events on a timeline. */
export async function getElectionRounds(): Promise<Record<number, string>> {
  const rows = await q<{ year: number; round1: string }>(`SELECT year, round1::VARCHAR AS round1 FROM election`);
  return Object.fromEntries(rows.map((r) => [r.year, r.round1]));
}
