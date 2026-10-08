-- Counterparties (donors / suppliers) and aggregated relationship edges.

-- Direct donations: counterparty -> candidate.
CREATE OR REPLACE TABLE rel_donation AS
SELECT year, donor_key AS key, candidate_id,
  any_value(donor_type) AS donor_type,
  sum(value) AS value,
  sum(value) FILTER (WHERE is_public) AS public_value,
  coalesce(sum(value) FILTER (WHERE nature = 'FINANCEIRO'), 0) AS financial_value,
  count(DISTINCT sq) AS n,
  min(date) AS first_date,
  max(date) AS last_date,
  arg_max(category, value) AS main_category
FROM revenue
WHERE donor_key IS NOT NULL
GROUP BY ALL
ORDER BY year, key;

-- Indirect donations: individual -> (party / crowdfunding platform) -> candidate.
CREATE OR REPLACE TABLE rel_origin AS
SELECT year, key, candidate_id, via_key, any_value(via_name) AS via_name, any_value(via_type) AS via_type,
  sum(value) AS value, count(*) AS n, min(date) AS first_date, max(date) AS last_date
FROM revenue_origin
WHERE key IS NOT NULL AND candidate_id IS NOT NULL
GROUP BY ALL
ORDER BY year, key;

-- Supplies: candidate -> supplier.
CREATE OR REPLACE TABLE rel_supply AS
SELECT year, supplier_key AS key, candidate_id,
  sum(value) AS value,
  count(DISTINCT sq) AS n,
  min(date) AS first_date,
  max(date) AS last_date,
  arg_max(category_group, value) AS main_group,
  arg_max(category, value) AS main_category
FROM expense
WHERE supplier_key IS NOT NULL
GROUP BY ALL
ORDER BY year, key;

