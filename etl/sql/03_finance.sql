-- Campaign finance facts: revenues, original donors, contracted expenses, payments, filings.
-- Rows whose SQ_RECEITA / SQ_DESPESA is -1 are "no movement" placeholders and are kept only
-- in the filing table. Repeated SQ values are itemised lines of one transaction (e.g. an
-- in-kind donation with several items) and are all kept; transaction counts use DISTINCT sq.

CREATE OR REPLACE MACRO fund_of(x) AS
  CASE
    WHEN norm(x) LIKE '%especial%' OR norm(x) LIKE '%fefc%' THEN 'FEFC'
    WHEN norm(x) LIKE '%partidario%' THEN 'FP'
    WHEN nz(x) IS NULL THEN NULL
    ELSE 'OUTROS'
  END;

CREATE OR REPLACE TABLE revenue AS
WITH r AS (
  SELECT
    CAST(AA_ELEICAO AS INT) AS year,
    nz(SQ_RECEITA) AS sq,
    nz(SQ_CANDIDATO) AS candidate_id,
    nz(SQ_PRESTADOR_CONTAS) AS account_id,
    br_date(DT_RECEITA) AS date,
    brl(VR_RECEITA) AS value,
    fund_of(DS_FONTE_RECEITA) AS fund,
    nz(DS_ORIGEM_RECEITA) AS origin,
    upper(strip_accents(nz(DS_NATUREZA_RECEITA))) AS nature,
    nz(DS_ESPECIE_RECEITA) AS kind,
    nz(DS_NATUREZA_RECURSO_ESTIMAVEL) AS estimable_nature,
    digits(NR_CPF_CNPJ_DOADOR) AS donor_doc,
    mask_cpf(coalesce(nz(NM_DOADOR_RFB), nz(NM_DOADOR))) AS donor_name,
    mask_cpf(nz(NM_DOADOR)) AS donor_name_declared,
    nz(SG_UF_DOADOR) AS donor_uf,
    nz(NM_MUNICIPIO_DOADOR) AS donor_city,
    nz(DS_CNAE_DOADOR) AS donor_cnae,
    nz(SG_PARTIDO_DOADOR) AS donor_party,
    nz(DS_ESFERA_PARTIDARIA_DOADOR) AS donor_party_sphere,
    nz(SQ_CANDIDATO_DOADOR) AS donor_candidate_id,
    nz(NR_RECIBO_DOACAO) AS receipt,
    mask_cpf(nz(NR_DOCUMENTO_DOACAO)) AS document,
    mask_cpf(nz(DS_RECEITA)) AS description,
    upper(strip_accents(nz(TP_PRESTACAO_CONTAS))) AS filing_type,
    br_date(DT_PRESTACAO_CONTAS) AS filing_date,
    TRY_CAST(ST_TURNO AS INT) AS round
  FROM raw_receitas
  WHERE nz(SQ_RECEITA) IS NOT NULL
)
SELECT
  row_number() OVER (ORDER BY year, candidate_id, sq, value) AS rid,
  r.*,
  CASE
    WHEN fund = 'FEFC' OR origin = 'Fundo Especial de Financiamento de Campanha' THEN 'fefc'
    WHEN fund = 'FP' OR origin = 'Fundo Partidário' THEN 'fp'
    WHEN origin = 'Recursos próprios' THEN 'proprios'
    WHEN origin IN ('Recursos de pessoas físicas', 'Doações pela Internet', 'Doações para Campanha') THEN 'pf'
    WHEN origin = 'Recursos de Financiamento Coletivo' THEN 'coletivo'
    WHEN origin = 'Recursos de partido político' THEN 'partido'
    WHEN origin = 'Recursos de outros candidatos' THEN 'candidatos'
    WHEN origin = 'Recursos de origens não identificadas' THEN 'nao_identificada'
    ELSE 'outros'
  END AS category,
  CASE
    WHEN origin = 'Recursos próprios' THEN 'proprio'
    WHEN donor_candidate_id IS NOT NULL OR origin = 'Recursos de outros candidatos' THEN 'candidato'
    WHEN origin = 'Recursos de partido político' OR (donor_party IS NOT NULL AND length(donor_doc) = 14) THEN 'partido'
    WHEN origin = 'Recursos de Financiamento Coletivo' THEN 'plataforma'
    WHEN length(donor_doc) = 14 THEN 'pj'
    WHEN length(donor_doc) BETWEEN 9 AND 11 THEN 'pf'
    ELSE 'desconhecido'
  END AS donor_type,
  party_key(donor_doc, donor_name) AS donor_key
FROM r;

