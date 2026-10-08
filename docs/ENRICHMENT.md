# Prumo — public-data enrichment (companies, sanctions, public contracts)

Prumo starts from the TSE's campaign-finance records. Companies that appear there (as suppliers,
donors, party bodies or campaign accounts) are enriched with other **official** open data, always
keyed by CNPJ and always with provenance (source, file/endpoint, publication date, retrieval date).

## Principles (binding)

1. **Identity before names.** Companies are identified by CNPJ (14 digits; `cnpj_basico` = first 8
   digits = the legal entity). Never join records by name alone.
2. **Confirmed vs possible.** A relationship is *confirmed* when both sides share an official
   identifier (CNPJ, TSE SQ_CANDIDATO, PNCP control number). A *possible match* is anything weaker
   (e.g. partner name + the 6 visible CPF digits equal to a TSE person). Possible matches are stored
   with `confidence = 'possivel'` and an explanation, and are always shown with a different visual
   treatment and the label "Possível correspondência".
3. **Independent facts.** Electoral payments, public contracts and sanction records are separate
   documented facts. The UI never connects them causally and never uses words like fraude,
   corrupção, laranja, suspeito, irregular. Sanction records are shown with source, authority,
   dates, type and status exactly as published.
4. **Privacy.** CPFs are never shown unmasked or put in URLs. Receita publishes partner CPFs
   already masked (`***123456**`); CGU publishes some individuals' CPFs unmasked — Prumo keeps only
   companies (`TIPO DE PESSOA = 'J'`) from sanction lists. Phone numbers, e-mails and street
   addresses from the CNPJ files are not loaded.
5. **Provenance per dataset.** Every enrichment table has a `source_*` column set or a row in
   `enrich_source` with: dataset name, URL, upstream publication date (Last-Modified / folder
   month / file date), and `retrieved_at`.

## Sources (verified 2026-10-08)

| Source | Access | Cadence | Use |
|---|---|---|---|
| Receita Federal — Dados Abertos CNPJ | Nextcloud public WebDAV: `PROPFIND https://arquivos.receitafederal.gov.br/public.php/dav/files/YggdBLfdninEJX9/` lists month folders (`2023-05/` … `2026-09/`); files at `…/YggdBLfdninEJX9/<YYYY-MM>/<File>.zip` (GET/HEAD/Range OK). ~7.8 GB per month. | monthly | company register, establishments, partners (QSA), Simples |
| CGU — CEIS, CNEP, CEPIM, Acordos de Leniência | `https://portaldatransparencia.gov.br/download-de-dados/{ceis\|cnep\|cepim\|acordos-leniencia}/{YYYYMMDD}` → 302 to `dadosabertos-download.cgu.gov.br/.../{date}_{CEIS\|CNEP\|CEPIM\|AcordosLeniencia}.zip`. Latest date: regex `arquivos.push({"ano" : "2026", "mes" : "10", "dia" : "07"` on `…/download-de-dados/{ds}`. Only the latest date exists. | daily | sanction and impediment registries |
| PNCP — consulta API | `GET https://pncp.gov.br/api/consulta/v1/contratos?dataInicial=YYYYMMDD&dataFinal=YYYYMMDD&pagina=N&tamanhoPagina=500` (1-day windows); incremental: `/v1/contratos/atualizacao` (same params). No supplier filter → local copy, joined on `niFornecedor`. Rate limit: ~1 request / 3 s; back off on 429. ~4.7M contracts since 2021. | daily | public contracts (all spheres) |

Formats: Receita CSVs are Latin-1, `;`, quoted, no header, dates `YYYYMMDD` (`0`/`00000000` =
empty), decimal comma; municipality codes are RFB/SIAFI codes (not IBGE). Since 2026-08, PJ
partners carry only the 8-digit `cnpj_basico`. CGU CSVs are CP1252, `;`, header row, CRLF, dates
`DD/MM/YYYY`. Column layouts: `/tmp/claude-1000/prumo-probe/research/` (samples, metadata PDF).

## Scope

