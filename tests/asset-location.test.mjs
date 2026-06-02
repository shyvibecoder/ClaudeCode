import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { taxProfile, annualDragRate, locateAssets, rebalanceLocated, DEFAULT_TAX } from "../scripts/lib/asset-location.mjs";

const holds = [
  { ticker: "GEV", account: "ira", role: "Anchor — build-out", weight: 0.10 },                              // build-out: high growth, low yield, tactical
  { ticker: "PAVE", account: "taxable", role: "Anchor — reshoring", weight: 0.10 },                          // build-out: tax-efficient anchor
  { ticker: "FIW", account: "taxable", role: "Anchor — non-build-out de-correlator", weight: 0.05 },         // diversifier: dividend-heavy
  { ticker: "NEE", account: "ira", role: "Diversifier (2nd axis) — utilities", axis: "diversifier", weight: 0.03 },
];
const sleeveUsd = 1_500_000;

describe("asset-location: tax profile by axis/role", () => {
  it("diversifiers are dividend-heavy + low-growth; build-out is low-yield + higher-growth", () => {
    const div = taxProfile(holds[2]); // FIW
    const bld = taxProfile(holds[0]); // GEV
    assert.ok(div.yieldPct > bld.yieldPct, "diversifier yields more");
    assert.ok(bld.growth > div.growth, "build-out grows faster");
  });
  it("a tactical (IRA) name turns over more than a taxable anchor", () => {
    assert.ok(taxProfile(holds[0]).turnover > taxProfile(holds[1]).turnover);
  });
  it("annual drag rises with yield + turnover", () => {
    assert.ok(annualDragRate({ yieldPct: 0.03, turnover: 0.6 }) > annualDragRate({ yieldPct: 0.008, turnover: 0.1 }));
  });
});

describe("asset-location: 3-way placement (Roth ← growth, Traditional ← income, taxable ← efficient)", () => {
  const r = locateAssets(holds, { capacities: { roth: 200_000, traditional: 200_000, taxable: 1_100_000 }, sleeveUsd, horizonYears: 20 });
  it("uses the 3-way split when Roth AND Traditional balances are given", () => assert.equal(r.three_way, true));
  it("puts a highest-growth build-out name (at least partly) in Roth", () => {
    assert.ok(r.rows.some((x) => x.ticker === "GEV" && x.account === "roth"));
  });
  it("shelters a dividend-heavy diversifier out of taxable", () => {
    const fiw = r.rows.filter((x) => x.ticker === "FIW");
    assert.ok(fiw.length && fiw.every((x) => x.account !== "taxable"));
  });
  it("never exceeds any account's capacity (fractional fill)", () => {
    const cap = { roth: 200_000, traditional: 200_000, taxable: 1_100_000 };
    for (const a of Object.keys(cap)) {
      const used = r.rows.filter((x) => x.account === a).reduce((s, x) => s + x.value, 0);
      assert.ok(used <= cap[a] + 2, `${a} used ${used} > cap ${cap[a]}`);
    }
  });
  it("reports a positive annual + horizon tax drag avoided", () => {
    assert.ok(r.summary.annual_drag_avoided > 0);
    assert.ok(r.summary.horizon_drag_avoided > r.summary.annual_drag_avoided);
  });
  it("[B1] splits an oversized name across accounts instead of stranding tax-advantaged capacity", () => {
    const r2 = locateAssets([{ ticker: "BIG", account: "taxable", role: "build-out", weight: 1.0 }], { capacities: { roth: 30_000, traditional: 20_000, taxable: 10_000 }, sleeveUsd: 60_000 });
    const used = (a) => r2.rows.filter((x) => x.account === a).reduce((s, x) => s + x.value, 0);
    assert.ok(used("roth") <= 30_002 && used("traditional") <= 20_002 && used("taxable") <= 10_002, "no account over capacity");
    assert.ok(used("roth") > 0 && used("traditional") > 0, "tax-advantaged room used, not stranded");
    assert.ok(Math.abs(used("roth") + used("traditional") + used("taxable") - 60_000) < 3, "all cash deployed");
  });
});

describe("asset-location: 2-way fallback (no Roth/Traditional split yet)", () => {
  const r = locateAssets(holds, { capacities: { ira: 400_000, taxable: 1_100_000 }, sleeveUsd });
  it("falls back to a combined tax-advantaged bucket and flags it", () => {
    assert.equal(r.three_way, false);
    assert.match(r.summary.note, /Roth \+ Traditional/);
    assert.ok(r.rows.every((x) => x.account === "tax-advantaged" || x.account === "taxable"));
  });
  it("shelters the highest-drag name first", () => {
    assert.ok(r.rows.some((x) => x.ticker === "NEE" && x.account === "tax-advantaged")); // NEE: diversifier + tactical → highest drag
  });
});