ALTER TABLE revenue ADD COLUMN is_public BOOLEAN;
UPDATE revenue SET is_public = category IN ('fefc', 'fp');

-- Individuals behind party transfers and crowdfunding ("doador originário").
CREATE OR REPLACE TABLE revenue_origin AS
WITH o AS (
  SELECT
    CAST(AA_ELEICAO AS INT) AS year,
    nz(SQ_RECEITA) AS sq,
    nz(SQ_PRESTADOR_CONTAS) AS account_id,
    digits(NR_CPF_CNPJ_DOADOR_ORIGINARIO) AS doc,
    mask_cpf(coalesce(nz(NM_DOADOR_ORIGINARIO_RFB), nz(NM_DOADOR_ORIGINARIO))) AS name,
    nz(TP_DOADOR_ORIGINARIO) AS type,
    nz(DS_CNAE_DOADOR_ORIGINARIO) AS cnae,
    br_date(DT_RECEITA) AS date,
    brl(VR_RECEITA) AS value,
    mask_cpf(nz(DS_RECEITA)) AS description
  FROM raw_receitas_originario
  WHERE nz(SQ_RECEITA) IS NOT NULL
),
link AS (
  SELECT DISTINCT year, sq, candidate_id, category, donor_key AS via_key, donor_name AS via_name, donor_type AS via_type
  FROM revenue
)
SELECT o.*, party_key(o.doc, o.name) AS key, l.candidate_id, l.category AS via_category, l.via_key, l.via_name, l.via_type
FROM o LEFT JOIN link l USING (year, sq);

-- Prumo's plain-language grouping of the ~45 official expense categories.
-- The official TSE category is always kept and shown alongside the group.
CREATE OR REPLACE MACRO expense_group(c) AS
  CASE
    WHEN norm(c) SIMILAR TO '.*(impulsionamento|paginas na internet|internet).*' THEN 'digital'
    WHEN norm(c) SIMILAR TO '.*(materiais impressos|adesivos|jornais e revistas|correspondencias|placas|faixas|cartazes|publicidade por).*' AND norm(c) NOT LIKE '%carros de som%' THEN 'impressos'
    WHEN norm(c) SIMILAR TO '.*(radio|televisao|video|jingles|carros de som|audiovisual).*' THEN 'audiovisual'
    WHEN norm(c) SIMILAR TO '.*(pessoal|militancia|mobilizacao|encargos sociais|cabos eleitorais).*' THEN 'pessoal'
    WHEN norm(c) SIMILAR TO '.*(advocaticios|contabeis|pesquisas|prestados por terceiros|servicos).*' THEN 'servicos'
    WHEN norm(c) SIMILAR TO '.*(veiculos|combustiveis|transporte|deslocamento|passagem|hospedagem).*' THEN 'transporte'
    WHEN norm(c) SIMILAR TO '.*(eventos|comicios).*' THEN 'eventos'
    WHEN norm(c) SIMILAR TO '.*(doacoes financeiras a outros|doacoes a outros|transferencia).*' THEN 'transferencias'
    WHEN norm(c) SIMILAR TO '.*(imoveis|bens moveis|comite|expediente|agua|energia|telefone|geradores|alimentacao|seguranca|aquisicao).*' THEN 'estrutura'
    ELSE 'outros'
  END;

CREATE OR REPLACE TABLE expense AS
WITH d AS (
  SELECT
    CAST(AA_ELEICAO AS INT) AS year,
    nz(SQ_DESPESA) AS sq,
    nz(SQ_CANDIDATO) AS candidate_id,
    nz(SQ_PRESTADOR_CONTAS) AS account_id,
    br_date(DT_DESPESA) AS date,
    brl(VR_DESPESA_CONTRATADA) AS value,
    nz(DS_ORIGEM_DESPESA) AS category,
    digits(NR_CPF_CNPJ_FORNECEDOR) AS supplier_doc,
    mask_cpf(coalesce(nz(NM_FORNECEDOR_RFB), nz(NM_FORNECEDOR))) AS supplier_name,
    mask_cpf(nz(NM_FORNECEDOR)) AS supplier_name_declared,
    CASE
      WHEN norm(DS_TIPO_FORNECEDOR) LIKE '%fisica%' THEN 'pf'
      WHEN norm(DS_TIPO_FORNECEDOR) LIKE '%juridica%' THEN 'pj'
    END AS supplier_type,
    nz(CD_CNAE_FORNECEDOR) AS supplier_cnae_code,
    nz(DS_CNAE_FORNECEDOR) AS supplier_cnae,
    nz(SG_UF_FORNECEDOR) AS supplier_uf,
    TRY_CAST(nz(CD_MUNICIPIO_FORNECEDOR) AS INT) AS supplier_city_code,
    nz(NM_MUNICIPIO_FORNECEDOR) AS supplier_city,
    nz(SQ_CANDIDATO_FORNECEDOR) AS supplier_candidate_id,
    nz(SG_PARTIDO_FORNECEDOR) AS supplier_party,
    nz(DS_TIPO_DOCUMENTO) AS doc_type,
    mask_cpf(nz(NR_DOCUMENTO)) AS doc_number,
    mask_cpf(nz(DS_DESPESA)) AS description,
    upper(strip_accents(nz(TP_PRESTACAO_CONTAS))) AS filing_type,
    br_date(DT_PRESTACAO_CONTAS) AS filing_date,
    TRY_CAST(ST_TURNO AS INT) AS round
  FROM raw_despesas_contratadas
  WHERE nz(SQ_DESPESA) IS NOT NULL
)
SELECT
  row_number() OVER (ORDER BY year, candidate_id, sq, value) AS eid,
  d.*,
  expense_group(category) AS category_group,
  party_key(supplier_doc, supplier_name) AS supplier_key
