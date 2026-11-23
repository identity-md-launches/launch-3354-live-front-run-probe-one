import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNumber, fieldError, numberLocale, toHash, fromHash, DEFAULT_FIELDS, toInput } from "../src/state.ts";
import { floorSig3, plainDecimal, percentApprox, percentExact } from "../src/format.ts";
import { probe, safeSlippage } from "../src/probe.ts";

const en = numberLocale("en-US");
const de = numberLocale("de-DE");

test("locale separators are detected", () => {
  assert.deepEqual([en.decimal, de.decimal], [".", ","]);
});

test("en-US: commas group thousands, a decimal comma is rejected with an example", () => {
  assert.equal(parseNumber("0.5", en), 0.5);
  assert.equal(parseNumber("1,234.5", en), 1234.5);
  assert.equal(parseNumber("1,500,000", en), 1500000);
  assert.ok(Number.isNaN(parseNumber("0,5", en)));
  assert.ok(Number.isNaN(parseNumber("1,23,4", en)));
  assert.equal(fieldError("slippage", "0,5", en), "Use a number like 1,234.5");
  assert.equal(fieldError("slippage", "abc", en), "Enter a percentage from 0 to 50");
});

test("de-DE: a decimal comma means a decimal, dots group thousands", () => {
  assert.equal(parseNumber("0,5", de), 0.5);
  assert.equal(parseNumber("1.234,5", de), 1234.5);
  assert.equal(parseNumber("1.500.000", de), 1500000);
  // Dots that cannot group thousands are the decimal point, as the example pools write them.
  assert.equal(parseNumber("0.3", de), 0.3);
  assert.equal(parseNumber("0.003", de), 0.003);
  assert.ok(Number.isNaN(parseNumber("1,2,3", de)));
  assert.equal(fieldError("slippage", "1,2,3", de), "Use a number like 1.234,5");
});

test("links carry locale-independent numbers and restore them whole", () => {
  const typed = { ...DEFAULT_FIELDS, slippage: "0,5", amountIn: "000000000000000000000000000000000000000042" };
  const hash = toHash(typed, de);
  assert.match(hash, /slip=0\.5/);
  const back = fromHash(hash)!;
  assert.equal(toInput(back)!.slippage, 0.005);
  assert.equal(toInput(back)!.amountIn, 42);
  // A long number in a link is not cut short.
  const long = fromHash("#sell=000000000000000000000000000000000000000042")!;
  assert.equal(long.amountIn, "000000000000000000000000000000000000000042");
  assert.equal(toInput(long)!.amountIn, 42);
  // Token names keep their 12-character limit.
  assert.equal(fromHash("#a=ABCDEFGHIJKLMNOP")!.tokenIn, "ABCDEFGHIJKL");
});

test("suggested slippage is rounded down to three significant digits and stays safe", () => {
  assert.equal(floorSig3(0.034788), 0.0347);
  assert.equal(floorSig3(12.3456), 12.3);
  assert.equal(floorSig3(0), 0);
  assert.equal(plainDecimal(0.0347), "0.0347");
  assert.equal(plainDecimal(0.00000123), "0.00000123");
  assert.equal(plainDecimal(12.3), "12.3");
  const p = toInput(DEFAULT_FIELDS)!;
  const safe = safeSlippage(p);
  assert.equal(percentApprox(safe), "0.0348%");
  const suggested = floorSig3(safe * 100) / 100;
  assert.ok(!probe({ ...p, slippage: suggested }).exposed);
  // 0.032% is below the break-even: not exposed, and shown as typed.
  assert.ok(!probe({ ...p, slippage: 0.00032 }).exposed);
  assert.equal(percentExact(0.00032), "0.032%");
});
