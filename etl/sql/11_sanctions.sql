-- Sanction and impediment registries published by CGU (Portal da Transparência), staged by
-- etl/sanctions.mjs: CEIS, CNEP, CEPIM and Acordos de Leniência. Companies only (rows of
-- individuals are dropped by the fetcher). Every company row is kept, not only Prumo's companies:
-- the table is small and a company can enter Prumo's scope later.
-- Records are shown as published; `status` is computed against the date of the file, never today.
-- CPF-shaped numbers in names and texts are masked (mask_cpf, as everywhere in Prumo).

CREATE OR REPLACE TABLE sanction AS
WITH meta AS (
  SELECT dataset, url, try_cast(file_date AS DATE) AS file_date, try_cast(retrieved_at AS TIMESTAMP) AS retrieved_at
  FROM read_parquet('{{STAGING}}/sancoes/meta.parquet')
),
registry AS (
  SELECT 'ceis' AS dataset, 'CEIS' AS source, * FROM read_parquet('{{STAGING}}/sancoes/ceis.parquet')
  UNION ALL BY NAME
  SELECT 'cnep' AS dataset, 'CNEP' AS source, * FROM read_parquet('{{STAGING}}/sancoes/cnep.parquet')
),
efeitos AS (
  SELECT id, string_agg(efeito || coalesce(': ' || complemento, ''), ' | ' ORDER BY efeito) AS efeitos
  FROM read_parquet('{{STAGING}}/sancoes/efeitos.parquet')
  GROUP BY id
),
unified AS (
  SELECT dataset, source, codigo AS record_id, cnpj,
    coalesce(nome_orgao, nome, razao_social) AS name,
    categoria AS category,
    try_strptime(data_inicio, '%d/%m/%Y')::DATE AS start_date,
    try_strptime(data_final, '%d/%m/%Y')::DATE AS end_date,
    try_strptime(data_publicacao, '%d/%m/%Y')::DATE AS publication_date,
    try_strptime(data_transito, '%d/%m/%Y')::DATE AS transit_date,
    processo AS process_number,
    orgao AS authority, uf_orgao AS authority_uf, esfera_orgao AS authority_sphere,
    fundamentacao AS legal_basis, abrangencia AS scope,
    try_cast(replace(replace(valor_multa, '.', ''), ',', '.') AS DOUBLE) AS fine_value,
    nullif(concat_ws(' · ',
      CASE WHEN publicacao IS NOT NULL AND publicacao <> 'Sem Informação'
        THEN 'Publicação: ' || publicacao || coalesce(' (' || detalhamento_publicacao || ')', '') END,
      'Observações: ' || observacoes), '') AS details
  FROM registry
  UNION ALL
  SELECT 'cepim', 'CEPIM', convenio, cnpj, nome, motivo,
    NULL, NULL, NULL, NULL, NULL,
    orgao, NULL, NULL, NULL, NULL, NULL,
    'Convênio nº ' || convenio
  FROM read_parquet('{{STAGING}}/sancoes/cepim.parquet')
  UNION ALL
  SELECT 'leniencia', 'Acordo de leniência', a.id, a.cnpj, coalesce(a.razao_social, a.nome_fantasia), a.situacao,
    try_strptime(a.data_inicio, '%d/%m/%Y')::DATE, try_strptime(a.data_fim, '%d/%m/%Y')::DATE, NULL, NULL,
    a.processo, a.orgao, NULL, NULL, NULL, NULL, NULL,
    nullif(concat_ws(' · ', a.termos, 'Efeitos: ' || e.efeitos), '')
  FROM read_parquet('{{STAGING}}/sancoes/acordos.parquet') a
  LEFT JOIN efeitos e USING (id)
)
SELECT u.source, u.record_id, u.cnpj, substr(u.cnpj, 1, 8) AS cnpj_basico,
  mask_cpf(u.name) AS name, u.category,
  u.start_date, u.end_date, u.publication_date, u.transit_date,
  u.process_number, -- valid CPFs already masked by the fetcher; other CPF-shaped numbers kept
  u.authority, u.authority_uf, u.authority_sphere,
  u.legal_basis, u.scope, u.fine_value, mask_cpf(u.details) AS details,
  CASE WHEN u.end_date IS NULL THEN 'Sem data final'
       WHEN u.end_date >= m.file_date THEN 'Em vigor'
       ELSE 'Encerrada' END AS status,
  m.file_date, m.url AS source_url, m.retrieved_at
FROM unified u
JOIN meta m USING (dataset)
WHERE length(u.cnpj) = 14
ORDER BY cnpj_basico, u.source, u.start_date DESC NULLS LAST, u.record_id;

-- Provenance (enrich_source is created by 10_cnpj.sql; created here too so this file runs alone).
CREATE TABLE IF NOT EXISTS enrich_source (
  dataset VARCHAR, label VARCHAR, url VARCHAR, published VARCHAR,
  coverage_from DATE, coverage_to DATE, retrieved_at TIMESTAMP, rows BIGINT
);

DELETE FROM enrich_source WHERE dataset IN ('ceis', 'cnep', 'cepim', 'leniencia');

INSERT INTO enrich_source
SELECT m.dataset, m.label, m.url, m.file_date AS published,
  NULL::DATE AS coverage_from, NULL::DATE AS coverage_to,
  try_cast(m.retrieved_at AS TIMESTAMP) AS retrieved_at,
  (SELECT count(*) FROM sanction s
   WHERE s.source = CASE m.dataset WHEN 'ceis' THEN 'CEIS' WHEN 'cnep' THEN 'CNEP' WHEN 'cepim' THEN 'CEPIM' ELSE 'Acordo de leniência' END) AS rows
FROM read_parquet('{{STAGING}}/sancoes/meta.parquet') m
ORDER BY m.dataset;
