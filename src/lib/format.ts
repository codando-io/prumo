// pt-BR formatting helpers. Pure functions — safe on server and client.

const brlFull = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlNoCents = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const int = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dec2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** R$ 1.234,56 (non-breaking space after R$, as Intl emits it, so the symbol never wraps alone) */
export function brl(v: unknown): string {
  return isNum(v) ? brlFull.format(v) : "—";
}

/** R$ 1.235 (no cents) */
export function brl0(v: unknown): string {
  return isNum(v) ? brlNoCents.format(v) : "—";
}

/** Compact: R$ 4,9 bi · R$ 12,3 mi · R$ 320 mil · R$ 950 */
export function brlc(v: unknown): string {
  if (!isNum(v)) return "—";
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1e9) return `${sign}R$\u00a0${dec1.format(a / 1e9)}\u00a0bi`;
  if (a >= 1e6) return `${sign}R$\u00a0${dec1.format(a / 1e6)}\u00a0mi`;
  if (a >= 1e4) return `${sign}R$\u00a0${int.format(a / 1e3)}\u00a0mil`;
  if (a >= 1e3) return `${sign}R$\u00a0${dec1.format(a / 1e3)}\u00a0mil`;
  return `${sign}${brlNoCents.format(a)}`;
}

/** 1.234.567 */
export function num(v: unknown): string {
  return isNum(v) ? int.format(v) : "—";
}

/** Compact count: 1,2 mi · 345 mil */
export function numc(v: unknown): string {
  if (!isNum(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e6) return `${dec1.format(v / 1e6)} mi`;
  if (a >= 1e4) return `${int.format(v / 1e3)} mil`;
  return int.format(v);
}

/** Share 0..1 -> "76%" (or "0,4%" for small shares). */
export function pct(v: unknown, digits?: number): string {
  if (!isNum(v)) return "—";
  const p = v * 100;
  if (digits !== undefined) return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(p)}%`;
  if (p > 0 && p < 0.1) return "<0,1%";
  if (p > 0 && p < 1) return `${dec1.format(p)}%`;
  return `${int.format(p)}%`;
}

/** R$ 2,18 (for per-vote values) */
export function brlUnit(v: unknown): string {
  return isNum(v) ? `R$\u00a0${dec2.format(v)}` : "—";
}

const months = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];

/** "2026-10-04" -> "04/10/2026" */
export function date(v: unknown): string {
  if (typeof v !== "string" || v.length < 10) return "—";
  return `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`;
}

/** "2026-10-04" -> "4 out. 2026" */
export function dateLong(v: unknown): string {
  if (typeof v !== "string" || v.length < 10) return "—";
  return `${Number(v.slice(8, 10))} ${months[Number(v.slice(5, 7)) - 1]} ${v.slice(0, 4)}`;
}

/** ISO timestamp -> "7 out. 2026, 04:05" (as published by the TSE, Brasília time). */
export function dateTime(v: unknown): string {
  if (typeof v !== "string" || v.length < 16) return "—";
  return `${dateLong(v)}, ${v.slice(11, 16)}`;
}

export function plural(n: number, one: string, many: string) {
  return `${num(n)} ${n === 1 ? one : many}`;
}

/** "outro candidato" / "outros 3 candidatos" */
export function others(n: number, one: string, many: string) {
  return n === 1 ? `outro ${one}` : `outros ${num(n)} ${many}`;
}

// Tokens kept upper-case when proper-casing names: states, company suffixes, party acronyms.
const KEEP_UPPER = new Set(
  (
    "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO BR " +
    "LTDA ME EPP EIRELI SA S/A SS TV FM CNPJ CPF ONG " +
    "PT PL PP PSD PSB PDT MDB PSDB PSOL PV PTB PMN PRTB DC PCO PCB PSTU UP PMB SD PSC PROS PCDOB PTC DEM PHS PPL PRP PSL PMDB"
  ).split(" "),
);

/** Proper-case an upper-case TSE name for display, keeping particles lower-case and acronyms upper-case. */
export function titleName(s: string | null | undefined): string {
  if (!s) return "";
  if (s !== s.toUpperCase()) return s;
  return s
    .split(/(\s+|-|\/|\(|\))/)
    .map((w, i) => {
      if (KEEP_UPPER.has(w.replace(/[.,]/g, ""))) return w;
      const l = w.toLowerCase();
      if (i > 0 && ["de", "da", "do", "das", "dos", "e"].includes(l)) return l;
      return l.charAt(0).toUpperCase() + l.slice(1);
    })
    .join("");
}

/** A category label inside a sentence: lower case, but acronyms stay ("Rádio, TV e vídeo" → "rádio, TV e vídeo"). */
export function inSentence(label: string | null | undefined): string {
  if (!label) return "";
  return label.replace(/[\p{L}]+/gu, (w) => (w.length >= 2 && w === w.toUpperCase() ? w : w.toLowerCase()));
}
