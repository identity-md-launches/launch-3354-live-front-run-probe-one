# DESIGN.md: Front-run probe

Source of truth: `src/styles.css` (tokens at the top, then layout, then components), component
markup in `src/App.tsx` and `src/ProfitChart.tsx`. There is no theme file, CSS framework or web
font; everything below is taken from those files.

## Overview

A single-task tool for people about to make a DEX swap. The page is read to reach one decision
(is my slippage safe?), so the answer sits right under the inputs: a coloured verdict with an icon,
a sentence that explains it, five numbers, one action, then a chart. The look is calm and plain:
warm off-white page, one white result surface, system sans type, one indigo accent for things you
can press, red and green only for the verdict. Density is moderate (44px controls, 16px body).
Light theme only; there is no dark theme.

System-wide rules: one filled (primary) button per view, colour never carries a state alone (the
verdict has an icon and words; invalid fields have a thicker border and an error line), numbers that
change use tabular figures, and the header has the name at the leading edge and help at the
trailing edge with no box.

## Colors

Hex primitives named by hue, semantic tokens named by role. Components use only semantic tokens.

| Semantic token | Primitive | Value | Use |
| --- | --- | --- | --- |
| `--color-bg` | `--gray-50` | `#f6f6f3` | Page background |
| `--color-surface` | `--gray-0` | `#ffffff` | Result surface, inputs, secondary and choice buttons |
| `--color-text` | `--gray-900` | `#17181a` | Body text, headings, values, chart "your slippage" marker |
| `--color-text-secondary` | `--gray-600` | `#555a61` | Lede, hints, stat labels, captions, footer |
| `--color-border-control` | `--gray-500` | `#7d828a` | Input and outline-button borders, chart zero line |
| `--color-accent` | `--indigo-600` | `#3b3fc4` | Primary button fill, links, pressed choice border, chart line |
| `--color-accent-hover` | `--indigo-700` | `#2f329e` | Primary button hover (hover-capable pointers only) |
| `--color-accent-subtle` | `--indigo-50` | `#ecedfb` | Pressed example-pool button fill |
| `--color-on-accent` | `--gray-0` | `#ffffff` | Text on the primary button |
| `--color-focus` | `--indigo-600` | `#3b3fc4` | 2px focus outline, offset 2px |
| `--color-danger` | `--red-700` | `#b3261e` | "Exposed" verdict, sandwiched output, field errors, invalid border |
| `--color-danger-subtle` | `--red-50` | `#fbe9e7` | Chart area where the bot profits |
| `--color-safe` | `--green-700` | `#1b6e3a` | "Not worth attacking" verdict, chart break-even line |

Contrast of the declared pairs (WCAG formula, computed from these hex values; the taste probe also
measured the rendered text pairs and found none below 4.5:1): text on bg 16.41:1, secondary on bg
6.42:1 and on surface 6.95:1, accent links on bg 7.20:1, white on accent 7.79:1, danger on surface
6.54:1, safe on surface 6.29:1, border-control on surface 3.87:1 and on bg 3.57:1 (non-text, 3:1).

## Typography

