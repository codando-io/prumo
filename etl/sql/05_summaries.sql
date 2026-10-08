-- Per-candidate financial summary, peer statistics and aggregated cubes.
-- All metrics here are calculations over the official records (never official figures
-- themselves); the app labels them as such.

CREATE OR REPLACE TABLE cand_rev AS
WITH tx AS (
  -- one row per revenue transaction (itemised lines summed)
  SELECT year, candidate_id, sq, sum(value) AS v, any_value(category) AS category, any_value(donor_key) AS donor_key
  FROM revenue GROUP BY ALL
),
pf AS (
  SELECT year, candidate_id,
    count(*) AS n_pf_donations,
    avg(v) AS pf_avg,
    median(v) AS pf_median,
    max(v) AS pf_max
  FROM tx WHERE category = 'pf' GROUP BY ALL
),
by_donor AS (
  SELECT r.year, r.candidate_id, r.donor_key, any_value(r.donor_name) AS donor_name, any_value(r.donor_type) AS donor_type,
    sum(r.value) AS v, bool_and(r.is_public) AS all_public
  FROM revenue r WHERE r.donor_key IS NOT NULL GROUP BY ALL
),
top_any AS (
  SELECT year, candidate_id, arg_max(donor_key, v) AS top_donor_key, arg_max(donor_name, v) AS top_donor_name,
    arg_max(donor_type, v) AS top_donor_type, max(v) AS top_donor_value
  FROM by_donor GROUP BY ALL
),
private_donors AS (
  -- private donors excluding the candidate's own resources
  SELECT r.year, r.candidate_id, r.donor_key, any_value(r.donor_name) AS donor_name, any_value(r.donor_type) AS donor_type, sum(r.value) AS v
  FROM revenue r WHERE NOT r.is_public AND r.category <> 'proprios' AND r.donor_key IS NOT NULL GROUP BY ALL
),
top_private AS (
  SELECT year, candidate_id,
    arg_max(donor_key, v) AS top_private_key, arg_max(donor_name, v) AS top_private_name,
    arg_max(donor_type, v) AS top_private_type, max(v) AS top_private_value,
    sum(v) AS private_ext_total,
    count(*) AS n_private_donors
  FROM private_donors GROUP BY ALL
),
top3_private AS (
  SELECT year, candidate_id, sum(v) AS top3_private_value FROM (
    SELECT *, row_number() OVER (PARTITION BY year, candidate_id ORDER BY v DESC) AS rk FROM private_donors
  ) WHERE rk <= 3 GROUP BY ALL
),
base AS (
  SELECT year, candidate_id,
    sum(value) AS revenue,
    coalesce(sum(value) FILTER (WHERE is_public), 0) AS revenue_public,
    coalesce(sum(value) FILTER (WHERE NOT is_public), 0) AS revenue_private,
    coalesce(sum(value) FILTER (WHERE category = 'fefc'), 0) AS rev_fefc,
    coalesce(sum(value) FILTER (WHERE category = 'fp'), 0) AS rev_fp,
    coalesce(sum(value) FILTER (WHERE category = 'partido'), 0) AS rev_partido,
    coalesce(sum(value) FILTER (WHERE category = 'pf'), 0) AS rev_pf,
    coalesce(sum(value) FILTER (WHERE category = 'proprios'), 0) AS rev_proprios,
    coalesce(sum(value) FILTER (WHERE category = 'coletivo'), 0) AS rev_coletivo,
    coalesce(sum(value) FILTER (WHERE category = 'candidatos'), 0) AS rev_candidatos,
    coalesce(sum(value) FILTER (WHERE category = 'nao_identificada'), 0) AS rev_nao_identificada,
    coalesce(sum(value) FILTER (WHERE category = 'outros'), 0) AS rev_outros,
    coalesce(sum(value) FILTER (WHERE nature LIKE 'ESTIM%'), 0) AS revenue_estimable,
    count(DISTINCT sq) AS n_revenue_tx,
    count(DISTINCT donor_key) AS n_donors,
    count(DISTINCT donor_key) FILTER (WHERE donor_type = 'pf') AS n_pf_donors,
    min(date) AS revenue_first_date,
    max(date) AS revenue_last_date
  FROM revenue GROUP BY ALL
)
SELECT b.*, pf.n_pf_donations, pf.pf_avg, pf.pf_median, pf.pf_max,
  t.top_donor_key, t.top_donor_name, t.top_donor_type, t.top_donor_value,
  tp.top_private_key, tp.top_private_name, tp.top_private_type, tp.top_private_value,
  coalesce(tp.private_ext_total, 0) AS private_ext_total, coalesce(tp.n_private_donors, 0) AS n_private_donors,
  t3.top3_private_value
