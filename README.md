# Prumo

De onde veio e para onde foi o dinheiro das campanhas eleitorais no Brasil.

Prumo is a civic-transparency explorer for the campaign-finance data published by the Brazilian
Superior Electoral Court (TSE). It turns the raw open-data files into candidate profiles, money
flows, donor and supplier explorers, a relationship graph, party and state views, a transaction
explorer and a change log — while keeping every number traceable to its source and keeping
analysis descriptive and politically neutral.

Elections covered: the general elections of **2026** (accounts still being filed — the app shows
when the data was published and what changed), **2022** and **2018**.

## Quick start

Requirements: Node 20.9+, the standard `unzip`, `tr` and `iconv` command-line tools, and Poppler
(`pdftotext`, `pdfinfo`) for government plans. Optional: `tesseract` + `pdftoppm` to read scanned
plans (`--ocr`; the Portuguese model is downloaded on first use).

```bash
npm install
npm run data:update   # downloads ~2.5 GB from the TSE, builds data/prumo.duckdb (~3 GB), ~5 min
npm run dev           # http://localhost:3000
```

`npm run data:update` also refreshes the enrichment sources (government plans, Receita CNPJ,
CGU sanction lists, the last days of PNCP contracts); skip any with `--no-proposals`, `--no-cnpj`,
`--no-sanctions`, `--no-pncp`. See `docs/ENRICHMENT.md` for sources, identity rules and tables.

`npm run data:update` is incremental: it checks each upstream file's `Last-Modified` and only
downloads and rebuilds when the TSE has published something new. Run it on a schedule (e.g. hourly
or daily while an election's accounts are open). Each run that sees a new TSE publication stores a
snapshot under `data/snapshots/` and diffs it against the previous one, so added, changed and
removed transactions show up on `/atualizacoes` and on each candidate page. Keep `data/snapshots/`
between runs — it is the change history.

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run data:build` | Rebuild the database from already-staged CSVs |
| `node etl/proposals.mjs [--ocr]` | Government plans (TSE): download PDFs, extract text page by page, Índice Prumo |
| `node etl/cnpj.mjs` | Receita Federal CNPJ register (monthly, ~7.8 GB download), filtered to companies in TSE records |
| `node etl/sanctions.mjs` | CGU lists: CEIS, CNEP, CEPIM, acordos de leniência (companies only) |
| `node etl/pncp.mjs --days 7` | PNCP public contracts: local copy, ~1 request / 3 s. First run: `--from 2021-06-01` (~9 h, resumable) |
| `npm run data:photos` | Download/refresh official candidate photos |
| `node etl/geo.mjs` | Refresh IBGE state/municipality boundaries |
| `npm run test:data` | Reconcile the database with the raw TSE files, check no CPF leaks into displayed text, test change detection |

Tip: the dev server watches the whole project folder, so it keeps reloading while the ETL writes
into `./data` (large downloads, the PNCP copy). Keep the data elsewhere with
`PRUMO_DATA_DIR=/path/to/prumo-data` (for both the ETL and `npm run dev`), or use `npm run build &&
npm start` while a long download runs.

Environment variables: `PRUMO_DATA_DIR` (default `./data`), `PRUMO_DB` (path to the database the
app reads), `PRUMO_YEARS` (default `2026,2022,2018`), `PRUMO_SALT` (salt for hashing CPFs into
person keys).

## What's inside

- `etl/` — download → stage (Latin-1 → UTF-8) → SQL model (`etl/sql/*.sql`, DuckDB) → signals →
  search index → snapshot/diff → atomic swap of `data/prumo.duckdb`.
- `src/` — Next.js 16 App Router app. Server components query DuckDB directly (read-only);
  charts use ECharts; UI copy is Brazilian Portuguese.
- `docs/ARCHITECTURE.md` — schema, conventions, design system and principles.
- `docs/ENRICHMENT.md` — company enrichment (Receita, CGU, PNCP): sources, identity rules, tables.
- `docs/DESIGN.md` — the editorial design system.

## Principles

1. Official data, Prumo's calculations and statistical patterns are always labelled apart.
2. Patterns ("Padrões para explorar") are descriptive; nothing is presented as evidence of
   wrongdoing.
3. No fabrication: missing data is shown as missing.
4. CPFs are never shown in full or used in URLs.
5. Every important number links to its source file and, for candidates, to DivulgaCandContas.

Prumo is independent and has no affiliation with the TSE, parties or candidates.