- Family: `--font-sans` = `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
  No font files ship; the face is whatever the platform provides.
- Weights: `--weight-regular` 400 (body, inputs, unpressed choices) and `--weight-strong` 600
  (headings, labels, buttons, values, errors).
- Scale (one per role, four fixed sizes plus one fluid display size):

| Token | Size | Line height | Role |
| --- | --- | --- | --- |
| `--text-display` | `clamp(2rem, 1.4rem + 2.4vw, 3rem)`, 32px at 390, 48px at 1440 | 1.1, tracking -0.02em, `text-wrap: balance` | The one `h1` |
| `--text-lg` | 1.25rem / 20px | 1.25 | `h2` (verdict, "How the probe works"), stat values |
| `--text-base` | 1rem / 16px | 1.5 | Body, inputs (16px so iOS does not zoom), buttons |
| `--text-sm` | 0.875rem / 14px | 1.5 (1.4 for hints and errors) | Field labels, hints, errors, stat labels, chart caption, axis, legend, footer |

Numbers in inputs, stat values and the chart axis use `font-variant-numeric: tabular-nums`.
Descriptions use `text-wrap: pretty` and a 60ch measure; stat values use `overflow-wrap: anywhere`
so a long amount wraps instead of clipping. Short labels and button text use `white-space: nowrap`.

## Layout

- Spacing scale (4px base): `--space-1` 4, `--space-2` 8, `--space-3` 12, `--space-4` 16,
  `--space-6` 24, `--space-8` 32, `--space-12` 48.
- Page: `--page-max` 72rem centred; inline padding `--page-inline` 16px, 32px from 40rem up.
- `.workspace`: one column on phones (form, then result, 24px apart). From 60rem the form takes
  `minmax(22rem, 26rem)` and the result the rest, 48px apart.
- `.fields`: `repeat(auto-fit, minmax(min(100%, 8.5rem), 1fr))`, so two columns from 320px up and
  more where they fit. Each `.field` spans three subgrid rows (label, input, message) so inputs in
  a row keep one top edge when a label wraps or an error appears.
- `.preset-row`: `repeat(auto-fit, minmax(5.5rem, 1fr))`, three equal buttons in one row at 320.
- `.stats`: `repeat(auto-fit, minmax(min(100%, 9rem), 1fr))`, one column at 320, two at 390, three
  on desktop.
- First screen at 390×844: header, headline, lede, example pools, all six inputs and the verdict
  heading with its sentence. Verified in Chromium screenshots at 320, 390, 768 and 1440 with no
  horizontal scroll.

## Elevation & Depth

Deliberately flat. No shadows anywhere. Depth comes from one tonal step: the white `.result`
surface on the off-white page. Borders mark controls only (inputs, outline buttons), never
surfaces, so no surface has both a border and a shadow and no card sits inside a card.

## Shapes

`--radius-control` 8px for inputs and buttons; `--radius-surface` 16px for the result surface
(its 16–32px padding keeps the nested 8px controls visually concentric). Chart legend keys use 2px.

## Components

- **Button** (`.btn`, `src/styles.css`): 44px min height, 8px radius, 600 weight, nowrap.
  `.btn--primary` (filled accent; one per view: "Use 0.03% slippage"), `.btn--secondary`
  (white with control border: "Copy link to this probe"), `.btn--choice` (example pools, toggle
  via `aria-pressed`; pressed = subtle accent fill, 2px accent border, 600 weight). Press feedback
  `scale: 0.96` and colour transitions of 150ms `--ease-out`, only under
  `prefers-reduced-motion: no-preference`. Hover only under `(hover: hover)`.
- **NumberField** (`src/App.tsx`): visible `<label for>`, `type="text"` with
  `inputmode="decimal"`, optional hint, live validation from `RULES` in `src/state.ts`. Invalid:
  `aria-invalid="true"`, 2px danger border, error text in danger linked by `aria-describedby`;
  messages say how to fix ("Enter a pool balance above 0").
- **TextField**: same shape, for renaming tokens, inside a native `<details>` ("Rename tokens").
- **Result** (`.result`): verdict `h2` (`.verdict--exposed` / `.verdict--safe`, with a 24px
  2px-stroke icon), `.verdict-line`, `.stats` (`<dl>` of `Stat`), `.advice`, `ProfitChart`, `.share`.
  A visually hidden `role="status"` announces the verdict; `.share-status` is a second status
  region for the copy result. Invalid input state: "Waiting for valid numbers".
- **ProfitChart** (`src/ProfitChart.tsx`): SVG, `role="img"` with a summary `aria-label`; accent
  profit line, danger-subtle area where profit is above zero, solid text-colour line for your
  slippage, dashed safe-colour line at break-even, axis labels and a text legend in HTML.
- **Header / footer**: brand (favicon mark + name, 600) at the leading edge, "How it works" anchor
  link at the trailing edge; footer one secondary-colour line.

## Do's and Don'ts

- Do take colours from the semantic tokens; add a role token rather than reuse one by value.
- Do keep one filled button per view; other actions use `.btn--secondary` or `.btn--choice`.
- Do keep sizes on the four scale tokens plus `--text-display`; do not add a fifth fixed size.
- Do pair red/green with an icon or words; never colour alone.
- Don't add shadows, bordered cards or a second accent hue; don't put small caps labels above
  headings.
- Don't name `transition: all`; list properties and wrap motion in the reduced-motion query.
- Adding a page: there is one page and state is in the URL hash, so a new view is a new section in
  `src/App.tsx` (an `h2` inside `.page`, spaced like `.how`), or a hash route. Reuse `.fields` and
  `NumberField` for inputs, `.result` for one answer surface, and `.btn` variants for actions.
