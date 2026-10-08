import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container, Empty } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/editorial";
import { ConnectionStart, ConnectionViews } from "@/components/graph/ConnectionViews";
import { expand } from "@/lib/queries/graph";
import { featured } from "@/lib/queries/dashboard";
import { parseYear } from "@/lib/labels";
import { titleName } from "@/lib/format";

export const metadata: Metadata = {
  title: "Conexões",
  description: "Siga o dinheiro entre candidaturas, doadores, fornecedores e partidos nos dados de prestação de contas do TSE.",
};

const NODE_RE = /^(c:\d{4}:\d{5,14}|e:[a-z0-9]{2,20}|p:.{1,40}|s:[a-z0-9]{2,40}|g:\d{14}|r:[A-Za-zÀ-ú ]{3,30}:[\w.\/-]{1,40}|y:\d{4}|d:\d{4}:\d{5,14}|t:\d{4}:\d{5,14}:[a-z]{2,20})$/;

export default function ConnectionsPage({ searchParams }: PageProps<"/conexoes">) {
  return (
    <Container className="pb-8">
      <PageHeader
        crumbs={[{ label: "Seguir o dinheiro" }, { label: "Conexões" }]}
        title="Conexões"
        lede="Quem doou para quem e quem recebeu de quais campanhas. Comece por um nome e siga uma relação de cada vez: cada passo mostra as ligações de maior valor primeiro."
      />
      <div className="mt-8">
        <Suspense fallback={<p className="text-[15px] text-muted">Carregando as conexões…</p>}>
          <Graph searchParams={searchParams} />
        </Suspense>
      </div>
    </Container>
  );
}

async function Graph({ searchParams }: { searchParams: PageProps<"/conexoes">["searchParams"] }) {
  const sp = await searchParams;
  const node = (Array.isArray(sp.no) ? sp.no[0] : sp.no) ?? "";
  const year = parseYear(sp.ano ?? (node.startsWith("c:") ? node.split(":")[1] : undefined));
  const trailParam = (Array.isArray(sp.trilha) ? sp.trilha[0] : sp.trilha) ?? "";
  const trail = trailParam
    .split(",")
    .filter((s) => NODE_RE.test(s))
    .slice(0, 8);

  if (!node) {
    const list = await featured(year);
    return (
      <div>
        <ConnectionStart year={year} />
        <p className="mt-4 max-w-[62ch] text-[14.5px] leading-relaxed text-ink-2">
          Ou comece por:{" "}
          {list.map((c, i) => (
            <span key={c.id}>
              {i > 0 && (i === list.length - 1 ? " ou " : ", ")}
              <Link className="link text-ink" href={`/conexoes?no=c:${year}:${c.id}`}>
                {titleName(c.ballot_name)}
              </Link>
            </span>
          ))}
          .
        </p>
      </div>
    );
  }

  const initial = NODE_RE.test(node) ? await expand(node, year, 24) : null;
  if (!initial?.center) {
    return (
      <Empty>
        Não encontramos esse ponto de partida em {year}. Ele pode não ter movimentação nesta eleição.{" "}
        <Link className="link" href="/conexoes">
          Começar por outro nome
        </Link>
        .
      </Empty>
    );
  }
  return <ConnectionViews key={`${node}-${year}`} initial={initial} year={year} initialTrail={trail} />;
}
