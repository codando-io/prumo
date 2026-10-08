import "server-only";
import { q, q1 } from "../db";
import { titleName } from "../format";
import { ENTITY_KIND } from "../labels";
import { hasTable } from "./company";
import { TOPIC_LABEL, TOPIC_MIN_HITS } from "./proposals";

export type NodeType =
  | "candidato"
  | "pf"
  | "pj"
  | "partido_org"
  | "partido"
  | "plataforma"
  | "desconhecido"
  | "pessoa" // partner in the Receita register (QSA), not a TSE record
  | "orgao" // government body that signed a public contract
  | "registro" // record in a sanction/impediment list
  | "eleicao"
  | "proposta" // government plan filed with the TSE
  | "tema"; // Índice Prumo topic inside a plan

export interface GNode {
  id: string; // c:<year>:<id> | e:<key> | p:<sigla> | s:<partner_key> | g:<orgao cnpj> | r:<source>:<record> | y:<year> | d:<year>:<id> | t:<year>:<id>:<topic>
  type: NodeType;
  label: string;
  sub: string;
  value: number; // money volume used for node size
  href: string;
  degree?: number; // how many connections exist in total (for "expandable" hints)
}

export type EdgeKind = "doacao" | "fornecimento" | "indireta" | "partido" | "socio" | "contrato" | "registro" | "eleicao" | "proposta" | "tema" | "possivel";

export interface GEdge {
  source: string;
  target: string;
  kind: EdgeKind;
  value: number;
  n: number;
  /** Where the relationship is documented, e.g. "TSE, prestação de contas 2022", "Receita Federal (QSA)". */
  origin?: string;
  /** Date or period of the relationship, when relevant (free text, already formatted). */
  when?: string;
  /** The supporting record, when it has its own page. */
  record?: { label: string; href: string };
  /** 'confirmado' when both ends share an official identifier; 'possivel' otherwise. */
  confidence?: "confirmado" | "possivel";
  /** Extra detail shown with the relationship (qualification, topic pages…). */
  detail?: string;
}

export interface Expansion {
  center: GNode | null;
  nodes: GNode[];
  edges: GEdge[];
  truncated: { donations: number; supplies: number };
}

const entityType = (kind: string | null): NodeType =>
  kind === "pf" ? "pf" : kind === "pj" ? "pj" : kind === "partido" ? "partido_org" : kind === "plataforma" ? "plataforma" : "desconhecido";

function candNode(year: number, r: { id: string; ballot_name: string; office: string; uf: string; party: string; value?: number }): GNode {
  return {
    id: `c:${year}:${r.id}`,
    type: "candidato",
    label: titleName(r.ballot_name),
    sub: `${r.office}${r.uf !== "BR" ? ` (${r.uf})` : ""}, ${r.party}, ${year}`,
    value: r.value ?? 0,
    href: `/candidatos/${year}/${r.id}`,
  };
}

function entityNode(year: number, r: { key: string; name: string | null; kind: string | null; party?: string | null; value?: number; degree?: number }): GNode {
  const t = entityType(r.kind);
  return {
    id: `e:${r.key}`,
    type: t,
    label: titleName(r.name) || "(sem nome)",
    sub: `${ENTITY_KIND[r.kind ?? ""] ?? "Não identificado"}${r.party && t === "partido_org" ? `, ${r.party}` : ""}`,
    value: r.value ?? 0,
    href:
      t === "partido_org" && r.party
        ? `/partidos/${encodeURIComponent(r.party)}?ano=${year}`
        : /^j\d{14}$/.test(r.key)
          ? `/empresas/${r.key.slice(1)}`
          : `/doadores/${r.key}?ano=${year}`,
    degree: r.degree,
  };
}

/**
 * Expand one node: its most significant relationships in the given election.
 * Only relationships worth at least `minShare` of the node's own total are kept by default,
 * so the graph opens on what matters financially.
 */
export async function expand(nodeId: string, year: number, limit = 12, minShare = 0.005): Promise<Expansion> {
  const [kind, ...rest] = nodeId.split(":");
  if (kind === "c") return expandCandidate(Number(rest[0]) || year, rest[1], limit, minShare);
  if (kind === "e") return expandEntity(rest.join(":"), year, limit);
  if (kind === "p") return expandParty(decodeURIComponent(rest.join(":")), year, limit);
  if (kind === "s") return expandPerson(rest.join(":"), year, limit);
  if (kind === "g") return expandOrgao(rest[0], limit);
  if (kind === "r") return expandRegistro(rest[0], rest.slice(1).join(":"));
  if (kind === "y") return expandElection(Number(rest[0]), limit);
  if (kind === "d") return expandProposal(Number(rest[0]), rest[1]);
  if (kind === "t") return expandTopic(Number(rest[0]), rest[1], rest[2]);
  return EMPTY;
}

