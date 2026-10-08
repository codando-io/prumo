# Prumo — design system (v2, editorial redesign)

Prumo should read like a data publication about public money, not a SaaS dashboard: calm,
precise, typographic. Hierarchy comes from type, alignment, whitespace and thin rules — not from
boxes. See `docs/UX-AUDIT.md` for why.

## Principles

1. **Questions, not widgets.** Sections are titled as the question they answer ("Para onde foi o
   dinheiro?"), open with one sentence that answers it in words and numbers, then show the evidence.
2. **One idea per element.** No KPI tile rows, no cards around sections, no pills or badges, no
   decorative icons. A number belongs in a sentence or in a table.
3. **Colour means something.** Only three data meanings have colour; the same meaning always looks
   the same everywhere. Everything else is neutral.
4. **Tables are first-class.** Large sets of entities are tables, not bar lists.
5. **Trust is visible but quiet.** Each section carries a source line; every aggregate links to the
   transactions behind it.
6. **Progressive disclosure.** Summary → expand a row → open the entity → transactions.

## Colour tokens (`src/app/globals.css`)

| Token | Use | Dark | Light |
|---|---|---|---|
| `--bg` | page | `#111315` | `#f6f6f4` |
| `--bg-raised` | header, popovers, palette | `#171a1d` | `#ffffff` |
| `--ink` | primary text, entity names, numbers | `#ecedee` | `#16181b` |
| `--ink-2` | secondary text, ledes | `#b3b8be` | `#4a4f57` |
| `--muted` | tertiary only (captions, axis) | `#868c93` | `#70757d` |
| `--rule` / `--rule-strong` | separators | `#25292d` / `#383d43` | `#e3e3df` / `#cfcfca` |
| `--accent` | interaction only: focus, selection, active nav, the plumb mark | `#d4b263` | `#86671c` |
| `--public` | public money (FEFC, Fundo Partidário) | `#4f86d3` | `#2e64b5` |
| `--private` | private money (people, own resources, crowdfunding, party private funds, others) | `#cf7a3e` | `#c0601f` |
| `--spend` | money spent (all expense categories) | `#8b929a` | `#6b717a` |

Rules: sub-categories inside public/private/spend use the same hue (opacity steps via
`--public-2/3`, `--private-2/3`, `--spend-2`), separated by 2px gaps and identified by direct labels,
never by new hues. Parties never get a colour. Status colours are not used. Validated with the
dataviz palette checker (public↔private CVD ΔE ≥ 19 in both modes).

## Typography

- **Newsreader** (serif, `font-serif` / `.title`, `.question`): page titles and section questions only.
- **Archivo** (sans, default): everything else, including numbers (`.num` = tabular figures, medium).
- Scale: page title 44/1.05 (mobile 34); section question 30/1.15 (mobile 25); lede 18/1.55;
  body 16/1.6; table 14.5; caption 13 (minimum for anything informative). Sentence case everywhere.
  No all-caps labels, no eyebrow labels.
- Big numbers are rare: the profile's two money totals and the election totals. Elsewhere numbers
  are inline (`<Fig>` = medium-weight tabular figure inside a sentence).

## Layout

- Content width 1200px (`<Container>`), 24px gutters (16px mobile). Long text ≤ 68ch.
- Sections: `<Section question lede source>` — top hairline, 64px vertical rhythm, question in serif,
  lede in `--ink-2`, optional source line right under the lede.
- Asymmetric two-column compositions (`lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]`): words left,
  evidence right. Tables span full width.
- No rounded containers except interactive surfaces (inputs, popovers, palette): radius 6px.

## Components (`src/components/`)

Editorial primitives live in `ui/editorial.tsx`; reuse them instead of hand-rolling headers:

- `PageHeader({crumbs, title, lede, meta, actions, aside})` — every page starts with it. `actions`
  are quiet text links (external ones get ↗), never buttons.
- `Section({id, question, lede, source})` — top hairline, serif question, lede, optional source line.
- `SourceLine({label, info, links})` — "Fonte: TSE, <dataset> · <link>"; the label opens provenance.
- `Fig({info})` — inline figure (medium tabular) inside a sentence, optional provenance popover.
- `YearTabs({path, params, year})` — election switch inside a page (underline in accent).
- `Caption`, `EmptyNote` — quiet note under evidence; empty state with a left rule.
- `ui/primitives.tsx` — `Container` (1200px), `Breadcrumbs` (same as `Crumbs`), `ResultChip`
  (plain text, not a pill), `Empty`, `Note`. `Stat`/`SectionHeader` exist for legacy code: prefer a
  sentence with `Fig`, and `Section`.
- `ui/ViewToggle` — switch between equivalent views (ranked list ↔ map). The list comes first.
- `ui/FilterForm` — one row of GET-form filters (URL state), works without JS.
- `.dt` table (globals.css): sticky header, hover rows; cell classes `.n` (number, right aligned,
  tabular), `.e` (entity name, strongest), `.s` (secondary text). Entity cells hold the name as a
  link plus a secondary line (`<div className="s text-[13.5px]">kind, context</div>`). Hide
  low-priority columns on small screens with `hidden sm:table-cell` / `hidden md:table-cell`.
  Long lists: show 10–15 rows, then `<details>` "Ver os N …" or a link to the full explorer.
- `money/Composition` + `CounterList` — money-in / money-out unit (client). `money/AggregateMoney`
  builds the pair for any scope (election, state, party) from `dashboard.ts` queries
  (`revenueByCategory`, `expenseByGroup`, `donorsByGroup`, `suppliersByGroup` with `DashFilters`).
  Funding tones: `FUNDING_TONE` (public → `public`, `public-2`; private → `private…private-4`).
- `search/describe.ts` — how any entity describes itself (`hitKind`, `hitFacts`); `search/
  SearchPalette` (`SearchPalette`, `SearchInvite`) — the global search.
- `lib/links.ts` — `counterpartHref` (party bodies → party, campaign accounts → candidacy, others
  → donor/supplier profile), `txHref`.
- Charts (ECharts) keep: thin marks, no gridline noise, one measure per chart, tooltip, list twin.
  No `panel` boxes around charts.

Patterns to remove when touching a page: KPI tile rows (`Stat` grids) → one lede sentence with
`Fig`s; `BarList` for entities → `.dt` table (keep tiny inline bars only for distributions);
rounded bordered boxes / `panel` / shadows → nothing (rules and spacing); coloured chips/pills →
plain text; lucide icons next to text → none (keep only functional icons: search, menu, theme);
`text-[12.5px]` informative text → 13.5px minimum; `wide`/`font-semibold` page headings → serif
`.title` via `PageHeader`; black filled buttons → quiet links or `border-rule-strong` outline.

## Language

Plain, neutral pt-BR. Signals are "Sinais nos dados": label (Concentração, Tempo, Relação,
Mudança detectada, Consistência) + one sentence with the fact + "Explorar …". Never "alerta", "suspeito",
"irregular". Actions are quiet text links, not buttons.
