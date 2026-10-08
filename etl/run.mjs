// Full refresh: download changed TSE files -> stage -> build DB (with snapshot/diff) -> photos.
//   node etl/run.mjs            # incremental (skips unchanged upstream files)
//   node etl/run.mjs --force    # re-download everything
//   node etl/run.mjs --no-photos
//   node etl/run.mjs --ocr          # also read scanned government plans with OCR (slow)
//   node etl/run.mjs --no-cnpj      # skip the Receita CNPJ enrichment (~7.8 GB download per month)
//   node etl/run.mjs --no-sanctions # skip the CGU sanction registries (CEIS, CNEP, CEPIM, leniência)
//   node etl/run.mjs --no-pncp      # skip PNCP contracts (incremental: updates of the last 7 days)
import { downloadAll } from './download.mjs';
import { stageAll } from './stage.mjs';
import { build } from './build.mjs';
import { fetchPhotos } from './photos.mjs';
import { fetchGeo } from './geo.mjs';
import { fetchProposals } from './proposals.mjs';
import { fetchCnpj } from './cnpj.mjs';
import { fetchSanctions } from './sanctions.mjs';
import { fetchPncp, buildPncpStaging } from './pncp.mjs';

const force = process.argv.includes('--force');
const t0 = Date.now();
const results = await downloadAll({ force });
const changed = results.some((r) => r.changed);
await stageAll();
await fetchGeo();
const proposals = process.argv.includes('--no-proposals') ? { changed: false } : await fetchProposals({ ocr: process.argv.includes('--ocr') });
// Enrichment sources are independent of the TSE files: an outage keeps the previous staging.
const optional = async (name, fn) => {
  try {
    return await fn();
  } catch (e) {
    console.warn(`${name} skipped: ${e.message}`);
    return { changed: false };
  }
};
// The CNPJ scope is read from the current database, so companies that first appear in this run's
// TSE files are enriched on the next run (the scope change alone then triggers a rebuild).
const cnpj = process.argv.includes('--no-cnpj') ? { changed: false } : await optional('cnpj', () => fetchCnpj({ force }));
const sanctions = process.argv.includes('--no-sanctions') ? { changed: false } : await optional('sanctions', () => fetchSanctions());
const pncp = process.argv.includes('--no-pncp')
  ? { changed: false }
  : await optional('pncp', async () => {
      const r = await optional('pncp fetch', () => fetchPncp({ incremental: true }));
      await buildPncpStaging(); // also picks up companies newly staged by fetchCnpj
      return r;
    });
if (changed || proposals.changed || cnpj.changed || sanctions.changed || pncp.changed || force || process.argv.includes('--rebuild')) {
  await build();
} else {
  console.log('No upstream changes; database left as is (use --rebuild to force).');
}
if (!process.argv.includes('--no-photos')) await fetchPhotos();
console.log(`pipeline finished in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