const EMPTY: Expansion = { center: null, nodes: [], edges: [], truncated: { donations: 0, supplies: 0 } };
const tse = (year: number) => `TSE, prestação de contas ${year}`;

async function expandCandidate(year: number, id: string, limit: number, minShare: number): Promise<Expansion> {
  const c = await q1<{ id: string; ballot_name: string; office: string; uf: string; party: string; revenue: number; expense: number; n_donors: number; n_suppliers: number }>(
    `SELECT id, ballot_name, office, uf, party, revenue, expense, n_donors, n_suppliers FROM candidate_summary WHERE year = ? AND id = ?`,
    [year, id],
  );
  if (!c) return { center: null, nodes: [], edges: [], truncated: { donations: 0, supplies: 0 } };
  const center = candNode(year, { ...c, value: Math.max(c.revenue, c.expense) });
  const [donors, suppliers] = await Promise.all([
    q<{ key: string; name: string | null; kind: string | null; party: string | null; campaign_candidate_id: string | null; value: number; n: number; donor_type: string; degree: number }>(
      `SELECT r.key, e.name, e.kind, e.party, e.campaign_candidate_id, r.value::DOUBLE AS value, r.n, r.donor_type,
         (SELECT count(DISTINCT candidate_id) FROM rel_donation x WHERE x.year = r.year AND x.key = r.key) AS degree
       FROM rel_donation r LEFT JOIN entity e ON e.key = r.key
       WHERE r.year = ? AND r.candidate_id = ? AND r.donor_type <> 'proprio' AND r.value >= ?
       ORDER BY r.value DESC LIMIT ?`,
      [year, id, c.revenue * minShare, limit],
    ),
    q<{ key: string; name: string | null; kind: string | null; party: string | null; campaign_candidate_id: string | null; value: number; n: number; degree: number }>(
      `SELECT r.key, e.name, e.kind, e.party, e.campaign_candidate_id, r.value::DOUBLE AS value, r.n,
         (SELECT count(DISTINCT candidate_id) FROM rel_supply x WHERE x.year = r.year AND x.key = r.key) AS degree
       FROM rel_supply r LEFT JOIN entity e ON e.key = r.key
       WHERE r.year = ? AND r.candidate_id = ? AND r.value >= ?
       ORDER BY r.value DESC LIMIT ?`,
      [year, id, c.expense * minShare, limit],
    ),
  ]);
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const otherCampaigns = new Set<string>();
  for (const d of donors) {
    if (d.kind === "campanha" && d.campaign_candidate_id) otherCampaigns.add(d.campaign_candidate_id);
  }
  for (const s of suppliers) {
    if (s.kind === "campanha" && s.campaign_candidate_id) otherCampaigns.add(s.campaign_candidate_id);
  }
  const campInfo = otherCampaigns.size
    ? await q<{ id: string; ballot_name: string; office: string; uf: string; party: string; expense: number }>(
        `SELECT id, ballot_name, office, uf, party, expense FROM candidate_summary WHERE year = ? AND id IN (${[...otherCampaigns].map(() => "?").join(",")})`,
        [year, ...otherCampaigns],
      )
    : [];
  const nodeFor = (r: { key: string; name: string | null; kind: string | null; party: string | null; campaign_candidate_id: string | null; value: number; degree: number }) => {
    if (r.kind === "campanha" && r.campaign_candidate_id) {
      const ci = campInfo.find((x) => x.id === r.campaign_candidate_id);
      if (ci) return candNode(year, { ...ci, value: ci.expense });
    }
    return entityNode(year, { ...r, degree: r.degree });
  };
  for (const d of donors) {
    const n = nodeFor(d);
    nodes.push(n);
    edges.push({ source: n.id, target: center.id, kind: "doacao", value: d.value, n: d.n, origin: tse(year), confidence: "confirmado" });
  }
  for (const s of suppliers) {
    const n = nodeFor(s);
    if (n.id.startsWith("e:") && n.type !== "partido_org") n.href = `/fornecedores/${s.key}?ano=${year}`;
    if (!nodes.find((x) => x.id === n.id)) nodes.push(n);
    edges.push({ source: center.id, target: n.id, kind: "fornecimento", value: s.value, n: s.n, origin: tse(year), confidence: "confirmado" });
  }
  if (c.party) {
    nodes.push({ id: `p:${c.party}`, type: "partido", label: c.party, sub: "Partido", value: 0, href: `/partidos/${encodeURIComponent(c.party)}?ano=${year}` });
    edges.push({ source: `p:${c.party}`, target: center.id, kind: "partido", value: 0, n: 0, origin: `TSE, registro de candidatura ${year}`, confidence: "confirmado" });
  }
  nodes.push(electionNode(year));
  edges.push({ source: center.id, target: `y:${year}`, kind: "eleicao", value: 0, n: 0, origin: `TSE, registro de candidatura ${year}`, confidence: "confirmado" });
  if (await hasTable("proposal_doc")) {
    const plan = await q1<{ pages: number; parts: number }>(
      `SELECT sum(pages)::INT AS pages, count(*)::INT AS parts FROM proposal_doc WHERE year = ? AND candidate_id = ?`,
      [year, id],
    );
    if (plan?.parts) {
      nodes.push({ id: `d:${year}:${id}`, type: "proposta", label: "Proposta de governo", sub: `${plan.pages} páginas, entregue ao TSE`, value: 0, href: `/candidatos/${year}/${id}/proposta` });
      edges.push({
        source: center.id,
        target: `d:${year}:${id}`,
        kind: "proposta",
        value: 0,
        n: 0,
        origin: `TSE, propostas de governo ${year}`,
        confidence: "confirmado",
        record: { label: "Ler a proposta", href: `/candidatos/${year}/${id}/proposta` },
      });
    }
  }
  return { center, nodes, edges, truncated: { donations: Math.max(0, c.n_donors - donors.length), supplies: Math.max(0, c.n_suppliers - suppliers.length) } };
}

