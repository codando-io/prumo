// Downloads TSE open-data archives, skipping files that have not changed upstream.
// Keeps a manifest with the upstream Last-Modified / Content-Length of every file,
// which later becomes part of the provenance shown in the app.
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { RAW_DIR, YEARS, datasets } from './config.mjs';

const MANIFEST = path.join(RAW_DIR, 'manifest.json');

export function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch {
    return {};
  }
}

function writeManifest(m) {
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
}

async function head(url) {
  const res = await fetch(url, { method: 'HEAD' });
  if (!res.ok) throw new Error(`HEAD ${url} -> ${res.status}`);
  return {
    lastModified: res.headers.get('last-modified'),
    contentLength: Number(res.headers.get('content-length')),
  };
}

// With `resume`, an interrupted download continues from its `.part` file (HTTP Range) as long as
// the upstream file is still the same version (Last-Modified + size recorded next to the part).
// `meta` ({ lastModified, contentLength }, e.g. from a directory listing) replaces the HEAD request.
export async function downloadFile(url, dest, { force = false, manifest, resume = false, meta: known } = {}) {
  const meta = known ?? (await head(url));
  const prev = manifest[url];
  const exists = fs.existsSync(dest);
  if (
    !force &&
    exists &&
    prev &&
    prev.lastModified === meta.lastModified &&
    fs.statSync(dest).size === meta.contentLength
  ) {
    return { url, changed: false, ...prev };
  }
  const tmp = `${dest}.part`;
  const partMeta = `${tmp}.json`;
  let start = 0;
  if (resume && fs.existsSync(tmp)) {
    try {
      const p = JSON.parse(fs.readFileSync(partMeta, 'utf8'));
      const size = fs.statSync(tmp).size;
      if (p.lastModified === meta.lastModified && p.contentLength === meta.contentLength && size < meta.contentLength) start = size;
    } catch {}
  }
  if (resume) fs.writeFileSync(partMeta, JSON.stringify(meta));
  const res = await fetch(url, start ? { headers: { Range: `bytes=${start}-` } } : undefined);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  const append = start > 0 && res.status === 206;
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp, { flags: append ? 'a' : 'w' }));
  const size = fs.statSync(tmp).size;
  if (meta.contentLength && size !== meta.contentLength) {
    throw new Error(`Incomplete download for ${url}: ${size} != ${meta.contentLength}`);
  }
  fs.renameSync(tmp, dest);
  if (resume) fs.rmSync(partMeta, { force: true });
  const entry = { ...meta, downloadedAt: new Date().toISOString(), file: path.basename(dest) };
  manifest[url] = entry;
  return { url, changed: true, ...entry };
}

export async function downloadAll({ force = false, years = YEARS } = {}) {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const manifest = readManifest();
  const results = [];
  for (const year of years) {
    for (const ds of datasets(year)) {
      const dest = path.join(RAW_DIR, path.basename(new URL(ds.url).pathname));
      const r = await downloadFile(ds.url, dest, { force, manifest });
      console.log(`${r.changed ? '↓ updated ' : '= unchanged'} ${path.basename(dest)} (${r.lastModified})`);
      results.push({ year, key: ds.key, ...r });
      writeManifest(manifest);
    }
  }
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  downloadAll({ force: process.argv.includes('--force') }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
