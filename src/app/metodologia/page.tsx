import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, Suspense } from "react";
import { Container } from "@/components/ui/primitives";
import { PageHeader, Section } from "@/components/ui/editorial";
import { q } from "@/lib/db";
import { EXPENSE_GROUPS, REVENUE_CATEGORY, FUNDING_GROUPS, YEARS, cdnFile } from "@/lib/labels";
import { describeSignal, FAMILY_LABEL } from "@/lib/signals";
import { num } from "@/lib/format";
import { Toc } from "./Toc";
import { TOPICS, TOPIC_MIN_HITS } from "@/lib/queries/proposals";

export const metadata: Metadata = {
  title: "Metodologia",
  description: "De onde vêm os dados do Prumo, como são tratados, como cada métrica e cada padrão são calculados, e quais são os limites da análise.",
};

const SIGNAL_CODES = [
  ["fornecedor_concentrado", "concentracao"],
  ["doador_concentrado", "concentracao"],
  ["autofinanciamento", "concentracao"],
  ["transacao_grande", "concentracao"],
  ["categoria_concentrada", "concentracao"],
  ["gasto_reta_final", "tempo"],
  ["fornecedor_compartilhado", "relacoes"],
  ["doador_multiplo", "relacoes"],
  ["doador_fornecedor", "relacoes"],
  ["despesa_maior_receita", "consistencia"],
  ["origem_nao_identificada", "consistencia"],
  ["data_fora_periodo", "consistencia"],
  ["mudanca_totais", "mudanca"],
  ["registros_removidos", "mudanca"],
] as const;

const TOC = [
  ["principios", "Princípios"],
  ["fontes", "De onde vêm os dados"],
  ["tipos", "Dado oficial, cálculo e padrão"],
  ["tratamento", "Como os dados são tratados"],
  ["categorias", "Categorias"],
  ["pessoas", "Pessoas e privacidade"],
  ["metricas", "Métricas"],
  ["padroes", "Sinais nos dados"],
  ["propostas", "Propostas de governo"],
  ["enriquecimento", "Empresas e outras fontes"],
  ["limites", "O que o Prumo não faz"],
  ["glossario", "Glossário"],
] as const;

const SOURCE_FILES = [
  ["candidatos", "Candidaturas"],
  ["bens", "Bens declarados"],
  ["receitas", "Receitas"],
  ["despesas_contratadas", "Despesas contratadas"],
  ["despesas_pagas", "Despesas pagas"],
  ["votacao", "Votação por município e zona"],
] as const;

// Same wording as the provenance popover (components/ui/Source, a client module).
const KIND = { oficial: "Dado oficial do TSE", calculo: "Cálculo do Prumo", sinal: "Padrão estatístico" };

/* Long-form reading: body at 16.5px, lines under 68ch. */
const bodyText = "max-w-[68ch] text-[16.5px] leading-[1.7] text-ink-2";

function P({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`mt-4 first:mt-0 ${bodyText} ${className}`}>{children}</p>;
}

function List({ children }: { children: React.ReactNode }) {
  return <ul className={`mt-4 list-disc space-y-2.5 pl-5 first:mt-0 marker:text-muted ${bodyText}`}>{children}</ul>;
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-10 text-[17px] font-semibold leading-snug text-ink first:mt-0">{children}</h3>;
}

/** Term → definition list separated by hairlines (metrics, glossary, kinds of number). */
function Definitions({ items }: { items: readonly (readonly [React.ReactNode, React.ReactNode])[] }) {
  return (
    <dl className="mt-4 max-w-[68ch] border-t border-rule first:mt-0">
      {items.map(([t, d], i) => (
        <div key={i} className="border-b border-rule py-3.5">
          <dt className="text-[16px] font-medium text-ink">{t}</dt>
          <dd className="mt-1 text-[16px] leading-[1.65] text-ink-2">{d}</dd>
        </div>
      ))}
    </dl>
  );
}

const strong = (s: string) => <span className="text-ink">{s}</span>;

