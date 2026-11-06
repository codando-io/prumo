# Prumo

Civic-transparency explorer for the campaign-finance open data of the Brazilian
Superior Electoral Court (TSE): candidate, donor, supplier, party, and state
profiles, money flows, a relationship graph, a transaction explorer, and a
change log for the 2026, 2022, and 2018 general elections. What matters most:
every number traceable to its source, CPFs never exposed, and copy that stays
descriptive and politically neutral (`docs/ARCHITECTURE.md`, *Principles*).

This repository uses the engineering harness. Harness configuration, project
overrides, and project memory live in `.engineering/`. Decisions live in the
ADR directory declared in `.engineering/harness.yaml` (`adr_dir`).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Commands

Verified on 2026-11-06 with Node 24.18.0 and npm 11.16.0, on a clone without
`data/prumo.duckdb`. Run from the repository root. Requirements (README): Node
20.9+; `unzip`, `tr`, `iconv`, and Poppler (`pdftotext`, `pdfinfo`) for the
data pipeline.

| Purpose | Command |
|---|---|
| Restore | `npm ci` |
| Type check | `npx --no -- next typegen && npx --no -- tsc --noEmit` (about 5 s; plain `tsc` fails on `PageProps` until `next typegen`, `next dev`, or `next build` writes `.next/types`) |
| Build | `npm run build`: compiles and type-checks, then fails while prerendering when `data/prumo.duckdb` is missing (`ENOENT` from `src/lib/db-core.ts`). Needs the database from `npm run data:update` |
| Fast tests | none: the repository has no unit or component tests |
| Full tests | `npm run test:data` (unverified: needs `data/prumo.duckdb` and `data/staging/` from `npm run data:update`; without them it exits with "database does not exist") |
| Run locally | `npm run dev`, then http://localhost:3000 (unverified: needs the database) |
| Lint / format check | `npm run lint` (ESLint 9 with `eslint-config-next`): 0 errors, 3 warnings on 2026-11-06. No formatter is configured |
| Data pipeline | `npm run data:update` (unverified: downloads about 2.5 GB from the TSE and builds a database of about 3 GB; README says about 5 min). Rebuild from staged CSVs: `npm run data:build` |

`PRUMO_DATA_DIR=/path` keeps the data outside the checkout for both the ETL and
the app, so `next dev` stops reloading while the ETL writes.

## Architecture

- Two halves share one DuckDB file. `etl/` (Node ESM scripts, `.mjs`) builds
  `data/prumo.duckdb`; `src/` (Next.js 16.4 App Router, React 19.3) reads it
  read-only (`access_mode: "READ_ONLY"`); the app never writes to it.
- ETL (`etl/run.mjs`, config and environment variables in `etl/config.mjs`):
  download (skips upstream files whose `Last-Modified` did not change) → stage
  (unzip, strip NUL bytes, Latin-1 to UTF-8) → `etl/sql/NN_*.sql` in order into
  `data/prumo.build.duckdb` → atomic rename to `data/prumo.duckdb` →
  snapshot and diff under `data/snapshots/` → photos. Enrichment fetchers:
  `etl/cnpj.mjs`, `etl/sanctions.mjs`, `etl/pncp.mjs`, `etl/proposals.mjs`.
- App: server components call query modules in `src/lib/queries/<area>.ts`,
  which use `q`/`q1` from `src/lib/db.ts` with positional `?` parameters.
  `src/lib/db-core.ts` keeps a pool of 4 read-only connections and reopens the
  file when its mtime changes, so a new build is picked up without a restart.
  `src/proxy.ts` answers 404 for unknown records before the page renders.
  Route handlers live in `src/app/api/` (search, graph, transactions as JSON or
  CSV, photos, proposals).
- Data stays out of git: `.gitignore` excludes the downloads, staging,
  snapshots, and `data/*.duckdb`; only `data/geo/` is tracked. GeoJSON for the
  maps is committed under `public/geo/`.
- Reference documents: `docs/ARCHITECTURE.md` (schema, keys, URL parameters,
  UI building blocks), `docs/ENRICHMENT.md` (Receita CNPJ, CGU, PNCP),
  `docs/DESIGN.md` (design system). No ADRs yet.

## Conventions

