// CPF masking for text written by the enrichment fetchers (same rule as mask_cpf() in
// etl/sql/01_base.sql): an 11-digit run, optionally punctuated as 123.456.789-01, becomes
// ***.456.789-**. CNPJs (14 digits) and longer numbers are left intact.
const CPF_RE = /(^|[^0-9])([0-9]{3})\.?([0-9]{3})\.?([0-9]{3})-?([0-9]{2})(?=[^0-9]|$)/g;

export function isValidCpf(d) {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(d[i]) * (n + 1 - i);
    if (((sum * 10) % 11) % 10 !== Number(d[n])) return false;
  }
  return true;
}

/** Masks every CPF-shaped number (free text: names, descriptions). */
export const maskCpf = (s) => (s == null ? s : s.replace(CPF_RE, '$1***.$3.$4-**'));

/**
 * Masks only numbers whose check digits make them a valid CPF. For identifiers such as process
 * numbers ("262.00006212/2025"), where most CPF-shaped runs are not CPFs and masking them would
 * corrupt the identifier.
 */
export const maskValidCpf = (s) =>
  s == null ? s : s.replace(CPF_RE, (m, pre, a, b, c, dv) => (isValidCpf(a + b + c + dv) ? `${pre}***.${b}.${c}-**` : m));
