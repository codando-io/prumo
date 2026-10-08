-- Receita Federal — Dados Abertos CNPJ (staged by etl/cnpj.mjs; see docs/ENRICHMENT.md).
-- Companies, establishments, partners and Simples for every CNPJ in the TSE records, plus the other
-- companies of the same partners (in_tse = false). Staging is text as published; typing, code
-- descriptions and labels happen here. Phones, e-mails and street addresses are never staged.

-- Provenance of every enrichment dataset (other enrichment SQL files insert their own rows).
CREATE OR REPLACE TABLE enrich_source (
  dataset VARCHAR, label VARCHAR, url VARCHAR, published VARCHAR,
  coverage_from DATE, coverage_to DATE, retrieved_at TIMESTAMP, rows BIGINT
);

CREATE OR REPLACE MACRO rf_nz(x) AS CASE WHEN trim(coalesce(x, '')) = '' THEN NULL ELSE trim(x) END;
-- Dates are YYYYMMDD; 0 / 00000000 mean "no date".
CREATE OR REPLACE MACRO rf_date(x) AS
  CASE WHEN rf_nz(x) IS NULL OR trim(x) IN ('0', '00000000') THEN NULL ELSE TRY_CAST(try_strptime(trim(x), '%Y%m%d') AS DATE) END;
-- Same normalisation as etl/cnpj.mjs (partner identities): upper case, no accents, single spaces.
CREATE OR REPLACE MACRO rf_name(x) AS trim(regexp_replace(upper(strip_accents(coalesce(x, ''))), '\s+', ' ', 'g'));
CREATE OR REPLACE MACRO rf_code(x, n) AS CASE WHEN rf_nz(x) IS NULL THEN NULL ELSE lpad(trim(x), n, '0') END;

CREATE OR REPLACE TEMP TABLE rf_src AS SELECT * FROM read_parquet('{{STAGING}}/cnpj/source.parquet') LIMIT 1;
CREATE OR REPLACE TEMP TABLE rf_naturezas AS SELECT rf_code(code, 4) AS code, any_value(description) AS description FROM read_parquet('{{STAGING}}/cnpj/naturezas.parquet') GROUP BY 1;
CREATE OR REPLACE TEMP TABLE rf_qualificacoes AS SELECT rf_code(code, 2) AS code, any_value(description) AS description FROM read_parquet('{{STAGING}}/cnpj/qualificacoes.parquet') GROUP BY 1;
CREATE OR REPLACE TEMP TABLE rf_motivos AS SELECT rf_code(code, 2) AS code, any_value(description) AS description FROM read_parquet('{{STAGING}}/cnpj/motivos.parquet') GROUP BY 1;
CREATE OR REPLACE TEMP TABLE rf_municipios AS SELECT rf_code(code, 4) AS code, any_value(description) AS description FROM read_parquet('{{STAGING}}/cnpj/municipios.parquet') GROUP BY 1;
CREATE OR REPLACE TEMP TABLE rf_paises AS SELECT rf_code(code, 3) AS code, any_value(description) AS description FROM read_parquet('{{STAGING}}/cnpj/paises.parquet') GROUP BY 1;

-- Companies whose CNPJ appears in this build's TSE records.
CREATE OR REPLACE TEMP TABLE rf_tse AS SELECT DISTINCT substr(key, 2, 8) AS cnpj_basico FROM entity WHERE regexp_full_match(key, 'j[0-9]{14}');

CREATE OR REPLACE TABLE rf_cnae AS
SELECT rf_code(code, 7) AS code, any_value(description) AS description
FROM read_parquet('{{STAGING}}/cnpj/cnaes.parquet')
WHERE rf_nz(code) IS NOT NULL
GROUP BY 1
ORDER BY 1;