`tse_cnpj` = every `entity.key` starting with `j` (14 digits after the `j`), i.e. every CNPJ that
appears in TSE records. Enrichment loads:

- companies (`rf_company`) and establishments (`rf_establishment`) for every `cnpj_basico` in
  `tse_cnpj` (all its establishments are NOT needed: load the establishments whose CNPJ is in
  `tse_cnpj` plus the head office — `matriz_filial = 1` — of each company);
- partners (`rf_partner`) of those companies;
- **other companies of the same partners**: for each partner identity found above, the other
  companies where it appears (`rf_partner` rows of those companies too), plus their `rf_company`
  row and head office `rf_establishment`, flagged `in_tse = false`;
- `rf_simples` for every company loaded.

## Tables (built into `data/prumo.duckdb` by `etl/sql/10_cnpj.sql`, `11_sanctions.sql`, `12_contracts.sql`)

Staging (written by the fetchers, read by the SQL) lives in `data/staging/cnpj/`,
`data/staging/sancoes/`, `data/staging/pncp/` as Parquet. The build must succeed when a staging
file is missing (empty tables), like `etl/proposals.mjs → ensureProposalStaging()`.

```sql
rf_company (
  cnpj_basico VARCHAR PRIMARY KEY,     -- 8 digits
  razao_social VARCHAR,
  natureza_code VARCHAR, natureza VARCHAR,          -- description from Naturezas
  qualificacao_responsavel VARCHAR,                 -- description
  capital_social DOUBLE,
  porte_code VARCHAR, porte VARCHAR,                -- 'Microempresa' | 'Empresa de pequeno porte' | 'Demais' | 'Não informado'
  ente_federativo VARCHAR,
  in_tse BOOLEAN,                                   -- false = loaded only as "other company of a partner"
  source_month VARCHAR                              -- e.g. '2026-09'
)
rf_establishment (
  cnpj VARCHAR PRIMARY KEY,            -- 14 digits
  cnpj_basico VARCHAR,
  matriz BOOLEAN,
  nome_fantasia VARCHAR,
  situacao_code VARCHAR, situacao VARCHAR,          -- 'Nula' | 'Ativa' | 'Suspensa' | 'Inapta' | 'Baixada'
  data_situacao DATE, motivo_situacao VARCHAR,      -- description from Motivos
  data_inicio DATE,
  cnae_principal VARCHAR, cnae_principal_desc VARCHAR,
  cnaes_secundarias VARCHAR[],                      -- codes
  uf VARCHAR, municipio_code VARCHAR, municipio VARCHAR,   -- RFB code + name from Municipios
  ibge_code INTEGER,                                -- best-effort crosswalk by UF + normalised name; NULL if unsure
  situacao_especial VARCHAR, data_situacao_especial DATE,
  source_month VARCHAR
)
rf_cnae (code VARCHAR PRIMARY KEY, description VARCHAR)
rf_simples (cnpj_basico VARCHAR PRIMARY KEY, opcao_simples BOOLEAN, data_opcao_simples DATE, data_exclusao_simples DATE,
            opcao_mei BOOLEAN, data_opcao_mei DATE, data_exclusao_mei DATE, source_month VARCHAR)
rf_partner (
  cnpj_basico VARCHAR,                 -- the company
  partner_key VARCHAR,                 -- 'j' || cnpj_basico for PJ partners; 's' || md5(norm_name || '|' || masked)[1:16] for PF; 'x' || md5(name)[1:16] for foreign
  partner_type VARCHAR,                -- 'PJ' | 'PF' | 'Estrangeiro'
  name VARCHAR,
  doc_masked VARCHAR,                  -- as published: '***123456**' (PF) or cnpj_basico/CNPJ (PJ)
  partner_cnpj_basico VARCHAR,         -- PJ only
  qualificacao_code VARCHAR, qualificacao VARCHAR,
  data_entrada DATE,
  faixa_etaria VARCHAR,                -- description ('31 a 40 anos'…), PF only
  pais VARCHAR,
  source_month VARCHAR
)
person_match (                          -- POSSIBLE matches between a Receita partner and a TSE person
  partner_key VARCHAR,
  tse_kind VARCHAR,                    -- 'candidato' | 'doador' | 'fornecedor'
  tse_key VARCHAR,                     -- candidato: person_id (hash used by candidate_summary.person_id); doador/fornecedor: entity.key ('f…')
  confidence VARCHAR,                  -- always 'possivel'
  basis VARCHAR                        -- e.g. 'Nome igual e os 6 dígitos visíveis do CPF coincidem'
)
sanction (
  source VARCHAR,                      -- 'CEIS' | 'CNEP' | 'CEPIM' | 'Acordo de leniência'
  record_id VARCHAR,
  cnpj VARCHAR, cnpj_basico VARCHAR,
  name VARCHAR,                        -- as published by the sanctioning body
  category VARCHAR,                    -- CATEGORIA DA SANÇÃO / MOTIVO DO IMPEDIMENTO / SITUAÇÃO do acordo
  start_date DATE, end_date DATE, publication_date DATE, transit_date DATE,
  process_number VARCHAR,
  authority VARCHAR, authority_uf VARCHAR, authority_sphere VARCHAR,
  legal_basis VARCHAR, scope VARCHAR, fine_value DOUBLE, details VARCHAR,
  status VARCHAR,                      -- 'Em vigor' | 'Encerrada' | 'Sem data final' — computed against the file date, never "today"
  file_date DATE, source_url VARCHAR, retrieved_at TIMESTAMP
)
public_contract (                       -- only contracts whose supplier cnpj_basico is in rf_company
  pncp_id VARCHAR PRIMARY KEY,         -- numeroControlePNCP
  supplier_cnpj VARCHAR, supplier_cnpj_basico VARCHAR, supplier_name VARCHAR,
  orgao_cnpj VARCHAR, orgao_nome VARCHAR, esfera VARCHAR, poder VARCHAR,
  unidade_nome VARCHAR, uf VARCHAR, municipio VARCHAR, ibge_code INTEGER,
  numero_contrato VARCHAR, ano INTEGER, sequencial INTEGER, processo VARCHAR,
  objeto VARCHAR, tipo_contrato VARCHAR, categoria_processo VARCHAR,
  valor_inicial DOUBLE, valor_global DOUBLE,
  data_assinatura DATE, data_vigencia_inicio DATE, data_vigencia_fim DATE,
  data_publicacao TIMESTAMP, data_atualizacao TIMESTAMP,
  url VARCHAR,                         -- https://pncp.gov.br/app/contratos/{orgao_cnpj}/{ano}/{sequencial}
  retrieved_at TIMESTAMP
)
enrich_source (                         -- one row per dataset actually loaded
  dataset VARCHAR,                     -- 'rf_cnpj' | 'ceis' | 'cnep' | 'cepim' | 'leniencia' | 'pncp_contratos'
  label VARCHAR, url VARCHAR,
  published VARCHAR,                   -- month folder / file date / covered date range
  coverage_from DATE, coverage_to DATE,
  retrieved_at TIMESTAMP, rows BIGINT
)
```

## Fetchers

- `etl/cnpj.mjs` — PROPFIND latest month; download with the manifest (`etl/download.mjs`);
  stream each zip (`unzip -p | iconv -f latin1 -t utf8`) into DuckDB and keep only rows in scope;
  write Parquet to `data/staging/cnpj/`. Never extract whole files to disk.
- `etl/sanctions.mjs` — latest date per dataset; download; companies only; Parquet.
- `etl/pncp.mjs` — local copy of PNCP contracts in `data/pncp/` (one gzipped NDJSON per day,
  compact fields only), resumable, newest days first, ~1 request / 3 s with backoff; `--days N`,
  `--from/--to`, and `--incremental` (uses `/v1/contratos/atualizacao` for the last days). Then
  writes `data/staging/pncp/contracts.parquet` filtered to companies in `rf_company`.
- `etl/run.mjs` runs them (each can be skipped with a flag) before `build`.