async function expandEntity(key: string, year: number, limit: number): Promise<Expansion> {
  let e = await q1<{ key: string; name: string | null; kind: string | null; party: string | null; campaign_candidate_id: string | null }>(
    `SELECT key, name, kind, party, campaign_candidate_id FROM entity WHERE key = ?`,
    [key],
  );
  const isCompany = /^j\d{14}$/.test(key);
  if (!e && isCompany && (await hasTable("rf_company"))) {
    // A company known only from the Receita register (e.g. another company of a partner).
    const rf = await q1<{ razao_social: string | null }>(`SELECT razao_social FROM rf_company WHERE cnpj_basico = ?`, [key.slice(1, 9)]);
    if (rf) e = { key, name: rf.razao_social, kind: "pj", party: null, campaign_candidate_id: null };
  }
  if (!e) return EMPTY;
  const [don, sup, ind, stats] = await Promise.all([
    q<{ id: string; ballot_name: string; office: string; uf: string; party: string; value: number; n: number }>(
      `SELECT c.id, c.ballot_name, c.office, c.uf, c.party, r.value::DOUBLE AS value, r.n
       FROM rel_donation r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id
       WHERE r.year = ? AND r.key = ? ORDER BY r.value DESC LIMIT ?`,
      [year, key, limit],
    ),
    q<{ id: string; ballot_name: string; office: string; uf: string; party: string; value: number; n: number }>(
      `SELECT c.id, c.ballot_name, c.office, c.uf, c.party, r.value::DOUBLE AS value, r.n
       FROM rel_supply r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id
       WHERE r.year = ? AND r.key = ? ORDER BY r.value DESC LIMIT ?`,
      [year, key, limit],
    ),
    q<{ id: string; ballot_name: string; office: string; uf: string; party: string; value: number; n: number; via_key: string; via_name: string }>(
      `SELECT c.id, c.ballot_name, c.office, c.uf, c.party, r.value::DOUBLE AS value, r.n, r.via_key, r.via_name
       FROM rel_origin r JOIN candidate c ON c.year = r.year AND c.id = r.candidate_id
       WHERE r.year = ? AND r.key = ? ORDER BY r.value DESC LIMIT ?`,
      [year, key, Math.ceil(limit / 2)],
    ),
    q1<{ donated: number; supplied: number; n_candidates_donated: number; n_candidates_supplied: number; n_candidates_indirect: number }>(
      `SELECT donated::DOUBLE AS donated, supplied::DOUBLE AS supplied, n_candidates_donated, n_candidates_supplied, n_candidates_indirect FROM entity_year WHERE year = ? AND key = ?`,
      [year, key],
    ),
  ]);
  const center = entityNode(year, { ...e, value: Math.max(stats?.donated ?? 0, stats?.supplied ?? 0) });
  if (!isCompany && sup.length > don.length) center.href = `/fornecedores/${key}?ano=${year}`;
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  for (const d of don) {
    const n = candNode(year, d);
    nodes.push(n);
    edges.push({ source: center.id, target: n.id, kind: "doacao", value: d.value, n: d.n, origin: tse(year), confidence: "confirmado" });
  }
  for (const s of sup) {
    const n = candNode(year, s);
    if (!nodes.find((x) => x.id === n.id)) nodes.push(n);
    edges.push({ source: n.id, target: center.id, kind: "fornecimento", value: s.value, n: s.n, origin: tse(year), confidence: "confirmado" });
  }
  for (const i of ind) {
    const n = candNode(year, i);
    if (!nodes.find((x) => x.id === n.id)) nodes.push(n);
    edges.push({ source: center.id, target: n.id, kind: "indireta", value: i.value, n: i.n, origin: tse(year), confidence: "confirmado", detail: i.via_name ? `por meio de ${titleName(i.via_name)}` : undefined });
  }
  if (isCompany) await addCompanyRelations(key.slice(1), center, nodes, edges, limit);
  return {
    center,
    nodes,
    edges,
    truncated: {
      donations: Math.max(0, (stats?.n_candidates_donated ?? 0) - don.length),
      supplies: Math.max(0, (stats?.n_candidates_supplied ?? 0) - sup.length),
    },
  };
}

