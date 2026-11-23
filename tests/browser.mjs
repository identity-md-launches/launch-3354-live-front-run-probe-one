// Serves dist/ under /probe/ (a subpath, like an IPFS gateway) and walks the primary interactions.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";
// Playwright is not a project dependency: name its module with IMD_PLAYWRIGHT, or install it where import can see it.
const { chromium } = await import(process.env.IMD_PLAYWRIGHT ?? "playwright");
const SHOTS = process.env.SHOTS_DIR ?? join(tmpdir(), "front-run-probe-shots");
mkdirSync(SHOTS, { recursive: true });
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (!path.startsWith("/probe/")) { res.writeHead(404).end(); return; }
  const rel = path.slice("/probe/".length) || "index.html";
  try { const body = await readFile(join("dist", rel)); res.writeHead(200, { "content-type": types[extname(rel)] ?? "application/octet-stream" }).end(body); }
  catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/probe/`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base.replace(/\/probe\/$/, "") });
const page = await ctx.newPage();
const problems = [];
page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("requestfailed", (r) => problems.push(`failed: ${r.url()}`));
page.on("response", (r) => { if (r.status() >= 400) problems.push(`${r.status()}: ${r.url()}`); });
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`); };
const verdict = () => page.locator("#result-title").innerText();
const field = (label) => page.getByLabel(label, { exact: true });

await page.goto(base);
check("default probe (mid-size) is exposed", /^Exposed: a sandwich nets the bot 0\.0832 ETH/.test(await verdict()), await verdict());
check("mid-size preset pressed", (await page.getByRole("button", { name: "Mid-size" }).getAttribute("aria-pressed")) === "true");
const h = await page.locator("#result-title").boundingBox();
check("verdict starts on the first 390x844 screen", h && h.y + 30 < 844, `top ${h?.y}`);

await page.getByRole("button", { name: "Deep" }).click();
check("Deep preset: not worth attacking", /^Not worth attacking at 0\.5% slippage/.test(await verdict()), await verdict());
check("Deep chart: summary has no false peak, no shaded key", /No positive bot profit in this range\. Highest modeled net: -0\.005 ETH\./.test(await page.locator(".chart-plot").getAttribute("aria-label")) && (await page.getByText("Shaded: the bot profits").count()) === 0 && (await page.locator(".chart-profit-zone").count()) === 0, await page.locator(".chart-plot").getAttribute("aria-label"));
check("Deep preset: advice says no slippage pays", await page.getByText("No sandwich pays on this pool at any slippage up to 50%.").isVisible());
check("Deep preset pressed, Mid-size released", (await page.getByRole("button", { name: "Deep" }).getAttribute("aria-pressed")) === "true" && (await page.getByRole("button", { name: "Mid-size" }).getAttribute("aria-pressed")) === "false");

await page.getByRole("button", { name: "Thin" }).click();
check("Thin preset: exposed", /^Exposed/.test(await verdict()), await verdict());

await page.getByRole("button", { name: "Mid-size" }).click();
check("verdict line names what the bot spends and buys", /^A bot could spend 2\.55 ETH to buy USDC ahead of you, then sell it back\. You receive 293\.25 USDC less\.$/.test(await page.locator(".verdict-line").innerText()), await page.locator(".verdict-line").innerText());
check("advice gives the approximate break-even", /break-even is about 0\.0348%/.test(await page.locator(".advice").innerText()), await page.locator(".advice").innerText());
await page.getByRole("button", { name: /^Use 0\.0347% slippage$/ }).click();
check("Use suggested slippage sets the field", (await field("Slippage (%)").inputValue()) === "0.0347", await field("Slippage (%)").inputValue());
check("suggested slippage makes the swap safe", /^Not worth attacking at 0\.0347% slippage/.test(await verdict()), await verdict());
check("focus moves to the slippage field", await field("Slippage (%)").evaluate((el) => el === document.activeElement));
check("presets released after editing", (await page.locator('[aria-pressed="true"]').count()) === 0);

await field("Slippage (%)").fill("0.032");
check("0.032% below break-even: verdict shows it as typed", /^Not worth attacking at 0\.032% slippage/.test(await verdict()), await verdict());
check("safe advice does not tell the visitor to tighten", /^At this slippage, the bot does not profit after costs\. The modeled break-even is about 0\.0348%\.$/.test(await page.locator(".advice").innerText()), await page.locator(".advice").innerText());
check("legend shows the exact setting and the approximate break-even", /Your slippage, 0\.032%/.test(await page.locator(".chart-legend").innerText()) && /Break-even, about 0\.0348%/.test(await page.locator(".chart-legend").innerText()), await page.locator(".chart-legend").innerText());
const geo = await page.evaluate(() => ({ line: +document.querySelector(".chart-current").getAttribute("x1"), cx: +document.querySelector(".chart-dot").getAttribute("cx"), cy: +document.querySelector(".chart-dot").getAttribute("cy"), zero: +document.querySelector(".chart-zero").getAttribute("y1") }));
check("chart dot sits on the marker line, below zero", Math.abs(geo.line - geo.cx) < 0.01 && geo.cy > geo.zero, JSON.stringify(geo));
await field("Slippage (%)").fill("1");
await field("Bot cost (ETH)").fill("0.00001");
check("tiny bot cost still offers a tighter setting", (await page.getByRole("button", { name: /^Use [\d.]+% slippage$/ }).count()) === 1, await page.locator(".advice").innerText());
await field("Bot cost (ETH)").fill("0");
check("zero bot cost still offers a tighter setting", (await page.getByRole("button", { name: /^Use [\d.]+% slippage$/ }).count()) === 1, await page.locator(".advice").innerText());
await field("Bot cost (ETH)").fill("0.003");
await field("Slippage (%)").fill("0,5");
check("a decimal comma in en-US is flagged with an example", (await field("Slippage (%)").getAttribute("aria-invalid")) === "true" && (await page.getByText("Use a number like 1,234.5").count()) === 1);
await field("Slippage (%)").fill("3");
check("typing 3% slippage updates live", /^Exposed/.test(await verdict()), await verdict());