FROM base b
LEFT JOIN pf USING (year, candidate_id)
LEFT JOIN top_any t USING (year, candidate_id)
LEFT JOIN top_private tp USING (year, candidate_id)
LEFT JOIN top3_private t3 USING (year, candidate_id);

CREATE OR REPLACE TABLE cand_exp AS
WITH tx AS (
  SELECT e.year, e.candidate_id, e.sq, sum(e.value) AS v, min(e.date) AS d, any_value(e.supplier_key) AS supplier_key
  FROM expense e GROUP BY ALL
),
tx_stats AS (
  SELECT t.year, t.candidate_id,
    count(*) AS n_expense_tx, avg(v) AS exp_avg, median(v) AS exp_median, max(v) AS exp_max,
    arg_max(sq, v) AS exp_max_sq,
    coalesce(sum(v) FILTER (WHERE d BETWEEN el.round1 - INTERVAL 6 DAY AND el.round1), 0) AS late_value
  FROM tx t JOIN election el ON el.year = t.year
  GROUP BY ALL
),
by_supplier AS (
  SELECT year, candidate_id, supplier_key, any_value(supplier_name) AS supplier_name, any_value(supplier_type) AS supplier_type, sum(value) AS v
  FROM expense WHERE supplier_key IS NOT NULL GROUP BY ALL
),
sup AS (
  SELECT year, candidate_id, count(*) AS n_suppliers,
    arg_max(supplier_key, v) AS top_supplier_key, arg_max(supplier_name, v) AS top_supplier_name, max(v) AS top_supplier_value
  FROM by_supplier GROUP BY ALL
),
sup3 AS (
  SELECT year, candidate_id, sum(v) AS top3_supplier_value FROM (
    SELECT *, row_number() OVER (PARTITION BY year, candidate_id ORDER BY v DESC) AS rk FROM by_supplier
  ) WHERE rk <= 3 GROUP BY ALL
),
by_cat AS (
  SELECT year, candidate_id, category, sum(value) AS v FROM expense GROUP BY ALL
),
cat AS (
  SELECT year, candidate_id, arg_max(category, v) AS top_category, max(v) AS top_category_value FROM by_cat GROUP BY ALL
),
grp AS (
  SELECT year, candidate_id,
    coalesce(sum(value) FILTER (WHERE category_group = 'impressos'), 0) AS exp_impressos,
    coalesce(sum(value) FILTER (WHERE category_group = 'digital'), 0) AS exp_digital,
    coalesce(sum(value) FILTER (WHERE category_group = 'audiovisual'), 0) AS exp_audiovisual,
    coalesce(sum(value) FILTER (WHERE category_group = 'pessoal'), 0) AS exp_pessoal,
    coalesce(sum(value) FILTER (WHERE category_group = 'servicos'), 0) AS exp_servicos,
    coalesce(sum(value) FILTER (WHERE category_group = 'transporte'), 0) AS exp_transporte,
    coalesce(sum(value) FILTER (WHERE category_group = 'estrutura'), 0) AS exp_estrutura,
    coalesce(sum(value) FILTER (WHERE category_group = 'eventos'), 0) AS exp_eventos,
    coalesce(sum(value) FILTER (WHERE category_group = 'transferencias'), 0) AS exp_transferencias,
    coalesce(sum(value) FILTER (WHERE category_group = 'outros'), 0) AS exp_outros,
    sum(value) AS expense,
    min(date) AS expense_first_date, max(date) AS expense_last_date
  FROM expense GROUP BY ALL
),
paid AS (
  SELECT year, candidate_id,
    sum(value) AS paid,
    coalesce(sum(value) FILTER (WHERE fund = 'FEFC'), 0) AS paid_fefc,
    coalesce(sum(value) FILTER (WHERE fund = 'FP'), 0) AS paid_fp,
    coalesce(sum(value) FILTER (WHERE fund = 'OUTROS'), 0) AS paid_outros
  FROM payment WHERE candidate_id IS NOT NULL GROUP BY ALL
)
SELECT g.*, s.n_expense_tx, s.exp_avg, s.exp_median, s.exp_max, s.exp_max_sq, s.late_value,
  sup.n_suppliers, sup.top_supplier_key, sup.top_supplier_name, sup.top_supplier_value, sup3.top3_supplier_value,
  cat.top_category, cat.top_category_value,
  coalesce(p.paid, 0) AS paid, coalesce(p.paid_fefc, 0) AS paid_fefc, coalesce(p.paid_fp, 0) AS paid_fp, coalesce(p.paid_outros, 0) AS paid_outros