const fmtDate = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : null);
const RF = "Receita Federal, quadro de sócios (QSA)";

/** Partners, holdings, public contracts and registry records of a company (by CNPJ root). */
async function addCompanyRelations(cnpj: string, center: GNode, nodes: GNode[], edges: GEdge[], limit: number) {
  const basico = cnpj.slice(0, 8);
  const add = (n: GNode) => nodes.find((x) => x.id === n.id) || nodes.push(n);
  if (await hasTable("rf_partner")) {
    const partners = await q<{ partner_key: string; partner_type: string; name: string; doc_masked: string | null; qualificacao: string | null; data_entrada: string | null; matriz: string | null }>(
      `SELECT p.partner_key, p.partner_type, p.name, p.doc_masked, p.qualificacao, p.data_entrada::VARCHAR AS data_entrada,
         (SELECT cnpj FROM rf_establishment m WHERE m.cnpj_basico = p.partner_cnpj_basico AND m.matriz LIMIT 1) AS matriz
       FROM rf_partner p WHERE p.cnpj_basico = ? ORDER BY p.data_entrada NULLS LAST LIMIT ?`,
      [basico, limit * 2],
    );
    for (const p of partners) {
      const id = p.partner_type === "PJ" && p.matriz ? `e:j${p.matriz}` : `s:${p.partner_key}`;
      add({
        id,
        type: p.partner_type === "PJ" ? "pj" : "pessoa",
        label: titleName(p.name),
        sub: p.partner_type === "PF" ? `Pessoa${p.doc_masked ? `, CPF ${p.doc_masked}` : ""}` : p.partner_type === "PJ" ? "Empresa" : "Sócio estrangeiro",
        value: 0,
        href: p.partner_type === "PJ" && p.matriz ? `/empresas/${p.matriz}` : `/empresas/${cnpj}#socios`,
      });
      edges.push({ source: id, target: center.id, kind: "socio", value: 0, n: 0, origin: RF, when: p.data_entrada ? `desde ${fmtDate(p.data_entrada)}` : undefined, detail: p.qualificacao ?? undefined, confidence: "confirmado" });
    }
    const holdings = await q<{ cnpj_basico: string; razao_social: string | null; qualificacao: string | null; data_entrada: string | null; matriz: string | null }>(
      `SELECT p.cnpj_basico, c.razao_social, p.qualificacao, p.data_entrada::VARCHAR AS data_entrada,
         (SELECT cnpj FROM rf_establishment m WHERE m.cnpj_basico = p.cnpj_basico AND m.matriz LIMIT 1) AS matriz
       FROM rf_partner p LEFT JOIN rf_company c ON c.cnpj_basico = p.cnpj_basico WHERE p.partner_key = ? LIMIT ?`,
      [`j${basico}`, limit],
    );
    for (const h of holdings) {
      if (!h.matriz) continue;
      const id = `e:j${h.matriz}`;
      add({ id, type: "pj", label: titleName(h.razao_social) || h.cnpj_basico, sub: "Empresa", value: 0, href: `/empresas/${h.matriz}` });
      edges.push({ source: center.id, target: id, kind: "socio", value: 0, n: 0, origin: RF, when: h.data_entrada ? `desde ${fmtDate(h.data_entrada)}` : undefined, detail: h.qualificacao ?? undefined, confidence: "confirmado" });
    }
  }
  if (await hasTable("public_contract")) {
    const orgs = await q<{ orgao_cnpj: string; orgao_nome: string; esfera: string | null; uf: string | null; n: number; value: number; first: string | null; last: string | null }>(
      `SELECT orgao_cnpj, any_value(orgao_nome) AS orgao_nome, any_value(esfera) AS esfera, any_value(uf) AS uf, count(*)::INT AS n,
         coalesce(sum(valor_global), 0)::DOUBLE AS value, min(data_assinatura)::VARCHAR AS first, max(data_assinatura)::VARCHAR AS last
       FROM public_contract WHERE supplier_cnpj_basico = ? GROUP BY orgao_cnpj ORDER BY value DESC LIMIT ?`,
      [basico, limit],
    );
    for (const o of orgs) {
      const id = `g:${o.orgao_cnpj}`;
      add({ id, type: "orgao", label: titleName(o.orgao_nome), sub: ["Órgão público", o.esfera, o.uf].filter(Boolean).join(", "), value: o.value, href: `/empresas/${cnpj}#contratos` });
      edges.push({
        source: center.id,
        target: id,
        kind: "contrato",
        value: o.value,
        n: o.n,
        origin: "PNCP, Portal Nacional de Contratações Públicas",
        when: o.first && o.last ? (o.first.slice(0, 4) === o.last.slice(0, 4) ? o.first.slice(0, 4) : `${o.first.slice(0, 4)}–${o.last.slice(0, 4)}`) : undefined,
        record: { label: "Ver os contratos", href: `/empresas/${cnpj}#contratos` },
        confidence: "confirmado",
      });
    }
  }
  if (await hasTable("sanction")) {
    const recs = await q<{ source: string; record_id: string; category: string | null; authority: string | null; start_date: string | null; end_date: string | null; status: string | null }>(
      `SELECT source, record_id, category, authority, start_date::VARCHAR AS start_date, end_date::VARCHAR AS end_date, status
       FROM sanction WHERE cnpj_basico = ? ORDER BY start_date DESC NULLS LAST LIMIT ?`,
      [basico, limit],
    );
    for (const r of recs) {
      const id = `r:${r.source}:${r.record_id}`;
      add({ id, type: "registro", label: `${r.source}: ${r.category ?? "registro"}`, sub: [r.authority, r.status].filter(Boolean).join(", "), value: 0, href: `/empresas/${cnpj}#registros` });
      edges.push({
        source: center.id,
        target: id,
        kind: "registro",
        value: 0,
        n: 0,
        origin: `CGU, ${r.source}`,
        when: r.start_date ? `${fmtDate(r.start_date)} a ${r.end_date ? fmtDate(r.end_date) : "sem data final"}` : undefined,
        record: { label: "Ver o registro", href: `/empresas/${cnpj}#registros` },
        confidence: "confirmado",
      });
    }
  }
}

