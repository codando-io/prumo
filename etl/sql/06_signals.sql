-- "Padrões para explorar": descriptive, statistical signals computed from the public records.
-- A signal never states or implies wrongdoing. Each row carries the measured value, the
-- threshold used and the peer percentile, so the app can show exactly why it appeared.
--
-- Materiality: concentration/timing signals only apply to campaigns that spent or raised at
-- least R$ 30.000 — tiny campaigns are trivially "concentrated" (one supplier, one donor).
-- Peer rule: where a metric is common, the campaign must also be in the top 10% of campaigns
-- for the same office in the same election.

CREATE OR REPLACE TABLE signal (
  year INT, candidate_id VARCHAR, code VARCHAR, family VARCHAR,
  metric DOUBLE, threshold DOUBLE, peer_pct DOUBLE,
  ref_key VARCHAR, ref_name VARCHAR, ref_value DOUBLE, ref_count BIGINT, strength DOUBLE
);

-- 1. One supplier received a large share of all contracted expenses.
INSERT INTO signal
SELECT s.year, s.id, 'fornecedor_concentrado', 'concentracao',
  s.top_supplier_share, 0.5, p.pct_top_supplier_share,
  s.top_supplier_key, s.top_supplier_name, s.top_supplier_value, s.n_suppliers, s.top_supplier_share
FROM candidate_summary s JOIN candidate_peer p ON p.year = s.year AND p.id = s.id
WHERE s.expense >= 30000 AND s.top_supplier_share >= 0.5 AND p.pct_top_supplier_share >= 0.9;

-- 2. One private donor (person or company, excluding party transfers and own resources)
--    accounts for a large share of all revenue.
INSERT INTO signal
WITH d AS (
  SELECT year, candidate_id, donor_key, any_value(donor_name) AS donor_name, sum(value) AS v, count(DISTINCT sq) AS n
  FROM revenue
  WHERE NOT is_public AND donor_type IN ('pf', 'pj') AND category <> 'proprios'
  GROUP BY year, candidate_id, donor_key
  QUALIFY row_number() OVER (PARTITION BY year, candidate_id ORDER BY v DESC) = 1
)
SELECT s.year, s.id, 'doador_concentrado', 'concentracao',
  d.v / s.revenue, 0.3, NULL, d.donor_key, d.donor_name, d.v, d.n, d.v / s.revenue
FROM candidate_summary s JOIN d ON d.year = s.year AND d.candidate_id = s.id
WHERE s.revenue >= 30000 AND d.v / s.revenue >= 0.3;

-- 3. Own resources make up most of the campaign's revenue.
INSERT INTO signal
SELECT s.year, s.id, 'autofinanciamento', 'concentracao',
  s.self_share, 0.5, p.pct_self_share, NULL, NULL, s.rev_proprios, NULL, s.self_share
FROM candidate_summary s JOIN candidate_peer p ON p.year = s.year AND p.id = s.id
WHERE s.revenue >= 30000 AND s.self_share >= 0.5 AND p.pct_self_share >= 0.9;

-- 4. A large share of expenses dated in the last 7 days before the first round.
INSERT INTO signal
SELECT s.year, s.id, 'gasto_reta_final', 'tempo',
  s.late_share, 0.4, p.pct_late_share, NULL, NULL, s.late_value, NULL, s.late_share
FROM candidate_summary s JOIN candidate_peer p ON p.year = s.year AND p.id = s.id
WHERE s.expense >= 30000 AND s.late_share >= 0.4 AND p.pct_late_share >= 0.9;

-- 5. A single expense is large relative to the campaign's total.
INSERT INTO signal
WITH tx AS (
  SELECT year, candidate_id, sq, sum(value) AS v, any_value(supplier_name) AS supplier_name, any_value(supplier_key) AS supplier_key
  FROM expense GROUP BY year, candidate_id, sq
  QUALIFY row_number() OVER (PARTITION BY year, candidate_id ORDER BY v DESC) = 1
)
SELECT s.year, s.id, 'transacao_grande', 'concentracao',
  s.max_expense_share, 0.4, p.pct_max_expense_share, tx.sq, tx.supplier_name, tx.v, s.n_expense_tx, s.max_expense_share
FROM candidate_summary s
JOIN candidate_peer p ON p.year = s.year AND p.id = s.id
JOIN tx ON tx.year = s.year AND tx.candidate_id = s.id
WHERE s.expense >= 30000 AND s.n_expense_tx >= 5 AND s.max_expense_share >= 0.4 AND p.pct_max_expense_share >= 0.9;

-- 6. Spending concentrated in one official category.
INSERT INTO signal
SELECT s.year, s.id, 'categoria_concentrada', 'concentracao',
  s.top_category_share, 0.8, p.pct_top_category_share, NULL, s.top_category, s.top_category_value, NULL, s.top_category_share
FROM candidate_summary s JOIN candidate_peer p ON p.year = s.year AND p.id = s.id
WHERE s.expense >= 30000 AND s.top_category_share >= 0.8 AND p.pct_top_category_share >= 0.9;

