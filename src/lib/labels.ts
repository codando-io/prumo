// Vocabulary shared by every page: categories, colours, offices, results, signals.
// Pure data — safe on server and client.

export const YEARS = [2026, 2022, 2018] as const;
export const CURRENT_YEAR = 2026;
export type Year = (typeof YEARS)[number];

export function parseYear(v: unknown): Year {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return (YEARS as readonly number[]).includes(n) ? (n as Year) : CURRENT_YEAR;
}

/* ---------- Funding (revenue) ---------- */

// Display groups for the composition bar, in stack order (public first). Colours were
// validated for adjacent-pair CVD separation in light and dark modes (see globals.css).
export const FUNDING_GROUPS = [
  { key: "fefc", label: "Fundo Eleitoral (FEFC)", short: "Fundo Eleitoral", color: "var(--fund-fefc)", public: true },
  { key: "fp", label: "Fundo Partidário", short: "Fundo Partidário", color: "var(--fund-fp)", public: true },
  { key: "pf", label: "Pessoas físicas", short: "Pessoas físicas", color: "var(--fund-pf)", public: false },
  { key: "partido", label: "Partido (recursos privados)", short: "Partido (privado)", color: "var(--fund-partido)", public: false },
  { key: "proprios", label: "Recursos próprios", short: "Próprios", color: "var(--fund-proprios)", public: false },
  { key: "coletivo", label: "Financiamento coletivo", short: "Vaquinha", color: "var(--fund-coletivo)", public: false },
  { key: "outras", label: "Outras fontes", short: "Outras", color: "var(--fund-outras)", public: false },
] as const;
export type FundingGroup = (typeof FUNDING_GROUPS)[number]["key"];

// Fine-grained revenue categories (as stored) -> display group.
export const REVENUE_CATEGORY: Record<string, { label: string; group: FundingGroup; help: string }> = {
  fefc: { label: "Fundo Especial de Financiamento de Campanha", group: "fefc", help: "Dinheiro público do Fundo Eleitoral, distribuído pelos partidos às candidaturas." },
  fp: { label: "Fundo Partidário", group: "fp", help: "Dinheiro público do Fundo Partidário repassado pelo partido à campanha." },
  pf: { label: "Doações de pessoas físicas", group: "pf", help: "Doações de cidadãos (inclui doações pela internet). Empresas não podem doar desde 2015." },
  partido: { label: "Recursos de partido (outros recursos)", group: "partido", help: "Repasses do partido com recursos que não vêm dos fundos públicos — por exemplo, doações que o partido recebeu." },
  proprios: { label: "Recursos próprios", group: "proprios", help: "Dinheiro do próprio candidato." },
  coletivo: { label: "Financiamento coletivo", group: "coletivo", help: "Doações feitas por meio de plataformas de 'vaquinha' autorizadas pelo TSE." },
  candidatos: { label: "Recursos de outros candidatos (privados)", group: "outras", help: "Repasses de outras campanhas com recursos privados." },
  nao_identificada: { label: "Recursos de origem não identificada", group: "outras", help: "Receitas cujo doador não pôde ser identificado. Pela legislação, não podem ser usadas e devem ser devolvidas ao Tesouro." },
  outros: { label: "Outras receitas", group: "outras", help: "Rendimentos de aplicações financeiras, comercialização de bens e eventos." },
};

export function fundingGroupOf(category: string): FundingGroup {
  return REVENUE_CATEGORY[category]?.group ?? "outras";
}

export const DONOR_TYPE: Record<string, string> = {
  pf: "Pessoa física",
  pj: "Empresa",
  partido: "Órgão partidário",
  candidato: "Outra campanha",
  proprio: "O próprio candidato",
  plataforma: "Plataforma de financiamento coletivo",
  desconhecido: "Não identificado",
};

export const ENTITY_KIND: Record<string, string> = {
  pf: "Pessoa física",
  pj: "Empresa",
  partido: "Órgão partidário",
  campanha: "Conta de campanha",
  plataforma: "Plataforma de financiamento coletivo",
  desconhecido: "Não identificado",
};

/* ---------- Spending (expense) ---------- */

export const EXPENSE_GROUPS: Record<string, { label: string; help: string }> = {
  impressos: { label: "Material impresso", help: "Santinhos, adesivos, jornais, placas e correspondência." },
  digital: { label: "Internet e impulsionamento", help: "Impulsionamento de conteúdo em redes sociais e sites." },
  audiovisual: { label: "Rádio, TV e vídeo", help: "Produção de programas, jingles e carros de som." },
  pessoal: { label: "Pessoal e mobilização", help: "Contratação de pessoal, cabos eleitorais e militância de rua." },
  servicos: { label: "Serviços profissionais", help: "Serviços de terceiros, advocacia, contabilidade e pesquisas." },
  transporte: { label: "Transporte e veículos", help: "Locação de veículos, combustível, passagens e hospedagem." },
  estrutura: { label: "Estrutura e comitê", help: "Aluguel de imóveis e bens, materiais de expediente, água, energia, alimentação." },
  eventos: { label: "Eventos e comícios", help: "Eventos de promoção da candidatura e comícios." },
  transferencias: { label: "Repasses a candidatos e partidos", help: "Doações da campanha para outras campanhas ou partidos." },
  outros: { label: "Taxas e outras despesas", help: "Taxas bancárias, impostos, multas e despesas 'diversas a especificar'." },
};

export const FUND_LABEL: Record<string, string> = {
  FEFC: "Fundo Eleitoral (FEFC)",
  FP: "Fundo Partidário",
  OUTROS: "Outros recursos",
};

/* ---------- Candidates ---------- */

