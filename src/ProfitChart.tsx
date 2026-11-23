import { percent, percentApprox, percentExact, amount } from "./format.ts";

interface Props {
  curve: { slippage: number; net: number }[];
  /** The visitor's slippage, as a fraction. */
  current: number;
  /** Bot profit after costs at exactly `current`, the same number the verdict uses. */
  currentNet: number;
  /** Modeled break-even slippage, or null when no slippage in range pays. */
  safe: number | null;
  token: string;
}

const W = 600;
const H = 200;
const PAD = 8;

/** Attacker profit after costs across slippage tolerances. Zero line, current tolerance, safe threshold. */
export function ProfitChart({ curve, current, currentNet, safe, token }: Props) {
  const xMax = curve[curve.length - 1].slippage;
  // Plot the exact current setting as a sample too, so the line passes through the dot.
  const points = current >= 0 && current <= xMax
    ? [...curve.filter((p) => p.slippage !== current), { slippage: current, net: currentNet }].sort((a, b) => a.slippage - b.slippage)
    : curve;
  const nets = points.map((p) => p.net);
  const peak = Math.max(...nets);
  const yMax = Math.max(peak, 0);
  const yMin = Math.min(...nets, 0);
  const span = yMax - yMin || 1;
  const x = (s: number) => PAD + ((W - 2 * PAD) * s) / xMax;
  const y = (v: number) => PAD + ((H - 2 * PAD) * (yMax - v)) / span;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.slippage).toFixed(1)},${y(p.net).toFixed(1)}`).join(" ");
  // Area between the curve and zero wherever the bot makes money.
  const zone =
    `M${x(0).toFixed(1)},${y(0).toFixed(1)} ` +
    points.map((p) => `L${x(p.slippage).toFixed(1)},${y(Math.max(0, p.net)).toFixed(1)}`).join(" ") +
    ` L${x(xMax).toFixed(1)},${y(0).toFixed(1)} Z`;
  const showZone = peak > 0;
  const showSafe = safe !== null && safe > 0 && safe < xMax;
  const summary =
    `Chart of bot profit after costs, from 0% to ${percent(xMax)} slippage. ` +
    (showZone
      ? `Highest point ${amount(peak)} ${token}.`
      : `No positive bot profit in this range. Highest modeled net: ${amount(peak)} ${token}.`) +
    (showSafe ? ` Profit turns positive above about ${percentApprox(safe!)}.` : "") +
    ` At your ${percentExact(current)}, ${amount(currentNet)} ${token}.`;

  return (
    <figure className="chart">
      <figcaption className="chart-caption">Bot profit after costs, by your slippage tolerance</figcaption>
      <svg className="chart-plot" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={summary}>
        {showZone && <path className="chart-profit-zone" d={zone} />}
        <line className="chart-zero" x1={0} x2={W} y1={y(0)} y2={y(0)} vectorEffect="non-scaling-stroke" />
        {showSafe && (
          <line className="chart-safe" x1={x(safe!)} x2={x(safe!)} y1={0} y2={H} vectorEffect="non-scaling-stroke" />
        )}
        <line className="chart-current" x1={x(current)} x2={x(current)} y1={0} y2={H} vectorEffect="non-scaling-stroke" />
        <path className="chart-line" d={line} vectorEffect="non-scaling-stroke" />
        <circle className="chart-dot" cx={x(current)} cy={y(currentNet)} r={6} />
      </svg>
      <div className="chart-axis" aria-hidden="true">
        <span>0%</span>
        <span>{percent(xMax)}</span>
      </div>
      <ul className="chart-legend">
        <li><span className="key key--current" aria-hidden="true" />Your slippage, {percentExact(current)}</li>
        {showSafe && <li><span className="key key--safe" aria-hidden="true" />Break-even, about {percentApprox(safe!)}</li>}
        {showZone && <li><span className="key key--zone" aria-hidden="true" />Shaded: the bot profits</li>}
      </ul>
    </figure>
  );
}