CREATE OR REPLACE TABLE rf_company AS
SELECT
  e.cnpj_basico,
  -- sole traders' company names often end with the owner's CPF
  mask_cpf(rf_nz(e.razao_social)) AS razao_social,
  rf_code(e.natureza_juridica, 4) AS natureza_code,
  n.description AS natureza,
  q.description AS qualificacao_responsavel,
  TRY_CAST(replace(rf_nz(e.capital_social), ',', '.') AS DOUBLE) AS capital_social,
  rf_code(e.porte, 2) AS porte_code,
  CASE rf_code(e.porte, 2) WHEN '01' THEN 'Microempresa' WHEN '03' THEN 'Empresa de pequeno porte' WHEN '05' THEN 'Demais' ELSE 'Não informado' END AS porte,
  rf_nz(e.ente_federativo) AS ente_federativo,
  t.cnpj_basico IS NOT NULL AS in_tse,
  (SELECT month FROM rf_src) AS source_month
FROM read_parquet('{{STAGING}}/cnpj/empresas.parquet') e
LEFT JOIN rf_naturezas n ON n.code = rf_code(e.natureza_juridica, 4)
LEFT JOIN rf_qualificacoes q ON q.code = rf_code(e.qualificacao_responsavel, 2)
LEFT JOIN rf_tse t ON t.cnpj_basico = e.cnpj_basico
WHERE regexp_full_match(e.cnpj_basico, '[0-9]{8}')
QUALIFY row_number() OVER (PARTITION BY e.cnpj_basico ORDER BY e.razao_social) = 1
ORDER BY e.cnpj_basico;

CREATE OR REPLACE TEMP TABLE rf_stage_estab AS
SELECT * FROM read_parquet('{{STAGING}}/cnpj/estabelecimentos.parquet')
WHERE regexp_full_match(cnpj_basico || cnpj_ordem || cnpj_dv, '[0-9]{14}');

