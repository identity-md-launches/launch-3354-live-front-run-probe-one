const big = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const mid = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const small = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 });

/** A token amount, rounded to what a reader can use. */
export function amount(n: number): string {
  const a = Math.abs(n);
  if (a === 0) return "0";
  if (a >= 1000) return big.format(n);
  if (a >= 1) return mid.format(n);
  return small.format(n);
}

/** A fraction as a percentage: 0.0123 -> "1.23%". */
export function percent(f: number, digits = 2): string {
  const p = f * 100;
  const fixed = Number(p.toFixed(digits));
  return `${fixed.toLocaleString("en-US", { maximumFractionDigits: digits })}%`;
}

const sig3 = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 });
const exact = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 8 });

/** A fraction as a percentage to three significant digits: 0.00034788 -> "0.0348%". */
export function percentApprox(f: number): string {
  return `${sig3.format(f * 100)}%`;
}

/** A fraction as the percentage the visitor typed, without rounding it away: 0.00032 -> "0.032%". */
export function percentExact(f: number): string {
  return `${exact.format(f * 100)}%`;
}

/**
 * A percentage rounded down to three significant digits, so a suggested setting never sits
 * above the break-even it came from. 0.034788 -> 0.0347. Zero stays zero.
 */
export function floorSig3(p: number): number {
  if (!(p > 0)) return 0;
  const e = Math.floor(Math.log10(p)) - 2;
  const unit = 10 ** e;
  let v = Number((Math.floor(p / unit) * unit).toPrecision(3));
  if (v > p) v = Number(((Math.floor(p / unit) - 1) * unit).toPrecision(3));
  return v;
}

/** Plain decimal text for a percentage from floorSig3, with no exponent: 1e-7 -> "0.0000001". */
export function plainDecimal(p: number): string {
  if (p === 0) return "0";
  const decimals = Math.max(0, 2 - Math.floor(Math.log10(p)));
  return Number(p.toFixed(decimals)).toFixed(decimals).replace(/\.?0+$/, "");
}