-- 7. A relevant supplier of this campaign (>= 20% of its expenses) also served 20+ other
--    campaigns in the same election.
INSERT INTO signal
WITH reach AS (
  SELECT year, key, count(DISTINCT candidate_id) AS n_campaigns FROM rel_supply GROUP BY ALL
)
SELECT r.year, r.candidate_id, 'fornecedor_compartilhado', 'relacoes',
  reach.n_campaigns - 1, 20, NULL, r.key, e.name, r.value, reach.n_campaigns - 1, (reach.n_campaigns - 1) / 20.0
FROM rel_supply r
JOIN candidate_summary s ON s.year = r.year AND s.id = r.candidate_id
JOIN reach ON reach.year = r.year AND reach.key = r.key
JOIN entity e ON e.key = r.key
WHERE s.expense >= 30000 AND r.value / s.expense >= 0.2 AND reach.n_campaigns - 1 >= 20
  AND e.kind NOT IN ('partido', 'campanha', 'plataforma')
QUALIFY row_number() OVER (PARTITION BY r.year, r.candidate_id ORDER BY reach.n_campaigns DESC) <= 3;

-- 8. A relevant private donor (>= 10% of revenue) also donated to 5+ other candidates.
INSERT INTO signal
WITH reach AS (
  SELECT year, key, count(DISTINCT candidate_id) AS n_candidates FROM rel_donation
  WHERE donor_type IN ('pf', 'pj') GROUP BY ALL
)
SELECT r.year, r.candidate_id, 'doador_multiplo', 'relacoes',
  reach.n_candidates - 1, 5, NULL, r.key, e.name, r.value, reach.n_candidates - 1, (reach.n_candidates - 1) / 5.0
FROM rel_donation r
JOIN candidate_summary s ON s.year = r.year AND s.id = r.candidate_id
JOIN reach ON reach.year = r.year AND reach.key = r.key
JOIN entity e ON e.key = r.key
WHERE r.donor_type IN ('pf', 'pj') AND s.revenue > 0 AND r.value / s.revenue >= 0.1 AND reach.n_candidates - 1 >= 5
QUALIFY row_number() OVER (PARTITION BY r.year, r.candidate_id ORDER BY reach.n_candidates DESC) <= 3;

-- 9. Money moved in both directions: the same CPF/CNPJ made a financial donation to the
--    campaign and received payments from it (in-kind donations are excluded, since the TSE
--    books those as both a donation and an expense of the same person).
INSERT INTO signal
WITH paid AS (
  SELECT e.year, e.candidate_id, e.supplier_key AS key, sum(p.value) AS paid
  FROM expense e JOIN (SELECT year, sq, sum(value) AS value FROM payment GROUP BY ALL) p ON p.year = e.year AND p.sq = e.sq
  WHERE e.supplier_key IS NOT NULL
  GROUP BY ALL
)
SELECT d.year, d.candidate_id, 'doador_fornecedor', 'relacoes',
  pd.paid, 1000, NULL, d.key, e.name, d.financial_value, NULL, least(pd.paid, d.financial_value) / 1000.0
FROM rel_donation d
JOIN paid pd ON pd.year = d.year AND pd.candidate_id = d.candidate_id AND pd.key = d.key
JOIN entity e ON e.key = d.key
WHERE e.kind IN ('pf', 'pj') AND d.donor_type IN ('pf', 'pj', 'proprio')
  AND d.financial_value >= 1000 AND pd.paid >= 1000;

-- 10. Contracted expenses exceed declared revenue (possible campaign debt).
INSERT INTO signal
SELECT s.year, s.id, 'despesa_maior_receita', 'consistencia',
  s.expense - s.revenue, 0, NULL, NULL, NULL, s.expense, NULL, (s.expense - s.revenue) / greatest(s.revenue, 1)
FROM candidate_summary s
WHERE s.has_finance AND s.expense > s.revenue * 1.2 AND s.expense - s.revenue >= 30000;

-- 11. Revenue the TSE classifies as being of unidentified origin.
INSERT INTO signal
SELECT s.year, s.id, 'origem_nao_identificada', 'consistencia',
  s.rev_nao_identificada, 0, NULL, NULL, NULL, s.rev_nao_identificada, NULL, s.rev_nao_identificada / greatest(s.revenue, 1)
FROM candidate_summary s
WHERE s.rev_nao_identificada > 0;

-- 12. Transactions dated outside the election year (often data-entry issues in the filing).
INSERT INTO signal
WITH x AS (
  SELECT year, candidate_id, count(DISTINCT sq) AS n, sum(value) AS v
  FROM expense WHERE date NOT BETWEEN make_date(year, 1, 1) AND make_date(year, 12, 31) GROUP BY ALL
)
SELECT x.year, x.candidate_id, 'data_fora_periodo', 'consistencia', x.n, 0, NULL, NULL, NULL, x.v, x.n, 0.1
FROM x;

CREATE OR REPLACE TABLE signal_count AS
SELECT year, candidate_id, count(*) AS n, list(DISTINCT code) AS codes FROM signal GROUP BY ALL;
