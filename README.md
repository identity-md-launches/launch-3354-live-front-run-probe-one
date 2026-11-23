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
npm test               # unit tests for the sandwich model (node --test, no extra deps)
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
| `src/state.ts` | Form fields, example pools, validation rules and messages, URL-hash encoding |
| `src/format.ts` | Number and percentage formatting |
| `src/App.tsx` | The page: header, form, result, "How the probe works" |
| `src/ProfitChart.tsx` | SVG chart of bot profit after costs across slippage tolerances |
| `src/styles.css` | Tokens and all styles (see `DESIGN.md`) |
| `public/` | `favicon.svg` and the 1200×630 share image `og.png` |
| `tests/` | `probe.test.ts` (unit) and `browser.mjs` (interaction) |
| `artifacts/validation.md` | Checks run, design review coverage, findings, limitations |

## Checks run for this delivery

Run on the final source on 2026-11-23; full detail in `artifacts/validation.md`.

| Command | Result |
| --- | --- |
| `npm run typecheck` | passed, no errors |
| `npm test` | 7 passed, 0 failed |
| `npm run build` | passed; `dist/index.html`, one JS and one CSS bundle, `favicon.svg`, `og.png` |
| `npm run test:browser` (Chromium 1248 via Playwright 1.64.0) | 35 passed, 0 failed |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | 16 of 16 checks passed |

Not performed: WebKit/Safari (no WebKit build on the machine), a real screen reader, native
200% browser zoom, physical phones. See `artifacts/validation.md`.

## Ignore file

`.gitignore` is new in this change. Its path budget, in full: `node_modules/` at any depth,
`.npm/`, `.cache/`, `*.tgz`, `test/scratch/` and `.imd/`. Nothing the site needs to run or rebuild
is ignored; `dist/` is tracked on purpose. `artifacts/validation.md` is kept out of Git by the
repository's local exclude and delivered alongside the commit.
