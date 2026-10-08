# Prumo — architecture and conventions

Prumo turns the TSE's open campaign-finance data into an explorable, citizen-facing product.
This document is the reference for anyone (human or agent) adding pages or data.

## Principles (non-negotiable)

1. **Official vs calculated vs signal.** Every important number is one of: an official TSE value
   (or a plain sum/count of official records) → `kind: "oficial"`; a calculation by Prumo
   (share, median, per-vote, percentile) → `kind: "calculo"`; a statistical pattern → `kind: "sinal"`.
   Wrap key figures in `<Source info={...}>` (see `src/components/ui/Source.tsx`, helpers in
   `src/lib/provenance.ts`) so users can answer "where did this number come from?".
2. **Never accuse.** Signals describe measurable patterns; copy never says or implies fraud,
   corruption, illegality or wrongdoing. Comparisons are descriptive — no "best/worst", no scores,
   no rankings framed as merit. Parties never get a colour.
3. **Never fabricate.** Show only what the data says. Empty states explain what's missing.
4. **Privacy.** CPFs never appear in URLs or in full: natural persons use a hashed key (`f…`) and
   `doc_display` is masked (`***.123.456-**`). CNPJs (companies/party bodies) are public and shown.
   CPF-shaped numbers inside free text (sole-trader company names, document numbers, descriptions)
   are masked by the ETL (`mask_cpf`); `etl/test/privacy.test.mjs` enforces it.
5. **Traceability.** Every analytical view links to the underlying transactions
   (`/transacoes?...`) and, for candidates, to DivulgaCandContas (`tseCandidateUrl`).

## Data pipeline (`etl/`)

`npm run data:update` = download (skips unchanged upstream files) → stage (unzip, strip NUL bytes,
Latin-1→UTF-8) → geo (IBGE meshes) → build (`etl/sql/*.sql` in order, into
`data/prumo.build.duckdb`, then atomic rename to `data/prumo.duckdb`) → snapshot/diff → photos.
The running app notices the new file (mtime) and reopens it.

Elections covered: general elections 2026 (current, still being updated by the TSE), 2022, 2018.

## Database (`data/prumo.duckdb`, read-only from the app)

Keys: a candidacy is `(year, id)` where `id` = TSE `SQ_CANDIDATO` (string). A person across
elections is `person_id` (hash of CPF). A counterparty (donor/supplier) is `key`:
`j<CNPJ>` for companies/party bodies/campaign accounts, `f<hash>` for natural persons,
`x<hash>` for records without a document.

Fact tables (one row per line item; a transaction = distinct `sq`):
- `revenue` — receitas. `category` ∈ fefc, fp, pf, partido, proprios, coletivo, candidatos,
  nao_identificada, outros; `is_public` (fefc/fp); `fund` FEFC/FP/OUTROS; `nature` FINANCEIRO/ESTIMAVEL;
  `donor_key`, `donor_type` ∈ pf, pj, partido, candidato, proprio, plataforma, desconhecido.
- `revenue_origin` — "doador originário": individuals behind party transfers/crowdfunding (`key`, `via_key`).
- `expense` — despesas contratadas. `category` = official TSE category; `category_group` ∈ impressos,
  digital, audiovisual, pessoal, servicos, transporte, estrutura, eventos, transferencias, outros;
  `supplier_key`, `supplier_type` pf/pj.
- `payment` — despesas pagas, linked to expense by `(year, sq)`; `fund` tells which account paid.
- `asset` — bens declarados (`category` ∈ imoveis, veiculos, participacoes, investimentos, depositos,
  dinheiro, creditos, outros).
- `vote_mun` — votes per candidacy × round × municipality (TSE municipality code); `mun_xwalk` maps
  TSE codes to IBGE codes (`public/geo/mun/<UF>.json` features carry `properties.ibge`).

Dimensions / aggregates:
- `election(year, label, round1, round2, portal_id)`
- `candidate` and **`candidate_summary`** (candidate + every per-campaign metric; use this one).
  Running mates (`is_running_mate`) have no finances of their own — see `running_mate`.
