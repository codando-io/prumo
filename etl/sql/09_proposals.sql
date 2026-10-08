-- Government plans filed with the TSE (President and Governor), extracted by etl/proposals.mjs.
-- The PDFs are the official documents; these tables only hold their text (page by page), the
-- titles Prumo detected in them and the Índice Prumo (keyword hits per topic and page).

CREATE OR REPLACE TABLE proposal_doc AS
SELECT
  year::INT AS year, candidate_id, part::INT AS part, uf, file, original_name,
  pages::INT AS pages, ocr_pages::INT AS ocr_pages, empty_pages::INT AS empty_pages, coalesce(unreadable, false) AS unreadable, bytes::BIGINT AS bytes, sha256,
  source_url, try_strptime(source_modified, '%a, %d %b %Y %H:%M:%S GMT') AS source_modified,
  try_cast(extracted_at AS TIMESTAMP) AS extracted_at
FROM read_json('{{STAGING}}/propostas/docs.ndjson', format = 'newline_delimited', columns = {
  year: 'INT', candidate_id: 'VARCHAR', part: 'INT', uf: 'VARCHAR', file: 'VARCHAR', original_name: 'VARCHAR',
  pages: 'INT', ocr_pages: 'INT', empty_pages: 'INT', unreadable: 'BOOLEAN', bytes: 'BIGINT', sha256: 'VARCHAR',
  source_url: 'VARCHAR', source_modified: 'VARCHAR', extracted_at: 'VARCHAR'
})
ORDER BY year, candidate_id, part;

CREATE OR REPLACE TABLE proposal_page AS
-- CPF-shaped numbers in the reading text are masked like everywhere else in Prumo (some plans
-- carry signers' CPFs); the PDF itself is served unchanged.
SELECT year, candidate_id, part, page, mask_cpf(text) AS text, ocr,
  lower(strip_accents(mask_cpf(text))) AS norm,
  length(regexp_replace(text, '\s', '', 'g'))::INT AS n_chars
FROM read_json('{{STAGING}}/propostas/pages.ndjson', format = 'newline_delimited', columns = {
  year: 'INT', candidate_id: 'VARCHAR', part: 'INT', page: 'INT', text: 'VARCHAR', ocr: 'BOOLEAN'
})
ORDER BY year, candidate_id, part, page;

CREATE OR REPLACE TABLE proposal_heading AS
SELECT year, candidate_id, part, ord, page, level, mask_cpf(text) AS text FROM read_json('{{STAGING}}/propostas/headings.ndjson', format = 'newline_delimited', columns = {
  year: 'INT', candidate_id: 'VARCHAR', part: 'INT', ord: 'INT', page: 'INT', level: 'INT', text: 'VARCHAR'
})
ORDER BY year, candidate_id, part, ord;

CREATE OR REPLACE TABLE proposal_topic AS
SELECT * FROM read_json('{{STAGING}}/propostas/topics.ndjson', format = 'newline_delimited', columns = {
  year: 'INT', candidate_id: 'VARCHAR', part: 'INT', page: 'INT', topic: 'VARCHAR', hits: 'INT'
})
ORDER BY year, candidate_id, part, page;
