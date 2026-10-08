import "server-only";
import { q } from "../db";

export interface RaceRow {
  id: string;
  office_code: number;
  office: string;
  ballot_name: string;
  party: string;
  result: string | null;
  registration_status: string | null;
  votes_r1: number;
  votes_r2: number | null;
  share_r1: number | null;
  share_r2: number | null;
  expense: number;
  has_finance: boolean;
  n_running: number;
}

/**
 * The statewide races (governor, senate): the most-voted candidacies of each, with their share of
 * the nominal votes given to that office in the state, per round.
 */
export async function getStateRaces(year: number, uf: string, perOffice = 5) {
  return q<RaceRow>(
    `SELECT id, office_code, office, ballot_name, party, result, registration_status, votes_r1, votes_r2,
       votes_r1 / nullif(sum(votes_r1) OVER (PARTITION BY office_code), 0) AS share_r1,
       votes_r2 / nullif(sum(votes_r2) OVER (PARTITION BY office_code), 0) AS share_r2,
       expense, has_finance,
       count(*) OVER (PARTITION BY office_code) AS n_running
     FROM candidate_summary
     WHERE year = ? AND uf = ? AND office_code IN (3, 5) AND NOT is_running_mate
     QUALIFY row_number() OVER (PARTITION BY office_code ORDER BY coalesce(votes_r2, 0) DESC, votes_r1 DESC, ballot_name) <= ?
     ORDER BY office_code, coalesce(votes_r2, 0) DESC, votes_r1 DESC`,
    [year, uf, perOffice],
  );
}
