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
check("Deep preset: advice says no slippage pays", await page.getByText("No sandwich pays on this pool at any slippage up to 50%.").isVisible());
check("Deep preset pressed, Mid-size released", (await page.getByRole("button", { name: "Deep" }).getAttribute("aria-pressed")) === "true" && (await page.getByRole("button", { name: "Mid-size" }).getAttribute("aria-pressed")) === "false");

await page.getByRole("button", { name: "Thin" }).click();
check("Thin preset: exposed", /^Exposed/.test(await verdict()), await verdict());

await page.getByRole("button", { name: "Mid-size" }).click();
await page.getByRole("button", { name: /^Use 0\.03% slippage$/ }).click();
check("Use suggested slippage sets the field", (await field("Slippage (%)").inputValue()) === "0.03", await field("Slippage (%)").inputValue());
check("suggested slippage makes the swap safe", /^Not worth attacking at 0\.03% slippage/.test(await verdict()), await verdict());
check("focus moves to the slippage field", await field("Slippage (%)").evaluate((el) => el === document.activeElement));
check("presets released after editing", (await page.locator('[aria-pressed="true"]').count()) === 0);

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

await page.getByRole("link", { name: "How it works" }).click();
await page.waitForTimeout(200);
const howTop = await page.locator("#how-title").boundingBox();
const atEnd = await page.evaluate(() => Math.abs(window.scrollY + innerHeight - document.documentElement.scrollHeight) < 2);
check("How it works link brings the section into view", howTop && howTop.y >= 0 && (howTop.y < 200 || atEnd), `top ${howTop?.y}, scrolled to end ${atEnd}`);
check("fields survive the anchor jump", (await page.getByLabel("Token you sell", { exact: true }).inputValue()) === "WBTC");

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
