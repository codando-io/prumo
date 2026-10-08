// Extracts the CSV members we need from each TSE zip and transcodes them to UTF-8.
// TSE files are Latin-1 and a few contain stray NUL bytes, which DuckDB's latin-1
// reader rejects, so we normalise them up front with standard tools (unzip, tr, iconv).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { RAW_DIR, STAGING_DIR, YEARS, datasets } from './config.mjs';

function sh(cmd) {
  return new Promise((resolve, reject) => {
    const p = spawn('bash', ['-o', 'pipefail', '-c', cmd], { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`command failed (${code}): ${cmd}`))));
  });
}

const q = (s) => `'${s.replaceAll("'", "'\\''")}'`;

export async function stageAll({ years = YEARS, force = false } = {}) {
  for (const year of years) {
    const dir = path.join(STAGING_DIR, String(year));
    fs.mkdirSync(dir, { recursive: true });
    for (const ds of datasets(year)) {
      const zip = path.join(RAW_DIR, path.basename(new URL(ds.url).pathname));
      if (!fs.existsSync(zip)) throw new Error(`Missing ${zip}; run the download step first`);
      const zipMtime = fs.statSync(zip).mtimeMs;
      for (const [name, member] of Object.entries(ds.members)) {
        const out = path.join(dir, `${name}.csv`);
        if (!force && fs.existsSync(out) && fs.statSync(out).mtimeMs >= zipMtime) continue;
        const t0 = Date.now();
        await sh(`unzip -p ${q(zip)} ${q(member)} | tr -d '\\000' | iconv -f LATIN1 -t UTF-8 > ${q(out + '.part')}`);
        fs.renameSync(out + '.part', out);
        console.log(`staged ${year}/${name}.csv in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      }
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  stageAll({ force: process.argv.includes('--force') }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
