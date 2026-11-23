import { test } from "node:test";
import assert from "node:assert/strict";
import { probe, safeSlippage, sandwich, swapOut, maxFrontRun } from "../src/probe.ts";

const base = { amountIn: 10, reserveIn: 500, reserveOut: 1_500_000, slippage: 0.01, fee: 0.003, attackerCost: 0.003 };

test("swapOut matches the constant-product formula", () => {
  const out = swapOut(10, 500, 1_500_000, 0.003);
  assert.ok(Math.abs(out - (1_500_000 * 9.97) / 509.97) < 1e-6);
});

test("no front-run leaves the victim at the expected output", () => {
  const r = probe({ ...base, slippage: 0 });
  assert.equal(r.frontRun, 0);
  assert.equal(r.loss, 0);
  assert.equal(r.exposed, false);
});

test("the sandwich never pushes the victim below their minimum", () => {
  for (const slippage of [0.001, 0.005, 0.01, 0.03, 0.1]) {
    const r = probe({ ...base, slippage });
    assert.ok(r.sandwichedOut >= r.minOut * (1 - 1e-9), `slippage ${slippage}`);
  }
});

test("a wide slippage tolerance on a mid-size pool is exposed", () => {
  const r = probe({ ...base, slippage: 0.03 });
  assert.ok(r.exposed);
  assert.ok(r.netProfit > 0);
  assert.ok(r.loss > 0);
});

test("profit grows with slippage tolerance", () => {
  const a = probe({ ...base, slippage: 0.01 }).grossProfit;
  const b = probe({ ...base, slippage: 0.03 }).grossProfit;
  assert.ok(b > a);
});

test("safeSlippage is the boundary between safe and exposed", () => {
  const s = safeSlippage(base);
  assert.ok(s > 0 && s < 0.5);
  assert.ok(probe({ ...base, slippage: s }).netProfit <= 0);
  assert.ok(probe({ ...base, slippage: s * 1.05 + 1e-5 }).netProfit > 0);
});

test("maxFrontRun is the largest front-run the minimum allows", () => {
  const r = probe(base);
  const limit = maxFrontRun(base, r.minOut);
  assert.ok(sandwich(base, limit).victimOut >= r.minOut * (1 - 1e-9));
  assert.ok(sandwich(base, limit * 1.01).victimOut < r.minOut);
});
