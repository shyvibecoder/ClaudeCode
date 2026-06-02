import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { basketReturns, axisCorrelation, basketStats, buildoutLoading, blendIndex } from "../scripts/lib/axis.mjs";

const DATES = (n) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2020, 0, 1) + i * 86400000).toISOString().slice(0, 10));

// Build a complex factor and three candidate baskets: one that tracks the complex (high corr), one
// independent (low corr), one independent + low amplitude (low beta). Verify the gate's verdicts.
function world() {
  const n = 300, dates = DATES(n), s = {};
  const rng = (seed) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5);
  const fComplex = Array.from({ length: n }, rng(1)).map((v) => v * 0.02);
  const fOther = Array.from({ length: n }, rng(2)).map((v) => v * 0.02);
  const px = (rets) => { const p = [100]; for (const r of rets) p.push(p[p.length - 1] * (1 + r)); return p; };
  // complex members ~ fComplex; tracker ~ fComplex; independent ~ fOther; defensive ~ 0.2*fOther
  s.CX1 = { dates, closes: px(fComplex.map((r, i) => r + 0.001 * (rng(3)() ))) };
  s.CX2 = { dates, closes: px(fComplex.map((r) => r * 1.1)) };
  s.TRK = { dates, closes: px(fComplex.map((r) => 1.0 * r)) };            // tracks the complex
  s.IND = { dates, closes: px(fOther.map((r) => 1.0 * r)) };             // independent driver
  s.DEF = { dates, closes: px(fOther.map((r) => 0.2 * r)) };             // independent + low beta
  return s;
}

describe("axis: basketReturns", () => {
  it("equal-weights member daily returns over common dates", () => {
    const dates = DATES(40);
    const aCloses = [100, 110, ...Array(38).fill(110)]; // +10% on day 1, flat after
    const bCloses = Array(40).fill(100);                 // flat
    const s = { A: { dates, closes: aCloses }, B: { dates, closes: bCloses } };
    const { rets } = basketReturns(s, ["A", "B"]);
    assert.equal(rets.length, 39);
    assert.ok(Math.abs(rets[0] - 0.05) < 1e-9); // (+10% + 0%)/2
    assert.ok(Math.abs(rets[1]) < 1e-9);        // both flat after
  });
});

describe("axis: basketStats (returns + risk + explicit window)", () => {
  it("reports CAGR, maxDD and the window for a steadily-growing basket", () => {
    const dates = DATES(253);
    const grow = [100]; for (let i = 1; i < 253; i++) grow.push(grow[i - 1] * Math.pow(2, 1 / 252)); // doubles in 1yr
    const s = { A: { dates, closes: grow } };
    const r = basketStats(s, ["A"]);
    assert.ok(r && r.years >= 0.9 && r.years <= 1.1, `years ${r?.years}`);
    assert.ok(Math.abs(r.cagr - 1.0) < 0.05, `cagr ${r.cagr} ~ 100%`);
    assert.ok(r.maxDD <= 0.001, `monotone series has ~no drawdown, got ${r.maxDD}`);
    assert.equal(r.start, dates[0]);
  });
  it("returns null on thin history", () => {
    const dates = DATES(20);
    assert.equal(basketStats({ A: { dates, closes: dates.map(() => 100) } }, ["A"]), null);
  });
});

describe("axis: blendIndex (combined sleeve = equal weight across axes)", () => {
  it("weights each axis equally regardless of name count, and blends to lower variance", () => {
    const dates = DATES(120);
    // Axis A (one name) swings up; Axis B (two names) swings down — blend should be flatter than either.
    const up = [100]; for (let i = 1; i < 120; i++) up.push(up[i - 1] * (1 + (i % 2 ? 0.02 : -0.01)));
    const dn = [100]; for (let i = 1; i < 120; i++) dn.push(dn[i - 1] * (1 + (i % 2 ? -0.02 : 0.01)));
    const s = { A1: { dates, closes: up }, B1: { dates, closes: dn }, B2: { dates, closes: dn } };
    const blended = blendIndex(s, [["A1"], ["B1", "B2"]]);
    assert.equal(blended.closes.length, 120);
    assert.ok(Math.abs(blended.closes[0] - 100) < 1e-9, "rebased to 100");
    // Each axis is 50%: with A up ~ -B down symmetric, blend stays near 100 (axes offset), proving 50/50.
    const drift = Math.abs(blended.closes[blended.closes.length - 1] - 100);
    assert.ok(drift < 25, `blend should be damped vs components, drift ${drift}`);
  });
  it("returns empty when fewer than two axes have data", () => {
    const dates = DATES(80);
    assert.equal(blendIndex({ A: { dates, closes: dates.map(() => 100) } }, [["A"], ["MISSING"]]).closes.length, 0);
  });
});