FROM d;

CREATE OR REPLACE TABLE payment AS
SELECT
  CAST(AA_ELEICAO AS INT) AS year,
  nz(SQ_DESPESA) AS sq,
  nz(SQ_PARCELAMENTO_DESPESA) AS installment,
  nz(SQ_PRESTADOR_CONTAS) AS account_id,
  br_date(DT_PAGTO_DESPESA) AS date,
  brl(VR_PAGTO_DESPESA) AS value,
  fund_of(DS_FONTE_DESPESA) AS fund,
  nz(DS_ORIGEM_DESPESA) AS category,
  nz(DS_ESPECIE_RECURSO) AS method,
  mask_cpf(nz(DS_DESPESA)) AS description,
  nz(DS_TIPO_DOCUMENTO) AS doc_type,
  mask_cpf(nz(NR_DOCUMENTO)) AS doc_number,
  upper(strip_accents(nz(TP_PRESTACAO_CONTAS))) AS filing_type
FROM raw_despesas_pagas
WHERE nz(SQ_DESPESA) IS NOT NULL;

-- Campaign account -> candidate.
CREATE OR REPLACE TABLE account AS
SELECT year, account_id, any_value(candidate_id) AS candidate_id, any_value(cnpj) AS cnpj
FROM (
  SELECT CAST(AA_ELEICAO AS INT) AS year, nz(SQ_PRESTADOR_CONTAS) AS account_id, nz(SQ_CANDIDATO) AS candidate_id, digits(NR_CNPJ_PRESTADOR_CONTA) AS cnpj FROM raw_receitas
  UNION ALL
  SELECT CAST(AA_ELEICAO AS INT), nz(SQ_PRESTADOR_CONTAS), nz(SQ_CANDIDATO), digits(NR_CNPJ_PRESTADOR_CONTA) FROM raw_despesas_contratadas
)
WHERE account_id IS NOT NULL AND candidate_id IS NOT NULL
GROUP BY ALL;

ALTER TABLE payment ADD COLUMN candidate_id VARCHAR;
UPDATE payment p SET candidate_id = a.candidate_id FROM account a WHERE a.year = p.year AND a.account_id = p.account_id;

-- Latest filing per candidate (each source file holds the most recent submission).
CREATE OR REPLACE TABLE filing AS
SELECT year, candidate_id,
  arg_max(filing_type, filing_date) AS filing_type,
  max(filing_date) AS filing_date,
  max(round) AS round,
  max(generated_at) AS generated_at
FROM (
  SELECT CAST(AA_ELEICAO AS INT) AS year, nz(SQ_CANDIDATO) AS candidate_id,
    upper(strip_accents(nz(TP_PRESTACAO_CONTAS))) AS filing_type, br_date(DT_PRESTACAO_CONTAS) AS filing_date,
    TRY_CAST(ST_TURNO AS INT) AS round, try_strptime(DT_GERACAO || ' ' || HH_GERACAO, '%d/%m/%Y %H:%M:%S') AS generated_at
  FROM raw_receitas
  UNION ALL
  SELECT CAST(AA_ELEICAO AS INT), nz(SQ_CANDIDATO), upper(strip_accents(nz(TP_PRESTACAO_CONTAS))), br_date(DT_PRESTACAO_CONTAS),
    TRY_CAST(ST_TURNO AS INT), try_strptime(DT_GERACAO || ' ' || HH_GERACAO, '%d/%m/%Y %H:%M:%S')
  FROM raw_despesas_contratadas
)
WHERE candidate_id IS NOT NULL
GROUP BY ALL;