The full list is in `docs/ARCHITECTURE.md`. The ones an agent gets wrong:

- Next.js 16 with `cacheComponents`: `params` and `searchParams` are Promises;
  type pages with the generated `PageProps<"/route">`; database access and
  parameter reads happen inside `<Suspense>`; no `Date.now()`, `new Date()`, or
  `Math.random()` in server components. Read `node_modules/next/dist/docs/`
  before writing Next.js code (block above).
- Every key figure is official (`oficial`), a Prumo calculation (`calculo`), or
  a statistical pattern (`sinal`), wrapped in `<Source>`
  (`src/components/ui/Source.tsx`, helpers in `src/lib/provenance.ts`).
- Copy never says or implies wrongdoing, ranks by merit, or gives a party a
  colour. UI copy is Brazilian Portuguese; code, comments, and docs are English.
- CPFs never appear in URLs or in full: people use hashed keys (`f…`),
  `doc_display` is masked, and the ETL masks CPF-shaped numbers in free text
  (`mask_cpf`). New text columns join the checks in `etl/test/privacy.test.mjs`.
- SQL: cast DECIMAL sums to `::DOUBLE`; ORDER BY fragments come from fixed maps
  (for example `CANDIDATE_ORDERS` in `src/lib/queries/candidates.ts`), never
  from the request.
- Styling: tokens in `src/app/globals.css` with Tailwind 4 utilities; ECharts
  charts always have a list or table twin.

## Reference implementations

Copy these when adding something similar:

- Page with database access under `<Suspense>`: `src/app/partidos/page.tsx`
- Route handler (JSON and a streamed CSV export): `src/app/api/transacoes/route.ts`
- Query module: `src/lib/queries/candidates.ts`
- Data test: `etl/test/privacy.test.mjs`

## Testing

- No unit, component, or end-to-end tests, and no test runner. The three data
  tests are plain Node scripts using `node:assert` against the built database:
  `etl/test/reconcile.test.mjs` (database against the staged TSE CSVs, year by
  year), `etl/test/privacy.test.mjs` (no CPF-shaped number in displayed or
  searched text), `etl/test/snapshot.test.mjs` (change detection, in a temp
  directory).
- Run one with `node etl/test/<name>.test.mjs`; `npm run test:data` runs all
  three. They read `PRUMO_DATA_DIR` like the ETL.
- No CI runs them. The only workflow is `.github/workflows/harness-check.yml`,
  which checks the harness files.

## Observability

None yet: no OpenTelemetry, no `instrumentation.ts`, no structured logging. The
ETL prints progress to stdout. Data freshness is visible in the app
(`/atualizacoes`) and in the `build_info` and `change_log` tables.

## Delivery

| Item | Value |
|---|---|
| CI on every change | missing |
| Hosting / provider | (unknown - ask the team) |
| Environments | (unknown - ask the team) |
| Staging gate | missing |
| Deploy trigger | (unknown - ask the team) |
| Rollback | missing (none documented) |
| Feature flags | missing |
| Database migrations | None: `npm run data:update` rebuilds the database from scratch and swaps the file atomically; the app only reads it |
| Data refresh | `npm run data:update` on a schedule (README: hourly or daily while accounts are open); what runs it is (unknown - ask the team). Keep `data/snapshots/` between runs: it is the change history |

## Security notes

- Public, read-only, unauthenticated app; no accounts. Runtime configuration is
  environment variables only: `PRUMO_DATA_DIR`, `PRUMO_DB`, `PRUMO_YEARS`,
  `PRUMO_SALT`.
- `PRUMO_SALT` salts the SHA-256 that turns a CPF into a person key
  (`etl/sql/01_base.sql`). The default, `prumo-v1` (`etl/config.mjs`), is
  public in this repository and a CPF has about 10^9 possible values, so with
  the default anyone can reverse an `f…` or `p…` key by enumeration. A database
  built for publication must use a secret salt; whether the published build
  does is (unknown - ask the team).
- The CSV export masks CPFs and neutralises spreadsheet formulas in text cells
  (`docs/ARCHITECTURE.md`, *Links between pages*).
- The ETL downloads from government hosts (`CDN` and `photoUrl` in
  `etl/config.mjs`, plus the enrichment fetchers); treat downloaded files as
  untrusted input.