- `candidate_peer` (percentiles within year × office), `peer_median` (per office, national and per UF).
- `entity(key, kind, doc_display, name, uf, city, cnae, party, campaign_candidate_id, person_id)`;
  `kind` ∈ pf, pj, partido, campanha, plataforma, desconhecido.
- `entity_year` / `entity_total` — donor and supplier role statistics.
- `rel_donation(year, key, candidate_id, donor_type, value, public_value, financial_value, n, …)`,
  `rel_supply(year, key, candidate_id, value, n, main_group, main_category, …)`,
  `rel_origin(year, key, candidate_id, via_key, …)` — the relationship graph edges.
- `rev_cube`, `exp_cube` (year × uf × office_code × party × category), `rev_daily`, `exp_daily`.
- `party_distribution` (Gini / top-10% share of public funds among a party's candidates).
- `signal` (+ `signal_count`) — see `etl/sql/06_signals.sql` and `src/lib/signals.ts`.
- `search_index`, `filing`, `capture`, `change_log`, `campaign_change`, `source_file`, `build_info`.

Run ad-hoc SQL with the DuckDB CLI or `node -e` + `@duckdb/node-api` (open read-only).

## App (`src/`)

Next.js 16.4 App Router with `cacheComponents` and `partialPrefetching` enabled. Rules:
- `params` / `searchParams` are **Promises**. Type pages with the global `PageProps<'/route/[x]'>`.
- Any DB access (and reading params/searchParams) must happen **inside a `<Suspense>` boundary**:
  the exported page component renders static chrome + `<Suspense fallback=…><AsyncPart params={params} searchParams={searchParams}/></Suspense>`.
- Never call `Date.now()`/`new Date()`/`Math.random()` in server components (prerender error).
- Client components using `useSearchParams`/`usePathname` must sit under `<Suspense>`.
- Route handlers: `export async function GET(req: NextRequest, ctx: RouteContext<'/api/x/[y]'>)`.
- DB: `import { q, q1 } from "@/lib/db"` — positional `?` params, returns plain JS objects
  (BIGINT→number, DATE→"YYYY-MM-DD", TIMESTAMP→ISO). Cast DECIMAL sums to `::DOUBLE` in SQL.
  Query modules live in `src/lib/queries/<area>.ts` and start with `import "server-only"`.
- Year: `?ano=2022` (default 2026). Use `parseYear()` from `@/lib/labels`.

UI building blocks:
- `@/components/ui/primitives`: `Container`, `Breadcrumbs`, `SectionHeader`, `Stat`, `ResultChip`, `Empty`, `Note`.
- `@/components/ui/Photo` (client), `@/components/ui/Source` (`Source`, `KindTag`, `SourceInfo`).
- `@/components/charts/BarList` (`BarList`, `StackBar`) — ranked bars as an accessible list.
- `@/components/charts/Ledger` — money in ← plumb line → money out.
- `@/components/charts/EChart` — `EChart`, `useTokens`, `baseTooltip` for ECharts client charts.
  Existing: `DailyChart`, `FlowChart` (Sankey), `PeerScatter`.
- Maps: `BrazilMap` (`data: {uf, value, note?}[]`, `format: brl|num|pct|brlUnit`, `label`,
  `hrefTemplate: "/estados/{uf}?ano=…"`) and `MunicipalityMap` (`uf`, `data: {ibge, value, name, tse?}[]`,
  `hrefTemplate` with `{tse}`/`{ibge}`, `highlight`). Single-hue sequential ramp, legend, tooltip
  without rank. GeoJSON comes from `public/geo/` (`etl/geo.mjs`); helpers in `src/components/geo/mapUtils.ts`
  (ECharts matches regions by *string* name and needs `preserveAspect`).
- Formatting `@/lib/format`: `brl`, `brl0`, `brlc` (compact "R$ 4,9 mi"), `num`, `numc`, `pct`,
  `brlUnit`, `date`, `dateLong`, `dateTime`, `plural`, `others`, `titleName` (proper-case TSE names).
- Vocabulary `@/lib/labels`: `FUNDING_GROUPS`, `REVENUE_CATEGORY`, `EXPENSE_GROUPS`, `DONOR_TYPE`,
  `ENTITY_KIND`, `OFFICES`, `UF_NAMES`, `FILING_TYPE`, `ASSET_CATEGORY`, `tseCandidateUrl`, `cdnFile`.

Design system (see `src/app/globals.css`):
- Tokens: `--page`, `--surface`, `--surface-2`, `--ink`, `--ink-2`, `--muted`, `--rule`, `--axis`,
  `--brass` (plumb line only), `--spend` (all spending bars), `--fund-*` (funding categories, fixed
  mapping). Tailwind colour utilities exist for these (`text-ink-2`, `bg-surface`, `border-rule`, …).
- Typeface Archivo (variable). Class `wide` = expanded width for names and headline figures;
  `tnum` for numeric columns. Sentence case; no all-caps labels, no eyebrow labels above headings,
  no "→" appended to links, avoid "A · B · C" meta strings in page copy.
- Sections are separated by hairlines (`.section`), not wrapped in identical cards; `.panel` is for
  interactive widgets (charts, signal cards). Max content width 1240px, left-aligned.
- Charts: one measure per chart (never dual axes), thin marks, recessive grid, values in ink
  (never in the series colour), a list/table twin for every chart, hover tooltips on ECharts.
- UI copy is Brazilian Portuguese, plain and neutral.

Conventions worth knowing:
- Votes = nominal votes in the last round the candidacy took part in. Party-level vote totals use
  federal-deputy votes only (summing offices would count each voter several times).
- State "per vote" = all campaign expenses in the state ÷ valid 1st-round votes for governor.
- Unknown keys call `notFound()` inside Suspense, which renders the not-found UI with `noindex` but
  HTTP 200 (streaming has already started). A real 404 would need a check in `src/proxy.ts`.
- A few 2018 running mates filed accounts of their own; candidate pages show finances whenever
  `has_finance` is true.

Links between pages:
- candidate `/candidatos/{year}/{id}`; donor `/doadores/{key}?ano=`; supplier `/fornecedores/{key}?ano=`;
  party `/partidos/{sigla}?ano=`; state `/estados/{UF}?ano=`; municipality `/estados/{UF}/{tseMunCode}?ano=`;
  graph `/conexoes?no=c:{year}:{id}` or `/conexoes?no=e:{key}&ano=`; comparison `/comparar?c={year}-{id},{year}-{id}`.
- Transactions explorer `/transacoes` query params: `ano`, `tipo` (receita|despesa), `candidato`,
  `contraparte` (entity key), `categoria` (revenue category key), `grupo` (funding group or expense
  group key), `categoria_tse` (official expense category text), `partido`, `uf`, `cargo` (office code),
  `de`/`ate` (YYYY-MM-DD), `min`/`max` (R$), `sq`, `q` (text), `ordem` (valor_desc|valor_asc|data_desc|data_asc), `pagina`.
- `/api/transacoes` takes the same params plus `formato=json|csv`. CSV: UTF-8 with BOM, `;`
  separator, decimal comma, ISO dates, at most 200,000 rows (headers `x-prumo-linhas`,
  `x-prumo-total`, `x-prumo-truncado`), CPFs masked, formula-injection-safe text cells.
- Donor and supplier lists: `/doadores` and `/fornecedores` accept `ano`, `tipo` (entity kind:
  pf, pj, partido, plataforma, campanha), `uf` (state of the candidacies supported/served; `BR` =
  presidential), `partido`, `grupo` (suppliers only: spending group), `q` (name or CNPJ),
  `ordem` (donors: valor | candidatos | doacoes | indireto; suppliers: valor | candidatos | partidos)
  and `pagina`. Profiles `/doadores/{key}` and `/fornecedores/{key}` focus the entity's most recent
  active election when `ano` is absent.
