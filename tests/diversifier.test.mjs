import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { screenCandidate, screenDiversifiers, DIVERSIFIER_UNIVERSE } from "../scripts/lib/diversifier.mjs";

// Synthetic factor world (deterministic — no RNG): a market factor and an independent "AI-capex" factor.
// The complex (QQQ) loads on BOTH; a HEDGE basket loads low on market and NEGATIVE on the AI factor (so
// it passes the gate); a PROXY basket loads POSITIVE on the AI factor (so it fails — it amplifies the
// build-out). This lets us assert the screen's gate + ranking + book-awareness without network.
const N = 300;
const dates = (() => { const out = []; let d = Date.UTC(2015, 0, 2); for (let i = 0; i < N; i++) { out.push(new Date(d).toISOString().slice(0, 10)); d += 86400000; } return out; })();
const closesFrom = (retFn) => { const c = [100]; for (let i = 1; i < N; i++) c.push(c[i - 1] * (1 + retFn(i))); return c; };
const mkt = (i) => 0.0005 + 0.02 * Math.sin(i / 5);
const ai = (i) => 0.018 * Math.sin(i / 7 + 1);
const S = {
  SPY: { dates, closes: closesFrom(mkt) },
  QQQ: { dates, closes: closesFrom((i) => mkt(i) + ai(i)) },
  H1: { dates, closes: closesFrom((i) => 0.4 * mkt(i) - 0.3 * ai(i) + 0.0008) },
  H2: { dates, closes: closesFrom((i) => 0.4 * mkt(i) - 0.3 * ai(i) + 0.0006) },
  P1: { dates, closes: closesFrom((i) => 1.0 * mkt(i) + 0.6 * ai(i)) },
};
const cand = (id, tickers) => ({ id, sector: "X", scarcity: id, tickers });

describe("diversifier: the gate decides admission (negative AI-capex loading = a real hedge)", () => {
  it("ADMITS a hedge basket (low market beta, negative aiβ)", () => {
    const r = screenCandidate(S, cand("hedge", ["H1", "H2"]), ["SPY"], ["QQQ"]);
    assert.equal(r.gate.pass, true);
    assert.ok(r.aiBeta < 0.3, `aiβ ${r.aiBeta} should be < 0.3`);
    assert.ok(r.marketBeta <= 0.95);
    assert.equal(r.qualifies, true);
  });
  it("REJECTS a secret AI proxy (positive aiβ amplifies the build-out it should hedge)", () => {
    const r = screenCandidate(S, cand("proxy", ["P1"]), ["SPY"], ["QQQ"]);
    assert.equal(r.gate.pass, false);
    assert.equal(r.qualifies, false);
    assert.match(r.reason, /amplifies/);
  });
  it("exposes marketBeta as canonical with mktBeta as an equal display alias", () => {
    const r = screenCandidate(S, cand("hedge", ["H1", "H2"]), ["SPY"], ["QQQ"]);
    assert.equal(r.marketBeta, r.mktBeta);
  });
});

describe("diversifier: ranking puts qualifiers first", () => {
  it("a gate-passing hedge ranks above a gate-failing proxy", () => {
    const ranked = screenDiversifiers(S, [cand("proxy", ["P1"]), cand("hedge", ["H1", "H2"])], ["SPY"], ["QQQ"]);
    assert.equal(ranked[0].id, "hedge");
    assert.equal(ranked[ranked.length - 1].id, "proxy");
  });
});

describe("diversifier: BOOK-AWARENESS (incremental drawdown vs the plan)", () => {
  it("ddReduction is null with no plan, finite with a plan", () => {
    assert.equal(screenCandidate(S, cand("hedge", ["H1", "H2"]), ["SPY"], ["QQQ"]).ddReduction, null);
    const wp = screenCandidate(S, cand("hedge", ["H1", "H2"]), ["SPY"], ["QQQ"], { planTickers: ["P1"] });
    assert.equal(typeof wp.ddReduction, "number");
  });
  it("flags exact-ticker overlap with the plan and yields zero incremental drawdown reduction", () => {
    const dup = screenCandidate(S, cand("dup", ["H1"]), ["SPY"], ["QQQ"], { planTickers: ["H1"] });
    assert.deepEqual(dup.heldOverlap, ["H1"]);
    assert.equal(dup.ddReduction, 0);                 // blending a holding with itself can't lower drawdown
    assert.match(dup.reason, /overlaps planned holdings/);
  });
});

describe("diversifier: universe", () => {
  it("ships a non-empty candidate universe with tickers", () => {
    assert.ok(DIVERSIFIER_UNIVERSE.length >= 2);
    assert.ok(DIVERSIFIER_UNIVERSE.every((c) => c.id && Array.isArray(c.tickers) && c.tickers.length));
  });
});
