-- Global search index: candidates (one row per person, latest candidacy), parties,
-- donors, suppliers, states and municipalities.

-- Each row carries what the search palette shows: the entity type, a short context line and two
-- quantities (money + counts) so results explain why they matter before the user opens them.
CREATE OR REPLACE TABLE search_index AS
WITH cur AS (SELECT max(year) AS y FROM election),
uf_names(uf, uf_name) AS (VALUES
  ('AC','Acre'),('AL','Alagoas'),('AM','Amazonas'),('AP','Amapá'),('BA','Bahia'),('CE','Ceará'),('DF','Distrito Federal'),
  ('ES','Espírito Santo'),('GO','Goiás'),('MA','Maranhão'),('MG','Minas Gerais'),('MS','Mato Grosso do Sul'),('MT','Mato Grosso'),
  ('PA','Pará'),('PB','Paraíba'),('PE','Pernambuco'),('PI','Piauí'),('PR','Paraná'),('RJ','Rio de Janeiro'),('RN','Rio Grande do Norte'),
  ('RO','Rondônia'),('RR','Roraima'),('RS','Rio Grande do Sul'),('SC','Santa Catarina'),('SE','Sergipe'),('SP','São Paulo'),('TO','Tocantins')),
cand AS (
  SELECT 'candidato' AS type, s.id AS key, s.year,
    coalesce(s.ballot_name, s.name) AS label,
    s.office AS kind,
    s.office || CASE WHEN s.uf <> 'BR' THEN ' (' || s.uf || ')' ELSE '' END || ', ' || coalesce(s.party, '') || ', ' || s.year AS context,
    s.result AS extra,
    s.expense::DOUBLE AS value, s.votes::BIGINT AS n1, NULL::BIGINT AS n2,
    norm(coalesce(s.ballot_name, '') || ' ' || coalesce(s.name, '') || ' ' || coalesce(s.social_name, '')) AS haystack,
    -- prominent campaigns rank first for ambiguous names
    ln(1 + s.votes) + ln(1 + s.expense) / 2 + CASE WHEN s.year = (SELECT y FROM cur) THEN 3 ELSE 0 END AS weight
  FROM candidate_summary s
  QUALIFY row_number() OVER (PARTITION BY coalesce(s.person_id, s.id) ORDER BY s.year DESC, s.is_running_mate) = 1
),
party AS (
  SELECT 'partido' AS type, c.party AS key, max(c.year) AS year, c.party AS label, 'Partido' AS kind,
    arg_max(c.party_name, c.year) AS context, NULL AS extra,
    (SELECT sum(revenue) FROM candidate_summary x WHERE x.party = c.party AND x.year = max(c.year) AND NOT x.is_running_mate)::DOUBLE AS value,
    count(*) FILTER (WHERE c.year = (SELECT y FROM cur) AND NOT c.is_running_mate) AS n1, NULL::BIGINT AS n2,
    norm(c.party || ' ' || arg_max(c.party_name, c.year)) AS haystack, 30.0 AS weight
  FROM candidate c WHERE c.party IS NOT NULL GROUP BY c.party
),
reach AS (
  SELECT key,
    count(DISTINCT CASE WHEN role = 's' THEN year || candidate_id END) AS supplied_campaigns,
    count(DISTINCT CASE WHEN role = 'd' THEN year || candidate_id END) AS donated_campaigns,
    max(year) FILTER (WHERE role = 's') AS last_supplied, max(year) FILTER (WHERE role = 'd') AS last_donated
  FROM (
    SELECT key, year, candidate_id, 's' AS role FROM rel_supply
    UNION ALL SELECT key, year, candidate_id, 'd' FROM rel_donation
    UNION ALL SELECT key, year, candidate_id, 'd' FROM rel_origin
  ) GROUP BY key
),
ent AS (
  SELECT
    CASE WHEN t.supplied >= t.donated + t.donated_indirect THEN 'fornecedor' ELSE 'doador' END AS type,
    e.key,
    CASE WHEN t.supplied >= t.donated + t.donated_indirect THEN r.last_supplied ELSE r.last_donated END AS year,
    e.name AS label,
    CASE e.kind WHEN 'pf' THEN 'Pessoa física' WHEN 'pj' THEN 'Empresa' WHEN 'partido' THEN 'Órgão partidário'
      WHEN 'plataforma' THEN 'Plataforma de financiamento coletivo' ELSE 'Não identificado' END AS kind,
    e.doc_display AS context, e.party AS extra,
    (CASE WHEN t.supplied >= t.donated + t.donated_indirect THEN t.supplied ELSE t.donated + t.donated_indirect END)::DOUBLE AS value,
    CASE WHEN t.supplied >= t.donated + t.donated_indirect THEN r.supplied_campaigns ELSE r.donated_campaigns END AS n1,
    CASE WHEN t.supplied >= t.donated + t.donated_indirect THEN r.donated_campaigns ELSE r.supplied_campaigns END AS n2,
    norm(e.name) || ' ' || coalesce(regexp_replace(e.doc_display, '[^0-9]', '', 'g'), '') AS haystack,
    ln(1 + t.supplied + t.donated + t.donated_indirect) AS weight
  FROM entity e JOIN entity_total t USING (key) LEFT JOIN reach r USING (key)
  WHERE e.name IS NOT NULL AND e.kind NOT IN ('campanha')
),
uf AS (
  SELECT 'estado' AS type, n.uf AS key, (SELECT y FROM cur) AS year, n.uf_name AS label, 'Estado' AS kind, n.uf AS context, NULL AS extra,
    (SELECT sum(expense) FROM candidate_summary x WHERE x.uf = n.uf AND x.year = (SELECT y FROM cur))::DOUBLE AS value,
    (SELECT count(*) FROM candidate_summary x WHERE x.uf = n.uf AND x.year = (SELECT y FROM cur) AND NOT x.is_running_mate) AS n1,
    NULL::BIGINT AS n2, norm(n.uf || ' ' || n.uf_name) AS haystack, 40.0 AS weight
  FROM uf_names n
),
mun AS (
  SELECT 'municipio' AS type, v.uf || '-' || v.mun_code AS key, NULL::INT AS year, any_value(v.mun_name) AS label, 'Município' AS kind,
    any_value(n.uf_name) AS context, v.uf AS extra, NULL::DOUBLE AS value, NULL::BIGINT AS n1, NULL::BIGINT AS n2,
    norm(any_value(v.mun_name)) AS haystack, 20.0 AS weight
  FROM vote_mun v LEFT JOIN uf_names n ON n.uf = v.uf WHERE v.mun_code IS NOT NULL AND v.uf <> 'ZZ' GROUP BY v.uf, v.mun_code
),
elec AS (
  SELECT 'eleicao' AS type, e.year::VARCHAR AS key, e.year, e.label, 'Eleição' AS kind,
    '1º turno em ' || strftime(e.round1, '%d/%m/%Y') AS context, NULL AS extra,
    (SELECT sum(revenue) FROM candidate_summary x WHERE x.year = e.year)::DOUBLE AS value,
    (SELECT count(*) FROM candidate_summary x WHERE x.year = e.year AND NOT x.is_running_mate) AS n1, NULL::BIGINT AS n2,
    norm('eleicao eleicoes geral gerais ' || e.year) AS haystack, 50.0 AS weight
  FROM election e
)
SELECT * FROM cand
UNION ALL SELECT * FROM party
UNION ALL SELECT * FROM ent
UNION ALL SELECT * FROM uf
UNION ALL SELECT * FROM mun
UNION ALL SELECT * FROM elec;

-- Indexes for the most common point lookups from the app.
CREATE INDEX IF NOT EXISTS idx_revenue_cand ON revenue (candidate_id);
CREATE INDEX IF NOT EXISTS idx_revenue_donor ON revenue (donor_key);
CREATE INDEX IF NOT EXISTS idx_expense_cand ON expense (candidate_id);
CREATE INDEX IF NOT EXISTS idx_expense_supplier ON expense (supplier_key);
CREATE INDEX IF NOT EXISTS idx_payment_sq ON payment (sq);
CREATE INDEX IF NOT EXISTS idx_origin_key ON revenue_origin (key);
CREATE INDEX IF NOT EXISTS idx_entity_key ON entity (key);
CREATE INDEX IF NOT EXISTS idx_cs_id ON candidate_summary (id);
CREATE INDEX IF NOT EXISTS idx_cs_person ON candidate_summary (person_id);
CREATE INDEX IF NOT EXISTS idx_reld_key ON rel_donation (key);
CREATE INDEX IF NOT EXISTS idx_rels_key ON rel_supply (key);
CREATE INDEX IF NOT EXISTS idx_relo_key ON rel_origin (key);
CREATE INDEX IF NOT EXISTS idx_vote_cand ON vote_mun (candidate_id);
