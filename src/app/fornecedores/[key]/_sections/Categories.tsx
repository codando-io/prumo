import Link from "next/link";
import { Fig, Section, SourceLine } from "@/components/ui/editorial";
import { ShareBar } from "@/components/entities/tables";
import { lcFirst } from "@/components/entities/parts";
import { entityOfficial } from "@/components/entities/sources";
import { EXPENSE_GROUPS } from "@/lib/labels";
import { brlc, num, pct } from "@/lib/format";

type Cat = { category_group: string; category: string; value: number; n: number; n_candidates: number };

/** What campaigns contracted from this supplier: Prumo's spending groups and the official TSE categories inside each. */
export function Categories({ entityKey, year, total, cats, generatedAt }: { entityKey: string; year: number; total: number; cats: Cat[]; generatedAt: string | null }) {
  const tx = `/transacoes?ano=${year}&contraparte=${entityKey}&tipo=despesa`;
  const groups = new Map<string, { value: number; n: number; cats: Cat[] }>();
  for (const c of cats) {
    const g = groups.get(c.category_group) ?? { value: 0, n: 0, cats: [] };
    g.value += c.value;
    g.n += c.n;
    g.cats.push(c);
    groups.set(c.category_group, g);
  }
  const rows = [...groups.entries()].sort((a, b) => b[1].value - a[1].value);
  const max = rows[0]?.[1].value ?? 1;
  const share = (v: number) => (total > 0 ? v / total : 0);
  const label = (g: string) => EXPENSE_GROUPS[g]?.label ?? g;
  const [first, second] = rows;

  return (
    <Section
      id="servicos"
      question="Por quais serviços?"
      lede={
        !first ? (
          "As despesas não trazem categoria registrada."
        ) : rows.length === 1 ? (
          <>Todas as despesas são de {lcFirst(label(first[0]))}.</>
        ) : share(first[1].value) >= 0.9 ? (
          <>
            <Fig>{pct(share(first[1].value))}</Fig> do valor foi para {lcFirst(label(first[0]))}; o restante se divide entre {num(rows.length - 1)}{" "}
            {rows.length === 2 ? "outra categoria" : "outras categorias"}. Cada grupo reúne categorias oficiais do TSE, como declaradas pelas campanhas.
          </>
        ) : (
          <>
            Principalmente {lcFirst(label(first[0]))} (<Fig>{pct(share(first[1].value))}</Fig> do valor), seguido de {lcFirst(label(second[0]))} (
            <Fig>{pct(share(second[1].value))}</Fig>). Cada grupo reúne categorias oficiais do TSE, como declaradas pelas campanhas.
          </>
        )
      }
      source={
        <SourceLine
          label="TSE, despesas contratadas, categoria de cada despesa"
          info={entityOfficial("despesas_contratadas", year, generatedAt, "Despesas somadas pela categoria oficial informada pela campanha; os grupos que reúnem essas categorias são uma classificação do Prumo.", {
            label: "Ver a metodologia",
            href: "/metodologia",
          })}
        />
      }
    >
      {rows.length > 0 && (
        <table className="dt max-w-[880px]">
          <thead>
            <tr>
              <th scope="col">Categoria de gasto</th>
              <th scope="col" className="n hidden sm:table-cell">
                Despesas
              </th>
              <th scope="col" className="n">
                Valor
              </th>
              <th scope="col" className="n">
                Do total
              </th>
            </tr>
          </thead>
          {rows.map(([g, v]) => {
            // The official categories are listed when they add something to the group label.
            const subs = v.cats.length > 1 || (v.cats[0] && v.cats[0].category.toLowerCase() !== label(g).toLowerCase()) ? v.cats : [];
            return (
              <tbody key={g}>
                <tr>
                  <td>
                    <Link href={`${tx}&grupo=${g}`} className="e no-underline hover:underline">
                      {label(g)}
                    </Link>
                    {EXPENSE_GROUPS[g]?.help && <div className="s text-[13.5px]">{EXPENSE_GROUPS[g].help}</div>}
                    {rows.length > 1 && v.value / max >= 0.01 && <ShareBar share={v.value / max} color="var(--spend)" />}
                  </td>
                  <td className="n s hidden sm:table-cell">{num(v.n)}</td>
                  <td className="n text-ink">{brlc(v.value)}</td>
                  <td className="n s">{pct(share(v.value))}</td>
                </tr>
                {subs.map((c) => (
                  <tr key={c.category}>
                    <td style={{ paddingLeft: "1rem" }}>
                      <Link className="action text-[13.5px]" href={`${tx}&categoria_tse=${encodeURIComponent(c.category)}`}>
                        {c.category}
                      </Link>
                    </td>
                    <td className="n s hidden text-[13.5px] sm:table-cell">{num(c.n)}</td>
                    <td className="n s text-[13.5px]">{brlc(c.value)}</td>
                    <td className="n s text-[13.5px]">{pct(share(c.value))}</td>
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      )}
    </Section>
  );
}