FROM grp g
LEFT JOIN tx_stats s USING (year, candidate_id)
LEFT JOIN sup USING (year, candidate_id)
LEFT JOIN sup3 USING (year, candidate_id)
LEFT JOIN cat USING (year, candidate_id)
LEFT JOIN paid p USING (year, candidate_id);

CREATE OR REPLACE TABLE cand_assets AS
SELECT year, candidate_id, sum(value) AS assets, count(*) AS n_assets,
  coalesce(sum(value) FILTER (WHERE category = 'imoveis'), 0) AS assets_imoveis,
  coalesce(sum(value) FILTER (WHERE category = 'veiculos'), 0) AS assets_veiculos,
  coalesce(sum(value) FILTER (WHERE category IN ('investimentos', 'depositos', 'dinheiro')), 0) AS assets_financeiros,
  coalesce(sum(value) FILTER (WHERE category = 'participacoes'), 0) AS assets_participacoes
FROM asset GROUP BY ALL;

-- The main per-candidacy table used across the app.
CREATE OR REPLACE TABLE candidate_summary AS
SELECT
  c.*,
  f.filing_type, f.filing_date, f.generated_at AS finance_generated_at,
  f.candidate_id IS NOT NULL AS has_finance,
  coalesce(r.revenue, 0)::DOUBLE AS revenue,
  coalesce(r.revenue_public, 0)::DOUBLE AS revenue_public,
  coalesce(r.revenue_private, 0)::DOUBLE AS revenue_private,
  coalesce(r.rev_fefc, 0)::DOUBLE AS rev_fefc, coalesce(r.rev_fp, 0)::DOUBLE AS rev_fp,
  coalesce(r.rev_partido, 0)::DOUBLE AS rev_partido, coalesce(r.rev_pf, 0)::DOUBLE AS rev_pf,
  coalesce(r.rev_proprios, 0)::DOUBLE AS rev_proprios, coalesce(r.rev_coletivo, 0)::DOUBLE AS rev_coletivo,
  coalesce(r.rev_candidatos, 0)::DOUBLE AS rev_candidatos, coalesce(r.rev_nao_identificada, 0)::DOUBLE AS rev_nao_identificada,
  coalesce(r.rev_outros, 0)::DOUBLE AS rev_outros,
  coalesce(r.revenue_estimable, 0)::DOUBLE AS revenue_estimable,
  coalesce(r.n_revenue_tx, 0) AS n_revenue_tx,
  coalesce(r.n_donors, 0) AS n_donors,
  coalesce(r.n_pf_donors, 0) AS n_pf_donors,
  coalesce(r.n_pf_donations, 0) AS n_pf_donations,
  r.pf_avg::DOUBLE AS pf_avg, r.pf_median::DOUBLE AS pf_median, r.pf_max::DOUBLE AS pf_max,
  r.top_donor_key, r.top_donor_name, r.top_donor_type, r.top_donor_value::DOUBLE AS top_donor_value,
  r.top_private_key, r.top_private_name, r.top_private_type, r.top_private_value::DOUBLE AS top_private_value,
  coalesce(r.private_ext_total, 0)::DOUBLE AS private_ext_total, coalesce(r.n_private_donors, 0) AS n_private_donors,
  r.top3_private_value::DOUBLE AS top3_private_value,
  r.revenue_first_date, r.revenue_last_date,
  coalesce(x.expense, 0)::DOUBLE AS expense,
  coalesce(x.paid, 0)::DOUBLE AS paid,
  coalesce(x.paid_fefc, 0)::DOUBLE AS paid_fefc, coalesce(x.paid_fp, 0)::DOUBLE AS paid_fp, coalesce(x.paid_outros, 0)::DOUBLE AS paid_outros,
  coalesce(x.exp_impressos, 0)::DOUBLE AS exp_impressos, coalesce(x.exp_digital, 0)::DOUBLE AS exp_digital,
  coalesce(x.exp_audiovisual, 0)::DOUBLE AS exp_audiovisual, coalesce(x.exp_pessoal, 0)::DOUBLE AS exp_pessoal,
  coalesce(x.exp_servicos, 0)::DOUBLE AS exp_servicos, coalesce(x.exp_transporte, 0)::DOUBLE AS exp_transporte,
  coalesce(x.exp_estrutura, 0)::DOUBLE AS exp_estrutura, coalesce(x.exp_eventos, 0)::DOUBLE AS exp_eventos,
  coalesce(x.exp_transferencias, 0)::DOUBLE AS exp_transferencias, coalesce(x.exp_outros, 0)::DOUBLE AS exp_outros,
  coalesce(x.n_expense_tx, 0) AS n_expense_tx,
  coalesce(x.n_suppliers, 0) AS n_suppliers,
  x.exp_avg::DOUBLE AS exp_avg, x.exp_median::DOUBLE AS exp_median, x.exp_max::DOUBLE AS exp_max, x.exp_max_sq,
  coalesce(x.late_value, 0)::DOUBLE AS late_value,
  x.top_supplier_key, x.top_supplier_name, x.top_supplier_value::DOUBLE AS top_supplier_value,
  x.top3_supplier_value::DOUBLE AS top3_supplier_value,
  x.top_category, x.top_category_value::DOUBLE AS top_category_value,
  x.expense_first_date, x.expense_last_date,
  coalesce(a.assets, 0)::DOUBLE AS assets, coalesce(a.n_assets, 0) AS n_assets,
  coalesce(a.assets_imoveis, 0)::DOUBLE AS assets_imoveis, coalesce(a.assets_veiculos, 0)::DOUBLE AS assets_veiculos,
  coalesce(a.assets_financeiros, 0)::DOUBLE AS assets_financeiros, coalesce(a.assets_participacoes, 0)::DOUBLE AS assets_participacoes,
  -- descriptive ratios (NULL when the denominator is zero)
  CASE WHEN c.votes > 0 AND x.expense > 0 THEN x.expense::DOUBLE / c.votes END AS expense_per_vote,
  CASE WHEN c.votes > 0 AND r.revenue > 0 THEN r.revenue::DOUBLE / c.votes END AS revenue_per_vote,
  CASE WHEN c.votes > 0 AND r.revenue > 0 THEN r.revenue_public::DOUBLE / c.votes END AS public_per_vote,
  CASE WHEN c.votes > 0 AND r.revenue > 0 THEN r.revenue_private::DOUBLE / c.votes END AS private_per_vote,
  CASE WHEN r.revenue > 0 THEN r.revenue_public::DOUBLE / r.revenue END AS public_share,
  CASE WHEN r.revenue > 0 THEN r.rev_proprios::DOUBLE / r.revenue END AS self_share,
  CASE WHEN r.private_ext_total > 0 THEN r.top3_private_value::DOUBLE / r.private_ext_total END AS top3_private_share,
  CASE WHEN r.private_ext_total > 0 THEN r.top_private_value::DOUBLE / r.private_ext_total END AS top_private_share,
  CASE WHEN x.expense > 0 THEN x.top_supplier_value::DOUBLE / x.expense END AS top_supplier_share,
  CASE WHEN x.expense > 0 THEN x.top3_supplier_value::DOUBLE / x.expense END AS top3_supplier_share,
  CASE WHEN x.expense > 0 THEN x.top_category_value::DOUBLE / x.expense END AS top_category_share,
  CASE WHEN x.expense > 0 THEN x.late_value::DOUBLE / x.expense END AS late_share,
  CASE WHEN x.expense > 0 THEN x.exp_max::DOUBLE / x.expense END AS max_expense_share