await field("You sell (ETH)").fill("abc");
const sell = field("You sell (ETH)");
check("invalid amount marked aria-invalid", (await sell.getAttribute("aria-invalid")) === "true");
const describedBy = await sell.getAttribute("aria-describedby");
check("error text tied by aria-describedby", describedBy && (await page.locator(`[id="${describedBy}"]`).innerText()) === "Enter an amount above 0");
check("result waits for valid numbers", (await verdict()) === "Waiting for valid numbers");
await sell.fill("0");
check("zero amount rejected", (await sell.getAttribute("aria-invalid")) === "true");
await sell.fill("10");
check("valid amount clears the error", (await sell.getAttribute("aria-invalid")) === null && /^Exposed/.test(await verdict()));
await field("Slippage (%)").fill("60");
check("slippage above 50 rejected", (await page.getByText("Enter a percentage from 0 to 50").count()) === 1);
await field("Slippage (%)").fill("1");

await page.getByText("Rename tokens").click();
await field("Token you sell").fill("WBTC");
await field("Token you buy").fill("DAI");
check("renamed tokens flow into labels", (await field("You sell (WBTC)").count()) === 1 && (await field("Pool holds (DAI)").count()) === 1);
check("renamed tokens flow into the verdict", /WBTC/.test(await verdict()), await verdict());

await page.getByRole("button", { name: "Copy link to this probe" }).click();
await page.waitForTimeout(100);
check("copy status announced", /Link copied/.test(await page.locator(".share-status").innerText()), await page.locator(".share-status").innerText());
const copied = await page.evaluate(() => navigator.clipboard.readText());
check("copied link carries the probe", copied.startsWith(base + "#") && copied.includes("a=WBTC") && copied.includes("slip=1"), copied);
const p2 = await ctx.newPage();
await p2.goto(copied);
check("shared link restores the fields", (await p2.getByLabel("You sell (WBTC)", { exact: true }).inputValue()) === "10" && (await p2.getByLabel("Token you buy", { exact: true }).inputValue()) === "DAI");
check("shared link restores the verdict", /WBTC/.test(await p2.locator("#result-title").innerText()));
await p2.close();

await page.waitForTimeout(400);
const hashBefore = await page.evaluate(() => location.hash);
await page.getByRole("link", { name: "How it works" }).click();
await page.waitForTimeout(800);
check("How it works keeps the saved probe in the address", (await page.evaluate(() => location.hash)) === hashBefore && hashBefore.includes("a=WBTC"), hashBefore);
check("How it works moves focus to the help heading", await page.evaluate(() => document.activeElement?.id === "how-title"));
const howTop = await page.locator("#how-title").boundingBox();
const atEnd = await page.evaluate(() => Math.abs(window.scrollY + innerHeight - document.documentElement.scrollHeight) < 2);
check("How it works link brings the section into view", howTop && howTop.y >= 0 && (howTop.y < 200 || atEnd), `top ${howTop?.y}, scrolled to end ${atEnd}`);
check("fields survive the anchor jump", (await page.getByLabel("Token you sell", { exact: true }).inputValue()) === "WBTC");
await page.reload();
check("fields survive a reload after reading the help", (await page.getByLabel("Token you sell", { exact: true }).inputValue()) === "WBTC");

// A long numeric value round-trips through a link
await page.goto(base + "#sell=000000000000000000000000000000000000000042");
await page.reload();
check("long numeric value restored whole", (await field("You sell (ETH)").inputValue()) === "000000000000000000000000000000000000000042" && /^Exposed/.test(await verdict()), await verdict());

// A copy that finishes after an edit names the previous inputs
await page.goto("about:blank");
await page.goto(base);
await field("You sell (ETH)").fill("42");
await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText(url) { window.reviewCopied = url; return new Promise((r) => { window.finishReviewCopy = r; }); } } }));
await page.getByRole("button", { name: "Copy link to this probe" }).click();
check("pending copy says Copying link…", (await page.locator(".share-status").innerText()) === "Copying link…");
await field("You sell (ETH)").fill("43");
await page.evaluate(() => window.finishReviewCopy());
await page.waitForTimeout(50);
check("late copy names the previous inputs", (await page.locator(".share-status").innerText()) === "Copied a link for the previous inputs. Copy again to share these numbers." && (await page.evaluate(() => window.reviewCopied)).includes("sell=42"));

