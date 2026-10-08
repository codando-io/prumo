import Link from "next/link";
import { FILING_TYPE, FUND_LABEL, tseCandidateUrl } from "@/lib/labels";
import { brl, date, dateLong, num, plural, titleName } from "@/lib/format";
import { txHref, type TxFilters, type TxRow } from "@/lib/queries/transactions";
import { categoryColor, categoryLabel, categorySub, counterpartyHref, counterpartyKind } from "./display";

/**
 * Dense table of transactions: date, who, type, category, description, amount. On desktop each
 * transaction is one table row; on small screens the same cells stack into a block. "Detalhes"
 * opens a second row with the TSE identifiers (pure CSS: the row group shows it while its
 * <details> is open).
 */
export function TxTable({ rows, f }: { rows: TxRow[]; f: TxFilters }) {
  const showCandidate = !f.candidato;
  const showCounterparty = !f.contraparte;
  const mixed = !f.tipo;
  const cols = 4 + Number(showCandidate) + Number(showCounterparty) + Number(mixed);
  const cpHeader = f.tipo === "receita" ? "Doador" : f.tipo === "despesa" ? "Fornecedor" : "Doador ou fornecedor";
  const th = "px-2 pb-2 pt-3 text-left text-[13px] font-normal text-muted md:sticky md:top-[60px] md:z-10 md:border-b md:border-rule-strong md:bg-bg";

  return (
    <table className="block w-full border-collapse text-[14.5px] md:table md:table-fixed">
      <caption className="sr-only">
        Transações encontradas, ordenadas por {f.ordem.startsWith("valor") ? "valor" : "data"} ({f.ordem.endsWith("desc") ? "decrescente" : "crescente"})
      </caption>
      <colgroup className="hidden md:table-column-group">
        <col className="w-[96px]" />
        {showCounterparty && <col className="w-[21%]" />}
        {showCandidate && <col className="w-[17%]" />}
        {mixed && <col className="w-[80px]" />}
        <col className="w-[17%]" />
        <col />
        <col className="w-[132px]" />
      </colgroup>
      <thead className="hidden md:table-header-group">
        <tr>
          <SortHeader f={f} field="data" label="Data" className={`${th} pl-0`} />
          {showCounterparty && (
            <th scope="col" className={th}>
              {cpHeader}
            </th>
          )}
          {showCandidate && (
            <th scope="col" className={th}>
              Candidatura
            </th>
          )}
          {mixed && (
            <th scope="col" className={th}>
              Tipo
            </th>
          )}
          <th scope="col" className={th}>
            Categoria
          </th>
          <th scope="col" className={th}>
            Descrição
          </th>
          <SortHeader f={f} field="valor" label="Valor" className={`${th} pr-0 text-right`} align="right" />
        </tr>
      </thead>
      {rows.map((r) => (
        <TxRowGroup key={`${r.tipo}-${r.sq}`} r={r} f={f} cols={cols} showCandidate={showCandidate} showCounterparty={showCounterparty} mixed={mixed} />
      ))}
    </table>
  );
}

function SortHeader({ f, field, label, align = "left", className }: { f: TxFilters; field: "data" | "valor"; label: string; align?: "left" | "right"; className: string }) {
  const active = f.ordem.startsWith(field);
  const desc = f.ordem.endsWith("desc");
  // First click sorts descending (largest / most recent first); a second click flips it.
  const next = active && desc ? `${field}_asc` : `${field}_desc`;
  return (
    <th scope="col" aria-sort={active ? (desc ? "descending" : "ascending") : undefined} className={className}>
      <Link
        href={txHref(f, { ordem: next === "valor_desc" ? null : next, pagina: null })}
        scroll={false}
        className={`inline-flex items-baseline gap-1 border-b no-underline hover:text-ink ${align === "right" ? "flex-row-reverse" : ""} ${active ? "border-accent text-ink" : "border-transparent"}`}
        title={`Ordenar por ${label.toLowerCase()}`}
      >
        {label}
        {active && <span aria-hidden="true">{desc ? "↓" : "↑"}</span>}
      </Link>
    </th>
  );
}