-- RFB municipality codes (SIAFI) -> IBGE, by state + accent-insensitive name. Leftovers take the
-- closest IBGE name in the same state only when it is clearly the best one (spelling variants such
-- as MOJI/MOGI or PARATI/PARATY); anything ambiguous stays NULL.
CREATE OR REPLACE TEMP TABLE rf_mun_xwalk AS
WITH rfb AS (
  SELECT DISTINCT s.uf, m.code, m.description AS name,
    trim(regexp_replace(regexp_replace(norm(m.description), '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')) AS nname
  FROM rf_stage_estab s JOIN rf_municipios m ON m.code = rf_code(s.municipio, 4)
  WHERE s.uf IN (SELECT DISTINCT uf FROM ibge_mun)
),
exact AS (
  SELECT r.uf, r.code, min(i.ibge_code) AS ibge_code
  FROM rfb r JOIN ibge_mun i ON i.uf = r.uf AND i.nname = r.nname
  GROUP BY ALL HAVING count(DISTINCT i.ibge_code) = 1
),
rest AS (SELECT r.* FROM rfb r ANTI JOIN exact e ON e.uf = r.uf AND e.code = r.code),
scored AS (
  SELECT r.uf, r.code, i.ibge_code, jaro_winkler_similarity(r.nname, i.nname) AS sim,
    row_number() OVER (PARTITION BY r.uf, r.code ORDER BY jaro_winkler_similarity(r.nname, i.nname) DESC) AS rk
  FROM rest r JOIN ibge_mun i ON i.uf = r.uf
  ANTI JOIN exact e ON e.uf = i.uf AND e.ibge_code = i.ibge_code
),
fuzzy AS (
  SELECT a.uf, a.code, a.ibge_code
  FROM scored a LEFT JOIN scored b ON b.uf = a.uf AND b.code = a.code AND b.rk = 2
  WHERE a.rk = 1 AND a.sim >= 0.9 AND (b.sim IS NULL OR a.sim - b.sim >= 0.05)
)
SELECT uf, code, ibge_code, 'nome' AS method FROM exact
UNION ALL
SELECT uf, code, ibge_code, 'aproximado' FROM fuzzy;

-- Renamed municipalities whose old (RFB) and current (IBGE) names don't match by spelling.
INSERT INTO rf_mun_xwalk
SELECT DISTINCT s.uf, m.code, i.ibge_code, 'renomeado'
FROM (VALUES ('RN', 'boa saude', 'januario cicco'), ('RN', 'ares', 'arez'), ('TO', 'fortaleza do tabocao', 'tabocao'),
             ('TO', 'sao valerio da natividade', 'sao valerio'), ('RR', 'sao luiz', 'sao luiz do anaua')) o(uf, rfb_nname, ibge_nname)
JOIN rf_municipios m ON trim(regexp_replace(regexp_replace(norm(m.description), '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')) = o.rfb_nname
JOIN (SELECT DISTINCT uf, rf_code(municipio, 4) AS code FROM rf_stage_estab) s ON s.uf = o.uf AND s.code = m.code
JOIN ibge_mun i ON i.uf = o.uf AND i.nname = o.ibge_nname
ANTI JOIN rf_mun_xwalk x ON x.uf = s.uf AND x.code = m.code;

CREATE OR REPLACE TABLE rf_establishment AS
SELECT
  s.cnpj_basico || s.cnpj_ordem || s.cnpj_dv AS cnpj,
  s.cnpj_basico,
  s.matriz_filial = '1' AS matriz,
  mask_cpf(rf_nz(s.nome_fantasia)) AS nome_fantasia,
  rf_code(s.situacao_cadastral, 2) AS situacao_code,
  CASE rf_code(s.situacao_cadastral, 2) WHEN '01' THEN 'Nula' WHEN '02' THEN 'Ativa' WHEN '03' THEN 'Suspensa' WHEN '04' THEN 'Inapta' WHEN '08' THEN 'Baixada' END AS situacao,
  rf_date(s.data_situacao_cadastral) AS data_situacao,
  -- code 00 is "SEM MOTIVO"
  CASE WHEN rf_code(s.motivo_situacao_cadastral, 2) <> '00' THEN mo.description END AS motivo_situacao,
  rf_date(s.data_inicio_atividade) AS data_inicio,
  rf_code(s.cnae_fiscal_principal, 7) AS cnae_principal,
  c.description AS cnae_principal_desc,
  list_transform(list_filter(string_split(coalesce(s.cnae_fiscal_secundaria, ''), ','), x -> trim(x) <> ''), x -> lpad(trim(x), 7, '0')) AS cnaes_secundarias,
  rf_nz(s.uf) AS uf,
  rf_code(s.municipio, 4) AS municipio_code,
  mu.description AS municipio,
  x.ibge_code::INTEGER AS ibge_code,
  rf_nz(s.situacao_especial) AS situacao_especial,
  rf_date(s.data_situacao_especial) AS data_situacao_especial,
  (SELECT month FROM rf_src) AS source_month
FROM rf_stage_estab s
LEFT JOIN rf_motivos mo ON mo.code = rf_code(s.motivo_situacao_cadastral, 2)
LEFT JOIN rf_cnae c ON c.code = rf_code(s.cnae_fiscal_principal, 7)
LEFT JOIN rf_municipios mu ON mu.code = rf_code(s.municipio, 4)
LEFT JOIN rf_mun_xwalk x ON x.uf = s.uf AND x.code = rf_code(s.municipio, 4)
QUALIFY row_number() OVER (PARTITION BY s.cnpj_basico, s.cnpj_ordem, s.cnpj_dv ORDER BY s.data_situacao_cadastral DESC) = 1
ORDER BY cnpj;

CREATE OR REPLACE TABLE rf_simples AS
SELECT
  cnpj_basico,
  CASE upper(trim(opcao_simples)) WHEN 'S' THEN true WHEN 'N' THEN false END AS opcao_simples,
  rf_date(data_opcao_simples) AS data_opcao_simples,
  rf_date(data_exclusao_simples) AS data_exclusao_simples,
  CASE upper(trim(opcao_mei)) WHEN 'S' THEN true WHEN 'N' THEN false END AS opcao_mei,
  rf_date(data_opcao_mei) AS data_opcao_mei,
  rf_date(data_exclusao_mei) AS data_exclusao_mei,
  (SELECT month FROM rf_src) AS source_month
FROM read_parquet('{{STAGING}}/cnpj/simples.parquet')
WHERE regexp_full_match(cnpj_basico, '[0-9]{8}')
QUALIFY row_number() OVER (PARTITION BY cnpj_basico ORDER BY data_opcao_simples DESC) = 1
ORDER BY cnpj_basico;

CREATE OR REPLACE TEMP TABLE rf_stage_socios AS
SELECT * FROM read_parquet('{{STAGING}}/cnpj/socios.parquet') WHERE regexp_full_match(cnpj_basico, '[0-9]{8}');

CREATE OR REPLACE TABLE rf_partner AS
SELECT
  s.cnpj_basico,
  s.partner_key,
  CASE s.identificador_socio WHEN '1' THEN 'PJ' WHEN '2' THEN 'PF' WHEN '3' THEN 'Estrangeiro' END AS partner_type,
  mask_cpf(rf_nz(s.nome_socio)) AS name,
  -- PF: as published (***123456**); a full 11-digit number is never kept
  CASE WHEN regexp_full_match(rf_nz(s.cnpj_cpf_socio), '[0-9]{11}') THEN '***' || substr(trim(s.cnpj_cpf_socio), 4, 6) || '**'
       ELSE rf_nz(s.cnpj_cpf_socio) END AS doc_masked,
  CASE WHEN s.identificador_socio = '1' AND length(regexp_replace(coalesce(s.cnpj_cpf_socio, ''), '[^0-9]', '', 'g')) >= 8
       THEN left(regexp_replace(s.cnpj_cpf_socio, '[^0-9]', '', 'g'), 8) END AS partner_cnpj_basico,
  rf_code(s.qualificacao_socio, 2) AS qualificacao_code,
  q.description AS qualificacao,
  rf_date(s.data_entrada_sociedade) AS data_entrada,
  CASE WHEN s.identificador_socio = '2' THEN
    CASE trim(s.faixa_etaria)
      WHEN '1' THEN '0 a 12 anos' WHEN '2' THEN '13 a 20 anos' WHEN '3' THEN '21 a 30 anos' WHEN '4' THEN '31 a 40 anos'
      WHEN '5' THEN '41 a 50 anos' WHEN '6' THEN '51 a 60 anos' WHEN '7' THEN '61 a 70 anos' WHEN '8' THEN '71 a 80 anos'
      WHEN '9' THEN 'Mais de 80 anos'
    END
  END AS faixa_etaria,
  p.description AS pais,
  (SELECT month FROM rf_src) AS source_month
FROM rf_stage_socios s
LEFT JOIN rf_qualificacoes q ON q.code = rf_code(s.qualificacao_socio, 2)
LEFT JOIN rf_paises p ON p.code = rf_code(s.pais, 3)
ORDER BY s.cnpj_basico, s.partner_key;

-- POSSIBLE matches between Receita partners (natural persons) and TSE persons: same full name
-- and same 6 visible CPF digits (Receita hides the first 3 and the last 2). The full CPF exists
-- only on the TSE side and only inside the build; nothing but keys is stored.
CREATE OR REPLACE TABLE person_match AS
WITH partner AS (
  SELECT DISTINCT partner_key, name_norm, substr(cnpj_cpf_socio, 4, 6) AS mid6
  FROM rf_stage_socios
  WHERE identificador_socio = '2'
    AND regexp_full_match(cnpj_cpf_socio, '\*\*\*[0-9]{6}\*\*')
    AND len(string_split(name_norm, ' ')) >= 2
),
tse AS (
  SELECT DISTINCT 'candidato' AS tse_kind, person_key(NR_CPF_CANDIDATO) AS tse_key, rf_name(NM_CANDIDATO) AS name_norm,
    substr(lpad(digits(NR_CPF_CANDIDATO), 11, '0'), 4, 6) AS mid6
  FROM raw_candidatos WHERE person_key(NR_CPF_CANDIDATO) IS NOT NULL
  UNION
  SELECT 'doador', donor_key, rf_name(donor_name), substr(lpad(donor_doc, 11, '0'), 4, 6)
  FROM revenue WHERE starts_with(donor_key, 'f')
  UNION
  SELECT 'doador', key, rf_name(name), substr(lpad(doc, 11, '0'), 4, 6)
  FROM revenue_origin WHERE starts_with(key, 'f')
  UNION
  SELECT 'fornecedor', supplier_key, rf_name(supplier_name), substr(lpad(supplier_doc, 11, '0'), 4, 6)
  FROM expense WHERE starts_with(supplier_key, 'f')
),
hits AS (
  SELECT p.partner_key, t.tse_key, list(DISTINCT t.tse_kind) AS kinds
  FROM partner p JOIN tse t ON t.name_norm = p.name_norm AND t.mid6 = p.mid6
  WHERE len(string_split(t.name_norm, ' ')) >= 2
  GROUP BY ALL
)
SELECT
  h.partner_key,
  -- one row per TSE page: a counterparty that both donated and supplied gets its main role
  CASE
    WHEN starts_with(h.tse_key, 'p') THEN 'candidato'
    WHEN len(h.kinds) = 1 THEN h.kinds[1]
    WHEN coalesce(et.supplied, 0) >= coalesce(et.donated, 0) + coalesce(et.donated_indirect, 0) THEN 'fornecedor'
    ELSE 'doador'
  END AS tse_kind,
  h.tse_key,
  'possivel' AS confidence,
  CASE
    WHEN starts_with(h.tse_key, 'p') THEN 'Nome igual ao do registro de candidatura no TSE e os 6 dígitos visíveis do CPF coincidem (a Receita não publica os outros 5)'
    WHEN len(h.kinds) > 1 THEN 'Nome igual ao do doador e fornecedor nas prestações de contas do TSE e os 6 dígitos visíveis do CPF coincidem (a Receita não publica os outros 5)'
    WHEN h.kinds[1] = 'fornecedor' THEN 'Nome igual ao do fornecedor nas prestações de contas do TSE e os 6 dígitos visíveis do CPF coincidem (a Receita não publica os outros 5)'
    ELSE 'Nome igual ao do doador nas prestações de contas do TSE e os 6 dígitos visíveis do CPF coincidem (a Receita não publica os outros 5)'
  END AS basis
FROM hits h
LEFT JOIN entity_total et ON et.key = h.tse_key
ORDER BY h.partner_key, h.tse_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rf_company ON rf_company (cnpj_basico);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rf_establishment ON rf_establishment (cnpj);
CREATE INDEX IF NOT EXISTS idx_rf_establishment_basico ON rf_establishment (cnpj_basico);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rf_simples ON rf_simples (cnpj_basico);
CREATE INDEX IF NOT EXISTS idx_rf_partner_basico ON rf_partner (cnpj_basico);
CREATE INDEX IF NOT EXISTS idx_rf_partner_key ON rf_partner (partner_key);
CREATE INDEX IF NOT EXISTS idx_person_match_partner ON person_match (partner_key);
CREATE INDEX IF NOT EXISTS idx_person_match_tse ON person_match (tse_key);

INSERT INTO enrich_source
SELECT dataset, label, url, published, coverage_from, coverage_to, retrieved_at,
  (SELECT count(*) FROM rf_company) + (SELECT count(*) FROM rf_establishment) + (SELECT count(*) FROM rf_partner) + (SELECT count(*) FROM rf_simples) AS rows
FROM rf_src
WHERE dataset IS NOT NULL AND (SELECT count(*) FROM rf_company) > 0;
