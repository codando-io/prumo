# Prumo — UX audit (before the redesign)

Inspected: dashboard `/`, candidate profile, state page, transactions, connections, donor/supplier,
party, mobile candidate. Screenshots of the "before" state are in `.ux/before/`.

## 1. Biggest hierarchy problems

- **Everything has the same weight.** Every section uses the same H2 + lede + two-column grid, so a
  candidate page reads as ten equal blocks (origem, destino, fluxo, padrões, por voto, votos,
  histórico, bens, dados). Nothing says "start here".
- **The financial story is not told.** The candidate "ledger" shows two 48px totals side by side
  with a mirrored stacked bar; the relationship (how much came in, from where, how much was
  spent, on what, paid to whom) has to be reconstructed by the reader.
- **The same numbers appear three times.** Funding categories are in the ledger legend, again in
  "Por tipo de origem", again in the KPI tiles ("Dinheiro público 97%"). Same for spending.
- **Generic KPI rows** (6–8 stat tiles: votes, R$/voto, donors, suppliers, transactions, assets) sit
  between the hero and the content, compete with it and repeat it.
- **Important context is tiny and grey.** Sublabels at 12.5px muted carry real information
  (what a number means, who a donor is, how many campaigns a supplier served).
- **Provenance is noisy, not trustworthy.** Dotted underlines on every big number read as a UI
  tic; the actual "where does this come from" is hidden one click away on each figure.

## 2. Biggest navigation problems

- **Eight equal top-level items** (Painel, Candidatos, Partidos, Estados, Doadores, Fornecedores,
  Conexões, Transações) expose the data model, not the user's journey. It reads like an admin tool.
- **Search is a 210px field** in the corner although it is the main entry point for most people.
  Results show a label and a grey sublabel, with no sense of what the entity is or why it matters.
- **The election is a global toggle** (2026 | 2022 | 2018) that silently means different things on
  different pages and disappears on some.
- **No investigation context.** Moving candidate → supplier → other campaign loses the thread;
  breadcrumbs describe the site hierarchy, not the path the user took.
- **The graph drops users into dozens of nodes** with no explanation of each relationship.

## 3. Biggest visual-density problems

- **Long lists of progress bars** (27 states, 15 donors, 10 suppliers, 7 donation bins, 10 expense
  groups) — tall, low information per pixel, all bars look alike.
- **Cards and panels everywhere**: signal cards, chart panels, notice boxes, filter boxes, bordered
  buttons, pills (result chip, kind tags, "Padrão estatístico" tags).
- **Oversized empty bands**: the full-width ledger band, a 620px graph canvas, a 460px map that
  answers a question nobody asked first.
- **Simultaneously too dense**: transaction rows carry category + group + description + details
  toggles in 13px text.

## 4. Components to remove

- KPI stat-tile rows (candidate, dashboard, state, party, donor, supplier).
- The mirrored ledger bar and its duplicate legend.
- Pills and badges: result chip, kind tags, "Padrão estatístico", federation chips.
- Bordered action buttons with icons on profiles (Comparar, Ver conexões, Registro no TSE).
- Signal cards (rounded panels with tag + regra + links).
- Notice boxes (bordered "prestação em andamento" banner).
- Donation-size histogram as a bar list; "Gasto por voto" stat block of four tiles.
- Dotted underline on every figure.

## 5. Components to redesign

- **Navigation** → journey-based: Eleição (with the year inside it), Candidaturas, Partidos,
  Estados, and "Seguir o dinheiro" (doadores, fornecedores, conexões, transações). Search becomes a
  full command-palette entry point with typed, quantified results.
- **Money composition** → one component, two directions (money in / money out): total, a single
  proportional strip with semantic colour (public / private / spending), and a compact table whose
  rows expand into the counterparties and transactions.
- **Tables** → one data-table style: sticky header, right-aligned tabular numbers, entity name as
  the strongest text, hover rows, sorting where useful, mobile row layout.
- **Provenance** → a quiet source line per section ("Fonte: TSE · publicado em 7 out. 2026 ·
  ver transações") that opens the detail, instead of per-number decoration.
- **Signals** → an annotated list: neutral label ("Concentração"), one plain sentence with the
  number, one link to explore. No cards, no warning colour.
- **Graph** → an investigation trail: start from one entity, expand one relationship at a time in
  columns where every row explains itself ("pagou R$ 31 mi", "recebeu de 12 campanhas"); the
  network view becomes an optional view of the trail.
- **Maps** → secondary to a ranked list (toggle map ↔ list), with the question as the title and a
  legend that states the metric.

## 6. Pages that need the largest structural change

1. **Candidate profile** — rebuild as a profile + financial narrative (who → result → money in →
   money out → suppliers), then deeper sections.
2. **Election overview (home)** — from dashboard to an edition-style overview organised by
   questions.
3. **State page** — from widget stack to questions ("O que aconteceu", "Quem disputou", "Para onde
   foi o dinheiro", "De onde veio", "Onde estavam os votos").
4. **Transactions** — summary of the largest flows before the table; lighter rows; inline detail.
5. **Connections** — trail-first exploration.
6. Donor, supplier and party pages — same system, tables over bar lists.
