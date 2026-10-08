import { q1 } from "./db-core";
import { UF_NAMES } from "./labels";

/*
 * Existence checks for detail routes, run by the request proxy before a page renders. With
 * Partial Prerendering the page's static shell starts streaming before the page itself can call
 * notFound(), which would leave unknown records with a 200 status; checking here keeps them 404.
 * The pages keep their own checks too (they are the source of truth in development).
 */

const STATE_UFS = new Set(Object.keys(UF_NAMES).filter((u) => u !== "BR" && u !== "ZZ"));
const normParty = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();

async function has(sql: string, params: unknown[]) {
  try {
    return Boolean(await q1(sql, params));
  } catch {
    // Missing table (e.g. a database built before an enrichment existed): not found there.
    return false;
  }
}

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** True when the path names a record that does not exist; false when it exists or is not a detail route. */
export async function isMissingRecord(pathname: string): Promise<boolean> {
  const parts = pathname.split("/").filter(Boolean);
  const [section, a, b] = parts;
  switch (section) {
    case "candidatos": {
      if (!a || !b) return false;
      if (!/^\d{4}$/.test(a) || !/^\d{5,14}$/.test(b)) return true;
      return !(await has(`SELECT 1 FROM candidate WHERE year = ? AND id = ?`, [Number(a), b]));
    }
    case "empresas": {
      if (!a) return false;
      if (!/^\d{14}$/.test(a) || /^(\d)\1{13}$/.test(a)) return true;
      if (await has(`SELECT 1 FROM entity WHERE key = ?`, [`j${a}`])) return false;
      return !(await has(`SELECT 1 FROM rf_establishment WHERE cnpj = ? OR (cnpj_basico = ? AND matriz)`, [a, a.slice(0, 8)]));
    }
    case "fornecedores":
    case "doadores": {
      if (!a) return false;
      if (!/^[a-z0-9]{2,20}$/.test(a)) return true;
      return !(await has(`SELECT 1 FROM entity WHERE key = ?`, [a]));
    }
    case "partidos": {
      if (!a) return false;
      const sigla = decode(a);
      return !(await has(`SELECT 1 FROM candidate WHERE party = ? OR upper(replace(strip_accents(party), ' ', '')) = ?`, [sigla, normParty(sigla)]));
    }
    case "estados": {
      if (!a) return false;
      const uf = a.toUpperCase();
      if (!STATE_UFS.has(uf)) return true;
      if (!b) return false;
      if (!/^\d{1,7}$/.test(b)) return true;
      if (await has(`SELECT 1 FROM mun_xwalk WHERE uf = ? AND tse_code = ?`, [uf, Number(b)])) return false;
      return !(await has(`SELECT 1 FROM vote_mun WHERE uf = ? AND mun_code = ?`, [uf, Number(b)]));
    }
    default:
      return false;
  }
}