FROM candidate c
LEFT JOIN filing f ON f.year = c.year AND f.candidate_id = c.id
LEFT JOIN cand_rev r ON r.year = c.year AND r.candidate_id = c.id
LEFT JOIN cand_exp x ON x.year = c.year AND x.candidate_id = c.id
LEFT JOIN cand_assets a ON a.year = c.year AND a.candidate_id = c.id
ORDER BY c.year, c.id;

-- Peer context: percentile of each metric among candidates for the same office in the same
-- election (national) — used to say "higher than X% of campaigns for this office".
CREATE OR REPLACE TABLE candidate_peer AS
SELECT year, id,
  percent_rank() OVER (PARTITION BY year, office_code ORDER BY revenue) AS pct_revenue,
  percent_rank() OVER (PARTITION BY year, office_code ORDER BY expense) AS pct_expense,
  CASE WHEN public_share IS NOT NULL THEN percent_rank() OVER (PARTITION BY year, office_code, public_share IS NOT NULL ORDER BY public_share) END AS pct_public_share,
  CASE WHEN expense_per_vote IS NOT NULL THEN percent_rank() OVER (PARTITION BY year, office_code, expense_per_vote IS NOT NULL ORDER BY expense_per_vote) END AS pct_expense_per_vote,
  CASE WHEN top_supplier_share IS NOT NULL THEN percent_rank() OVER (PARTITION BY year, office_code, top_supplier_share IS NOT NULL ORDER BY top_supplier_share) END AS pct_top_supplier_share,
  CASE WHEN top3_private_share IS NOT NULL THEN percent_rank() OVER (PARTITION BY year, office_code, top3_private_share IS NOT NULL ORDER BY top3_private_share) END AS pct_top3_private_share,
  CASE WHEN late_share IS NOT NULL THEN percent_rank() OVER (PARTITION BY year, office_code, late_share IS NOT NULL ORDER BY late_share) END AS pct_late_share,
  CASE WHEN top_category_share IS NOT NULL THEN percent_rank() OVER (PARTITION BY year, office_code, top_category_share IS NOT NULL ORDER BY top_category_share) END AS pct_top_category_share,
  CASE WHEN max_expense_share IS NOT NULL THEN percent_rank() OVER (PARTITION BY year, office_code, max_expense_share IS NOT NULL ORDER BY max_expense_share) END AS pct_max_expense_share,
  CASE WHEN self_share IS NOT NULL THEN percent_rank() OVER (PARTITION BY year, office_code, self_share IS NOT NULL ORDER BY self_share) END AS pct_self_share
