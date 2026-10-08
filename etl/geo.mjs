// Fetches simplified boundaries from IBGE's public mesh API:
//   public/geo/br-uf.json          states, feature.properties.uf = "SP"
//   public/geo/mun/<UF>.json       municipalities, feature.properties.ibge = 3550308
// and a municipality list (IBGE code + name) used to cross-walk TSE municipality codes,
// which differ from IBGE's, by accent-insensitive name within each state.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, PUBLIC_DIR, UFS } from './config.mjs';

const API = 'https://servicodados.ibge.gov.br/api';
const IBGE_UF = {
  11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO', 21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB',
  26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA', 31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP', 41: 'PR', 42: 'SC', 43: 'RS', 50: 'MS',
  51: 'MT', 52: 'GO', 53: 'DF',
};

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt >= 4) throw new Error(`GET ${url} failed: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

export async function fetchGeo({ force = false } = {}) {
  const geoDir = path.join(PUBLIC_DIR, 'geo');
  const munDir = path.join(geoDir, 'mun');
  fs.mkdirSync(munDir, { recursive: true });

  const statesFile = path.join(geoDir, 'br-uf.json');
  if (force || !fs.existsSync(statesFile)) {
    const fc = await getJson(`${API}/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF`);
    for (const f of fc.features) f.properties = { uf: IBGE_UF[Number(f.properties.codarea)] };
    fs.writeFileSync(statesFile, JSON.stringify(fc));
    console.log('geo: states');
  }

  const rows = ['uf,ibge_code,name'];
  for (const uf of UFS) {
    const out = path.join(munDir, `${uf}.json`);
    if (force || !fs.existsSync(out)) {
      const fc = await getJson(`${API}/v3/malhas/estados/${uf}?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio`);
      for (const f of fc.features) f.properties = { ibge: Number(f.properties.codarea) };
      fs.writeFileSync(out, JSON.stringify(fc));
    }
    const list = await getJson(`${API}/v1/localidades/estados/${uf}/municipios`);
    for (const m of list) rows.push(`${uf},${m.id},"${m.nome.replaceAll('"', '""')}"`);
  }
  fs.mkdirSync(path.join(DATA_DIR, 'geo'), { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, 'geo', 'ibge_municipios.csv'), rows.join('\n'));
  console.log(`geo: ${rows.length - 1} municipalities`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchGeo({ force: process.argv.includes('--force') }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
