-- TSE municipality codes differ from IBGE's. Cross-walk by accent-insensitive name within
-- each state; leftovers (spelling variants such as MOJI/MOGI) take the closest name by
-- Jaro-Winkler similarity in the same state.

CREATE OR REPLACE TABLE ibge_mun AS
SELECT uf, CAST(ibge_code AS INT) AS ibge_code, name,
  trim(regexp_replace(regexp_replace(norm(name), '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')) AS nname
FROM read_csv('{{DATA}}/geo/ibge_municipios.csv', header = true, all_varchar = true);

CREATE OR REPLACE TABLE mun_xwalk AS
WITH tse AS (
  SELECT uf, mun_code AS tse_code, any_value(mun_name) AS tse_name,
    trim(regexp_replace(regexp_replace(norm(any_value(mun_name)), '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')) AS nname
  FROM vote_mun WHERE uf <> 'ZZ' AND mun_code IS NOT NULL GROUP BY uf, mun_code
),
exact AS (
  SELECT t.uf, t.tse_code, t.tse_name, i.ibge_code, i.name AS ibge_name, 'nome' AS method
  FROM tse t JOIN ibge_mun i ON i.uf = t.uf AND i.nname = t.nname
),
rest AS (
  SELECT t.* FROM tse t ANTI JOIN exact e ON e.uf = t.uf AND e.tse_code = t.tse_code
),
fuzzy AS (
  SELECT r.uf, r.tse_code, r.tse_name, i.ibge_code, i.name AS ibge_name, 'aproximado' AS method,
    jaro_winkler_similarity(r.nname, i.nname) AS sim
  FROM rest r JOIN ibge_mun i ON i.uf = r.uf
  ANTI JOIN exact e ON e.uf = i.uf AND e.ibge_code = i.ibge_code
  QUALIFY row_number() OVER (PARTITION BY r.uf, r.tse_code ORDER BY sim DESC) = 1
)
SELECT uf, tse_code, tse_name, ibge_code, ibge_name, method FROM exact
UNION ALL
SELECT uf, tse_code, tse_name, ibge_code, ibge_name, method FROM fuzzy WHERE sim >= 0.85;

-- Renamed municipalities whose old and new names don't match by spelling.
INSERT INTO mun_xwalk
SELECT o.uf, t.mun_code, t.mun_name, i.ibge_code, i.name, 'renomeado'
FROM (VALUES ('RN', 'boa saude', 'januario cicco'), ('TO', 'tabocao', 'tabocao'), ('TO', 'fortaleza do tabocao', 'tabocao')) o(uf, tse_nname, ibge_nname)
JOIN (SELECT uf, mun_code, any_value(mun_name) AS mun_name FROM vote_mun WHERE mun_code IS NOT NULL GROUP BY uf, mun_code) t
  ON t.uf = o.uf AND trim(regexp_replace(regexp_replace(norm(t.mun_name), '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')) = o.tse_nname
JOIN ibge_mun i ON i.uf = o.uf AND i.nname = o.ibge_nname
ANTI JOIN mun_xwalk x ON x.uf = t.uf AND x.tse_code = t.mun_code;
