import "server-only";
import { q1 } from "../db";
import { resolveParty } from "./parties";
import { getMunicipality, isStateUf } from "./geo";

// Cheap existence checks run before a detail page starts streaming, so unknown records get a
// real HTTP 404 instead of a not-found UI inside a 200 response.

export async function candidacyExists(year: number, id: string) {
  if (!/^\d{4}$/.test(String(year)) || !/^\d{5,14}$/.test(id)) return false;
  return Boolean(await q1(`SELECT 1 FROM candidate WHERE year = ? AND id = ?`, [year, id]));
}

export async function entityExists(key: string) {
  if (!/^[a-z0-9]{2,20}$/.test(key)) return false;
  return Boolean(await q1(`SELECT 1 FROM entity WHERE key = ?`, [key]));
}

export async function partyExists(sigla: string) {
  return (await resolveParty(sigla)).length > 0;
}

export async function municipalityExists(uf: string, code: string) {
  if (!isStateUf(uf) || !/^\d{1,7}$/.test(code)) return false;
  return Boolean(await getMunicipality(uf, Number(code)));
}
