// Central configuration for the TSE ingestion pipeline.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.PRUMO_DATA_DIR ?? path.join(ROOT, 'data');
export const RAW_DIR = path.join(DATA_DIR, 'raw');
export const STAGING_DIR = path.join(DATA_DIR, 'staging');
export const SNAPSHOT_DIR = path.join(DATA_DIR, 'snapshots');
export const DB_PATH = path.join(DATA_DIR, 'prumo.duckdb');
export const PUBLIC_DIR = path.join(ROOT, 'public');

// General elections covered. The first one is the "current" election shown by default.
export const YEARS = (process.env.PRUMO_YEARS ?? '2026,2022,2018').split(',').map(Number);

// Used to derive stable, non-reversible-at-a-glance identifiers for natural persons (CPF).
// CPFs never appear in URLs; the UI only shows the masked form (***.123.456-**).
export const PERSON_SALT = process.env.PRUMO_SALT ?? 'prumo-v1';

export const CDN = 'https://cdn.tse.jus.br/estatistica/sead/odsele';

// Every dataset we read, with the zip it lives in and the members we extract.
export const datasets = (year) => [
  {
    key: 'candidatos',
    label: 'Candidatos',
    url: `${CDN}/consulta_cand/consulta_cand_${year}.zip`,
    members: { candidatos: `consulta_cand_${year}_BRASIL.csv` },
  },
  {
    key: 'bens',
    label: 'Bens de candidatos',
    url: `${CDN}/bem_candidato/bem_candidato_${year}.zip`,
    members: { bens: `bem_candidato_${year}_BRASIL.csv` },
  },
  {
    key: 'prestacao',
    label: 'Prestação de contas eleitorais – candidatos',
    url: `${CDN}/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_${year}.zip`,
    members: {
      receitas: `receitas_candidatos_${year}_BRASIL.csv`,
      receitas_originario: `receitas_candidatos_doador_originario_${year}_BRASIL.csv`,
      despesas_contratadas: `despesas_contratadas_candidatos_${year}_BRASIL.csv`,
      despesas_pagas: `despesas_pagas_candidatos_${year}_BRASIL.csv`,
    },
  },
  {
    key: 'votacao',
    label: 'Votação nominal por município e zona',
    url: `${CDN}/votacao_candidato_munzona/votacao_candidato_munzona_${year}.zip`,
    members: { votacao: `votacao_candidato_munzona_${year}_BRASIL.csv` },
  },
];

export const photoUrl = (year, uf) =>
  `https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes${year}/fotos/foto_cand${year}_${uf}_div.zip`;

export const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB',
  'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];

// Election metadata not present in the CSVs (or needed before parsing them).
export const ELECTIONS = {
  2026: { label: 'Eleições Gerais 2026', round1: '2026-10-04', round2: '2026-10-25', portalId: '20322002026' },
  2022: { label: 'Eleições Gerais 2022', round1: '2022-10-02', round2: '2022-10-30', portalId: '2040602022' },
  2018: { label: 'Eleições Gerais 2018', round1: '2018-10-07', round2: '2018-10-28', portalId: '2022802018' },
};
