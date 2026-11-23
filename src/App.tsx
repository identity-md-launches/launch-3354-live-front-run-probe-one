import { useEffect, useId, useMemo, useRef, useState } from "react";
import { probe, profitCurve, safeSlippage } from "./probe.ts";
import { amount, percent } from "./format.ts";
import {
  DEFAULT_FIELDS, PRESETS, type Fields, type NumericField,
  fieldError, fromHash, matchPreset, toHash, toInput, tokenLabel,
} from "./state.ts";
import { ProfitChart } from "./ProfitChart.tsx";

const MAX_SAFE = 0.5;

function initialFields(): Fields {
  return fromHash(window.location.hash) ?? DEFAULT_FIELDS;
}

export function App() {
  const [fields, setFields] = useState<Fields>(initialFields);
  const [copyStatus, setCopyStatus] = useState("");
  const slippageRef = useRef<HTMLInputElement>(null);

  const tokenIn = tokenLabel(fields.tokenIn, "token A");
  const tokenOut = tokenLabel(fields.tokenOut, "token B");
  const input = useMemo(() => toInput(fields), [fields]);
  const result = useMemo(() => (input ? probe(input) : null), [input]);
  const safe = useMemo(() => (input ? safeSlippage(input, MAX_SAFE) : null), [input]);
  const curve = useMemo(() => {
    if (!input || safe === null) return null;
    const reach = safe >= MAX_SAFE ? input.slippage * 2 : Math.max(input.slippage, safe) * 2;
    const xMax = Math.min(MAX_SAFE, Math.max(0.01, reach));
    return profitCurve(input, xMax);
  }, [input, safe]);

  // Keep the address bar in step with the form, so the URL is always a shareable probe.
  useEffect(() => {
    const t = window.setTimeout(() => {
      history.replaceState(null, "", toHash(fields));
    }, 250);
    return () => window.clearTimeout(t);
  }, [fields]);

  const set = (name: keyof Fields, value: string) => {
    setFields((f) => ({ ...f, [name]: value }));
    setCopyStatus("");
  };

  const activePreset = matchPreset(fields);
  const announcement = result && input
    ? result.exposed
      ? `Exposed. A sandwich nets the bot ${amount(result.netProfit)} ${tokenIn}.`
      : `Not worth attacking at ${percent(input.slippage)} slippage.`
    : "Waiting for valid numbers.";

  // Round the break-even down to 0.01% so the suggested value stays on the safe side.
  const suggested = safe !== null && safe < MAX_SAFE ? Math.floor(safe * 10000) / 10000 : null;

  const useSuggested = () => {
    if (suggested === null) return;
    set("slippage", String(Number((suggested * 100).toFixed(2))));
    slippageRef.current?.focus();
  };

  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}${toHash(fields)}`;
    history.replaceState(null, "", toHash(fields));
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus("Link copied. It opens this probe with these numbers.");
    } catch {
      setCopyStatus("Unable to copy here. The address bar now holds the link to this probe.");
    }
  };

  return (
    <>
      <header className="site-header">
        <span className="brand">
          <img src="./favicon.svg" alt="" width="24" height="24" />
          Front-run probe
        </span>
        <a className="header-link" href="#how">How it works</a>
      </header>

      <main id="main" className="page">
        <div className="intro">
          <h1>Can your swap be sandwiched?</h1>
          <p className="lede">
            A calculator for what a sandwich bot can take from one swap, and the slippage that stops it.
          </p>
        </div>

        <div className="workspace">
          <form className="probe-form" onSubmit={(e) => e.preventDefault()} noValidate aria-label="Swap to probe">
            <fieldset className="presets">
              <legend>Example pools</legend>
              <div className="preset-row">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="btn btn--choice"
                    aria-pressed={activePreset === p.id}
                    onClick={() => { setFields(p.fields); setCopyStatus(""); }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="fields">
              <NumberField name="amountIn" label={`You sell (${tokenIn})`} fields={fields} onChange={set} />
              <NumberField name="slippage" label="Slippage (%)" fields={fields} onChange={set} inputRef={slippageRef} />
              <NumberField name="reserveIn" label={`Pool holds (${tokenIn})`} fields={fields} onChange={set} />
              <NumberField name="reserveOut" label={`Pool holds (${tokenOut})`} fields={fields} onChange={set} />
              <NumberField name="fee" label="Pool fee (%)" fields={fields} onChange={set} />
              <NumberField name="attackerCost" label={`Bot cost (${tokenIn})`} hint="Gas plus builder tip" fields={fields} onChange={set} />
            </div>

            <details className="rename">
              <summary>Rename tokens</summary>
              <div className="fields">
                <TextField name="tokenIn" label="Token you sell" fields={fields} onChange={set} />
                <TextField name="tokenOut" label="Token you buy" fields={fields} onChange={set} />
              </div>
            </details>
          </form>

          <section className="result" aria-labelledby="result-title">
            <p className="visually-hidden" role="status">{announcement}</p>
            {result && input && safe !== null && curve ? (
              <>
                <h2 id="result-title" className={`verdict ${result.exposed ? "verdict--exposed" : "verdict--safe"}`}>
                  <VerdictIcon exposed={result.exposed} />
                  {result.exposed
                    ? `Exposed: a sandwich nets the bot ${amount(result.netProfit)} ${tokenIn}`
                    : `Not worth attacking at ${percent(input.slippage)} slippage`}
                </h2>
                <p className="verdict-line">
                  {result.exposed
                    ? `A bot can buy ${amount(result.frontRun)} ${tokenIn} ahead of you and sell right after. You receive ${amount(result.loss)} ${tokenOut} less.`
                    : result.grossProfit > 0
                      ? `The best sandwich earns ${amount(result.grossProfit)} ${tokenIn}, less than the ${amount(input.attackerCost)} ${tokenIn} it costs the bot.`
                      : `No front-run makes money here: the bot pays the pool fee twice and your trade moves the price too little.`}
                </p>

                <dl className="stats">
                  <Stat term="You expect" value={`${amount(result.expectedOut)} ${tokenOut}`} />
                  <Stat term="Lowest you accept" value={`${amount(result.minOut)} ${tokenOut}`} />
                  <Stat term="You get if sandwiched" value={`${amount(result.sandwichedOut)} ${tokenOut}`} tone={result.exposed ? "danger" : undefined} />
                  <Stat term="Bot profit after costs" value={`${amount(result.netProfit)} ${tokenIn}`} />
                  <Stat term="Your price impact" value={percent(result.priceImpact)} />
                </dl>

                <div className="advice">
                  {suggested === null ? (
                    <p>No sandwich pays on this pool at any slippage up to {percent(MAX_SAFE)}.</p>
                  ) : suggested <= 0 ? (
                    <p>Even 0.01% slippage leaves room for a sandwich that pays. Split the swap into smaller trades or send it privately.</p>
                  ) : result.exposed ? (
                    <>
                      <p>At {percent(suggested)} slippage or less, the sandwich loses the bot money. Set it too tight and the swap can fail if the price moves.</p>
                      <button type="button" className="btn btn--primary" onClick={useSuggested}>
                        Use {percent(suggested)} slippage
                      </button>
                    </>
                  ) : (
                    <p>Stay at or below {percent(suggested)} slippage. Above that, a sandwich pays.</p>
                  )}
                </div>

                <ProfitChart curve={curve} current={input.slippage} safe={suggested === null ? null : safe} token={tokenIn} />
              </>
            ) : (
              <>
                <h2 id="result-title" className="verdict">Waiting for valid numbers</h2>
                <p className="verdict-line">Fix the highlighted field to see the result.</p>
              </>
            )}

            <div className="share">
              <button type="button" className="btn btn--secondary" onClick={copyLink}>Copy link to this probe</button>
              <p className="share-status" role="status">{copyStatus}</p>
            </div>
          </section>
        </div>

        <section id="how" className="how" aria-labelledby="how-title">
          <h2 id="how-title">How the probe works</h2>
          <ol>
            <li>It models one pool that prices with <span className="nowrap">x × y = k</span>, the rule Uniswap v2 and its forks use.</li>
            <li>A bot buys ahead of you, as much as your slippage tolerance allows. Your swap fills at the worse price, then the bot sells back into the pool.</li>
            <li>The probe searches for the front-run size that pays the bot most, then takes off the bot&rsquo;s cost.</li>
          </ol>
          <p>
            It does not model concentrated liquidity (Uniswap v3 and v4), routes across several pools or other trades in the same block, so treat the numbers as an estimate. The example pools are illustrations, not live balances.
          </p>
        </section>
      </main>

      <footer className="site-footer">
        <p>Runs in your browser. Nothing you enter leaves this page.</p>
      </footer>
    </>
  );
}

function NumberField({ name, label, hint, fields, onChange, inputRef }: {
  name: NumericField;
  label: string;
  hint?: string;
  fields: Fields;
  onChange: (name: keyof Fields, value: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const id = useId();
  const error = fieldError(name, fields[name]);
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        ref={inputRef}
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={fields[name]}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(name, e.target.value)}
      />
      {hint && <p id={`${id}-hint`} className="field-hint">{hint}</p>}
      {error && <p id={`${id}-error`} className="field-error">{error}</p>}
    </div>
  );
}

function TextField({ name, label, fields, onChange }: {
  name: "tokenIn" | "tokenOut";
  label: string;
  fields: Fields;
  onChange: (name: keyof Fields, value: string) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type="text" maxLength={12} autoComplete="off" spellCheck={false} value={fields[name]} onChange={(e) => onChange(name, e.target.value)} />
    </div>
  );
}

function Stat({ term, value, tone }: { term: string; value: string; tone?: "danger" }) {
  return (
    <div className="stat">
      <dt>{term}</dt>
      <dd className={tone ? `stat-value stat-value--${tone}` : "stat-value"}>{value}</dd>
    </div>
  );
}

function VerdictIcon({ exposed }: { exposed: boolean }) {
  return (
    <svg className="verdict-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {exposed ? (
        <>
          <path d="M12 3 2.5 20h19L12 3Z" />
          <path d="M12 10v4" />
          <path d="M12 17.5v.01" />
        </>
      ) : (
        <>
          <path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3Z" />
          <path d="m8.5 12 2.5 2.5 4.5-5" />
        </>
      )}
    </svg>
  );
}