export default function MethodologyPage() {
  return (
    <Container className="pb-8">
      <PageHeader
        crumbs={[{ label: "Início", href: "/" }, { label: "Sobre os dados" }]}
        title="Metodologia"
        lede="O Prumo reorganiza dados que o Tribunal Superior Eleitoral já publica, para que qualquer pessoa entenda de onde veio e para onde foi o dinheiro de uma campanha. Esta página explica cada etapa, para que todo número possa ser conferido."
        actions={[
          { label: "Atualizações dos dados", href: "/atualizacoes" },
          { label: "Portal de Dados Abertos do TSE", href: "https://dadosabertos.tse.jus.br/", external: true },
        ]}
      />

      <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-x-16">
        <aside className="hidden pt-[6.5rem] lg:block">
          <div className="sticky top-[88px]">
            <Toc items={TOC} />
          </div>
        </aside>

        <article className="min-w-0 max-w-[760px]">
          <Section id="principios" question="Que princípios o Prumo segue?" lede="Mostrar o que o TSE publica, dizer o que é fato e o que é cálculo, e nunca transformar um padrão em acusação.">
            <List>
              <li>Separar sempre o que é dado oficial, o que é cálculo do Prumo e o que é um padrão estatístico.</li>
              <li>Não inventar informação, não preencher lacunas e não corrigir valores declarados.</li>
              <li>Nunca apresentar um padrão estatístico como prova de irregularidade, nem sugerir crime a partir de dados incomuns.</li>
              <li>Manter comparações descritivas: sem notas, pontuações ou rankings de mérito de candidatos ou partidos. Partidos não recebem cores.</li>
              <li>Ligar cada visualização às transações que a produziram e ao registro original no TSE.</li>
            </List>
          </Section>

          <Section
            id="fontes"
            question="De onde vêm os dados?"
            lede={
              <>
                Todos os dados vêm do{" "}
                <a className="link text-ink" href="https://dadosabertos.tse.jus.br/" rel="noreferrer">
                  Portal de Dados Abertos do TSE
                </a>
                , para as eleições gerais de {YEARS.slice().reverse().join(", ")}.
              </>
            }
          >
            <H3>Arquivos usados em cada eleição</H3>
            <table className="dt mt-3">
              <thead>
                <tr>
                  <th scope="col">Conjunto</th>
                  <th scope="col">Arquivo no portal do TSE</th>
                </tr>
              </thead>
              <tbody>
                {SOURCE_FILES.map(([k, label]) => (
                  <tr key={k}>
                    <td className="e whitespace-nowrap">{label}</td>
                    <td className="s break-all">
                      {cdnFile(k, 2026).file.replace("2026", "{ano}")}
                      {k === "receitas" && (
                        <div className="mt-0.5 break-normal text-[13.5px]">
                          e o arquivo de doadores originários (doações recebidas por partidos e plataformas e repassadas às campanhas)
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <P className="mt-6">
              Também usamos as fotos oficiais de candidatura publicadas pelo TSE e as malhas de estados e municípios do{" "}
              <a className="link text-ink" href="https://servicodados.ibge.gov.br/api/docs/malhas" rel="noreferrer">
                IBGE
              </a>
              . A cada atualização, o Prumo verifica quais arquivos mudaram no servidor do TSE e reconstrói a base. As datas de publicação de cada arquivo aparecem nas
              páginas e em{" "}
              <Link className="link text-ink" href="/atualizacoes">
                Atualizações
              </Link>
              .
            </P>
          </Section>

          <Section
            id="tipos"
            question="Que tipo de número é este?"
            lede="Todo número do Prumo é de um de três tipos. Nos números importantes, um clique mostra de onde vêm, e cada seção traz uma linha com a fonte."
          >
            <Definitions
              items={[
                [KIND.oficial, "Valor como publicado pelo TSE, ou soma e contagem simples dos registros oficiais (por exemplo, o total de receitas de uma campanha)."],
                [KIND.calculo, "Valor calculado pelo Prumo a partir dos registros: proporções, médias, medianas, valores por voto, comparações com outras campanhas."],
                [
                  KIND.sinal,
                  "Um padrão nos dados que pode merecer um olhar mais atento, gerado por regras fixas e públicas (abaixo). Não é acusação nem indício de irregularidade.",
                ],
              ]}
            />
          </Section>

          <Section id="tratamento" question="Como os dados são tratados?" lede="Nenhum valor declarado é alterado. O tratamento converte a codificação, junta os itens de uma mesma transação e liga os votos aos municípios.">
            <List>
              <li>Os arquivos do TSE vêm em codificação Latin-1; convertemos para UTF-8 e removemos bytes nulos. Nenhum valor é alterado.</li>
              <li>
                Cada receita e cada despesa tem um identificador do TSE (SQ_RECEITA, SQ_DESPESA). Quando uma doação em bens tem vários itens, eles aparecem em linhas
                com o mesmo identificador: somamos os itens e contamos uma transação.
              </li>
              <li>Linhas sem identificador (“-1”) indicam campanhas que entregaram prestação sem movimentação; não entram nas somas.</li>
              <li>
                {strong("Receitas")} incluem doações estimáveis em dinheiro (bens e serviços cedidos, como um carro emprestado), sempre identificadas como tal. O arquivo
                de {strong("despesas contratadas")} traz todos os gastos declarados, inclusive doações da campanha a outros candidatos e partidos; a soma corresponde ao
                “Total de Despesas” do DivulgaCandContas, e é o que o Prumo chama de total de despesas. O arquivo de {strong("despesas pagas")} registra cada pagamento e
                de qual conta saiu o dinheiro (Fundo Eleitoral, Fundo Partidário ou outros recursos).
              </li>
              <li>
                Os arquivos trazem apenas a prestação mais recente de cada campanha. Durante a eleição, ela pode ser um relatório financeiro ou uma prestação parcial;
                depois, a prestação final. Cada página informa qual foi considerada.
              </li>
              <li>Vices e suplentes não têm contas próprias: o dinheiro da chapa é registrado na conta do titular.</li>
              <li>
                Votos são a soma dos votos nominais em todas as zonas, no último turno disputado. Municípios do TSE são ligados aos do IBGE pelo nome (com correção para
                grafias diferentes e municípios renomeados).
              </li>
            </List>
          </Section>

          <Section
            id="categorias"
            question="Como agrupamos as categorias?"
            lede="Receitas são divididas entre dinheiro público e privado; despesas, em dez grupos que reúnem as cerca de 45 categorias oficiais do TSE."
          >
            <H3>Origem do dinheiro</H3>
            <P>
              Dinheiro {strong("público")} é o que o TSE classifica como Fundo Especial de Financiamento de Campanha (FEFC) ou Fundo Partidário — mesmo quando chega à
              campanha por meio de um repasse do partido ou de outro candidato. Todo o resto é {strong("privado")}.
            </P>
            <table className="dt mt-5">
              <thead>
                <tr>
                  <th scope="col">Grupo</th>
                  <th scope="col">O que inclui</th>
                </tr>
              </thead>
              <tbody>
                {FUNDING_GROUPS.map((g) => (
                  <tr key={g.key}>
                    <td className="w-[38%]">
                      <span className="flex items-baseline gap-2.5">
                        <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 translate-y-[1px]" style={{ background: g.color }} />
                        <span>
                          <span className="e">{g.label}</span>
                          <span className="s block text-[13.5px]">{g.public ? "Dinheiro público" : "Dinheiro privado"}</span>
                        </span>
                      </span>
                    </td>
                    <td className="s">
                      {Object.entries(REVENUE_CATEGORY)
                        .filter(([, v]) => v.group === g.key)
                        .map(([, v]) => v.help)
                        .join(" ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <H3>Destino do dinheiro</H3>
            <P>
              O TSE classifica despesas em cerca de 45 categorias oficiais. Para leitura rápida, o Prumo as agrupa em dez grupos; a categoria oficial continua visível em
              cada despesa e nos detalhamentos.
            </P>
            <Suspense fallback={<P className="text-muted">Carregando categorias…</P>}>
              <ExpenseMapping />
            </Suspense>
          </Section>

          <Section id="pessoas" question="Como o Prumo trata dados de pessoas?" lede="CPFs aparecem apenas mascarados e nunca em endereços de página; CNPJs, que identificam pessoas jurídicas, aparecem completos.">
            <List>
              <li>
                O TSE publica o CPF completo de doadores e fornecedores pessoas físicas. O Prumo mostra apenas a forma mascarada (***.123.456-**), padrão usado pelo
                governo federal, e nunca coloca CPFs em endereços de página.
              </li>
              <li>CNPJs de empresas, órgãos partidários e contas de campanha são informações públicas de pessoas jurídicas e aparecem completos.</li>
              <li>
                Uma mesma pessoa é reconhecida entre eleições, e entre os papéis de doadora, fornecedora e candidata, pelo CPF informado ao TSE. Nomes iguais com CPFs
                diferentes são pessoas diferentes.
              </li>
            </List>
          </Section>

          <Section id="metricas" question="Como calculamos as métricas?" lede="São descrições feitas a partir dos registros oficiais. Nenhuma delas é nota, pontuação ou medida de eficiência.">
            <Definitions
              items={[
                ["Parcela pública", "Receitas do FEFC e do Fundo Partidário divididas pela receita total."],
                [
                  "Gasto por voto",
                  "Total de despesas dividido pelos votos do último turno disputado. Também calculamos receita, dinheiro público e privado por voto. São métricas descritivas: não medem eficiência e não estabelecem relação de causa entre dinheiro e votos.",
                ],
                ["Doação média e mediana", "Calculadas sobre as doações de pessoas físicas, uma por transação. A mediana é o valor do meio; é menos afetada por doações muito grandes."],
                [
                  "Comparação com outras campanhas",
                  "Percentil da campanha entre todas as campanhas ao mesmo cargo na mesma eleição (nacional), e medianas por cargo no país e em cada estado.",
                ],
                [
                  "Distribuição dentro do partido",
                  "Índice de Gini do dinheiro público recebido pelas candidaturas de cada partido (0 = todas recebem o mesmo; perto de 1 = poucas concentram quase tudo) e a parcela recebida pelos 10% que mais receberam.",
                ],
              ]}
            />
          </Section>

          <Section
            id="padroes"
            question="Como calculamos os sinais?"
            lede="Os sinais nos dados são calculados automaticamente, com as mesmas regras para todas as campanhas. Nenhum deles indica, por si só, irregularidade."
          >
            <P>
              Sinais de concentração e de tempo só se aplicam a campanhas que arrecadaram ou gastaram ao menos R$ 30 mil, porque campanhas muito pequenas são
              naturalmente concentradas. Quando o padrão é comum, exigimos também que a campanha esteja entre as 10% com o valor mais alto para o mesmo cargo. Na página
              de cada candidatura, cada sinal aparece com um rótulo neutro, uma frase com o fato e um link para as transações.
            </P>
            <Suspense fallback={<P className="text-muted">Carregando sinais…</P>}>
              <SignalList />
            </Suspense>
          </Section>

          <Section
            id="propostas"
            question="Como o Prumo mostra as propostas de governo?"
            lede="O documento oficial nunca é alterado. O Prumo extrai o texto do PDF para leitura e busca, e oferece um índice próprio para navegar, sempre identificado como do Prumo."
          >
            <P>
              Candidaturas a presidente e a governador entregam ao TSE uma proposta de governo em PDF, publicada nos dados abertos (um arquivo por estado e eleição).
              O Prumo guarda o PDF como foi publicado e o serve sem modificação; cada página lida no Prumo tem um link para a mesma página no original. O texto é
              extraído do próprio PDF, página por página. Páginas que são imagens (documentos digitalizados) são lidas por reconhecimento óptico de caracteres (OCR),
              sempre identificadas como tal, porque o texto reconhecido pode conter erros. Arquivos que o TSE publicou corrompidos aparecem como tal. Números no formato de CPF que aparecem no texto (por exemplo, em assinaturas digitais) são mascarados na leitura, como em todo o Prumo; o PDF original continua disponível sem alteração.
            </P>
            <P>
              O Índice Prumo tem duas partes, ambas apenas para navegação. Os títulos são linhas curtas em maiúsculas ou numeradas, detectadas automaticamente no
              texto, com o número da página. Os temas são listas públicas de termos: uma página entra em um tema quando tem pelo menos {TOPIC_MIN_HITS} ocorrências
              de termos da lista. Isso mostra onde um assunto é mencionado, não o que foi proposto, nem a qualidade ou a quantidade das propostas. Não usamos
              resumos automáticos; se um dia forem usados, serão identificados como gerados por inteligência artificial e sempre ligados ao trecho original.
            </P>
            <P>Os termos de cada tema (sem acentos; um asterisco casa qualquer palavra que comece com o termo):</P>
            <table className="dt mt-4">
              <thead>
                <tr>
                  <th scope="col">Tema</th>
                  <th scope="col">Termos procurados</th>
                </tr>
              </thead>
              <tbody>
                {TOPICS.map((t) => (
                  <tr key={t.key}>
                    <td className="e whitespace-nowrap">{t.label}</td>
                    <td className="s text-[14px]">{t.terms.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section
            id="enriquecimento"
            question="Como o Prumo junta outras fontes públicas?"
            lede="Empresas que aparecem nas prestações de contas são completadas com dados oficiais de outros órgãos, sempre pelo CNPJ e sempre com a fonte e a data."
          >
            <P>
              <strong className="font-medium text-ink">Identidade.</strong> Uma empresa é identificada pelo CNPJ; registros de outro estabelecimento da mesma empresa
              são ligados pela raiz do CNPJ (os oito primeiros dígitos) e aparecem identificados como tal. Nomes parecidos nunca bastam para ligar dois registros.
              Quando só existe uma coincidência parcial — por exemplo, um sócio com o mesmo nome e os mesmos seis dígitos visíveis do CPF de uma pessoa que aparece
              no TSE —, o Prumo mostra uma “possível correspondência”, com aparência diferente e a explicação do critério, e nunca a trata como confirmada.
            </P>
            <P>
              <strong className="font-medium text-ink">Fontes.</strong> Cadastro de empresas, estabelecimentos, quadro de sócios e Simples Nacional: Dados Abertos CNPJ
              da Receita Federal (atualização mensal; CPFs de sócios já publicados mascarados). Cadastros de sanções e impedimentos: CEIS, CNEP, CEPIM e acordos de
              leniência, publicados pela Controladoria-Geral da União no Portal da Transparência (atualização diária; o Prumo carrega apenas registros de pessoas
              jurídicas). Contratos públicos: Portal Nacional de Contratações Públicas (PNCP), consultado pela API oficial e guardado em cópia local; a cobertura de
              municípios no PNCP cresceu a partir de 2024. Telefones, e-mails e endereços dos arquivos da Receita não são carregados.
            </P>
            <P>
              <strong className="font-medium text-ink">Fatos independentes.</strong> Um pagamento de campanha, um contrato público e um registro em cadastro de sanções
              são fatos documentados por fontes diferentes. O Prumo os mostra lado a lado, em ordem cronológica quando faz sentido, mas não infere relação entre eles,
              e a ordem dos eventos não indica causa. Registros de sanção são reproduzidos com o órgão responsável, as datas, a categoria e a situação na data do
              arquivo; o Prumo não os interpreta.
            </P>
          </Section>

          <Section id="limites" question="O que o Prumo não faz" lede="Não audita contas, não corrige o que foi declarado e não tira conclusões sobre intenção ou legalidade.">
            <List>
              <li>Os valores são os declarados pelas campanhas. O Prumo não audita contas: a análise oficial cabe à Justiça Eleitoral.</li>
              <li>As contas de 2026 ainda estão em andamento; totais mudam a cada nova prestação, e o 2º turno ainda não aconteceu.</li>
              <li>
                A prestação de contas quase nunca informa onde cada gasto ocorreu (o município do fornecedor raramente é preenchido). Por isso, no nível municipal
                mostramos votos, não gastos.
              </li>
              <li>Datas são as registradas pelas campanhas e podem conter erros de digitação; mantemos os registros como publicados e sinalizamos datas fora do ano eleitoral.</li>
              <li>Nomes de fornecedores e doadores seguem o cadastro da Receita Federal quando o TSE o informa; caso contrário, o nome declarado pela campanha.</li>
              <li>Relações entre doadores, fornecedores e candidaturas mostram apenas que houve doação ou pagamento registrado — não proximidade, influência ou intenção.</li>
            </List>
          </Section>

          <Section id="glossario" question="O que quer dizer cada termo?">
            <Definitions
              items={[
                ["FEFC (Fundo Eleitoral)", "Fundo Especial de Financiamento de Campanha: dinheiro público distribuído aos partidos para as campanhas, que o repassam às candidaturas."],
                ["Fundo Partidário", "Dinheiro público destinado ao funcionamento dos partidos, que também pode ser usado em campanhas."],
                ["Doação estimável", "Doação de bens ou serviços (um carro emprestado, um imóvel cedido), registrada pelo valor estimado em dinheiro."],
                ["Recursos próprios", "Dinheiro do próprio candidato aplicado na campanha."],
                ["Financiamento coletivo", "Doações feitas por plataformas de “vaquinha” cadastradas no TSE, que repassam os valores à campanha."],
                ["Doador originário", "Quem doou a um partido ou plataforma, quando esse dinheiro foi repassado a uma campanha."],
                ["Relatório financeiro", "Informação enviada durante a campanha sobre recursos recebidos, em até 72 horas do recebimento."],
                ["Prestação parcial e final", "A parcial é entregue durante a campanha; a final, depois da eleição, consolida todas as receitas e despesas."],
                [
                  "Quociente partidário (QP)",
                  "Nas eleições para deputado, as vagas são distribuídas entre partidos conforme seus votos; “eleito por QP” e “eleito por média” indicam por qual etapa da distribuição a vaga foi obtida.",
                ],
              ]}
            />
          </Section>
        </article>
      </div>
    </Container>
  );
}

async function ExpenseMapping() {
  const rows = await q<{ category_group: string; category: string }>(`SELECT DISTINCT category_group, category FROM exp_cube WHERE category IS NOT NULL ORDER BY 1, 2`);
  return (
    <table className="dt mt-5">
      <thead>
        <tr>
          <th scope="col">Grupo do Prumo</th>
          <th scope="col">Categorias oficiais do TSE</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(EXPENSE_GROUPS).map(([k, g]) => (
          <tr key={k}>
            <td className="w-[38%]">
              <span className="e">{g.label}</span>
              <span className="s block text-[13.5px]">{g.help}</span>
            </td>
            <td className="s">
              {rows
                .filter((r) => r.category_group === k)
                .map((r) => r.category)
                .join("; ") || "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function SignalList() {
  const counts = await q<{ year: number; code: string; n: number }>(`SELECT year, code, count(DISTINCT candidate_id) AS n FROM signal GROUP BY ALL`);
  const years = [...YEARS];
  const described = SIGNAL_CODES.map(([code, family]) => ({
    code,
    family,
    t: describeSignal(
      { code, family, metric: 0, threshold: 0, peer_pct: null, ref_key: null, ref_name: null, ref_value: 0, ref_count: 0 },
      { year: 2026, id: "", office: "", revenue: 0, expense: 0 },
    ),
  }));
  const families = [...new Set(SIGNAL_CODES.map(([, f]) => f))];
  const n = (y: number, code: string) => counts.find((c) => c.year === y && c.code === code)?.n ?? 0;

  return (
    <>
      {families.map((family) => (
        <Fragment key={family}>
          <H3>{FAMILY_LABEL[family]}</H3>
          <ul className="mt-3 max-w-[68ch] border-t border-rule">
            {described
              .filter((s) => s.family === family)
              .map(({ code, t }) => (
                <li key={code} className="border-b border-rule py-4">
                  <h4 className="text-[16.5px] font-medium leading-snug text-ink">{t.title}</h4>
                  <p className="mt-1.5 text-[16px] leading-[1.65] text-ink-2">{t.rule}</p>
                  <p className="mt-1.5 text-[15px] leading-[1.6] text-muted">{t.context}</p>
                </li>
              ))}
          </ul>
        </Fragment>
      ))}

      <H3>Quantas campanhas têm cada sinal</H3>
      <table className="dt mt-3">
        <thead>
          <tr>
            <th scope="col">Sinal</th>
            {years.map((y) => (
              <th key={y} scope="col" className="n">
                {y}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {described.map(({ code, family, t }) => (
            <tr key={code}>
              <td>
                <span className="e">{t.title}</span>
                <span className="s block text-[13.5px]">{FAMILY_LABEL[family]}</span>
              </td>
              {years.map((y) => (
                <td key={y} className={`n ${n(y, code) ? "text-ink" : "s"}`}>
                  {num(n(y, code))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 max-w-[68ch] text-[13.5px] leading-relaxed text-muted">
        Número de candidaturas com cada sinal, por eleição. Os sinais de {FAMILY_LABEL.mudanca.toLowerCase()} dependem de ao menos duas capturas da mesma eleição.
      </p>
    </>
  );
}
