-- Public contracts published on PNCP (all spheres), staged by etl/pncp.mjs from its local copy of
-- the consulta API. Only contracts whose supplier is one of Prumo's companies: rf_company (built by
-- 10_cnpj.sql) plus every CNPJ in TSE records (entity 'j' keys), so the table still works when the
-- Receita data is not loaded. Contracts are documented facts on their own; they are joined to the
-- rest of Prumo by the supplier's CNPJ only.

-- Normally created by 10_cnpj.sql; declared here (no-op then) so this file can run alone.
CREATE TABLE IF NOT EXISTS rf_company (
  cnpj_basico VARCHAR PRIMARY KEY, razao_social VARCHAR, natureza_code VARCHAR, natureza VARCHAR,
  qualificacao_responsavel VARCHAR, capital_social DOUBLE, porte_code VARCHAR, porte VARCHAR,
  ente_federativo VARCHAR, in_tse BOOLEAN, source_month VARCHAR
);

CREATE OR REPLACE TABLE public_contract (
  pncp_id VARCHAR PRIMARY KEY,
  supplier_cnpj VARCHAR, supplier_cnpj_basico VARCHAR, supplier_name VARCHAR,
  orgao_cnpj VARCHAR, orgao_nome VARCHAR, esfera VARCHAR, poder VARCHAR,
  unidade_nome VARCHAR, uf VARCHAR, municipio VARCHAR, ibge_code INTEGER,
  numero_contrato VARCHAR, ano INTEGER, sequencial INTEGER, processo VARCHAR,
  objeto VARCHAR, tipo_contrato VARCHAR, categoria_processo VARCHAR,
  valor_inicial DOUBLE, valor_global DOUBLE,
  data_assinatura DATE, data_vigencia_inicio DATE, data_vigencia_fim DATE,
  data_publicacao TIMESTAMP, data_atualizacao TIMESTAMP,
  url VARCHAR,
  retrieved_at TIMESTAMP
);

INSERT INTO public_contract
SELECT
  c.numeroControlePNCP,
  c.niFornecedor, substr(c.niFornecedor, 1, 8), mask_cpf(c.nomeRazaoSocialFornecedor),
  c.orgaoCnpj, c.orgaoRazaoSocial,
  CASE c.esferaId WHEN 'F' THEN 'Federal' WHEN 'E' THEN 'Estadual' WHEN 'M' THEN 'Municipal' WHEN 'D' THEN 'Distrital' WHEN 'N' THEN 'Não se aplica' ELSE c.esferaId END,
  CASE c.poderId WHEN 'E' THEN 'Executivo' WHEN 'L' THEN 'Legislativo' WHEN 'J' THEN 'Judiciário' WHEN 'N' THEN 'Não se aplica' ELSE c.poderId END,
  c.nomeUnidade, c.ufSigla, c.municipioNome, try_cast(c.codigoIbge AS INTEGER),
  -- valid CPFs in process/contract numbers are masked by the fetcher (most CPF-shaped ones are not CPFs)
  c.numeroContratoEmpenho, c.anoContrato, c.sequencialContrato, c.processo,
  mask_cpf(c.objetoContrato), c.tipoContrato, c.categoriaProcesso,
  c.valorInicial, c.valorGlobal,
  try_cast(c.dataAssinatura AS DATE), try_cast(c.dataVigenciaInicio AS DATE), try_cast(c.dataVigenciaFim AS DATE),
  try_cast(c.dataPublicacaoPncp AS TIMESTAMP),
  -- Latest change known to PNCP: the contract itself or its documents/amendments ("global").
  greatest(try_cast(c.dataAtualizacao AS TIMESTAMP), try_cast(c.dataAtualizacaoGlobal AS TIMESTAMP)),
  'https://pncp.gov.br/app/contratos/' || c.orgaoCnpj || '/' || c.anoContrato || '/' || c.sequencialContrato,
  try_cast(c.retrievedAt AS TIMESTAMP)
FROM read_parquet('{{STAGING}}/pncp/contracts.parquet') c
WHERE substr(c.niFornecedor, 1, 8) IN (
  SELECT cnpj_basico FROM rf_company
  UNION SELECT substr(key, 2, 8) FROM entity WHERE starts_with(key, 'j') AND length(key) = 15
)
ORDER BY substr(c.niFornecedor, 1, 8), c.dataAssinatura DESC NULLS LAST, c.numeroControlePNCP;

CREATE INDEX IF NOT EXISTS idx_public_contract_supplier ON public_contract (supplier_cnpj_basico);

-- Provenance (enrich_source is created by 10_cnpj.sql; created here too so this file runs alone).
CREATE TABLE IF NOT EXISTS enrich_source (
  dataset VARCHAR, label VARCHAR, url VARCHAR, published VARCHAR,
  coverage_from DATE, coverage_to DATE, retrieved_at TIMESTAMP, rows BIGINT
);

DELETE FROM enrich_source WHERE dataset = 'pncp_contratos';

INSERT INTO enrich_source
SELECT dataset, label, url, published, coverage_from, coverage_to, retrieved_at,
  (SELECT count(*) FROM public_contract) AS rows
FROM read_parquet('{{STAGING}}/pncp/coverage.parquet');
