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
