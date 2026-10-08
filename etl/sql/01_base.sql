-- Shared macros and raw views over the staged (UTF-8) TSE CSVs.
-- Every raw column is read as VARCHAR; typing happens in the model tables.

-- TSE uses several sentinels for "no value".
CREATE OR REPLACE MACRO nz(x) AS
  CASE WHEN trim(x) IN ('', '#NULO', '#NULO#', '#NE', '#NE#', '-1', '-3', '-4', 'NÃO DIVULGÁVEL') THEN NULL ELSE trim(x) END;

-- Brazilian decimal "1234,56" -> DECIMAL.
CREATE OR REPLACE MACRO brl(x) AS TRY_CAST(replace(nz(x), ',', '.') AS DECIMAL(18, 2));

CREATE OR REPLACE MACRO br_date(x) AS TRY_CAST(try_strptime(nz(x), '%d/%m/%Y') AS DATE);

CREATE OR REPLACE MACRO digits(x) AS nullif(regexp_replace(coalesce(nz(x), ''), '[^0-9]', '', 'g'), '');

-- Title-case helper for upper-case TSE labels ("DEPUTADO FEDERAL" -> "Deputado Federal").
CREATE OR REPLACE MACRO titlecase(x) AS
  array_to_string(list_transform(string_split(lower(x), ' '),
    w -> CASE WHEN w IN ('de', 'da', 'do', 'das', 'dos', 'e') THEN w ELSE upper(w[1]) || w[2:] END), ' ');

-- CPF-shaped numbers typed into free text (sole-trader company names end with the owner's CPF,
-- document numbers and descriptions often carry one) are masked like doc_display:
-- 12345678901 / 123.456.789-01 -> ***.456.789-**. Eleven-digit runs only; CNPJs (14 digits) and
-- longer identifiers are left intact. Phone numbers that look like CPFs are masked too.
-- Applied twice: a match consumes its trailing boundary, so back-to-back numbers need a second pass.
CREATE OR REPLACE MACRO mask_cpf_once(x) AS
  regexp_replace(x, '(^|[^0-9])[0-9]{3}\.?([0-9]{3})\.?([0-9]{3})-?[0-9]{2}([^0-9]|$)', '\1***.\2.\3-**\4', 'g');
CREATE OR REPLACE MACRO mask_cpf(x) AS mask_cpf_once(mask_cpf_once(x));

-- Accent-insensitive normalisation used by search.
CREATE OR REPLACE MACRO norm(x) AS lower(strip_accents(coalesce(x, '')));

-- Counterparty identity. CNPJs (companies, party bodies, campaign accounts) are public
-- business identifiers and are used as-is; CPFs are hashed so they never appear in URLs.
CREATE OR REPLACE MACRO party_key(doc, name) AS
  CASE
    WHEN length(doc) = 14 THEN 'j' || doc
    WHEN length(doc) BETWEEN 9 AND 11 THEN 'f' || substr(sha256(lpad(doc, 11, '0') || '{{SALT}}'), 1, 16)
    WHEN name IS NOT NULL THEN 'x' || substr(md5(upper(name)), 1, 16)
    ELSE NULL
  END;

CREATE OR REPLACE MACRO doc_display(doc) AS
  CASE
    WHEN length(doc) = 14 THEN substr(doc, 1, 2) || '.' || substr(doc, 3, 3) || '.' || substr(doc, 6, 3) || '/' || substr(doc, 9, 4) || '-' || substr(doc, 13, 2)
    WHEN length(doc) BETWEEN 9 AND 11 THEN '***.' || substr(lpad(doc, 11, '0'), 4, 3) || '.' || substr(lpad(doc, 11, '0'), 7, 3) || '-**'
    ELSE NULL
  END;

CREATE OR REPLACE MACRO person_key(cpf) AS
  CASE WHEN length(digits(cpf)) BETWEEN 9 AND 11 THEN 'p' || substr(sha256(lpad(digits(cpf), 11, '0') || '{{SALT}}'), 1, 16) END;

CREATE OR REPLACE VIEW raw_candidatos AS
  SELECT * FROM read_csv('{{STAGING}}/*/candidatos.csv', delim = ';', header = true, all_varchar = true, union_by_name = true, max_line_size = 10000000);
CREATE OR REPLACE VIEW raw_bens AS
  SELECT * FROM read_csv('{{STAGING}}/*/bens.csv', delim = ';', header = true, all_varchar = true, union_by_name = true, max_line_size = 10000000);
CREATE OR REPLACE VIEW raw_receitas AS
  SELECT * FROM read_csv('{{STAGING}}/*/receitas.csv', delim = ';', header = true, all_varchar = true, union_by_name = true, max_line_size = 10000000);
CREATE OR REPLACE VIEW raw_receitas_originario AS
  SELECT * FROM read_csv('{{STAGING}}/*/receitas_originario.csv', delim = ';', header = true, all_varchar = true, union_by_name = true, max_line_size = 10000000);
CREATE OR REPLACE VIEW raw_despesas_contratadas AS
  SELECT * FROM read_csv('{{STAGING}}/*/despesas_contratadas.csv', delim = ';', header = true, all_varchar = true, union_by_name = true, max_line_size = 10000000);
CREATE OR REPLACE VIEW raw_despesas_pagas AS
  SELECT * FROM read_csv('{{STAGING}}/*/despesas_pagas.csv', delim = ';', header = true, all_varchar = true, union_by_name = true, max_line_size = 10000000);
CREATE OR REPLACE VIEW raw_votacao AS
  SELECT * FROM read_csv('{{STAGING}}/*/votacao.csv', delim = ';', header = true, all_varchar = true, union_by_name = true, max_line_size = 10000000);