describe("asset-location: tax-located REBALANCE (net held → buy + sell) [D2]", () => {
  const BLD = { ticker: "BLD", weight: 0.85, role: "build-out" };           // high growth, low yield
  const DIV = { ticker: "DIV", weight: 0.15, role: "non-build-out de-correlator" }; // low growth, high yield
  const cap = { roth: 100_000, traditional: 100_000, taxable: 100_000 };    // bookTotal 300k

  it("all-cash reduces to the deploy: all buys, no sells, sums to the book; growth→Roth, income→tax-advantaged", () => {
    const r = rebalanceLocated([BLD, DIV], { held: {}, capacities: cap });
    assert.equal(r.summary.sell_usd, 0);
    assert.equal(r.summary.needs_new_cash_usd, 0);
    assert.ok(Math.abs(r.summary.buy_usd - 300_000) < 5);
    assert.ok(r.rows.some((x) => x.ticker === "BLD" && x.account === "roth" && x.action === "buy"));     // growth → Roth
    assert.ok(r.rows.some((x) => x.ticker === "DIV" && x.account === "traditional" && x.action === "buy")); // income → Traditional
    assert.ok(!r.rows.some((x) => x.ticker === "DIV" && x.account === "taxable"));                        // dividends not stranded in taxable
  });
  it("an overweight tax-advantaged holding produces a TRIM (in-place, not blocked)", () => {
    const r = rebalanceLocated([{ ticker: "BLD", weight: 1.0 }], { held: { BLD: { traditional: 150_000 } }, capacities: { roth: 50_000, traditional: 50_000, taxable: 0 } }); // target 100k, held 150k
    const trim = r.rows.find((x) => x.ticker === "BLD" && x.action === "trim");
    assert.ok(trim && trim.account === "traditional" && Math.abs(trim.amount - 50_000) < 5);
    assert.ok(Math.abs(r.summary.sell_usd - 50_000) < 5);
  });
  it("a taxable overweight is BLOCKED (buy-and-hold anchor) unless its ticker is trim-OK", () => {
    const held = { BLD: { taxable: 150_000 } }, capacities = { roth: 60_000, traditional: 40_000, taxable: 0 }; // target 100k
    const blocked = rebalanceLocated([{ ticker: "BLD", weight: 1.0 }], { held, capacities });
    const row = blocked.rows.find((x) => x.ticker === "BLD" && x.account === "taxable");
    assert.ok(row.blocked && /anchor/.test(row.action));
    assert.equal(blocked.summary.sell_usd, 0);
    assert.ok(blocked.summary.blocked_usd > 0);
    const allowed = rebalanceLocated([{ ticker: "BLD", weight: 1.0 }], { held, capacities, taxableAnchorTrimOk: ["BLD"] });
    assert.ok(allowed.rows.some((x) => x.ticker === "BLD" && x.action === "trim" && !x.blocked));
  });
  it("an underweight name is BOUGHT and the buy is located into available room (no account over capacity)", () => {
    const r = rebalanceLocated([{ ticker: "BLD", weight: 0.5 }, { ticker: "DIV", weight: 0.5, role: "de-correlator" }],
      { held: { BLD: { taxable: 100_000 }, DIV: { taxable: 50_000 } }, capacities: { roth: 100_000, traditional: 100_000, taxable: 200_000 } });
    for (const a of ["roth", "traditional", "taxable"]) {
      const heldA = a === "taxable" ? 150_000 : 0;
      const boughtA = r.rows.filter((x) => x.account === a && x.action === "buy").reduce((s, x) => s + x.amount, 0);
      assert.ok(heldA + boughtA <= ({ roth: 100_000, traditional: 100_000, taxable: 200_000 })[a] + 5, `${a} over capacity`);
    }
    assert.ok(r.rows.some((x) => x.ticker === "BLD" && x.account === "roth" && x.action === "buy")); // new growth → Roth
  });
  it("a holding dropped from the plan is sold/exited", () => {
    const r = rebalanceLocated([{ ticker: "BLD", weight: 1.0 }], { held: { OLD: { roth: 50_000 } }, capacities: { roth: 100_000, traditional: 50_000, taxable: 0 } });
    assert.ok(r.rows.some((x) => x.ticker === "OLD" && /sell|not in plan/.test(x.action)));
  });
});
