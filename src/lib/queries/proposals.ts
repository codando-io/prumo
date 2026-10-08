import "server-only";
import { q } from "../db";
import topicsCfg from "../proposal-topics.json";

/*
 * Government plans (propostas de governo). The PDFs filed with the TSE are the official
 * documents; Prumo stores their text page by page and an index (detected titles and keyword
 * topics). Nothing here rewrites or summarises a candidate's proposal.
 */

export const TOPICS: { key: string; label: string; terms: string[] }[] = topicsCfg.topics;
export const TOPIC_MIN_HITS: number = topicsCfg.minHitsPerPage;
export const TOPIC_LABEL: Record<string, string> = Object.fromEntries(TOPICS.map((t) => [t.key, t.label]));

export interface ProposalFile {
  part: number;
  file: string;
  original_name: string;
  pages: number;
  ocr_pages: number;
  empty_pages: number;
  unreadable: boolean;
  bytes: number;
  source_url: string;
  source_modified: string | null;
  extracted_at: string | null;
}

export interface ProposalTopic {
  topic: string;
  label: string;
  pages: number;
  hits: number;
}

export async function getProposalFiles(year: number, id: string) {
  return q<ProposalFile>(
    `SELECT part, file, original_name, pages, ocr_pages, empty_pages, unreadable, bytes, source_url,
       source_modified::VARCHAR AS source_modified, extracted_at::VARCHAR AS extracted_at
     FROM proposal_doc WHERE year = ? AND candidate_id = ? ORDER BY part`,
    [year, id],
  );
}

/** Topics of the Índice Prumo present in a plan: pages with at least TOPIC_MIN_HITS term matches. */
export async function getProposalTopics(year: number, id: string): Promise<ProposalTopic[]> {
  const rows = await q<{ topic: string; pages: number; hits: number }>(
    `SELECT topic, count(*) FILTER (WHERE hits >= ?)::INT AS pages, sum(hits)::INT AS hits
     FROM proposal_topic WHERE year = ? AND candidate_id = ? GROUP BY topic
     HAVING count(*) FILTER (WHERE hits >= ?) > 0 ORDER BY hits DESC`,
    [TOPIC_MIN_HITS, year, id, TOPIC_MIN_HITS],
  );
  return rows.map((r) => ({ ...r, label: TOPIC_LABEL[r.topic] ?? r.topic }));
}

export interface ProposalPage {
  part: number;
  page: number;
  text: string;
  ocr: boolean;
  n_chars: number;
}

export async function getProposalPages(year: number, id: string) {
  return q<ProposalPage>(`SELECT part, page, text, ocr, n_chars FROM proposal_page WHERE year = ? AND candidate_id = ? ORDER BY part, page`, [year, id]);
}

export async function getProposalHeadings(year: number, id: string) {
  return q<{ part: number; ord: number; page: number; level: number; text: string }>(
    `SELECT part, ord, page, level, text FROM proposal_heading WHERE year = ? AND candidate_id = ? ORDER BY part, ord`,
    [year, id],
  );
}

/** Pages of one topic, strongest first. */
export async function getTopicPages(year: number, id: string, topic: string) {
  return q<{ part: number; page: number; hits: number }>(
    `SELECT part, page, hits FROM proposal_topic WHERE year = ? AND candidate_id = ? AND topic = ? AND hits >= ? ORDER BY hits DESC, part, page`,
    [year, id, topic, TOPIC_MIN_HITS],
  );
}

/** Normalise like the database's lower(strip_accents(...)). */
export function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export interface Snippet {
  before: string;
  match: string;
  after: string;
}

/**
 * Occurrences of a phrase in a page's text (accent- and case-insensitive, flexible spaces),
 * with short snippets taken from the original text.
 */
export function findInText(text: string, query: string, maxSnippets = 3): { count: number; snippets: Snippet[] } {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return { count: 0, snippets: [] };
  // Build the normalised text char by char so offsets map back to the original.
  let normText = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const n = normalize(text[i]);
    for (let k = 0; k < n.length; k++) {
      normText += n[k];
      map.push(i);
    }
  }
  const re = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "g");
  const snippets: Snippet[] = [];
  let count = 0;
  for (const m of normText.matchAll(re)) {
    count++;
    if (snippets.length >= maxSnippets) continue;
    const s = map[m.index!];
    const e = map[m.index! + m[0].length - 1] + 1;
    const clean = (x: string) => x.replace(/\s+/g, " ");
    const before = clean(text.slice(Math.max(0, s - 110), s));
    const after = clean(text.slice(e, e + 140));
    snippets.push({
      before: (s > 110 ? "…" : "") + before.replace(/^\S*\s/, ""),
      match: clean(text.slice(s, e)),
      after: after.replace(/\s\S*$/, "") + (e + 140 < text.length ? "…" : ""),
    });
  }
  return { count, snippets };
}

