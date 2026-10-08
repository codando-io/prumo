-- Elections, candidates, votes and declared assets.

CREATE OR REPLACE TABLE election AS
SELECT year::INT AS year, label, round1::DATE AS round1, round2::DATE AS round2, portal_id
FROM (VALUES {{ELECTIONS_VALUES}}) t(year, label, round1, round2, portal_id);

-- One row per candidacy (SQ_CANDIDATO). Candidates that went to a second round appear
-- twice in the source; we keep the latest round's status and the first round's metadata.
CREATE OR REPLACE TABLE candidate_stage AS
SELECT
  CAST(ANO_ELEICAO AS INT) AS year,
  nz(SQ_CANDIDATO) AS id,
  TRY_CAST(NR_TURNO AS INT) AS turno,
  TRY_CAST(CD_ELEICAO AS INT) AS election_code,
  nz(DS_ELEICAO) AS election_name,
  nz(SG_UF) AS uf,
  nz(SG_UE) AS ue,
  nz(NM_UE) AS ue_name,
  TRY_CAST(CD_CARGO AS INT) AS office_code,
  titlecase(nz(DS_CARGO)) AS office,
  TRY_CAST(NR_CANDIDATO AS INT) AS number,
  nz(NM_CANDIDATO) AS name,
  nz(NM_URNA_CANDIDATO) AS ballot_name,
  nz(NM_SOCIAL_CANDIDATO) AS social_name,
  person_key(NR_CPF_CANDIDATO) AS person_id,
  nz(SG_PARTIDO) AS party,
  TRY_CAST(NR_PARTIDO AS INT) AS party_number,
  nz(NM_PARTIDO) AS party_name,
  nz(TP_AGREMIACAO) AS alliance_type,
  nz(SG_FEDERACAO) AS federation,
  nz(NM_FEDERACAO) AS federation_name,
  nz(DS_COMPOSICAO_FEDERACAO) AS federation_parties,
  nz(NM_COLIGACAO) AS coalition,
  nz(DS_COMPOSICAO_COLIGACAO) AS coalition_parties,
  nz(DS_SITUACAO_CANDIDATURA) AS registration_status,
  titlecase(nz(DS_GENERO)) AS gender,
  titlecase(nz(DS_GRAU_INSTRUCAO)) AS education,
  titlecase(nz(DS_OCUPACAO)) AS occupation,
  titlecase(nz(DS_COR_RACA)) AS race,
  br_date(DT_NASCIMENTO) AS birth_date,
  nz(DS_SIT_TOT_TURNO) AS result,
  try_strptime(DT_GERACAO || ' ' || HH_GERACAO, '%d/%m/%Y %H:%M:%S') AS generated_at
FROM raw_candidatos;

CREATE OR REPLACE TABLE vote_mun AS
SELECT
  CAST(ANO_ELEICAO AS INT) AS year,
  nz(SQ_CANDIDATO) AS candidate_id,
  TRY_CAST(NR_TURNO AS INT) AS turno,
  nz(SG_UF) AS uf,
  TRY_CAST(CD_MUNICIPIO AS INT) AS mun_code,
  nz(NM_MUNICIPIO) AS mun_name,
  sum(TRY_CAST(QT_VOTOS_NOMINAIS AS BIGINT)) AS votes,
  sum(TRY_CAST(QT_VOTOS_NOMINAIS_VALIDOS AS BIGINT)) AS valid_votes
FROM raw_votacao
GROUP BY ALL;

CREATE OR REPLACE TABLE vote_meta AS
SELECT
  CAST(ANO_ELEICAO AS INT) AS year,
  max(try_strptime(DT_GERACAO || ' ' || HH_GERACAO, '%d/%m/%Y %H:%M:%S')) AS generated_at
FROM raw_votacao GROUP BY ALL;

