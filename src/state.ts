import type { ProbeInput } from "./probe.ts";

/** Form values as typed, so a half-typed number is never rewritten under the cursor. */
export interface Fields {
  amountIn: string;
  reserveIn: string;
  reserveOut: string;
  slippage: string;
  fee: string;
  attackerCost: string;
  tokenIn: string;
  tokenOut: string;
}

export type NumericField = Exclude<keyof Fields, "tokenIn" | "tokenOut">;

export interface Preset {
  id: string;
  name: string;
  fields: Fields;
}

/** Illustrative pools, not live chain data. */
export const PRESETS: Preset[] = [
  {
    id: "thin",
    name: "Thin",
    fields: { amountIn: "2", reserveIn: "50", reserveOut: "150000", slippage: "2", fee: "0.3", attackerCost: "0.004", tokenIn: "ETH", tokenOut: "USDC" },
  },
  {
    id: "mid",
    name: "Mid-size",
    fields: { amountIn: "10", reserveIn: "500", reserveOut: "1500000", slippage: "1", fee: "0.3", attackerCost: "0.003", tokenIn: "ETH", tokenOut: "USDC" },
  },
  {
    id: "deep",
    name: "Deep",
    fields: { amountIn: "10", reserveIn: "20000", reserveOut: "60000000", slippage: "0.5", fee: "0.05", attackerCost: "0.005", tokenIn: "ETH", tokenOut: "USDC" },
  },
];

export const DEFAULT_FIELDS = PRESETS[1].fields;

/** Range rules per field; the message says how to fix the value. */
export const RULES: Record<NumericField, { min: number; max: number; minExclusive: boolean; message: string }> = {
  amountIn: { min: 0, max: 1e15, minExclusive: true, message: "Enter an amount above 0" },
  reserveIn: { min: 0, max: 1e18, minExclusive: true, message: "Enter a pool balance above 0" },
  reserveOut: { min: 0, max: 1e18, minExclusive: true, message: "Enter a pool balance above 0" },
  slippage: { min: 0, max: 50, minExclusive: false, message: "Enter a percentage from 0 to 50" },
  fee: { min: 0, max: 10, minExclusive: false, message: "Enter a percentage from 0 to 10" },
  attackerCost: { min: 0, max: 1e15, minExclusive: false, message: "Enter 0 or more" },
};

/** Separators of the visitor's number locale, e.g. de-DE writes 1.234,5. */
export interface NumberLocale { decimal: "." | ","; group: string }

export function numberLocale(tag?: string): NumberLocale {
  const lang = tag ?? (typeof navigator !== "undefined" ? navigator.language : undefined) ?? "en-US";
  let parts: Intl.NumberFormatPart[] = [];
  try { parts = new Intl.NumberFormat(lang).formatToParts(1234.5); } catch { /* unknown tag */ }
  const decimal = parts.find((p) => p.type === "decimal")?.value === "," ? "," : ".";
  const group = parts.find((p) => p.type === "group")?.value ?? (decimal === "," ? "." : ",");
  return { decimal, group };
}

/** "1,234.5" for en-US, "1.234,5" for de-DE: the example a format error shows. */
export function formatExample(loc: NumberLocale = numberLocale()): string {
  const g = /\s/.test(loc.group) ? " " : loc.group;
  return `1${g}234${loc.decimal}5`;
}

// Whole-number part with separators in the right places: 1 to 3 digits (not a leading 0), then groups of 3.
const grouped = (sep: string) => new RegExp(`^[1-9]\\d{0,2}(?:${sep === "." ? "\\." : sep}\\d{3})+$`);
const PLAIN = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/**
 * Reads a number as typed in the visitor's locale. The locale's decimal separator is the decimal
 * point; its grouping separator is removed only where it groups thousands. A dot is also read as
 * the decimal point when it cannot be a thousands separator ("0.5" in de-DE), because the example
 * pools and suggestions are written that way. Anything else, such as "0,5" in en-US, is NaN.
 */