/** A partner (person) from the Receita register: companies where it appears, and POSSIBLE matches in TSE records. */
async function expandPerson(partnerKey: string, year: number, limit: number): Promise<Expansion> {
  if (!(await hasTable("rf_partner"))) return EMPTY;
  const rows = await q<{ cnpj_basico: string; name: string; doc_masked: string | null; qualificacao: string | null; data_entrada: string | null; razao_social: string | null; matriz: string | null }>(
    `SELECT p.cnpj_basico, p.name, p.doc_masked, p.qualificacao, p.data_entrada::VARCHAR AS data_entrada, c.razao_social,
       (SELECT cnpj FROM rf_establishment m WHERE m.cnpj_basico = p.cnpj_basico AND m.matriz LIMIT 1) AS matriz
     FROM rf_partner p LEFT JOIN rf_company c ON c.cnpj_basico = p.cnpj_basico WHERE p.partner_key = ? ORDER BY c.in_tse DESC NULLS LAST LIMIT ?`,
    [partnerKey, limit * 2],
  );
  if (!rows.length) return EMPTY;
  const first = rows[0];
  const center: GNode = { id: `s:${partnerKey}`, type: "pessoa", label: titleName(first.name), sub: `Sócio ou administrador${first.doc_masked ? `, CPF ${first.doc_masked}` : ""}`, value: 0, href: first.matriz ? `/empresas/${first.matriz}#socios` : "#" };
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  for (const r of rows) {
    if (!r.matriz) continue;
    const id = `e:j${r.matriz}`;
    if (!nodes.find((x) => x.id === id)) nodes.push({ id, type: "pj", label: titleName(r.razao_social) || r.cnpj_basico, sub: "Empresa", value: 0, href: `/empresas/${r.matriz}` });
    edges.push({ source: center.id, target: id, kind: "socio", value: 0, n: 0, origin: RF, when: r.data_entrada ? `desde ${fmtDate(r.data_entrada)}` : undefined, detail: r.qualificacao ?? undefined, confidence: "confirmado" });
  }
  if (await hasTable("person_match")) {
    const matches = await q<{ tse_kind: string; tse_key: string; basis: string }>(`SELECT DISTINCT tse_kind, tse_key, basis FROM person_match WHERE partner_key = ? LIMIT 10`, [partnerKey]);
    for (const m of matches) {
      if (m.tse_kind === "candidato") {
        const c = await q1<{ year: number; id: string; ballot_name: string; office: string; uf: string; party: string }>(
          `SELECT year, id, ballot_name, office, uf, party FROM candidate_summary WHERE person_id = ? ORDER BY abs(year - ?) LIMIT 1`,
          [m.tse_key, year],
        );
        if (!c) continue;
        const n = candNode(c.year, c);
        nodes.push(n);
        edges.push({ source: center.id, target: n.id, kind: "possivel", value: 0, n: 0, origin: "Receita Federal (QSA) e TSE", detail: m.basis, confidence: "possivel" });
      } else {
        const e = await q1<{ key: string; name: string | null; kind: string | null; party: string | null }>(`SELECT key, name, kind, party FROM entity WHERE key = ?`, [m.tse_key]);
        if (!e) continue;
        const n = entityNode(year, e);
        if (m.tse_kind === "fornecedor") n.href = `/fornecedores/${e.key}?ano=${year}`;
        nodes.push(n);
        edges.push({ source: center.id, target: n.id, kind: "possivel", value: 0, n: 0, origin: "Receita Federal (QSA) e TSE", detail: m.basis, confidence: "possivel" });
      }
    }
  }
  return { center, nodes, edges, truncated: { donations: 0, supplies: 0 } };
}

