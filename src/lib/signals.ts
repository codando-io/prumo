// Plain-language description of each analytical signal. The wording is deliberately neutral:
// a signal describes a measurable pattern and the data behind it — never intent or legality.
import { brl, brlc, num, pct, titleName } from "./format";

/** "20261007T040537" -> "07/10/2026 04:05" */
function capDate(id: string | null) {
  if (!id || id.length < 15) return "—";
  return `${id.slice(6, 8)}/${id.slice(4, 6)}/${id.slice(0, 4)} ${id.slice(9, 11)}:${id.slice(11, 13)}`;
}

export interface SignalInput {
  code: string;
  family: string;
  metric: number | null;
  threshold: number | null;
  peer_pct: number | null;
  ref_key: string | null;
  ref_name: string | null;
  ref_value: number | null;
  ref_count: number | null;
  strength?: number | null;
}

export interface SignalText {
  title: string;
  body: string;
  context: string;
  rule: string;
  evidence?: { label: string; href: string };
  ref?: { label: string; href: string };
}

export const FAMILY_LABEL: Record<string, string> = {
  concentracao: "Concentração",
  tempo: "Tempo",
  relacoes: "Relação",
  mudanca: "Mudança detectada",
  consistencia: "Consistência",
};

export function describeSignal(
  s: SignalInput,
  c: { year: number; id: string; office: string; revenue: number; expense: number },
): SignalText {
  const tx = (extra: string) => `/transacoes?ano=${c.year}&candidato=${c.id}${extra}`;
  const name = titleName(s.ref_name);
  const peer =
    s.peer_pct != null ? ` Isso é mais do que em ${pct(Math.min(s.peer_pct, 0.999), 0)} das campanhas a ${c.office.toLowerCase()} em ${c.year}.` : "";
  switch (s.code) {
    case "fornecedor_concentrado":
      return {
        title: "Um fornecedor concentra boa parte dos gastos",
        body: `${name} recebeu ${pct(s.metric)} das despesas contratadas pela campanha (${brl(s.ref_value)}).${peer}`,
        context:
          "Concentração pode refletir a contratação de uma agência que reúne vários serviços — produção, mídia, impressão — em um único contrato.",
        rule: "Aparece quando um fornecedor recebe 50% ou mais das despesas, a campanha gastou ao menos R$ 30 mil e a proporção está entre as 10% maiores do cargo.",
        evidence: { label: "Ver as despesas com este fornecedor", href: tx(`&tipo=despesa&contraparte=${s.ref_key}`) },
        ref: s.ref_key ? { label: `Ver ${name} no explorador de fornecedores`, href: `/fornecedores/${s.ref_key}` } : undefined,
      };
    case "doador_concentrado":
      return {
        title: "Um único doador responde por parte grande da receita",
        body: `${name} doou ${brl(s.ref_value)}, o equivalente a ${pct(s.metric)} de toda a receita da campanha.`,
        context:
          "Doações de pessoas físicas são permitidas até 10% dos rendimentos brutos do doador no ano anterior à eleição; esse cruzamento é feito pela Justiça Eleitoral e pela Receita Federal, não pelo Prumo.",
        rule: "Aparece quando um único doador privado (pessoa física ou empresa, sem contar repasses de partidos e recursos próprios) soma 30% ou mais da receita de uma campanha que arrecadou ao menos R$ 30 mil.",
        evidence: { label: "Ver as doações deste doador", href: tx(`&tipo=receita&contraparte=${s.ref_key}`) },
        ref: s.ref_key ? { label: `Ver ${name} no explorador de doadores`, href: `/doadores/${s.ref_key}` } : undefined,
      };
    case "autofinanciamento":
      return {
        title: "Campanha financiada principalmente com recursos próprios",
        body: `${pct(s.metric)} da receita veio de recursos do próprio candidato (${brl(s.ref_value)}).${peer}`,
        context: "O uso de recursos próprios é permitido, dentro dos limites definidos pela legislação de cada eleição.",
        rule: "Aparece quando recursos próprios somam 50% ou mais da receita, a campanha arrecadou ao menos R$ 30 mil e a proporção está entre as 10% maiores do cargo.",
        evidence: { label: "Ver as receitas de recursos próprios", href: tx(`&tipo=receita&categoria=proprios`) },
      };
    case "gasto_reta_final":
      return {
        title: "Gastos concentrados na última semana antes da eleição",
        body: `${pct(s.metric)} das despesas contratadas têm data nos 7 dias anteriores ao 1º turno (${brl(s.ref_value)}).${peer}`,
        context:
          "É comum que os gastos se intensifiquem no fim da campanha. A data registrada costuma ser a da contratação, que pode não coincidir com a da entrega do serviço.",
        rule: "Aparece quando 40% ou mais das despesas são datadas na última semana antes do 1º turno, a campanha gastou ao menos R$ 30 mil e a proporção está entre as 10% maiores do cargo.",
        evidence: { label: "Ver as despesas da última semana", href: tx(`&tipo=despesa&ordem=data_desc`) },
      };
    case "transacao_grande":
      return {
        title: "Uma única despesa pesa muito no total",
        body: `A maior despesa (${brl(s.ref_value)}${s.ref_name ? `, com ${name}` : ""}) corresponde a ${pct(s.metric)} de tudo o que a campanha contratou.${peer}`,
        context: "Pode refletir um contrato amplo, como produção de propaganda de rádio e TV ou uma grande encomenda de material.",
        rule: "Aparece quando a maior despesa representa 40% ou mais do total, a campanha tem ao menos 5 despesas e gastou ao menos R$ 30 mil, e a proporção está entre as 10% maiores do cargo.",
        evidence: { label: "Ver as maiores despesas", href: tx(`&tipo=despesa&ordem=valor_desc`) },
      };
    case "categoria_concentrada":
      return {
        title: "Gastos concentrados em uma categoria",
        body: `${pct(s.metric)} das despesas estão na categoria “${s.ref_name}” (${brl(s.ref_value)}).${peer}`,
        context: "Algumas estratégias de campanha concentram recursos em um único meio, como impressos ou internet.",
        rule: "Aparece quando uma categoria oficial do TSE soma 80% ou mais das despesas, a campanha gastou ao menos R$ 30 mil e a proporção está entre as 10% maiores do cargo.",
        evidence: { label: "Ver as despesas desta categoria", href: tx(`&tipo=despesa&categoria_tse=${encodeURIComponent(s.ref_name ?? "")}`) },
      };
    case "fornecedor_compartilhado":
      return {
        title: "Fornecedor relevante também atende muitas outras campanhas",
        body: `${name} recebeu ${brl(s.ref_value)} desta campanha e também prestou serviços a outras ${num(s.ref_count)} campanhas em ${c.year}.`,
        context: "Gráficas, plataformas digitais e agências costumam atender várias campanhas, inclusive de partidos diferentes.",
        rule: "Aparece quando um fornecedor recebe ao menos 20% das despesas da campanha e atendeu 20 ou mais outras campanhas na mesma eleição.",
        evidence: { label: "Ver quem mais contratou este fornecedor", href: `/fornecedores/${s.ref_key}?ano=${c.year}` },
        ref: s.ref_key ? { label: "Abrir no mapa de conexões", href: `/conexoes?no=e:${s.ref_key}&ano=${c.year}` } : undefined,
      };
    case "doador_multiplo":
      return {
        title: "Doador relevante também financiou outras candidaturas",
        body: `${name} doou ${brl(s.ref_value)} a esta campanha e também doou a outros ${num(s.ref_count)} candidatos em ${c.year}.`,
        context: "Doadores frequentemente apoiam várias candidaturas do mesmo partido ou da mesma região.",
        rule: "Aparece quando um doador privado responde por ao menos 10% da receita da campanha e doou a 5 ou mais outros candidatos na mesma eleição.",
        evidence: { label: "Ver todas as doações deste doador", href: `/doadores/${s.ref_key}?ano=${c.year}` },
        ref: s.ref_key ? { label: "Abrir no mapa de conexões", href: `/conexoes?no=e:${s.ref_key}&ano=${c.year}` } : undefined,
      };
    case "doador_fornecedor":
      return {
        title: "Mesma pessoa ou empresa como doadora e fornecedora",
        body: `${name} doou ${brl(s.ref_value)} em dinheiro à campanha e recebeu ${brl(s.metric)} em pagamentos dela.`,
        context:
          "Pode ocorrer, por exemplo, quando alguém que trabalha na campanha também faz uma doação. Os dois registros são públicos; a combinação, por si só, não indica irregularidade.",
        rule: "Aparece quando o mesmo CPF ou CNPJ fez doação financeira de ao menos R$ 1 mil e recebeu ao menos R$ 1 mil em pagamentos da mesma campanha. Doações em bens e serviços não entram, porque o TSE as registra também como despesa.",
        evidence: { label: "Ver doações e pagamentos envolvidos", href: tx(`&contraparte=${s.ref_key}`) },
      };
    case "despesa_maior_receita":
      return {
        title: "Despesas contratadas superam as receitas declaradas",
        body: `A campanha contratou ${brl(s.ref_value)} em despesas e declarou ${brl(c.revenue)} em receitas — diferença de ${brl(s.metric)}.`,
        context:
          c.year === 2026
            ? "Com a prestação de contas ainda em andamento, a diferença pode refletir receitas não lançadas ou despesas a pagar. Também pode indicar dívida de campanha."
            : "Pode indicar dívida de campanha, que precisa ser declarada e assumida na prestação de contas final.",
        rule: "Aparece quando as despesas contratadas superam as receitas em mais de 20% e em pelo menos R$ 30 mil.",
        evidence: { label: "Ver todas as transações", href: tx("") },
      };
    case "origem_nao_identificada":
      return {
        title: "Receita classificada como de origem não identificada",
        body: `O TSE registra ${brl(s.metric)} como recursos de origem não identificada nesta campanha.`,
        context:
          "Pela legislação eleitoral, recursos de origem não identificada não podem ser usados pela campanha e devem ser transferidos ao Tesouro Nacional. A classificação é do próprio registro do TSE.",
        rule: "Aparece sempre que há receita nessa categoria oficial.",
        evidence: { label: "Ver essas receitas", href: tx(`&tipo=receita&categoria=nao_identificada`) },
      };
    case "data_fora_periodo":
      return {
        title: "Despesas com data fora do ano eleitoral",
        body: `${num(s.ref_count)} despesas (${brlc(s.ref_value)}) têm data registrada fora de ${c.year}.`,
        context: "Pode indicar erro de preenchimento da data na prestação de contas. Os registros aparecem aqui exatamente como publicados.",
        rule: "Aparece quando há despesas datadas fora do ano da eleição.",
        evidence: { label: "Ver as despesas", href: tx(`&tipo=despesa&ordem=data_desc`) },
      };
    case "mudanca_totais":
      return {
        title: "Totais mudaram bastante entre publicações do TSE",
        body: `Entre as publicações de ${capDate(s.ref_name)} e ${capDate(s.ref_key)}, as receitas ou despesas declaradas variaram ${pct(s.strength ?? 0)} (até ${brl(s.metric)}).`,
        context:
          "Mudanças grandes são comuns durante a campanha, quando novas prestações acrescentam lançamentos, e também podem refletir correções feitas pela própria campanha.",
        rule: "Aparece quando receitas ou despesas variam ao menos 20% e ao menos R$ 30 mil entre as duas publicações mais recentes do TSE.",
        evidence: { label: "Ver o histórico de mudanças", href: `/candidatos/${c.year}/${c.id}#dados` },
      };
    case "registros_removidos":
      return {
        title: "Transações publicadas antes não aparecem mais",
        body: `${num(s.ref_count)} ${s.ref_count === 1 ? "transação publicada" : "transações publicadas"} em ${capDate(s.ref_name)} (${brl(s.ref_value)}) não ${s.ref_count === 1 ? "consta" : "constam"} na publicação de ${capDate(s.ref_key)}.`,
        context: "Lançamentos podem ser retirados ou substituídos quando a campanha retifica a prestação de contas.",
        rule: "Aparece quando, entre as duas publicações mais recentes do TSE, ao menos uma receita ou despesa deixa de constar.",
        evidence: { label: "Ver o histórico de mudanças", href: `/candidatos/${c.year}/${c.id}#dados` },
      };
    default:
      return { title: s.code, body: "", context: "", rule: "" };
  }
}