FROM candidate_summary
WHERE NOT is_running_mate;

-- Medians per office (national and per state), for "typical campaign" comparisons.
CREATE OR REPLACE TABLE peer_median AS
SELECT year, office_code, coalesce(uf, 'BR') AS uf, grouping(uf) = 1 AS national,
  count(*) AS n,
  median(revenue) AS revenue, median(expense) AS expense, median(public_share) AS public_share,
  median(expense_per_vote) AS expense_per_vote, median(revenue_per_vote) AS revenue_per_vote,
  median(public_per_vote) AS public_per_vote, median(private_per_vote) AS private_per_vote,
  median(n_donors) AS n_donors, median(n_suppliers) AS n_suppliers, median(votes) AS votes,
  median(top_supplier_share) AS top_supplier_share, median(late_share) AS late_share, median(assets) AS assets
FROM candidate_summary
WHERE NOT is_running_mate AND has_finance AND expense > 0
GROUP BY GROUPING SETS ((year, office_code), (year, office_code, uf));

-- Aggregated cubes for dashboard filters (state x office x party).
CREATE OR REPLACE TABLE rev_cube AS
SELECT r.year, c.uf, c.office_code, c.party, r.category, r.is_public,
  sum(r.value)::DOUBLE AS value, count(DISTINCT r.sq) AS n