/** A government body: the companies in Prumo's scope it has public contracts with. */
async function expandOrgao(orgaoCnpj: string, limit: number): Promise<Expansion> {
  if (!(await hasTable("public_contract"))) return EMPTY;
  const rows = await q<{ supplier_cnpj: string; supplier_name: string | null; n: number; value: number; first: string | null; last: string | null; orgao_nome: string; esfera: string | null; uf: string | null }>(
    `SELECT any_value(supplier_cnpj) AS supplier_cnpj, any_value(supplier_name) AS supplier_name, count(*)::INT AS n, coalesce(sum(valor_global), 0)::DOUBLE AS value,
       min(data_assinatura)::VARCHAR AS first, max(data_assinatura)::VARCHAR AS last, any_value(orgao_nome) AS orgao_nome, any_value(esfera) AS esfera, any_value(uf) AS uf
     FROM public_contract WHERE orgao_cnpj = ? GROUP BY supplier_cnpj_basico ORDER BY value DESC LIMIT ?`,
    [orgaoCnpj, limit],
  );
  if (!rows.length) return EMPTY;
  const total = await q1<{ n: number }>(`SELECT count(DISTINCT supplier_cnpj_basico)::INT AS n FROM public_contract WHERE orgao_cnpj = ?`, [orgaoCnpj]);
  const center: GNode = { id: `g:${orgaoCnpj}`, type: "orgao", label: titleName(rows[0].orgao_nome), sub: ["Órgão público", rows[0].esfera, rows[0].uf].filter(Boolean).join(", "), value: 0, href: "#" };
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  for (const r of rows) {
    const id = `e:j${r.supplier_cnpj}`;
    nodes.push({ id, type: "pj", label: titleName(r.supplier_name) || r.supplier_cnpj, sub: "Empresa", value: r.value, href: `/empresas/${r.supplier_cnpj}` });
    edges.push({
      source: id,
      target: center.id,
      kind: "contrato",
      value: r.value,
      n: r.n,
      origin: "PNCP, Portal Nacional de Contratações Públicas",
      when: r.first && r.last ? (r.first.slice(0, 4) === r.last.slice(0, 4) ? r.first.slice(0, 4) : `${r.first.slice(0, 4)}–${r.last.slice(0, 4)}`) : undefined,
      record: { label: "Ver os contratos", href: `/empresas/${r.supplier_cnpj}#contratos` },
      confidence: "confirmado",
    });
  }
  return { center, nodes, edges, truncated: { donations: Math.max(0, (total?.n ?? 0) - rows.length), supplies: 0 } };
}