function TxRowGroup({
  r,
  f,
  cols,
  showCandidate,
  showCounterparty,
  mixed,
}: {
  r: TxRow;
  f: TxFilters;
  cols: number;
  showCandidate: boolean;
  showCounterparty: boolean;
  mixed: boolean;
}) {
  const detailId = `tx-${r.tipo}-${r.sq}`;
  const cpHref = counterpartyHref(r);
  const cpName =
    r.tipo === "receita" && r.donor_type === "proprio"
      ? "Recursos próprios"
      : titleName(r.name) || (r.tipo === "despesa" ? "Sem fornecedor identificado" : "Doador não identificado");
  const cpKind = counterpartyKind(r);
  const desc = r.description ?? (r.nature === "ESTIMAVEL" ? r.estimable : null);
  const sub = categorySub(r);
  const cell = "md:px-2 md:py-2.5 md:align-top";

  return (
    <tbody className="group/tx block border-b border-rule hover:bg-[var(--hover)] has-[details[open]]:bg-[var(--hover)] md:table-row-group">
      <tr className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 py-3 md:table-row md:py-0">
        <td className={`order-1 text-[13.5px] text-muted md:text-ink-2 ${cell} md:pl-0`}>
          <span className="tnum">{date(r.date)}</span>
          {mixed && <span className="ml-2 md:hidden">· {r.tipo === "receita" ? "Receita" : "Despesa"}</span>}
        </td>

        {showCounterparty && (
          <td className={`order-3 col-span-2 min-w-0 ${cell}`}>
            <span className="mr-1 text-[13.5px] text-muted md:hidden">{r.tipo === "receita" ? "De" : "Para"}</span>
            {cpHref ? (
              <Link href={cpHref} className="font-medium text-ink no-underline [overflow-wrap:anywhere] hover:underline hover:decoration-accent">
                {cpName}
              </Link>
            ) : (
              <span className="font-medium text-ink-2">{cpName}</span>
            )}
            {cpKind && <span className="block text-[13px] text-muted">{cpKind}</span>}
          </td>
        )}

        {showCandidate && (
          <td className={`order-4 col-span-2 min-w-0 ${cell}`}>
            <span className="mr-1 text-[13.5px] text-muted md:hidden">{r.tipo === "receita" ? "Para" : "De"}</span>
            <Link href={`/candidatos/${r.year}/${r.candidate_id}`} className="text-ink no-underline hover:underline hover:decoration-accent">
              {titleName(r.ballot_name) || r.candidate_id}
            </Link>
            <span className="block text-[13px] text-muted">
              {r.office}
              {r.uf && r.uf !== "BR" ? ` ${r.uf}` : ""}
              {r.party ? `, ${r.party}` : ""}
            </span>
          </td>
        )}

        {mixed && <td className={`hidden text-ink-2 md:table-cell ${cell}`}>{r.tipo === "receita" ? "Receita" : "Despesa"}</td>}

        <td className={`order-5 col-span-2 min-w-0 ${cell}`}>
          <span className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-[7px] h-2 w-2 shrink-0" style={{ background: categoryColor(r) }} />
            <span className="min-w-0 text-ink-2">
              <span className="block">{categoryLabel(r)}</span>
              {sub && <span className="block text-[13px] text-muted">{sub}</span>}
              {r.nature === "ESTIMAVEL" && <span className="block text-[13px] text-muted">Doação em bens ou serviços (estimável)</span>}
            </span>
          </span>
        </td>

        <td className={`order-6 col-span-2 min-w-0 text-ink-2 ${cell}`}>
          {desc ? <span className="line-clamp-3 [overflow-wrap:anywhere] md:line-clamp-2">{desc}</span> : <span className="hidden text-muted md:inline">—</span>}
          {r.lines > 1 && <span className="block text-[13px] text-muted">{plural(r.lines, "item", "itens")} somados</span>}
        </td>

        <td className={`order-2 text-right ${cell} md:pr-0`}>
          <span className="tnum whitespace-nowrap font-medium text-ink">{brl(r.value)}</span>
          <details className="group/d mt-0.5 hidden md:block">
            <summary aria-controls={detailId} className="cursor-pointer list-none text-[13px] text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
              <span className="group-open/d:hidden">Detalhes</span>
              <span className="hidden group-open/d:inline">Fechar</span>
              <span className="sr-only"> da transação {r.sq}</span>
            </summary>
          </details>
        </td>

        <td className="order-7 col-span-2 md:hidden">
          <details className="group/d">
            <summary aria-controls={detailId} className="cursor-pointer list-none text-[13.5px] text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
              <span className="group-open/d:hidden">Detalhes</span>
              <span className="hidden group-open/d:inline">Fechar detalhes</span>
              <span className="sr-only"> da transação {r.sq}</span>
            </summary>
          </details>
        </td>
      </tr>
      <tr id={detailId} className="hidden group-has-[details[open]]/tx:block md:group-has-[details[open]]/tx:table-row">
        <td colSpan={cols} className="block pb-4 md:table-cell md:px-0 md:pt-0">
          <TxDetails r={r} f={f} cpName={cpName} cpKind={cpKind} />
        </td>
      </tr>
    </tbody>
  );
}

