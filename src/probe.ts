// Sandwich (front-run + back-run) model for one swap on a constant-product pool (x * y = k),
// the pricing used by Uniswap v2 style pools. Pure functions: no network, no randomness.

export interface ProbeInput {
  /** Amount of the token you sell. */
  amountIn: number;
  /** Pool reserve of the token you sell. */
  reserveIn: number;
  /** Pool reserve of the token you buy. */
  reserveOut: number;
  /** Slippage tolerance as a fraction (0.005 = 0.5%). */
  slippage: number;
  /** Pool fee as a fraction (0.003 = 0.3%). */
  fee: number;
  /** What the attack costs the attacker (gas and builder tip), in the token you sell. */
  attackerCost: number;
}

export interface ProbeResult {
  /** Output with nobody in front of you. */
  expectedOut: number;
  /** Lowest output your slippage tolerance accepts. */
  minOut: number;
  /** Price impact of your own swap, as a fraction. */
  priceImpact: number;
  /** Size of the most profitable front-run, in the token you sell. */
  frontRun: number;
  /** Output you receive when that front-run lands first. */
  sandwichedOut: number;
  /** expectedOut - sandwichedOut, in the token you buy. */
  loss: number;
  /** Attacker profit before costs, in the token you sell. */
  grossProfit: number;
  /** Attacker profit after costs, in the token you sell. */
  netProfit: number;
  /** True when the best sandwich makes money after costs. */
  exposed: boolean;
}

/** Output of a swap of `amount` into a pool holding `rIn` and `rOut`, after `fee`. */
export function swapOut(amount: number, rIn: number, rOut: number, fee: number): number {
  if (amount <= 0) return 0;
  const net = amount * (1 - fee);
  return (rOut * net) / (rIn + net);
}

/** What the victim receives and the attacker earns for a front-run of size `a`. */
export function sandwich(p: ProbeInput, a: number) {
  const attackerOut = swapOut(a, p.reserveIn, p.reserveOut, p.fee);
  const in1 = p.reserveIn + a;
  const out1 = p.reserveOut - attackerOut;
  const victimOut = swapOut(p.amountIn, in1, out1, p.fee);
  const in2 = in1 + p.amountIn;
  const out2 = out1 - victimOut;
  // Back-run: sell what the front-run bought, back into the pool.
  const back = swapOut(attackerOut, out2, in2, p.fee);
  return { victimOut, gross: back - a };
}

/** Largest front-run that still leaves the victim at or above `minOut`. */
export function maxFrontRun(p: ProbeInput, minOut: number): number {
  if (sandwich(p, 0).victimOut < minOut) return 0;
  let hi = Math.max(p.amountIn, p.reserveIn * 1e-6);
  let guard = 0;
  while (sandwich(p, hi).victimOut >= minOut && guard++ < 200) hi *= 2;
  let lo = 0;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (sandwich(p, mid).victimOut >= minOut) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Front-run size in [0, limit] with the highest gross profit. */
function bestFrontRun(p: ProbeInput, limit: number): number {
  if (limit <= 0) return 0;
  const steps = 64;
  let best = 0;
  let bestGross = 0;
  for (let i = 1; i <= steps; i++) {
    const a = (limit * i) / steps;
    const g = sandwich(p, a).gross;
    if (g > bestGross) { bestGross = g; best = a; }
  }
  // Refine around the best sample with a ternary search.
  let lo = Math.max(0, best - limit / steps);
  let hi = Math.min(limit, best + limit / steps);
  for (let i = 0; i < 60; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (sandwich(p, m1).gross < sandwich(p, m2).gross) lo = m1;
    else hi = m2;
  }
  const refined = (lo + hi) / 2;
  return sandwich(p, refined).gross > bestGross ? refined : best;
}

export function probe(p: ProbeInput): ProbeResult {
  const expectedOut = swapOut(p.amountIn, p.reserveIn, p.reserveOut, p.fee);
  const minOut = expectedOut * (1 - p.slippage);
  const spot = p.reserveOut / p.reserveIn;
  const priceImpact = 1 - expectedOut / (p.amountIn * spot * (1 - p.fee));
  const raw = maxFrontRun(p, minOut);
  // Rounding noise at zero slippage is not a front-run.
  const limit = raw < p.amountIn * 1e-9 ? 0 : raw;
  const a = bestFrontRun(p, limit);
  const s = sandwich(p, a);
  const grossProfit = Math.max(0, s.gross);
  const frontRun = s.gross > 0 ? a : 0;
  const sandwichedOut = frontRun > 0 ? s.victimOut : expectedOut;
  const netProfit = grossProfit - p.attackerCost;
  return {
    expectedOut,
    minOut,
    priceImpact,
    frontRun,
    sandwichedOut,
    loss: expectedOut - sandwichedOut,
    grossProfit,
    netProfit,
    exposed: grossProfit > 0 && netProfit > 0,
  };
}

/**
 * Highest slippage tolerance at which the best sandwich does not make money after costs.
 * Returns `max` when even that tolerance is safe.
 */
export function safeSlippage(p: ProbeInput, max = 0.5): number {
  const net = (s: number) => probe({ ...p, slippage: s }).netProfit;
  if (net(max) <= 0) return max;
  let lo = 0;
  let hi = max;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (net(mid) <= 0) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Net attacker profit sampled across slippage tolerances, for the chart. */
export function profitCurve(p: ProbeInput, maxSlippage: number, points = 48) {
  const out: { slippage: number; net: number }[] = [];
  for (let i = 0; i <= points; i++) {
    const slippage = (maxSlippage * i) / points;
    out.push({ slippage, net: probe({ ...p, slippage }).netProfit });
  }
  return out;
}