CREATE OR REPLACE TABLE candidate AS
WITH latest AS (
  SELECT * FROM candidate_stage
  QUALIFY row_number() OVER (PARTITION BY year, id ORDER BY turno DESC) = 1
),
votes AS (
  SELECT year, candidate_id,
    sum(votes) FILTER (WHERE turno = 1) AS votes_r1,
    sum(votes) FILTER (WHERE turno = 2) AS votes_r2,
    sum(valid_votes) FILTER (WHERE turno = 1) AS valid_votes_r1,
    sum(valid_votes) FILTER (WHERE turno = 2) AS valid_votes_r2
  FROM vote_mun GROUP BY ALL
)
SELECT
  l.* EXCLUDE (turno, result),
  l.result,
  l.result LIKE 'ELEITO%' AS elected,
  l.office_code IN (2, 4, 9, 10) AS is_running_mate,
  coalesce(v.votes_r1, 0)::BIGINT AS votes_r1,
  v.votes_r2::BIGINT AS votes_r2,
  coalesce(v.valid_votes_r1, 0)::BIGINT AS valid_votes_r1,
  v.valid_votes_r2::BIGINT AS valid_votes_r2,
  -- votes in the last round the candidate took part in
  coalesce(v.votes_r2, v.votes_r1, 0)::BIGINT AS votes,
  CASE WHEN l.birth_date IS NOT NULL THEN date_diff('year', l.birth_date, e.round1) END AS age
FROM latest l
LEFT JOIN votes v ON v.year = l.year AND v.candidate_id = l.id
LEFT JOIN election e ON e.year = l.year;

-- Running mates (vice-president, vice-governor, senate alternates) share the head's number.
CREATE OR REPLACE TABLE running_mate AS
SELECT m.year, h.id AS head_id, m.id AS mate_id, m.office AS mate_office, m.office_code AS mate_office_code
FROM candidate m
JOIN candidate h ON h.year = m.year AND h.ue = m.ue AND h.number = m.number
  AND h.office_code = CASE m.office_code WHEN 2 THEN 1 WHEN 4 THEN 3 WHEN 9 THEN 5 WHEN 10 THEN 5 END
WHERE m.is_running_mate;

CREATE OR REPLACE TABLE asset AS
SELECT
  CAST(ANO_ELEICAO AS INT) AS year,
  nz(SQ_CANDIDATO) AS candidate_id,
  TRY_CAST(NR_ORDEM_BEM_CANDIDATO AS INT) AS ord,
  TRY_CAST(CD_TIPO_BEM_CANDIDATO AS INT) AS type_code,
  nz(DS_TIPO_BEM_CANDIDATO) AS type,
  nz(DS_BEM_CANDIDATO) AS description,
  coalesce(brl(VR_BEM_CANDIDATO), 0) AS value,
  CASE
    WHEN norm(DS_TIPO_BEM_CANDIDATO) SIMILAR TO '.*(veiculo|aeronave|embarcac|automovel|motocicleta).*' THEN 'veiculos'
    WHEN norm(DS_TIPO_BEM_CANDIDATO) SIMILAR TO '.*(quota|quinhao|participac|acoes|acao |capital social).*' THEN 'participacoes'
    WHEN norm(DS_TIPO_BEM_CANDIDATO) SIMILAR TO '.*(apartamento|casa|terreno|predio|imovel|imoveis|sala|loja|galpao|terra nua|construc|benfeitoria|edificac|fazenda|sitio|chacara|rural|urbano|garagem|vaga).*' THEN 'imoveis'
    WHEN norm(DS_TIPO_BEM_CANDIDATO) SIMILAR TO '.*(dinheiro em especie|especie).*' THEN 'dinheiro'
    WHEN norm(DS_TIPO_BEM_CANDIDATO) SIMILAR TO '.*(deposito|conta corrente|poupanca).*' THEN 'depositos'
    WHEN norm(DS_TIPO_BEM_CANDIDATO) SIMILAR TO '.*(aplicac|fundo|titulo|previdencia|vgbl|pgbl|renda fixa|renda variavel|investimento|criptoativo|cripto|ouro|lci|lca|cdb|debenture|tesouro).*' THEN 'investimentos'
    WHEN norm(DS_TIPO_BEM_CANDIDATO) SIMILAR TO '.*(credito|emprestimo|consorcio).*' THEN 'creditos'
    ELSE 'outros'
  END AS category,
  br_date(DT_ULT_ATUAL_BEM_CANDIDATO) AS updated_on
FROM raw_bens;
