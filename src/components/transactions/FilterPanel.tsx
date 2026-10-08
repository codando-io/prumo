import Link from "next/link";
import { EXPENSE_GROUPS, FUNDING_GROUPS, OFFICES, REVENUE_CATEGORY, UF_NAMES, YEARS } from "@/lib/labels";
import { brl, date, titleName } from "@/lib/format";
import {
  TX_ORDERS,
  TX_PARAM_KEYS,
  isExpenseGroup,
  txHref,
  txParams,
  type TxCandidate,
  type TxCounterparty,
  type TxFilters,
  type TxParamKey,
} from "@/lib/queries/transactions";
import { TxFilterForm } from "./TxFilterForm";
import { EntityPicker } from "./EntityPicker";

const field = "flex min-w-0 flex-col gap-1 text-[13px] text-muted";
const control = "field h-9 w-full min-w-0 px-2.5 text-[14px]";

/** Number as typed in the value fields: 1234.5 -> "1234,50". */
const moneyInput = (v: number | undefined) => (v == null ? "" : v.toFixed(2).replace(".", ",").replace(/,00$/, ""));

export interface TxOptions {
  parties: string[];
  categories: { category: string; category_group: string }[];
}

export function FilterPanel({
  f,
  candidate,
  counterparty,
  options,
}: {
  f: TxFilters;
  candidate?: TxCandidate;
  counterparty?: TxCounterparty;
  options: TxOptions;
}) {
  const advanced = !!(f.partido || f.uf || f.cargo || f.de || f.ate || f.min != null || f.max != null || f.categoria || f.categoria_tse);
  // Remount on every URL change so uncontrolled fields always show the applied filters.
  const formKey = new URLSearchParams(txParams(f)).toString();
  const without = (k: TxParamKey) => txParams(f, { [k]: null, pagina: null });

  return (
    <div className="border-y border-rule py-5">
      <TxFilterForm key={formKey} order={TX_PARAM_KEYS}>
        {f.candidato && <input type="hidden" name="candidato" value={f.candidato} />}
        {f.contraparte && <input type="hidden" name="contraparte" value={f.contraparte} />}
        {f.sq && <input type="hidden" name="sq" value={f.sq} />}
        {!f.tipo && f.categoria && <input type="hidden" name="categoria" value={f.categoria} />}
        {!f.tipo && f.categoria_tse && <input type="hidden" name="categoria_tse" value={f.categoria_tse} />}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className={`${field} col-span-2 lg:col-span-1`}>
            <label htmlFor="tx-q">Texto</label>
            <input
              type="search"
              id="tx-q"
              name="q"
              defaultValue={f.q ?? ""}
              maxLength={100}
              placeholder="Nome do doador ou fornecedor, descrição"
              className={control}
            />
          </div>
          <div className={field}>
            <label htmlFor="tx-tipo">Tipo</label>
            <select id="tx-tipo" name="tipo" defaultValue={f.tipo ?? ""} className={control}>
              <option value="">Receitas e despesas</option>
              <option value="receita">Receitas</option>
              <option value="despesa">Despesas</option>
            </select>
          </div>
          <div className={field}>
            <label htmlFor="tx-grupo">{f.tipo === "receita" ? "Origem do dinheiro" : f.tipo === "despesa" ? "Tipo de gasto" : "Categoria"}</label>
            <select id="tx-grupo" name="grupo" defaultValue={f.grupo ?? ""} className={control}>
              <option value="">Todas</option>
              {f.tipo !== "despesa" && (
                <optgroup label="Receitas: origem">
                  {FUNDING_GROUPS.map((g) => (
                    <option key={g.key} value={g.key}>
                      {g.label}
                    </option>
                  ))}
                </optgroup>
              )}
              {f.tipo !== "receita" && (
                <optgroup label="Despesas: tipo de gasto">
                  {Object.entries(EXPENSE_GROUPS).map(([k, g]) => (
                    <option key={k} value={k}>
                      {g.label}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div className={`${field} col-span-2 lg:col-span-1`}>
            <label htmlFor="tx-ordem">Ordenar por</label>
            <select id="tx-ordem" name="ordem" defaultValue={f.ordem === "valor_desc" ? "" : f.ordem} className={control}>
              {TX_ORDERS.map((o) => (
                <option key={o.key} value={o.key === "valor_desc" ? "" : o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {candidate || f.candidato ? (
            <Selected
              label="Candidatura"
              value={
                candidate
                  ? `${titleName(candidate.ballot_name)} (${candidate.office}${candidate.uf !== "BR" ? ` ${candidate.uf}` : ""}, ${candidate.party})`
                  : `nº ${f.candidato}`
              }
              removeHref={txHref(f, { candidato: null, pagina: null })}
            />
          ) : (
            <EntityPicker param="candidato" label="Candidatura" placeholder="Buscar pelo nome de urna" year={f.year} params={without("candidato")} />
          )}
          {counterparty || f.contraparte ? (
            <Selected
              label="Doador ou fornecedor"
              value={counterparty ? titleName(counterparty.name) || f.contraparte! : f.contraparte!}
              removeHref={txHref(f, { contraparte: null, pagina: null })}
            />
          ) : (
            <EntityPicker
              param="contraparte"
              label="Doador ou fornecedor"
              placeholder="Buscar pelo nome ou CNPJ"
              year={f.year}
              params={without("contraparte")}
            />
          )}
        </div>

        <details className="group/more mt-4" open={advanced}>
          <summary className="cursor-pointer list-none text-[14px] text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
            <span className="text-ink underline decoration-transparent underline-offset-[3px] hover:decoration-accent">
              <span className="group-open/more:hidden">Mais filtros</span>
              <span className="hidden group-open/more:inline">Menos filtros</span>
            </span>{" "}
            <span className="text-muted">eleição, partido, estado, cargo, datas e valores</span>
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <div className={field}>
              <label htmlFor="tx-ano">Eleição</label>
              <select id="tx-ano" name="ano" defaultValue={String(f.year)} className={control}>
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className={field}>
              <label htmlFor="tx-partido">Partido</label>
              <select id="tx-partido" name="partido" defaultValue={f.partido ?? ""} className={control}>
                <option value="">Todos</option>
                {options.parties.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className={field}>
              <label htmlFor="tx-uf">Estado</label>
              <select id="tx-uf" name="uf" defaultValue={f.uf ?? ""} className={control}>
                <option value="">Todos</option>
                {Object.entries(UF_NAMES)
                  .filter(([k]) => k !== "BR" && k !== "ZZ")
                  .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                <option value="BR">Candidaturas nacionais (Presidente)</option>
              </select>
            </div>
            <div className={field}>
              <label htmlFor="tx-cargo">Cargo</label>
              <select id="tx-cargo" name="cargo" defaultValue={f.cargo ? String(f.cargo) : ""} className={control}>
                <option value="">Todos</option>
                {OFFICES.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {f.tipo === "receita" && (
              <div className={`${field} col-span-2`}>
                <label htmlFor="tx-categoria">Categoria da receita</label>
                <select id="tx-categoria" name="categoria" defaultValue={f.categoria ?? ""} className={control}>
                  <option value="">Todas</option>
                  {Object.entries(REVENUE_CATEGORY).map(([k, c]) => (
                    <option key={k} value={k}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {f.tipo === "despesa" && (
              <div className={`${field} col-span-2`}>
                <label htmlFor="tx-categoria_tse">Categoria oficial do TSE</label>
                <select id="tx-categoria_tse" name="categoria_tse" defaultValue={f.categoria_tse ?? ""} className={control}>
                  <option value="">Todas</option>
                  {Object.entries(EXPENSE_GROUPS).map(([g, meta]) => {
                    const cats = options.categories.filter((c) => c.category_group === g);
                    return cats.length ? (
                      <optgroup key={g} label={meta.label}>
                        {cats.map((c) => (
                          <option key={c.category} value={c.category}>
                            {c.category}
                          </option>
                        ))}
                      </optgroup>
                    ) : null;
                  })}
                  {f.categoria_tse && !options.categories.some((c) => c.category === f.categoria_tse) && (
                    <option value={f.categoria_tse}>{f.categoria_tse}</option>
                  )}
                </select>
              </div>
            )}
            <div className={field}>
              <label htmlFor="tx-de">De</label>
              <input type="date" id="tx-de" name="de" defaultValue={f.de ?? ""} className={control} />
            </div>
            <div className={field}>
              <label htmlFor="tx-ate">Até</label>
              <input type="date" id="tx-ate" name="ate" defaultValue={f.ate ?? ""} className={control} />
            </div>
            <div className={field}>
              <label htmlFor="tx-min">Valor mínimo (R$)</label>
              <input type="text" inputMode="decimal" id="tx-min" name="min" defaultValue={moneyInput(f.min)} placeholder="0,00" className={`${control} tnum`} />
            </div>
            <div className={field}>
              <label htmlFor="tx-max">Valor máximo (R$)</label>
              <input
                type="text"
                inputMode="decimal"
                id="tx-max"
                name="max"
                defaultValue={moneyInput(f.max)}
                placeholder="sem limite"
                className={`${control} tnum`}
              />
            </div>
          </div>
          {!f.tipo && <p className="mt-3 text-[13px] text-muted">Escolha receitas ou despesas para filtrar também pela categoria detalhada.</p>}
        </details>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="submit" className="h-9 rounded-[6px] border border-rule-strong px-4 text-[14px] text-ink hover:border-accent">
            Aplicar filtros
          </button>
          <p className="text-[13px] text-muted">A busca por texto procura no nome de quem doou ou recebeu e na descrição.</p>
        </div>
      </TxFilterForm>
    </div>
  );
}

function Selected({ label, value, removeHref }: { label: string; value: string; removeHref: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-1 flex h-9 items-center justify-between gap-3 border-b border-accent">
        <span className="truncate text-[14.5px] font-medium text-ink">{value}</span>
        <Link href={removeHref} scroll={false} className="action shrink-0 text-[13.5px]" aria-label={`Remover filtro de ${label.toLowerCase()}`}>
          remover
        </Link>
      </div>
    </div>
  );
}

/** Applied filters as removable chips (each one a plain link without that parameter). */
export function ActiveFilters({ f, candidate, counterparty }: { f: TxFilters; candidate?: TxCandidate; counterparty?: TxCounterparty }) {
  const chips: { key: TxParamKey; label: string }[] = [];
  if (f.tipo) chips.push({ key: "tipo", label: f.tipo === "receita" ? "Só receitas" : "Só despesas" });
  if (f.candidato) chips.push({ key: "candidato", label: `Candidatura: ${candidate ? titleName(candidate.ballot_name) : `nº ${f.candidato}`}` });
  if (f.contraparte)
    chips.push({
      key: "contraparte",
      label: `${f.tipo === "receita" ? "Doador" : f.tipo === "despesa" ? "Fornecedor" : "Doador ou fornecedor"}: ${titleName(counterparty?.name) || f.contraparte}`,
    });
  if (f.grupo)
    chips.push({
      key: "grupo",
      label: isExpenseGroup(f.grupo) ? (EXPENSE_GROUPS[f.grupo]?.label ?? f.grupo) : (FUNDING_GROUPS.find((g) => g.key === f.grupo)?.label ?? f.grupo),
    });
  if (f.categoria) chips.push({ key: "categoria", label: REVENUE_CATEGORY[f.categoria]?.label ?? f.categoria });
  if (f.categoria_tse) chips.push({ key: "categoria_tse", label: `Categoria TSE: ${f.categoria_tse}` });
  if (f.partido) chips.push({ key: "partido", label: `Partido: ${f.partido}` });
  if (f.uf) chips.push({ key: "uf", label: f.uf === "BR" ? "Candidaturas nacionais" : `Estado: ${UF_NAMES[f.uf] ?? f.uf}` });
  if (f.cargo) chips.push({ key: "cargo", label: OFFICES.find((o) => o.code === f.cargo)?.label ?? `Cargo ${f.cargo}` });
  if (f.de) chips.push({ key: "de", label: `Desde ${date(f.de)}` });
  if (f.ate) chips.push({ key: "ate", label: `Até ${date(f.ate)}` });
  if (f.min != null) chips.push({ key: "min", label: `A partir de ${brl(f.min)}` });
  if (f.max != null) chips.push({ key: "max", label: `Até ${brl(f.max)}` });
  if (f.sq) chips.push({ key: "sq", label: `Transação ${f.sq}` });
  if (f.q) chips.push({ key: "q", label: `Texto: “${f.q}”` });
  if (!chips.length) return null;

  return (
    <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[14px]">
      <h2 className="text-muted">Filtrando por</h2>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {chips.map((c) => (
          <li key={c.key}>
            <Link
              href={txHref(f, { [c.key]: null, pagina: null })}
              scroll={false}
              className="group inline-flex max-w-full items-baseline gap-1 text-ink no-underline"
              aria-label={`Remover filtro: ${c.label}`}
            >
              <span className="truncate">{c.label}</span>
              <span aria-hidden="true" className="text-muted group-hover:text-accent">×</span>
            </Link>
          </li>
        ))}
      </ul>
      {chips.length > 1 && (
        <Link href={txHref({ year: f.year, ordem: f.ordem, pagina: 1 })} scroll={false} className="action ml-2 text-[14px]">
          Limpar filtros
        </Link>
      )}
    </div>
  );
}
