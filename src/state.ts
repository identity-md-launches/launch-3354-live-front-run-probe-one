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

export function parseNumber(raw: string): number {
  const cleaned = raw.replace(/[,_\s]/g, "");
  if (cleaned === "" || !/^\d*\.?\d*(e[+-]?\d+)?$/i.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

export function fieldError(name: NumericField, raw: string): string | null {
  const n = parseNumber(raw);
  const rule = RULES[name];
  if (!Number.isFinite(n)) return rule.message;
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

export function toHash(f: Fields): string {
  const q = new URLSearchParams();
  for (const k of Object.keys(KEYS) as (keyof Fields)[]) q.set(KEYS[k], f[k]);
  return `#${q.toString()}`;
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
    if (v !== null) { out[k] = v.slice(0, 40); found = true; }
  }
  return found ? out : null;
}

export function matchPreset(f: Fields): string | null {
  return PRESETS.find((p) => (Object.keys(p.fields) as (keyof Fields)[]).every((k) => p.fields[k] === f[k]))?.id ?? null;
}

export function tokenLabel(raw: string, fallback: string): string {
  const t = raw.trim();
  return t === "" ? fallback : t;
}