/** Search every plan of an election (or all) for a phrase: candidacies ranked by occurrences. */
export async function searchProposals(term: string, year?: number) {
  const words = normalize(term).split(/\s+/).filter((w) => w.length > 0);
  if (!words.length || normalize(term).trim().length < 3) return [];
  const pattern = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  const like = `%${words[0]}%`;
  return q<{
    year: number;
    candidate_id: string;
    ballot_name: string;
    office: string;
    office_code: number;
    uf: string;
    party: string;
    result: string | null;
    pages: number;
    hits: number;
    first_part: number;
    first_page: number;
  }>(
    `WITH m AS (
       SELECT year, candidate_id, part, page, len(regexp_extract_all(norm, ?)) AS hits
       FROM proposal_page WHERE norm LIKE ? ${year ? "AND year = ?" : ""}
     )
     SELECT m.year, m.candidate_id, c.ballot_name, c.office, c.office_code, c.uf, c.party, c.result,
       count(*) FILTER (WHERE hits > 0)::INT AS pages, sum(hits)::INT AS hits,
       arg_min(part, part * 10000 + page) FILTER (WHERE hits > 0) AS first_part,
       arg_min(page, part * 10000 + page) FILTER (WHERE hits > 0) AS first_page
     FROM m JOIN candidate_summary c ON c.year = m.year AND c.id = m.candidate_id
     GROUP BY ALL HAVING sum(hits) > 0
     ORDER BY hits DESC, c.ballot_name LIMIT 200`,
    year ? [pattern, like, year] : [pattern, like],
  );
}

export interface ProposalListRow {
  year: number;
  candidate_id: string;
  ballot_name: string;
  office: string;
  office_code: number;
  uf: string;
  party: string;
  result: string | null;
  registration_status: string | null;
  parts: number;
  pages: number;
  empty_pages: number;
  ocr_pages: number;
  unreadable: boolean;
  topics: string[] | null;
}

/** Every plan of an election, with the plan's three strongest Índice Prumo topics. */
export async function listProposals(year: number, opts: { office?: number; uf?: string } = {}) {
  const where = ["d.year = ?"];
  const params: unknown[] = [TOPIC_MIN_HITS, year];
  if (opts.office) {
    where.push("c.office_code = ?");
    params.push(opts.office);
  }
  if (opts.uf) {
    where.push("c.uf = ?");
    params.push(opts.uf);
  }
  return q<ProposalListRow>(
    `WITH t AS (
       SELECT year, candidate_id, topic, sum(hits) AS hits FROM proposal_topic WHERE hits >= ? GROUP BY ALL
     ),
     tt AS (
       SELECT year, candidate_id, list(topic ORDER BY hits DESC)[1:3] AS topics FROM t GROUP BY ALL
     )
     SELECT d.year, d.candidate_id, c.ballot_name, c.office, c.office_code, c.uf, c.party, c.result, c.registration_status, c.votes,
       count(*)::INT AS parts, sum(d.pages)::INT AS pages, sum(d.empty_pages)::INT AS empty_pages, sum(d.ocr_pages)::INT AS ocr_pages,
       bool_and(d.unreadable) AS unreadable, any_value(tt.topics) AS topics
     FROM proposal_doc d
     JOIN candidate_summary c ON c.year = d.year AND c.id = d.candidate_id
     LEFT JOIN tt ON tt.year = d.year AND tt.candidate_id = d.candidate_id
     WHERE ${where.join(" AND ")}
     GROUP BY ALL
     ORDER BY c.office_code, c.uf, c.votes DESC NULLS LAST, c.ballot_name`,
    params,
  );
}

/** Whether a candidacy filed a plan (cheap; used by the profile to decide on the section). */
export async function hasProposal(year: number, id: string) {
  const r = await q<{ n: number }>(`SELECT count(*)::INT AS n FROM proposal_doc WHERE year = ? AND candidate_id = ?`, [year, id]);
  return (r[0]?.n ?? 0) > 0;
}