describe("axis: 2-factor deep-tech build-out loading (the forward-looking gate)", () => {
  // market factor + an independent deep-tech build-out-specific factor. complex = market + aiComp (loads on both).
  // A high-market-beta basket with NO ai-specific exposure must PASS; a basket that loads on aiComp FAILS,
  // even if both have similar raw correlation to the complex.
  const n = 400, dates = DATES(n);
  const rng = (seed) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5);
  const mkt = Array.from({ length: n }, rng(7)).map((v) => v * 0.02);
  const aiComp = Array.from({ length: n }, rng(8)).map((v) => v * 0.02);
  const noise = (seed) => Array.from({ length: n }, rng(seed)).map((v) => v * 0.01);
  const px = (rets) => { const p = [100]; for (const r of rets) p.push(p[p.length - 1] * (1 + r)); return p; };
  const s = {
    SPY: { dates, closes: px(mkt) },
    CPX: { dates, closes: px(mkt.map((m, i) => m + aiComp[i])) },          // complex = market + AI-specific
    MKTONLY: { dates, closes: px(mkt.map((m, i) => 0.9 * m + noise(9)[i])) }, // high market beta, no AI loading
    AIPLAY: { dates, closes: px(mkt.map((m, i) => 0.5 * m + 0.9 * aiComp[i])) }, // genuine deep-tech build-out loading
  };
  it("PASSES a high-market-beta basket with ~zero residual deep-tech build-out loading", () => {
    const r = buildoutLoading(s, ["MKTONLY"], ["SPY"], ["CPX"], { buildoutBetaMax: 0.3 });
    assert.ok(r && Math.abs(r.buildoutBeta) < 0.3, `buildoutBeta ${r?.buildoutBeta} should be ~0`);
    assert.ok(r.marketBeta > 0.5, `should still show real market beta, got ${r.marketBeta}`);
    assert.equal(r.qualifies, true);
  });
  it("FAILS a basket that loads on the deep-tech build-out factor after market beta", () => {
    const r = buildoutLoading(s, ["AIPLAY"], ["SPY"], ["CPX"], { buildoutBetaMax: 0.3 });
    assert.ok(Math.abs(r.buildoutBeta) > 0.5, `buildoutBeta ${r.buildoutBeta} should be high`);
    assert.equal(r.qualifies, false);
  });
  it("PASSES a basket with NEGATIVE deep-tech build-out loading (a hedge, not a risk)", () => {
    // candidate = market MINUS the AI-specific factor → negative buildoutBeta; must qualify (one-sided gate).
    const sh = { ...s, HEDGE: { dates, closes: px(mkt.map((m, i) => 0.6 * m - 0.6 * aiComp[i])) } };
    const r = buildoutLoading(sh, ["HEDGE"], ["SPY"], ["CPX"], { buildoutBetaMax: 0.3 });
    assert.ok(r.buildoutBeta < -0.3, `buildoutBeta ${r.buildoutBeta} should be clearly negative`);
    assert.equal(r.qualifies, true);
  });
  it("returns null on thin overlap", () => {
    const d = DATES(20);
    assert.equal(buildoutLoading({ A: { dates: d, closes: d.map(() => 100) } }, ["A"], ["A"], ["A"]), null);
  });
});

describe("axis: correlation gate (the G2 / scout-gate verdict)", () => {
  const s = world();
  it("REJECTS a basket that tracks the deep-tech build-out complex (high corr → not breadth)", () => {
    const r = axisCorrelation(s, ["TRK"], ["CX1", "CX2"], { corrMax: 0.5, betaMax: 0.7 });
    assert.ok(r && Math.abs(r.corr) > 0.7, `corr ${r.corr} should be high`);
    assert.equal(r.qualifies, false);
    assert.ok(/REJECT/.test(r.note));
  });
  it("QUALIFIES an independently-driven basket (low corr → real breadth)", () => {
    const r = axisCorrelation(s, ["IND"], ["CX1", "CX2"], { corrMax: 0.5, betaMax: 0.7 });
    assert.ok(Math.abs(r.corr) < 0.5, `corr ${r.corr} should be low`);
    assert.equal(r.qualifies, true);
  });
  it("QUALIFIES a defensive low-beta independent basket (best objective fit)", () => {
    const r = axisCorrelation(s, ["DEF"], ["CX1", "CX2"], { corrMax: 0.5, betaMax: 0.7 });
    assert.ok(Math.abs(r.beta) < 0.7 && r.qualifies);
  });
  it("returns null on thin overlap", () => {
    const dates = DATES(20);
    assert.equal(axisCorrelation({ A: { dates, closes: dates.map(() => 100) }, B: { dates, closes: dates.map(() => 100) } }, ["A"], ["B"]), null);
  });
});
