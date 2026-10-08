// Government plans ("propostas de governo") that candidacies to President and Governor file with
// the TSE. One zip per state per election, with one or more PDFs per candidacy
// (<year><UF><SQ_CANDIDATO>[_NN].pdf).
//
//   node etl/proposals.mjs            # download changed zips, extract new/changed PDFs, write staging
//   node etl/proposals.mjs --ocr      # also OCR pages with no text layer (needs tesseract; slow)
//
// The original PDFs are kept untouched in data/proposals/<year>/<id>_<part>.pdf and served by
// /api/proposta. Their text is extracted page by page (pdftotext) and cached next to the PDF as
// JSON, keyed by the file's SHA-256, so unchanged files are never re-read. Pages without a text
// layer can be read with OCR; such pages are flagged, because recognised text may contain errors.
// Staging output (read by etl/sql/09_proposals.sql): data/staging/propostas/*.ndjson.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { DATA_DIR, RAW_DIR, ROOT, STAGING_DIR, UFS, YEARS } from './config.mjs';
import { downloadFile, readManifest } from './download.mjs';

export const proposalUrl = (year, uf) => `https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_${year}_${uf}.zip`;
const OUT_DIR = path.join(DATA_DIR, 'proposals');
const STAGE = path.join(STAGING_DIR, 'propostas');
const TESSDATA = path.join(DATA_DIR, 'tessdata');
const TESS_POR = 'https://github.com/tesseract-ocr/tessdata_fast/raw/main/por.traineddata';
const EXTRACTOR_VERSION = 4; // bump to re-extract every cached file
const MIN_TEXT = 40; // non-space characters below which a page counts as having no text layer
const CPUS = Math.max(2, os.cpus().length - 2);

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => err.push(d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`${cmd} ${code}: ${Buffer.concat(err).toString().slice(0, 300)}`))));
  });
}

async function pool(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      await fn(items[k], k);
    }
  });
  await Promise.all(workers);
}

const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/* ---------- Headings: short standalone blocks in capitals or numbered, minus running headers ---------- */

const NUMBERED = /^(\d{1,2}(\.\d{1,2}){0,3}[.)]?|[IVXL]{1,5}[.)–-])\s+\S/;

export function detectHeadings(pages) {
  const blocks = pages.map((text) =>
    text
      .split(/\n\s*\n/)
      .map((b) => b.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean))
      .filter((b) => b.length),
  );
  // Lines that repeat on 3+ pages are running headers/footers.
  const seen = new Map();
  for (const bs of blocks) for (const l of new Set(bs.flat())) seen.set(l, (seen.get(l) ?? 0) + 1);
  const running = (l) => (seen.get(l) ?? 0) >= 3;

  const isUpper = (l) => {
    const letters = l.replace(/[^\p{L}]/gu, '');
    return letters.length >= 4 && letters === letters.toUpperCase();
  };
  const found = [];
  blocks.forEach((bs, pi) => {
    for (const b of bs) {
      // A title is a block of up to two lines, or the leading one or two capitalised lines of a
      // block whose text continues in normal case ("TÍTULO\nTexto do parágrafo...").
      let lines = b;
      if (b.length > 2) {
        const run = b.findIndex((l) => !isUpper(l));
        if (run < 1 || run > 2) continue;
        lines = b.slice(0, run);
      }
      const text = lines.join(' ');
      const letters = text.replace(/[^\p{L}]/gu, '');
      if (letters.length < 4 || text.length > 90) continue;
      if (lines.some(running)) continue;
      if (/https?:|www\.|fonte:|^p[aá]g(ina)?\.?\s*\d/i.test(text)) continue;
      if (/[.,;:]$/.test(text)) continue;
      const upper = letters === letters.toUpperCase();
      const rest = text.replace(/^(\d{1,2}(\.\d{1,2}){0,3}[.)]?|[IVXL]{1,5}[.)–-])\s+/, '');
      const numbered = NUMBERED.test(text) && /^\p{Lu}/u.test(rest) && lines === b;
      if (!upper && !numbered) continue;
      const m = text.match(/^(\d{1,2}(?:\.\d{1,2}){0,3})/);
      const level = m ? m[1].split('.').length : 1;
      found.push({ page: pi + 1, text, level, numbered: Boolean(m) });
    }
  });
  // Magazine-style documents set whole paragraphs in capitals: keep only numbered titles then.
  const perPage = found.length / Math.max(1, pages.length);
  const kept = perPage > 2 ? found.filter((h) => h.numbered) : found;
  return kept.slice(0, 200);
}

/* ---------- Índice Prumo: topic hits per page ---------- */