export const OFFICES: { code: number; label: string; plural: string }[] = [
  { code: 1, label: "Presidente", plural: "Presidente" },
  { code: 3, label: "Governador", plural: "Governador" },
  { code: 5, label: "Senador", plural: "Senador" },
  { code: 6, label: "Deputado Federal", plural: "Deputado federal" },
  { code: 7, label: "Deputado Estadual", plural: "Deputado estadual" },
  { code: 8, label: "Deputado Distrital", plural: "Deputado distrital" },
];

export function resultLabel(
  result: string | null | undefined,
  year: number,
  registration?: string | null,
): { label: string; tone: "elected" | "runoff" | "neutral" | "muted" } {
  if (!result && registration === "INAPTO") return { label: "Candidatura considerada inapta", tone: "muted" };
  switch (result) {
    case "ELEITO":
      return { label: "Eleito", tone: "elected" };
    case "ELEITO POR QP":
      return { label: "Eleito por quociente partidário", tone: "elected" };
    case "ELEITO POR MÉDIA":
      return { label: "Eleito por média", tone: "elected" };
    case "SUPLENTE":
      return { label: "Suplente", tone: "neutral" };
    case "NÃO ELEITO":
      return { label: "Não eleito", tone: "neutral" };
    case "2º TURNO":
      return year === CURRENT_YEAR
        ? { label: "Disputa o 2º turno", tone: "runoff" }
        : { label: "Foi ao 2º turno", tone: "runoff" };
    default:
      return { label: "Sem resultado de votação", tone: "muted" };
  }
}

export const FILING_TYPE: Record<string, string> = {
  PARCIAL: "Prestação de contas parcial",
  "RELATORIO FINANCEIRO": "Relatório financeiro",
  FINAL: "Prestação de contas final",
  "REGULARIZACAO DA OMISSAO": "Regularização de omissão",
};

export const UF_NAMES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal",
  ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MG: "Minas Gerais", MS: "Mato Grosso do Sul",
  MT: "Mato Grosso", PA: "Pará", PB: "Paraíba", PE: "Pernambuco", PI: "Piauí", PR: "Paraná",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RO: "Rondônia", RR: "Roraima", RS: "Rio Grande do Sul",
  SC: "Santa Catarina", SE: "Sergipe", SP: "São Paulo", TO: "Tocantins", BR: "Brasil", ZZ: "Exterior",
};

const REGION: Record<string, string> = {
  AC: "NORTE", AP: "NORTE", AM: "NORTE", PA: "NORTE", RO: "NORTE", RR: "NORTE", TO: "NORTE",
  AL: "NORDESTE", BA: "NORDESTE", CE: "NORDESTE", MA: "NORDESTE", PB: "NORDESTE", PE: "NORDESTE", PI: "NORDESTE", RN: "NORDESTE", SE: "NORDESTE",
  DF: "CENTROOESTE", GO: "CENTROOESTE", MT: "CENTROOESTE", MS: "CENTROOESTE",
  ES: "SUDESTE", MG: "SUDESTE", RJ: "SUDESTE", SP: "SUDESTE",
  PR: "SUL", RS: "SUL", SC: "SUL", BR: "BRASIL",
};

const PORTAL_ELECTION: Record<number, string> = { 2026: "20322002026", 2022: "2040602022", 2018: "2022802018" };

/** Link to the candidate's official page on DivulgaCandContas (TSE). */
export function tseCandidateUrl(year: number, uf: string, id: string) {
  return `https://divulgacandcontas.tse.jus.br/divulga/#/candidato/${REGION[uf] ?? "BRASIL"}/${uf}/${PORTAL_ELECTION[year]}/${id}/${year}/${uf}`;
}

export const TSE_DATASETS = {
  candidatos: { label: "Candidatos", page: "https://dadosabertos.tse.jus.br/dataset/?q=candidatos" },
  prestacao: { label: "Prestação de contas eleitorais", page: "https://dadosabertos.tse.jus.br/dataset/?q=presta%C3%A7%C3%A3o+de+contas" },
  bens: { label: "Bens de candidatos", page: "https://dadosabertos.tse.jus.br/dataset/?q=candidatos" },
  votacao: { label: "Resultados — votação nominal", page: "https://dadosabertos.tse.jus.br/dataset/?q=resultados" },
} as const;

export function cdnFile(kind: "receitas" | "despesas_contratadas" | "despesas_pagas" | "candidatos" | "bens" | "votacao", year: number) {
  const base = "https://cdn.tse.jus.br/estatistica/sead/odsele";
  switch (kind) {
    case "candidatos":
      return { zip: `${base}/consulta_cand/consulta_cand_${year}.zip`, file: `consulta_cand_${year}_BRASIL.csv` };
    case "bens":
      return { zip: `${base}/bem_candidato/bem_candidato_${year}.zip`, file: `bem_candidato_${year}_BRASIL.csv` };
    case "votacao":
      return { zip: `${base}/votacao_candidato_munzona/votacao_candidato_munzona_${year}.zip`, file: `votacao_candidato_munzona_${year}_BRASIL.csv` };
    default:
      return {
        zip: `${base}/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_${year}.zip`,
        file: `${kind === "receitas" ? "receitas_candidatos" : kind === "despesas_contratadas" ? "despesas_contratadas_candidatos" : "despesas_pagas_candidatos"}_${year}_BRASIL.csv`,
      };
  }
}

/* ---------- Assets ---------- */

export const ASSET_CATEGORY: Record<string, string> = {
  imoveis: "Imóveis",
  veiculos: "Veículos",
  participacoes: "Participações em empresas e ações",
  investimentos: "Aplicações e investimentos",
  depositos: "Depósitos e poupança",
  dinheiro: "Dinheiro em espécie",
  creditos: "Créditos e empréstimos concedidos",
  outros: "Outros bens e direitos",
};
