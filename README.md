# Front-run probe

One small page that answers: **can your swap be sandwiched?** Enter a pool and a trade (or pick an
example pool) and the page computes, as you type, the most profitable front-run a bot could fit
inside your slippage tolerance, what it costs you, what the bot keeps after its costs, and the
highest slippage at which the attack stops paying. One button applies that slippage; another copies
a link that reopens the probe with the same numbers.

Everything runs in the browser. There is no backend, no wallet and no network request: the example
pools are illustrations, not live balances. The model is one constant-product pool (x × y = k,
Uniswap v2 style). It does not model concentrated liquidity, multi-pool routes or other trades in
the same block; the page says so in "How the probe works".

## Install, preview, rebuild

Requires Node 20.19+ (built with Node 24.21 and npm 11.19).

```sh
npm ci                 # install from package-lock.json
npm run dev            # development server with hot reload
npm run build          # typecheck (tsc --noEmit), then the production export into dist/
npm run preview        # serve the built dist/ locally
npm run typecheck      # typecheck only
npm test               # unit tests: sandwich model, number parsing, links, rounding (node --test)
npm run test:browser   # browser interaction test of dist/ (needs Playwright, see below)
```

`dist/` is committed and is what gets hosted. Vite's `base` is `./`, so every asset URL in
`dist/index.html` is relative and the export works from a gateway subpath or an ENS name. State
lives in the URL hash (`#sell=10&poolIn=500&...`), so no server rewrites are needed. Serve `dist/`
over HTTP(S); browsers refuse module scripts from `file://`.

After changing anything in `src/`, `index.html` or `public/`, run `npm run build` and commit the
new `dist/` with the source.

### Browser test

`tests/browser.mjs` serves `dist/` under `/probe/` (a subpath, like a gateway) and drives Chromium
through the primary interactions. Playwright is deliberately not a project dependency. Install it
anywhere outside the repository and point the test at it:

```sh
npm install --prefix /some/tmp/dir playwright@1.64.0
IMD_PLAYWRIGHT=/some/tmp/dir/node_modules/playwright/index.mjs npm run test:browser
```

Screenshots go to `$SHOTS_DIR` (default: the OS temp directory).

## Layout of the source

| Path | What it holds |
| --- | --- |
| `src/probe.ts` | The model: constant-product swap, sandwich, best front-run search, break-even slippage, profit curve |
| `src/state.ts` | Form fields, example pools, locale-aware number parsing, validation rules and messages, URL-hash encoding |
| `src/format.ts` | Number and percentage formatting |
| `src/App.tsx` | The page: header, form, result, "How the probe works" |
| `src/ProfitChart.tsx` | SVG chart of bot profit after costs across slippage tolerances |
| `src/styles.css` | Tokens and all styles (see `DESIGN.md`) |
| `public/` | `favicon.svg` and the 1200×630 share image `og.png` |
| `tests/` | `probe.test.ts`, `state.test.ts` (unit) and `browser.mjs` (interaction) |
| `artifacts/validation.md` | Checks run, design review coverage, findings, limitations |

## Checks run for this delivery

Run on the final source on 2026-11-23, after the review revision described below.

| Command | Result |
| --- | --- |
| `npm run typecheck` | passed, no errors |
| `npm test` | 12 passed, 0 failed (7 model, 5 parsing/links/rounding) |
| `npm run build` | passed; `dist/index.html`, one JS and one CSS bundle, `favicon.svg`, `og.png` |
| `npm run test:browser` (Chromium 1248 via Playwright 1.64.1) | 54 passed, 0 failed |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | 16 of 16 checks passed (render, layout, targets, contrast, casing, tracking, eyebrows, type-sizes, type-faces, glyphs, slogans, repetition, copy-budget, chrome, motion, share) |

The 390×844 screenshot shows the header, headline, scope lede, example pools, all six inputs and
the verdict heading on the first screen.

Not performed: WebKit/Safari (the WebKit build on this machine does not launch with this
Playwright version), a real screen reader, native 200% browser zoom, physical phones.

### Review revision

Each reported defect was reproduced in Chromium against the previous export before it was fixed,
and the browser test now covers it:

- **Long token names at 320px** (`src/styles.css`): `overflow-wrap: anywhere` on `.field label`,
  `.verdict`, `.verdict-line` and legend items. Test: with two 12-character names, no label
  extends past its cell (4 did with the old rule), no overlap, no horizontal scroll.
- **Break-even and advice** (`src/App.tsx`, `src/format.ts`): verdict and legend show your slippage
  as entered (0.032%); break-even is "about 0.0348%"; the offered value is rounded down to three
  significant digits (0.0347%) and offered for every exposed swap; a safe swap reads "At this
  slippage, the bot does not profit after costs."
- **Decimal comma** (`src/state.ts`): locale-aware parsing; `0,5` is 0.5 in de-DE and an error
  with a format example in en-US; links carry `slip=0.5`.
- **How it works** keeps the saved probe in the address and focuses the help heading.
- **Links** restore numbers whole (only token names are cut to 12 characters) and are written in
  canonical form.
- **Copy** shows "Copying link…" and, if the form changed during the write, says the link holds
  the previous inputs.
- **Verdict sentence**: "A bot could spend 2.55 ETH to buy USDC ahead of you, then sell it back."
- **Chart**: the dot sits on the current-slippage line at the verdict's net profit; the summary
  says "No positive bot profit in this range" when that is true; the shaded key shows only with
  a shaded area.
- **Lede** states the scope (one constant-product pool, such as Uniswap v2); presets read "Example
  pools with sample balances".

Better Interface review of this revision: writing (verdict direction, scope stated before use,
status messages that name what was copied), accessibility (chart name matches the curve, focus
moved to the help heading, format errors tied by `aria-describedby`), layout (no overflow with
the longest allowed names), typography (no new sizes; wrapping rules), colors (unchanged) and UI
(the primary action shown whenever a tighter setting exists) were rechecked. One remaining
limitation: with a zero or near-zero bot cost the break-even can be a tiny figure such as
0.00000000391%. That is the model's honest answer, but it is not a practical setting.

## Ignore file

`.gitignore` is new in this change. Its path budget, in full: `node_modules/` at any depth,
`.npm/`, `.cache/`, `*.tgz`, `test/scratch/` and `.imd/`. Nothing the site needs to run or rebuild
is ignored; `dist/` is tracked on purpose. `artifacts/validation.md` is kept out of Git by the
repository's local exclude and delivered alongside the commit.