export function parseNumber(raw: string, loc: NumberLocale = numberLocale()): number {
  // Spaces (and no-break spaces) only ever group digits.
  const s = raw.replace(/[\s\u00a0\u202f]/g, "");
  if (s === "") return Number.NaN;
  if (PLAIN.test(s)) {
    // A lone dot: the decimal point, unless this locale groups with dots and it groups correctly.
    if (loc.decimal === "," && grouped(".").test(s)) return Number(s.replace(/\./g, ""));
    return Number(s);
  }
  const groupSep = loc.decimal === "," ? "." : ",";
  const [whole, frac, ...rest] = s.split(loc.decimal);
  if (rest.length) return Number.NaN;
  if (frac !== undefined && !/^\d*(e[+-]?\d+)?$/i.test(frac)) return Number.NaN;
  let digits: string;
  if (/^\d*$/.test(whole)) digits = whole;
  else if (grouped(groupSep).test(whole)) digits = whole.split(groupSep).join("");
  else return Number.NaN;
  const canonical = frac === undefined ? digits : `${digits || "0"}.${frac}`;
  return PLAIN.test(canonical) ? Number(canonical) : Number.NaN;
}

export function fieldError(name: NumericField, raw: string, loc: NumberLocale = numberLocale()): string | null {
  const n = parseNumber(raw, loc);
  const rule = RULES[name];
  const stripped = raw.replace(/[\s\u00a0\u202f]/g, "");
  if (!Number.isFinite(n)) {
    // Separators that do not fit the locale get a format example, not a range message.
    return /^[\d.,]+$/.test(stripped) && /\d/.test(stripped) ? `Use a number like ${formatExample(loc)}` : rule.message;
  }
  if (rule.minExclusive ? n <= rule.min : n < rule.min) return rule.message;
  if (n > rule.max) return rule.message;
  return null;
}

export const NUMERIC: NumericField[] = ["amountIn", "reserveIn", "reserveOut", "slippage", "fee", "attackerCost"];

/** The model input, or null while any field is invalid. */
export function toInput(f: Fields): ProbeInput | null {
  if (NUMERIC.some((k) => fieldError(k, f[k]))) return null;
  return {
    amountIn: parseNumber(f.amountIn),
    reserveIn: parseNumber(f.reserveIn),
    reserveOut: parseNumber(f.reserveOut),
    slippage: parseNumber(f.slippage) / 100,
    fee: parseNumber(f.fee) / 100,
    attackerCost: parseNumber(f.attackerCost),
  };
}

const KEYS: Record<keyof Fields, string> = {
  amountIn: "sell",
  reserveIn: "poolIn",
  reserveOut: "poolOut",
  slippage: "slip",
  fee: "fee",
  attackerCost: "cost",
  tokenIn: "a",
  tokenOut: "b",
};

const isNumeric = (k: keyof Fields): k is NumericField => (NUMERIC as string[]).includes(k);

/**
 * The form as a URL fragment. Valid numbers are written in one locale-independent form
 * ("0.5", never "0,5"), so the recipient's browser reads the same value. Invalid text is kept as typed.
 */
export function toHash(f: Fields, loc: NumberLocale = numberLocale()): string {
  const q = new URLSearchParams();
  for (const k of Object.keys(KEYS) as (keyof Fields)[]) {
    const v = f[k];
    q.set(KEYS[k], isNumeric(k) && !fieldError(k, v, loc) ? String(parseNumber(v, loc)) : v);
  }
  return `#${q.toString()}`;
}

/** True when the fragment holds saved probe inputs rather than a section link like #how. */
export function hashHasProbe(hash: string): boolean {
  return fromHash(hash) !== null;
}

/** Fields from a shared link; anything missing falls back to the default pool. */
export function fromHash(hash: string): Fields | null {
  const body = hash.replace(/^#/, "");
  if (!body.includes("=")) return null;
  const q = new URLSearchParams(body);
  const out: Fields = { ...DEFAULT_FIELDS };
  let found = false;
  for (const k of Object.keys(KEYS) as (keyof Fields)[]) {
    const v = q.get(KEYS[k]);
    // Numbers are restored whole and validated by the form; only token names have a length limit.
    if (v !== null) { out[k] = isNumeric(k) ? v : v.slice(0, TOKEN_MAX); found = true; }
  }
  return found ? out : null;
}

export const TOKEN_MAX = 12;

export function matchPreset(f: Fields): string | null {
  return PRESETS.find((p) => (Object.keys(p.fields) as (keyof Fields)[]).every((k) => p.fields[k] === f[k]))?.id ?? null;
}

export function tokenLabel(raw: string, fallback: string): string {
  const t = raw.trim();
  return t === "" ? fallback : t;
}