async function expandRegistro(source: string, recordId: string): Promise<Expansion> {
  if (!(await hasTable("sanction"))) return EMPTY;
  const r = await q1<{ cnpj: string; name: string | null; category: string | null; authority: string | null; status: string | null; start_date: string | null; end_date: string | null }>(
    `SELECT cnpj, name, category, authority, status, start_date::VARCHAR AS start_date, end_date::VARCHAR AS end_date FROM sanction WHERE source = ? AND record_id = ?`,
    [source, recordId],
  );
  if (!r) return EMPTY;
  const center: GNode = { id: `r:${source}:${recordId}`, type: "registro", label: `${source}: ${r.category ?? "registro"}`, sub: [r.authority, r.status].filter(Boolean).join(", "), value: 0, href: `/empresas/${r.cnpj}#registros` };
  const company: GNode = { id: `e:j${r.cnpj}`, type: "pj", label: titleName(r.name) || r.cnpj, sub: "Empresa", value: 0, href: `/empresas/${r.cnpj}` };
  return {
    center,
    nodes: [company],
    edges: [{ source: company.id, target: center.id, kind: "registro", value: 0, n: 0, origin: `CGU, ${source}`, when: r.start_date ? `${fmtDate(r.start_date)} a ${r.end_date ? fmtDate(r.end_date) : "sem data final"}` : undefined, confidence: "confirmado" }],
    truncated: { donations: 0, supplies: 0 },
  };
}

function electionNode(year: number): GNode {
  return { id: `y:${year}`, type: "eleicao", label: `Eleições ${year}`, sub: "Eleições gerais", value: 0, href: `/?ano=${year}` };
}

/** An election: its presidential candidacies and the most voted for governor. */
async function expandElection(year: number, limit: number): Promise<Expansion> {
  if (!year) return EMPTY;
  const rows = await q<{ id: string; ballot_name: string; office: string; uf: string; party: string; value: number }>(
    `SELECT id, ballot_name, office, uf, party, revenue AS value FROM candidate_summary
     WHERE year = ? AND office_code IN (1, 3) AND NOT is_running_mate ORDER BY office_code, votes DESC NULLS LAST LIMIT ?`,
    [year, limit],
  );
  const total = await q1<{ n: number }>(`SELECT count(*)::INT AS n FROM candidate_summary WHERE year = ? AND NOT is_running_mate`, [year]);
  if (!total?.n) return EMPTY;
  const center = electionNode(year);
  return {
    center,
    nodes: rows.map((r) => candNode(year, r)),
    edges: rows.map((r) => ({ source: `c:${year}:${r.id}`, target: center.id, kind: "eleicao" as const, value: 0, n: 0, origin: `TSE, registro de candidatura ${year}`, confidence: "confirmado" as const })),
    truncated: { donations: Math.max(0, total.n - rows.length), supplies: 0 },
  };
}