FROM revenue r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id
GROUP BY ALL;

CREATE OR REPLACE TABLE exp_cube AS
SELECT e.year, c.uf, c.office_code, c.party, e.category_group, e.category,
  sum(e.value)::DOUBLE AS value, count(DISTINCT e.sq) AS n
FROM expense e JOIN candidate c ON c.year = e.year AND c.id = e.candidate_id
GROUP BY ALL;

CREATE OR REPLACE TABLE exp_daily AS
SELECT e.year, c.uf, c.office_code, c.party, e.date, sum(e.value)::DOUBLE AS value
FROM expense e JOIN candidate c ON c.year = e.year AND c.id = e.candidate_id
WHERE e.date BETWEEN make_date(e.year, 1, 1) AND make_date(e.year, 12, 31)
GROUP BY ALL;

CREATE OR REPLACE TABLE rev_daily AS
SELECT r.year, c.uf, c.office_code, c.party, r.date, sum(r.value)::DOUBLE AS value,
  coalesce(sum(r.value) FILTER (WHERE r.is_public), 0)::DOUBLE AS public_value
FROM revenue r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id
WHERE r.date BETWEEN make_date(r.year, 1, 1) AND make_date(r.year, 12, 31)
GROUP BY ALL;

-- Party-level distribution of public funds among its candidates (Gini, top-10% share).
CREATE OR REPLACE TABLE party_distribution AS
WITH x AS (
  SELECT year, party, revenue_public AS v,
    row_number() OVER (PARTITION BY year, party ORDER BY revenue_public) AS i,
    count(*) OVER (PARTITION BY year, party) AS n,
    sum(revenue_public) OVER (PARTITION BY year, party) AS total,
    row_number() OVER (PARTITION BY year, party ORDER BY revenue_public DESC) AS rk_desc
  FROM candidate_summary
  WHERE NOT is_running_mate AND party IS NOT NULL
)
SELECT year, party, any_value(n) AS n_candidates, any_value(total)::DOUBLE AS public_total,
  CASE WHEN any_value(total) > 0 THEN (2 * sum(i * v) / (any_value(n) * any_value(total)) - (any_value(n) + 1) / any_value(n))::DOUBLE END AS gini_public,
  CASE WHEN any_value(total) > 0 THEN (sum(v) FILTER (WHERE rk_desc <= greatest(1, ceil(n * 0.1))) / any_value(total))::DOUBLE END AS top10_share_public,
  count(*) FILTER (WHERE v > 0) AS n_with_public
FROM x GROUP BY ALL;
