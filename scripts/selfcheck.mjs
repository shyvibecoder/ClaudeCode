#!/usr/bin/env node
// CI gate (run after `node scripts/scan.mjs --offline`). Asserts:
//   1. All four web/data/*.json files match their schema.
//   2. signals.json is valid JSON with the expected shape.
//   3. Every tradeable portfolio ticker is present in signals.quotes and is
//      either resolved (numeric price) or errored explicitly (error string) —
//      i.e. nothing silently dropped.
// Exits non-zero with a readable report on any failure.

import { readFileSync } from "node:fs";
import { isTradeable } from "./lib/quotes.mjs";
import {
  validatePortfolio, validateScarcities, validateTriggers, validateSignals, validateSecurities,
} from "./lib/schema.mjs";
import { bsPrice, impliedVol } from "./lib/options.mjs";

const read = (p) => JSON.parse(readFileSync(new URL(`../web/data/${p}`, import.meta.url)));
const readOpt = (p) => { try { return read(p); } catch { return null; } };

let portfolio, scarcities, triggers, signals;
try {
  portfolio = read("portfolio.json");
  scarcities = read("scarcities.json");
  triggers = read("triggers.json");
  signals = read("signals.json");
} catch (e) {
  console.error(`selfcheck FAILED: could not read/parse a data file — ${e.message}`);
  process.exit(1);
}

const errors = [];
validatePortfolio(portfolio, errors);
validateScarcities(scarcities, errors);
validateTriggers(triggers, errors);
validateSignals(signals, errors);
const securities = readOpt("securities.json");
if (securities) validateSecurities(securities, errors);

// Every tradeable holding must appear in signals.quotes, resolved or errored.
let checked = 0;
for (const h of portfolio.holdings) {
  if (!isTradeable(h.ticker)) continue;
  checked++;
  const q = signals.quotes?.[h.ticker];
  if (q === undefined) {
    errors.push(`signals.json: portfolio ticker ${h.ticker} missing from quotes (neither resolved nor errored)`);
  } else if (q !== null && typeof q.price !== "number" && typeof q.error !== "string") {
    errors.push(`signals.json: portfolio ticker ${h.ticker} has no price and no error`);
  }
}

// Options math regression: put-call parity and IV round-trip.
{
  const C = bsPrice({ type: "call", S: 100, K: 105, T: 0.5, r: 0.04, sigma: 0.3 });
  const P = bsPrice({ type: "put", S: 100, K: 105, T: 0.5, r: 0.04, sigma: 0.3 });
  const parity = (C - P) - (100 - 105 * Math.exp(-0.04 * 0.5));
  if (Math.abs(parity) > 1e-4) errors.push(`options: put-call parity off by ${parity}`);
  const px = bsPrice({ type: "call", S: 50, K: 55, T: 0.75, r: 0.04, sigma: 0.35 });
  const iv = impliedVol({ type: "call", S: 50, K: 55, T: 0.75, r: 0.04, price: px });
  if (iv == null || Math.abs(iv - 0.35) > 1e-3) errors.push(`options: IV round-trip got ${iv}, expected ~0.35`);
}

if (errors.length) {
  console.error(`selfcheck FAILED (${errors.length} issue${errors.length > 1 ? "s" : ""}):\n  - ${errors.join("\n  - ")}`);
  process.exit(1);
}

console.log(`selfcheck OK: 4 data files valid; all ${checked} tradeable portfolio tickers resolved or errored; options math verified.`);