/** A government plan: its Índice Prumo topics (keyword index, not a summary). */
async function expandProposal(year: number, id: string): Promise<Expansion> {
  if (!(await hasTable("proposal_topic"))) return EMPTY;
  const c = await q1<{ ballot_name: string; office: string; uf: string; party: string }>(`SELECT ballot_name, office, uf, party FROM candidate_summary WHERE year = ? AND id = ?`, [year, id]);
  const plan = await q1<{ pages: number }>(`SELECT sum(pages)::INT AS pages FROM proposal_doc WHERE year = ? AND candidate_id = ?`, [year, id]);
  if (!c || !plan?.pages) return EMPTY;
  const topics = await q<{ topic: string; pages: number }>(
    `SELECT topic, count(*) FILTER (WHERE hits >= ?)::INT AS pages FROM proposal_topic WHERE year = ? AND candidate_id = ? GROUP BY topic
     HAVING count(*) FILTER (WHERE hits >= ?) > 0 ORDER BY pages DESC`,
    [TOPIC_MIN_HITS, year, id, TOPIC_MIN_HITS],
  );
  const reader = `/candidatos/${year}/${id}/proposta`;
  const center: GNode = { id: `d:${year}:${id}`, type: "proposta", label: `Proposta de governo de ${titleName(c.ballot_name)}`, sub: `${plan.pages} páginas, ${year}`, value: 0, href: reader };
  const cand = candNode(year, { id, ...c });
  return {
    center,
    nodes: [cand, ...topics.map((t) => ({ id: `t:${year}:${id}:${t.topic}`, type: "tema" as const, label: TOPIC_LABEL[t.topic] ?? t.topic, sub: `Índice Prumo, ${t.pages} ${t.pages === 1 ? "página" : "páginas"}`, value: t.pages, href: `${reader}?tema=${t.topic}` }))],
    edges: [
      { source: cand.id, target: center.id, kind: "proposta", value: 0, n: 0, origin: `TSE, propostas de governo ${year}`, confidence: "confirmado", record: { label: "Ler a proposta", href: reader } },
      ...topics.map((t) => ({
        source: center.id,
        target: `t:${year}:${id}:${t.topic}`,
        kind: "tema" as const,
        value: t.pages,
        n: 0,
        origin: "Índice Prumo (palavras-chave)",
        detail: `${t.pages} ${t.pages === 1 ? "página" : "páginas"} com termos do tema`,
        record: { label: "Ver as páginas", href: `${reader}?tema=${t.topic}` },
      })),
    ],
    truncated: { donations: 0, supplies: 0 },
  };
}

/** A topic of a plan: links back to the plan; the pages themselves are read in the reader. */
async function expandTopic(year: number, id: string, topic: string): Promise<Expansion> {
  const p = await expandProposal(year, id);
  const node = p.nodes.find((n) => n.id === `t:${year}:${id}:${topic}`);
  if (!p.center || !node) return EMPTY;
  return {
    center: node,
    nodes: [p.center],
    edges: [{ source: p.center.id, target: node.id, kind: "tema", value: node.value, n: 0, origin: "Índice Prumo (palavras-chave)", record: { label: "Ver as páginas", href: node.href } }],
    truncated: { donations: 0, supplies: 0 },
  };
}

async function expandParty(party: string, year: number, limit: number): Promise<Expansion> {
  const rows = await q<{ id: string; ballot_name: string; office: string; uf: string; party: string; value: number }>(
    `SELECT id, ballot_name, office, uf, party, revenue AS value FROM candidate_summary
     WHERE year = ? AND party = ? AND NOT is_running_mate AND revenue > 0 ORDER BY revenue DESC LIMIT ?`,
    [year, party, limit],
  );
  const total = await q1<{ n: number; revenue: number }>(`SELECT count(*) AS n, sum(revenue) AS revenue FROM candidate_summary WHERE year = ? AND party = ? AND NOT is_running_mate`, [year, party]);
  if (!total?.n) return { center: null, nodes: [], edges: [], truncated: { donations: 0, supplies: 0 } };
  const center: GNode = { id: `p:${party}`, type: "partido", label: party, sub: `Partido, ${total.n} candidaturas em ${year}`, value: total.revenue, href: `/partidos/${encodeURIComponent(party)}?ano=${year}` };
  return {
    center,
    nodes: rows.map((r) => candNode(year, r)),
    edges: rows.map((r) => ({ source: center.id, target: `c:${year}:${r.id}`, kind: "partido" as const, value: r.value, n: 0, origin: `TSE, registro de candidatura ${year}`, confidence: "confirmado" as const })),
    truncated: { donations: Math.max(0, total.n - rows.length), supplies: 0 },
  };
}
