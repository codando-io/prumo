// Downloads the TSE's official candidate photo archives (one zip per state per election)
// and stores them as data/photos/<year>/<SQ_CANDIDATO>.jpg. The app serves them through
// /api/foto/<year>/<id>. Photos are optional: the UI falls back to initials.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DATA_DIR, RAW_DIR, UFS, YEARS, photoUrl } from './config.mjs';
import { downloadFile, readManifest } from './download.mjs';

export async function fetchPhotos({ years = YEARS } = {}) {
  const manifest = readManifest();
  const zipDir = path.join(RAW_DIR, 'fotos');
  fs.mkdirSync(zipDir, { recursive: true });
  for (const year of years) {
    const outDir = path.join(DATA_DIR, 'photos', String(year));
    fs.mkdirSync(outDir, { recursive: true });
    let n = 0;
    for (const uf of [...UFS, 'BR']) {
      const url = photoUrl(year, uf);
      const zip = path.join(zipDir, path.basename(new URL(url).pathname));
      let r;
      try {
        r = await downloadFile(url, zip, { manifest });
      } catch (e) {
        console.warn(`  photos ${year}/${uf}: ${e.message}`);
        continue;
      }
      if (!r.changed && fs.existsSync(path.join(outDir, `.${uf}.done`))) continue;
      const tmp = fs.mkdtempSync(path.join(outDir, '.x'));
      const res = spawnSync('unzip', ['-o', '-q', zip, '-d', tmp]);
      if (res.status !== 0) throw new Error(`unzip failed for ${zip}`);
      for (const f of fs.readdirSync(tmp)) {
        const m = f.match(/^F[A-Z]{2}(\d+)_div\.(jpe?g)$/i);
        if (!m) continue;
        fs.renameSync(path.join(tmp, f), path.join(outDir, `${m[1]}.jpg`));
        n++;
      }
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.writeFileSync(path.join(outDir, `.${uf}.done`), new Date().toISOString());
    }
    fs.writeFileSync(path.join(RAW_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`photos ${year}: ${n} extracted`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchPhotos().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