function TxDetails({ r, f, cpName, cpKind }: { r: TxRow; f: TxFilters; cpName: string; cpKind: string }) {
  const rev = r.tipo === "receita";
  const items: [string, React.ReactNode][] = [];
  items.push([
    rev ? "Identificador da receita (SQ_RECEITA)" : "Identificador da despesa (SQ_DESPESA)",
    <span key="sq" className="tnum">
      {r.sq}
    </span>,
  ]);
  if (rev) {
    if (r.receipt)
      items.push([
        "Recibo eleitoral",
        <span key="rc" className="[overflow-wrap:anywhere]">
          {r.receipt}
        </span>,
      ]);
    if (r.document)
      items.push([
        "Documento",
        <span key="dc" className="[overflow-wrap:anywhere]">
          {r.document}
        </span>,
      ]);
    if (r.origin) items.push(["Origem declarada", r.origin]);
    items.push([
      "Natureza",
      r.nature === "ESTIMAVEL"
        ? `Estimável (bens ou serviços)${r.estimable ? `: ${r.estimable}` : ""}`
        : `Financeira${r.form && r.form !== "--" ? `, ${r.form}` : ""}`,
    ]);
    if (r.fund) items.push(["Fundo", FUND_LABEL[r.fund] ?? r.fund]);
  } else {
    if (r.doc_type || r.doc_number)
      items.push([
        "Documento",
        <span key="dc" className="[overflow-wrap:anywhere]">
          {[r.doc_type, r.doc_number && `nº ${r.doc_number}`].filter(Boolean).join(" ")}
        </span>,
      ]);
    items.push([
      "Pagamento",
      r.paid != null ? (
        <span key="pg">
          pago: <span className="tnum">{brl(r.paid)}</span>
          {r.paid_funds
            ? ` (${r.paid_funds
                .split(", ")
                .map((x) => (x === "OUTROS" ? "outros recursos" : x))
                .join(", ")})`
            : ""}
          {r.n_payments && r.n_payments > 1 ? `, em ${num(r.n_payments)} pagamentos` : ""}
          {r.last_paid ? `, último em ${dateLong(r.last_paid)}` : ""}
        </span>
      ) : (
        "Nenhum pagamento registrado até agora"
      ),
    ]);
  }
  items.push([
    rev ? "Doador" : "Fornecedor",
    `${cpName}${cpKind ? `, ${cpKind.toLowerCase()}` : ""}${r.doc_display ? ` (${r.kind === "pf" || r.donor_type === "proprio" ? "CPF" : "CNPJ"} ${r.doc_display})` : ""}`,
  ]);
  if (r.filing_type)
    items.push(["Prestação de contas", `${FILING_TYPE[r.filing_type] ?? r.filing_type}${r.filing_date ? `, entregue em ${dateLong(r.filing_date)}` : ""}`]);

  return (
    <div className="ml-0 border-l-2 border-accent py-1 pl-4 text-[14px] md:ml-[96px]">
      <dl className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[13px] text-muted">{k}</dt>
            <dd className="text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {r.lines > 1 && (
        <div className="mt-3">
          <div className="text-[13px] text-muted">
            {plural(r.lines, "item registrado", "itens registrados")} nesta {rev ? "receita" : "despesa"}
            {r.items.length < r.lines ? ` (mostrando ${num(r.items.length)})` : ""}
          </div>
          <ul className="mt-1 divide-y divide-rule border-y border-rule">
            {r.items.map((it, i) => (
              <li key={i} className="flex justify-between gap-4 py-1.5">
                <span className="min-w-0 text-ink-2 [overflow-wrap:anywhere]">{it.description ?? "Sem descrição"}</span>
                <span className="tnum shrink-0">{brl(it.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[14px]">
        {!f.candidato && (
          <li>
            <Link className="action" href={txHref(f, { candidato: r.candidate_id, pagina: null })} scroll={false}>
              Só desta candidatura
            </Link>
          </li>
        )}
        {!f.contraparte && r.key && (
          <li>
            <Link className="action" href={txHref(f, { contraparte: r.key, pagina: null })} scroll={false}>
              Só {rev ? "deste doador" : "deste fornecedor"}
            </Link>
          </li>
        )}
        <li>
          <Link className="action" href={txHref({ year: f.year, tipo: r.tipo, sq: r.sq, ordem: "valor_desc", pagina: 1 })}>
            Link permanente
          </Link>
        </li>
        {r.uf && (
          <li>
            <a
              className="action"
              href={tseCandidateUrl(r.year, r.uf, r.candidate_id)}
              target="_blank"
              rel="noreferrer"
            >
              Prestação no DivulgaCandContas <span aria-hidden="true">↗</span>
            </a>
          </li>
        )}
      </ul>
    </div>
  );
}