export function topicMatchers() {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'lib', 'proposal-topics.json'), 'utf8'));
  return cfg.topics.map((t) => {
    const alt = t.terms
      .map((term) => {
        const prefix = term.endsWith('*');
        const core = (prefix ? term.slice(0, -1) : term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
        return prefix ? `${core}\\w*` : core;
      })
      .join('|');
    return { key: t.key, re: new RegExp(`(?<![\\w])(?:${alt})(?![\\w])`, 'g') };
  });
}

/* ---------- Text extraction ---------- */

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function ocrPage(pdf, page, tmpDir) {
  const base = path.join(tmpDir, `p${page}`);
  await run('pdftoppm', ['-r', '200', '-gray', '-png', '-singlefile', '-f', String(page), '-l', String(page), pdf, base]);
  const out = await run('tesseract', [`${base}.png`, '-', '-l', 'por', '--psm', '3'], { env: { ...process.env, TESSDATA_PREFIX: TESSDATA, OMP_THREAD_LIMIT: '1' } });
  fs.rmSync(`${base}.png`, { force: true });
  return out.toString('utf8');
}

async function extract(pdf, { ocr }) {
  const cacheFile = pdf.replace(/\.pdf$/, '.json');
  const hash = sha256(pdf);
  let cached = null;
  try {
    cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } catch {}
  const needsOcr = (c) => ocr && !c.ocrDone && c.pages.some((p) => !p.ocr && p.text.replace(/\s/g, '').length < MIN_TEXT);
  if (cached && cached.sha256 === hash && cached.version === EXTRACTOR_VERSION && !needsOcr(cached)) return cached;

  let pages;
  let unreadable = false;
  if (cached && cached.sha256 === hash && cached.version === EXTRACTOR_VERSION) {
    pages = cached.pages;
    unreadable = Boolean(cached.unreadable);
  } else {
    let raw = '';
    let failed = false;
    try {
      raw = (await run('pdftotext', ['-enc', 'UTF-8', '-q', pdf, '-'])).toString('utf8');
    } catch {
      failed = true;
    }
    const parts = raw.split('\f');
    if (parts.length > 1 && parts[parts.length - 1].trim() === '') parts.pop();
    let n = parts.length;
    try {
      const info = (await run('pdfinfo', [pdf])).toString('utf8');
      n = Number(info.match(/^Pages:\s+(\d+)/m)?.[1] ?? n);
    } catch {
      // A file neither tool can open is broken as published (truncated or corrupt).
      if (failed) unreadable = true;
    }
    pages = unreadable ? [] : Array.from({ length: n }, (_, i) => ({ text: (parts[i] ?? '').replace(/\r/g, ''), ocr: false }));
  }

  if (ocr) {
    const empty = pages.map((p, i) => (!p.ocr && p.text.replace(/\s/g, '').length < MIN_TEXT ? i : -1)).filter((i) => i >= 0);
    if (empty.length) {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo-ocr-'));
      await pool(empty, CPUS, async (i) => {
        try {
          const text = await ocrPage(pdf, i + 1, tmp);
          if (text.replace(/\s/g, '').length >= MIN_TEXT) pages[i] = { text, ocr: true };
        } catch (e) {
          console.warn(`  OCR failed ${path.basename(pdf)} p.${i + 1}: ${e.message}`);
        }
      });
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  const doc = {
    version: EXTRACTOR_VERSION,
    sha256: hash,
    bytes: fs.statSync(pdf).size,
    unreadable,
    // OCR already attempted on this file: pages it could not read are blank, not pending.
    ocrDone: Boolean(ocr) || Boolean(cached && cached.sha256 === hash && cached.ocrDone),
    extractedAt: new Date().toISOString(),
    pages,
  };
  fs.writeFileSync(cacheFile, JSON.stringify(doc));
  return { ...doc, fresh: true };
}

async function ensureTessdata() {
  if (spawnSync('which', ['tesseract']).status !== 0 || spawnSync('which', ['pdftoppm']).status !== 0) {
    console.warn('OCR skipped: tesseract and pdftoppm are required.');
    return false;
  }
  const file = path.join(TESSDATA, 'por.traineddata');
  if (!fs.existsSync(file)) {
    fs.mkdirSync(TESSDATA, { recursive: true });
    console.log(`downloading Portuguese OCR model from ${TESS_POR}`);
    const res = await fetch(TESS_POR);
    if (!res.ok) throw new Error(`GET ${TESS_POR} -> ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return true;
}

/* ---------- Pipeline ---------- */

export async function fetchProposals({ years = YEARS, ocr = false } = {}) {
  const manifest = readManifest();
  let changed = false;
  const zipDir = path.join(RAW_DIR, 'propostas');
  fs.mkdirSync(zipDir, { recursive: true });
  fs.mkdirSync(STAGE, { recursive: true });
  if (ocr) ocr = await ensureTessdata();
  const topics = topicMatchers();

  const out = {
    docs: fs.createWriteStream(path.join(STAGE, 'docs.ndjson')),
    pages: fs.createWriteStream(path.join(STAGE, 'pages.ndjson')),
    headings: fs.createWriteStream(path.join(STAGE, 'headings.ndjson')),
    topics: fs.createWriteStream(path.join(STAGE, 'topics.ndjson')),
  };
  const write = (s, o) => s.write(`${JSON.stringify(o)}\n`);

  for (const year of years) {
    const dir = path.join(OUT_DIR, String(year));
    fs.mkdirSync(dir, { recursive: true });
    const files = [];
    for (const uf of ['BR', ...UFS]) {
      const url = proposalUrl(year, uf);
      const zip = path.join(zipDir, path.basename(new URL(url).pathname));
      let r;
      try {
        r = await downloadFile(url, zip, { manifest });
      } catch (e) {
        console.warn(`  propostas ${year}/${uf}: ${e.message}`);
        continue;
      }
      const marker = path.join(dir, `.${uf}.json`);
      let members = null;
      try {
        const m = JSON.parse(fs.readFileSync(marker, 'utf8'));
        if (m.lastModified === r.lastModified) members = m.members;
      } catch {}
      if (!members) {
        changed = true;
        const tmp = fs.mkdtempSync(path.join(dir, '.x'));
        const res = spawnSync('unzip', ['-o', '-q', zip, '-d', tmp]);
        if (res.status !== 0) throw new Error(`unzip failed for ${zip}`);
        members = [];
        const walk = (d) => {
          for (const f of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, f.name);
            if (f.isDirectory()) walk(p);
            const m = f.name.match(/^(\d{4})([A-Z]{2})(\d{6,14})(?:_(\d+))?\.pdf$/i);
            if (!m) continue;
            const id = m[3];
            const part = Number(m[4] ?? 1);
            const name = `${id}_${part}.pdf`;
            fs.renameSync(p, path.join(dir, name));
            members.push({ id, part, uf, file: name, original: f.name });
          }
        };
        walk(tmp);
        fs.rmSync(tmp, { recursive: true, force: true });
        fs.writeFileSync(marker, JSON.stringify({ lastModified: r.lastModified, members }));
      }
      for (const m of members) files.push({ ...m, url, zipModified: r.lastModified });
      fs.writeFileSync(path.join(RAW_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
    }

    let nPages = 0;
    let nOcr = 0;
    await pool(files, CPUS, async (f) => {
      const pdf = path.join(dir, f.file);
      if (!fs.existsSync(pdf)) return;
      const doc = await extract(pdf, { ocr });
      if (doc.fresh) changed = true;
      const ocrPages = doc.pages.filter((p) => p.ocr).length;
      const emptyPages = doc.pages.filter((p) => p.text.replace(/\s/g, '').length < MIN_TEXT).length;
      nPages += doc.pages.length;
      nOcr += ocrPages;
      write(out.docs, {
        year,
        candidate_id: f.id,
        part: f.part,
        uf: f.uf,
        file: f.file,
        original_name: f.original,
        pages: doc.pages.length,
        ocr_pages: ocrPages,
        empty_pages: emptyPages,
        unreadable: Boolean(doc.unreadable),
        bytes: doc.bytes,
        sha256: doc.sha256,
        source_url: f.url,
        source_modified: f.zipModified,
        extracted_at: doc.extractedAt,
      });
      doc.pages.forEach((p, i) => {
        write(out.pages, { year, candidate_id: f.id, part: f.part, page: i + 1, text: p.text, ocr: p.ocr });
        const n = norm(p.text);
        for (const t of topics) {
          const hits = n.match(t.re)?.length ?? 0;
          if (hits) write(out.topics, { year, candidate_id: f.id, part: f.part, page: i + 1, topic: t.key, hits });
        }
      });
      detectHeadings(doc.pages.map((p) => p.text)).forEach((h, i) => write(out.headings, { year, candidate_id: f.id, part: f.part, ord: i + 1, page: h.page, level: h.level, text: h.text }));
    });
    console.log(`propostas ${year}: ${files.length} arquivos, ${nPages} páginas${ocr ? `, ${nOcr} lidas por OCR` : ''}`);
  }
  await Promise.all(Object.values(out).map((s) => new Promise((r) => s.end(r))));
  return { changed };
}

/** Empty staging files, so the database builds even before proposals were fetched. */
export function ensureProposalStaging() {
  fs.mkdirSync(STAGE, { recursive: true });
  for (const f of ['docs', 'pages', 'headings', 'topics']) {
    const p = path.join(STAGE, `${f}.ndjson`);
    if (!fs.existsSync(p)) fs.writeFileSync(p, '');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  fetchProposals({ ocr: process.argv.includes('--ocr') })
    .then(() => console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
