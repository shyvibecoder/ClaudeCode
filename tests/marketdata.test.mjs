import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { corroborate, num, isTradeable } from "../scripts/lib/marketdata.mjs";

describe("marketdata: plausibility guard (num)", () => {
  it("accepts positive finite numbers", () => assert.equal(num("123.45"), 123.45));
  it("rejects zero, negative, NaN, non-finite", () => {
    for (const bad of [0, -5, "abc", Infinity, null, undefined]) assert.equal(num(bad), null);
  });
});

describe("marketdata: cross-source corroboration", () => {
  it("is ok when sources agree within 3%", () => {
    const c = corroborate({ yahoo: 100, stooq: 101.5 });
    assert.equal(c.ok, true);
    assert.equal(c.n, 2);
  });
  it("flags when a source diverges >3% (synthetic/bad print)", () => {
    const c = corroborate({ yahoo: 100, stooq: 101.5, finnhub: 130 });
    assert.equal(c.ok, false);
    assert.ok(c.spread > 0.03);
  });
  it("ok=null with a single source (cannot corroborate)", () => {
    assert.equal(corroborate({ yahoo: 100 }).ok, null);
  });
  it("computes a TRUE median for even counts (red-team C1)", () => {
    assert.equal(corroborate({ a: 100, b: 130 }).median, 115);
  });
  it("excludes a lone outlier from the consensus `used` price (red-team C2)", () => {
    const c = corroborate({ yahoo: 500, stooq: 100, finnhub: 101 });
    assert.equal(c.median, 101);   // true median, not 500 or the lower-middle
    assert.equal(c.ok, false);     // still flagged as divergent
    assert.equal(c.used, 100.5);   // outlier 500 excluded → mean of {100,101}
  });
  it("drops implausible prices before computing", () => {
    const c = corroborate({ yahoo: 100, bad: -1 });
    assert.deepEqual(c.sources, ["yahoo"]);
  });
});

describe("marketdata: isTradeable", () => {
  it("treats real tickers as tradeable and placeholders/cash as not", () => {
    assert.equal(isTradeable("GEV"), true);
    assert.equal(isTradeable("CASH-MMF"), false);
    assert.equal(isTradeable("(private: SpaceX)"), false);
  });
});

import { integrityFlags } from "../scripts/lib/marketdata.mjs";
// Audit P1/P3: a single-source quote (corroboration.ok === null) was passing with NO flag — invisible
// to data_quality and the trigger path. And a Stooq-only quote (asof null) could never be flagged stale.
describe("marketdata: integrityFlags (single-source + freshness)", () => {
  it("flags a single-source (uncorroborated) quote", () => {
    const f = integrityFlags({ ok: null, sources: ["yahoo"] }, "2026-06-01T00:00:00Z", { now: Date.parse("2026-06-01T12:00:00Z") });
    assert.ok(f.some((x) => /single-source/.test(x)));
  });
  it("does NOT flag single-source when corroborated (ok true/false)", () => {
    assert.ok(!integrityFlags({ ok: true, sources: ["yahoo", "stooq"] }, "2026-06-01T00:00:00Z", { now: Date.parse("2026-06-01T01:00:00Z") }).some((x) => /single-source/.test(x)));
  });
  it("flags freshness-unknown when there is no dated bar (Stooq-only)", () => {
    assert.ok(integrityFlags({ ok: null, sources: ["stooq"] }, null).some((x) => /freshness unknown/.test(x)));
  });
  it("flags a stale last bar when asof is older than the window", () => {
    const f = integrityFlags({ ok: true, sources: ["yahoo", "stooq"] }, "2026-05-01T00:00:00Z", { now: Date.parse("2026-06-01T00:00:00Z") });
    assert.ok(f.some((x) => /stale last bar/.test(x)));
  });
  it("clean (corroborated + fresh) → no flags", () => {
    assert.deepEqual(integrityFlags({ ok: true, sources: ["yahoo", "stooq"] }, "2026-06-01T00:00:00Z", { now: Date.parse("2026-06-01T02:00:00Z") }), []);
  });
});

import { dataQualityGate } from "../scripts/lib/marketdata.mjs";
// Audit P3: `degraded` must trip on BAD DATA (divergence/anomaly) or a CORROBORATION-COVERAGE COLLAPSE
// (e.g. Stooq fully down → everything single-source), but NOT on a few legitimately-foreign single-source
// tickers — else it would constantly hold triggers.
const q = (o) => o;
describe("marketdata: dataQualityGate", () => {
  it("clean corroborated universe → not degraded", () => {
    const g = dataQualityGate({ A: q({ corroboration: { ok: true } }), B: q({ corroboration: { ok: true } }) });
    assert.equal(g.degraded, false);
  });
  it("a few foreign single-source tickers (majority corroborated) → NOT degraded", () => {
    const quotes = {};
    for (let i = 0; i < 8; i++) quotes["C" + i] = q({ corroboration: { ok: true } });
    for (let i = 0; i < 2; i++) quotes["S" + i] = q({ corroboration: { ok: null, sources: ["yahoo"] }, flags: ["single-source (yahoo) — uncorroborated"] });
    const g = dataQualityGate(quotes);
    assert.equal(g.degraded, false);
    assert.equal(g.uncorroborated, 2);
  });
  it("corroboration COLLAPSE (most single-source, e.g. Stooq down) → degraded", () => {
    const quotes = {};
    for (let i = 0; i < 8; i++) quotes["S" + i] = q({ corroboration: { ok: null, sources: ["yahoo"] }, flags: ["single-source"] });
    for (let i = 0; i < 2; i++) quotes["C" + i] = q({ corroboration: { ok: true } });
    assert.equal(dataQualityGate(quotes).degraded, true);
  });
  it("high BAD-DATA (divergence) rate → degraded", () => {
    const quotes = {};
    for (let i = 0; i < 6; i++) quotes["B" + i] = q({ corroboration: { ok: false }, flags: ["source divergence 12%"] });
    for (let i = 0; i < 4; i++) quotes["C" + i] = q({ corroboration: { ok: true } });
    assert.equal(dataQualityGate(quotes).degraded, true);
  });
  it("offline is always degraded", () => {
    assert.equal(dataQualityGate({ A: q({ corroboration: { ok: true } }) }, { offline: true }).degraded, true);
  });
});

import { plausibleNextBar } from "../scripts/lib/marketdata.mjs";
// Audit P2: V2.3 macro-brake bars (^VIX/QQQ) were single-Yahoo-fetched with no anomaly check — a glitch
// print could flip the regime. plausibleNextBar rejects a clear data glitch (a >5x / <0.2x move vs the
// prior close) without rejecting legitimately-volatile moves (VIX can move 30%+ in a day, which passes).
describe("marketdata: plausibleNextBar (V2.3 glitch guard)", () => {
  it("accepts a normal move (incl a sharp but real VIX spike)", () => {
    assert.equal(plausibleNextBar(20, 18), true);
    assert.equal(plausibleNextBar(26, 18), true);   // +44% VIX day — real, accepted
  });
  it("rejects a clear glitch (>5x or <0.2x)", () => {
    assert.equal(plausibleNextBar(900, 20), false); // 45x
    assert.equal(plausibleNextBar(2, 20), false);   // 0.1x
  });
  it("accepts when there is no prior close (first bar) or prior is invalid", () => {
    assert.equal(plausibleNextBar(20, null), true);
    assert.equal(plausibleNextBar(20, 0), true);
  });
  it("rejects a non-finite/≤0 price", () => {
    assert.equal(plausibleNextBar(0, 20), false);
    assert.equal(plausibleNextBar(NaN, 20), false);
  });
});
