import { percent, amount } from "./format.ts";

interface Props {
  curve: { slippage: number; net: number }[];
  current: number;
  safe: number | null;
  token: string;
}

const W = 600;
const H = 200;
const PAD = 8;

/** Attacker profit after costs across slippage tolerances. Zero line, current tolerance, safe threshold. */
export function ProfitChart({ curve, current, safe, token }: Props) {
  const xMax = curve[curve.length - 1].slippage;
  const nets = curve.map((p) => p.net);
  const yMax = Math.max(...nets, 0);
  const yMin = Math.min(...nets, 0);
  const span = yMax - yMin || 1;
  const x = (s: number) => PAD + ((W - 2 * PAD) * s) / xMax;
  const y = (v: number) => PAD + ((H - 2 * PAD) * (yMax - v)) / span;
  const line = curve.map((p, i) => `${i ? "L" : "M"}${x(p.slippage).toFixed(1)},${y(p.net).toFixed(1)}`).join(" ");
  // Area between the curve and zero wherever the bot makes money.
  const zone =
    `M${x(0).toFixed(1)},${y(0).toFixed(1)} ` +
    curve.map((p) => `L${x(p.slippage).toFixed(1)},${y(Math.max(0, p.net)).toFixed(1)}`).join(" ") +
    ` L${x(xMax).toFixed(1)},${y(0).toFixed(1)} Z`;
  const curIdx = curve.reduce((best, p, i) => (Math.abs(p.slippage - current) < Math.abs(curve[best].slippage - current) ? i : best), 0);
  const curNet = curve[curIdx].net;
  const showSafe = safe !== null && safe > 0 && safe < xMax;
  const summary =
    `Chart of bot profit after costs, from 0% to ${percent(xMax)} slippage. ` +
    `Highest point ${amount(yMax)} ${token}.` +
    (showSafe ? ` Profit turns positive above ${percent(safe!)}.` : "");

  return (
    <figure className="chart">
      <figcaption className="chart-caption">Bot profit after costs, by your slippage tolerance</figcaption>
      <svg className="chart-plot" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={summary}>
        {yMax > 0 && <path className="chart-profit-zone" d={zone} />}
        <line className="chart-zero" x1={0} x2={W} y1={y(0)} y2={y(0)} vectorEffect="non-scaling-stroke" />
        {showSafe && (
          <line className="chart-safe" x1={x(safe!)} x2={x(safe!)} y1={0} y2={H} vectorEffect="non-scaling-stroke" />
        )}
        <line className="chart-current" x1={x(current)} x2={x(current)} y1={0} y2={H} vectorEffect="non-scaling-stroke" />
        <path className="chart-line" d={line} vectorEffect="non-scaling-stroke" />
        <circle className="chart-dot" cx={x(curve[curIdx].slippage)} cy={y(curNet)} r={6} />
      </svg>
      <div className="chart-axis" aria-hidden="true">
        <span>0%</span>
        <span>{percent(xMax)}</span>
      </div>
      <ul className="chart-legend">
        <li><span className="key key--current" aria-hidden="true" />Your slippage, {percent(current)}</li>
        {showSafe && <li><span className="key key--safe" aria-hidden="true" />Break-even, {percent(safe!)}</li>}
        <li><span className="key key--zone" aria-hidden="true" />Shaded: the bot profits</li>
      </ul>
    </figure>
  );
}