CREATE OR REPLACE TABLE entity AS
WITH obs AS (
  SELECT donor_key AS key, donor_doc AS doc, donor_name AS name, donor_type AS t, donor_uf AS uf, donor_city AS city,
         donor_cnae AS cnae, donor_party AS party, year, value
  FROM revenue WHERE donor_key IS NOT NULL
  UNION ALL
  SELECT key, doc, name, CASE WHEN length(doc) = 14 THEN 'pj' ELSE 'pf' END, NULL, NULL, cnae, NULL, year, value
  FROM revenue_origin WHERE key IS NOT NULL
  UNION ALL
  SELECT supplier_key, supplier_doc, supplier_name, supplier_type, supplier_uf, supplier_city, supplier_cnae, supplier_party, year, value
  FROM expense WHERE supplier_key IS NOT NULL
),
campaign AS (
  SELECT 'j' || cnpj AS key, arg_max(candidate_id, year) AS candidate_id, max(year) AS year
  FROM account WHERE cnpj IS NOT NULL GROUP BY 1
),
agg AS (
  SELECT key,
    any_value(doc) AS doc,
    -- the most recent, most frequent spelling of the name
    arg_max(name, year * 1e12 + coalesce(value, 0)) AS name,
    mode(t) AS t,
    -- classify by where most of the money is, so one odd record can't relabel a company
    coalesce(sum(value) FILTER (WHERE t = 'partido'), 0) AS party_value,
    coalesce(sum(value) FILTER (WHERE t = 'plataforma'), 0) AS platform_value,
    coalesce(sum(value), 0) AS all_value,
    arg_max(uf, year) FILTER (WHERE uf IS NOT NULL) AS uf,
    arg_max(city, year) FILTER (WHERE city IS NOT NULL) AS city,
    arg_max(cnae, year) FILTER (WHERE cnae IS NOT NULL) AS cnae,
    arg_max(party, year) FILTER (WHERE party IS NOT NULL) AS party,
    CASE WHEN starts_with(key, 'f') THEN 'p' || substr(key, 2) END AS person_probe
  FROM obs GROUP BY key
),
persons AS (SELECT DISTINCT person_id FROM candidate WHERE person_id IS NOT NULL)
SELECT
  a.key,
  CASE
    WHEN starts_with(a.key, 'f') THEN 'pf'
    WHEN c.candidate_id IS NOT NULL THEN 'campanha'
    -- campaign accounts are registered as "ELEIÇÃO <ano> <NOME> <CARGO>" (e.g. vice candidates' own accounts)
    WHEN starts_with(a.key, 'j') AND norm(a.name) SIMILAR TO 'eleicao (19|20)[0-9]{2} .*' THEN 'campanha'
    WHEN a.party_value > a.all_value / 2 THEN 'partido'
    WHEN a.platform_value > a.all_value / 2 THEN 'plataforma'
    WHEN starts_with(a.key, 'j') THEN 'pj'
    ELSE 'desconhecido'
  END AS kind,
  doc_display(a.doc) AS doc_display,
  a.name,
  a.uf, a.city, a.cnae, a.party,
  c.candidate_id AS campaign_candidate_id,
  c.year AS campaign_year,
  -- natural persons who were also candidates (same CPF hash)
  p.person_id
FROM agg a
LEFT JOIN campaign c ON c.key = a.key
LEFT JOIN persons p ON p.person_id = a.person_probe;

-- Per-entity, per-year role statistics.
CREATE OR REPLACE TABLE entity_year AS
WITH d AS (
  SELECT r.year, r.key, sum(r.value) AS donated, sum(r.n) AS n_donations,
    count(DISTINCT r.candidate_id) AS n_candidates_donated,
    count(DISTINCT c.party) AS n_parties_donated,
    count(DISTINCT c.uf) AS n_ufs_donated
  FROM rel_donation r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id
  GROUP BY ALL
),
o AS (
  SELECT r.year, r.key, sum(r.value) AS donated_indirect, sum(r.n) AS n_donations_indirect,
    count(DISTINCT r.candidate_id) AS n_candidates_indirect
  FROM rel_origin r GROUP BY ALL
),
s AS (
  SELECT r.year, r.key, sum(r.value) AS supplied, sum(r.n) AS n_supplies,
    count(DISTINCT r.candidate_id) AS n_candidates_supplied,
    count(DISTINCT c.party) AS n_parties_supplied,
    count(DISTINCT c.uf) AS n_ufs_supplied
  FROM rel_supply r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id
  GROUP BY ALL
),
keys AS (SELECT year, key FROM d UNION SELECT year, key FROM o UNION SELECT year, key FROM s)
SELECT k.year, k.key,
  coalesce(d.donated, 0) AS donated, coalesce(d.n_donations, 0) AS n_donations,
  coalesce(d.n_candidates_donated, 0) AS n_candidates_donated, coalesce(d.n_parties_donated, 0) AS n_parties_donated,
  coalesce(d.n_ufs_donated, 0) AS n_ufs_donated,
  coalesce(o.donated_indirect, 0) AS donated_indirect, coalesce(o.n_donations_indirect, 0) AS n_donations_indirect,
  coalesce(o.n_candidates_indirect, 0) AS n_candidates_indirect,
  coalesce(s.supplied, 0) AS supplied, coalesce(s.n_supplies, 0) AS n_supplies,
  coalesce(s.n_candidates_supplied, 0) AS n_candidates_supplied, coalesce(s.n_parties_supplied, 0) AS n_parties_supplied,
  coalesce(s.n_ufs_supplied, 0) AS n_ufs_supplied
FROM keys k
LEFT JOIN d USING (year, key)
LEFT JOIN o USING (year, key)
LEFT JOIN s USING (year, key);

-- Lifetime totals per entity (all covered elections).
CREATE OR REPLACE TABLE entity_total AS
SELECT key,
  sum(donated) AS donated, sum(n_donations) AS n_donations,
  sum(donated_indirect) AS donated_indirect, sum(n_donations_indirect) AS n_donations_indirect,
  sum(supplied) AS supplied, sum(n_supplies) AS n_supplies,
  list(DISTINCT year ORDER BY year) FILTER (WHERE donated > 0 OR donated_indirect > 0) AS donor_years,
  list(DISTINCT year ORDER BY year) FILTER (WHERE supplied > 0) AS supplier_years
FROM entity_year GROUP BY key;