// de-DE: a decimal comma is a decimal
{
  const de = await browser.newContext({ locale: "de-DE", viewport: { width: 390, height: 844 } });
  const dp = await de.newPage();
  await dp.goto(base);
  await dp.getByLabel("Slippage (%)", { exact: true }).fill("0,5");
  check("de-DE: 0,5 reads as 0.5%", (await dp.getByLabel("Slippage (%)", { exact: true }).getAttribute("aria-invalid")) === null && /Your slippage, 0\.5%/.test(await dp.locator(".chart-legend").innerText()), await dp.locator(".chart-legend").innerText());
  await dp.waitForTimeout(400);
  check("de-DE: the address carries 0.5, not 0,5", /slip=0\.5(&|$)/.test(await dp.evaluate(() => location.hash)), await dp.evaluate(() => location.hash));
  await de.close();
}

// Wide token names wrap inside their cells at 320
{
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("about:blank");
  await page.goto(base);
  await page.getByText("Rename tokens").click();
  await field("Token you sell").fill("WWWWWWWWWWWW");
  await field("Token you buy").fill("WWWWWWWWWWWW");
  const r = await page.evaluate(() => {
    const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const labels = [...document.querySelectorAll(".probe-form > .fields .field label")].map((l) => l.getBoundingClientRect());
    let overlap = 0;
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i], b = labels[j];
      if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlap++;
    }
    const card = document.querySelector(".result").getBoundingClientRect();
    const spill = [...document.querySelectorAll(".result *")].filter((el) => { const b = el.getBoundingClientRect(); return b.width && b.right > card.right + 0.5; }).length;
    const inputs = [...document.querySelectorAll("input")].filter((el) => el.getBoundingClientRect().right > innerWidth + 0.5).length;
    const clipped = [...document.querySelectorAll(".field label, .verdict, .verdict-line, .chart-legend li")].filter((el) => { const r = document.createRange(); r.selectNodeContents(el); const t = r.getBoundingClientRect(), b = el.getBoundingClientRect(); return t.right > b.right + 0.5 || t.left < b.left - 0.5; }).length;
    const cellsOut = [...document.querySelectorAll(".field label")].filter((l) => l.getBoundingClientRect().right > l.parentElement.getBoundingClientRect().right + 0.5).length;
    return { over, overlap, spill, inputs, clipped, cellsOut };
  });
  check("12-character token names: no overlap or overflow at 320", r.over <= 0 && r.overlap === 0 && r.spill === 0 && r.inputs === 0 && r.clipped === 0 && r.cellsOut === 0, JSON.stringify(r));
  await page.screenshot({ path: join(SHOTS, "320-wide-tokens.png"), fullPage: true });
}

// Keyboard: tab order and a visible focus outline
await page.goto(base);
await page.keyboard.press("Tab");
const first = await page.evaluate(() => document.activeElement?.textContent);
check("first tab stop is the header link", first === "How it works", first);
const order = [];
for (let i = 0; i < 10; i++) { await page.keyboard.press("Tab"); order.push(await page.evaluate(() => { const a = document.activeElement; return a?.getAttribute("aria-label") || a?.labels?.[0]?.textContent || a?.textContent?.trim(); })); }
console.log("     tab order:", order.join(" | "));
const outline = await page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`; });
check("focused control shows a 2px solid outline", /^solid 2px/.test(outline), outline);
await page.keyboard.press("Shift+Tab");
await page.keyboard.press("Shift+Tab");
await page.keyboard.press("Shift+Tab");
await page.keyboard.press("Shift+Tab");
await page.keyboard.press("Shift+Tab");
await page.keyboard.press("Shift+Tab");
await page.keyboard.press("Shift+Tab");
const onDeep = await page.evaluate(() => document.activeElement?.textContent);
await page.keyboard.press("Enter");
check(`Enter on a focused preset (${onDeep}) applies it`, (await page.locator('[aria-pressed="true"]').innerText()) === onDeep);

// Overflow and screenshots at three widths
for (const w of [320, 390, 768, 1440]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto(base);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`no horizontal scroll at ${w}`, over <= 0, `overflow ${over}`);
  await page.screenshot({ path: join(SHOTS, `${w}.png`), fullPage: w === 320 || w === 768 });
}
await page.setViewportSize({ width: 320, height: 760 });
await page.goto(base);
await page.screenshot({ path: join(SHOTS, "320-top.png") });
await page.getByLabel("Pool holds (ETH)", { exact: true }).fill("x");
const rows = await page.evaluate(() => [...document.querySelectorAll(".probe-form > .fields input")].map((i) => Math.round(i.getBoundingClientRect().top)));
check("inputs in one row share a top edge at 320", rows[0] === rows[1] && rows[2] === rows[3] && rows[4] === rows[5], rows.join(","));
await page.screenshot({ path: join(SHOTS, "320-error.png") });
check("no console errors, failed or 4xx requests", problems.length === 0, problems.join("; "));
await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
