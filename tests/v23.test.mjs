import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { v23Signals, fcThrustLadder, termBackwardation, hyVelocityElevated, compositeStress, v23State, dislocationEntryWindow } from "../scripts/lib/v23.mjs";

// Build a synthetic QQQ close series with a controllable shape.
const ramp = (n, start, step) => Array.from({ length: n }, (_, i) => start + i * step);

describe("v23: signals from QQQ closes (faithful to the spec)", () => {
  it("steady uptrend → TREND true, CRASH_OFF false", () => {
    const s = v23Signals(ramp(260, 100, 0.5)); // rising, low vol, positive 252-ret
    assert.equal(s.trend, true); assert.equal(s.crash_off, false); assert.equal(s.thrust, true);
  });
  it("THRUST needs a RISING 20-DMA: a series that just turned up below the 200-DMA", () => {
    // flat-high, then a deep drop, then a sharp recent recovery: price < 200-DMA (the high bulk
    // keeps the average up) but price > a rising 20-DMA.
    const closes = [...Array(210).fill(100), ...Array(30).fill(70), ...ramp(10, 71, 1.2)];
    const s = v23Signals(closes);
    assert.equal(s.trend, false);        // still below 200-DMA
    assert.equal(s.thrust, true);        // rising 20-DMA reclaimed
  });
  it("returns null on too-short history", () => assert.equal(v23Signals(ramp(50, 100, 1)), null));
});

describe("v23: F+C Thrust ladder order (first match wins)", () => {
  it("CRASH_OFF beats TREND (defensive even if above 200-DMA)", () => {
    assert.equal(fcThrustLadder({ crash_off: true, trend: true, thrust: true }).instrument, "SGOV");
  });
  it("TREND → QLD; THRUST-only → QLD; nothing → SGOV", () => {
    assert.equal(fcThrustLadder({ crash_off: false, trend: true, thrust: false }).instrument, "QLD");
    assert.equal(fcThrustLadder({ crash_off: false, trend: false, thrust: true }).instrument, "QLD");
    assert.equal(fcThrustLadder({ crash_off: false, trend: false, thrust: false }).instrument, "SGOV");
  });
});

describe("v23: composite-stress overlay inputs", () => {
  it("term backwardation requires VIX/VIX3M ≥ 1.0 for 3 consecutive days", () => {
    assert.equal(termBackwardation([1.1, 1.1, 1.1], [1, 1, 1]), true);
    assert.equal(termBackwardation([1.1, 0.9, 1.1], [1, 1, 1]), false); // a sub-1 day breaks it
    assert.equal(termBackwardation([1.1], [1]), null);                  // not enough days
  });
  it("HY-velocity elevated = today in the top 5% of the trailing 252-day distribution", () => {
    // flat HYG for ~300 days (≥ win+lookback+1=273), then a sharp recent drop → today's 20-day
    // −log change is an extreme of the trailing distribution.
    const flat = Array(300).fill(100);
    const dropped = [...flat.slice(0, 299), 80];
    assert.equal(hyVelocityElevated(dropped), true);
    // past stress (an old drop) but a CALM recent window → today's velocity is NOT in the top 5%.
    const calmNow = [...Array(60).fill(100), ...ramp(20, 100, -1), ...Array(220).fill(80)];
    assert.equal(hyVelocityElevated(calmNow), false);
    assert.equal(hyVelocityElevated(ramp(50, 100, 0)), null); // insufficient history
  });
  it("composite is suppressed (null) if EITHER input is uncomputable", () => {
    assert.equal(compositeStress({ vixCloses: [1.1, 1.1, 1.1], vix3mCloses: [1, 1, 1], hygCloses: ramp(30, 100, 0) }), null);
  });
});

describe("v23: full state + exit-only overlay", () => {
  const up = ramp(260, 100, 0.5);
  it("uptrend, no stress → FULL / QLD", () => {
    const s = v23State(up, { compositeStress: false });
    assert.equal(s.state, "FULL"); assert.equal(s.instrument, "QLD"); assert.equal(s.overlay_applied, false);
  });
  it("overlay is EXIT-ONLY: stress forces QLD→SGOV, never the reverse", () => {
    const stressed = v23State(up, { compositeStress: true });
    assert.equal(stressed.instrument, "SGOV"); assert.equal(stressed.overlay_applied, true);
    // a cash ladder + stress stays cash (overlay can't add risk)
    const down = [...ramp(230, 200, -0.5), ...ramp(30, 85, -1)]; // below everything, falling
    assert.equal(v23State(down, { compositeStress: true }).instrument, "SGOV");
  });
  it("suppressed overlay (null) leaves the ladder decision untouched", () => {
    assert.equal(v23State(up, { compositeStress: null }).instrument, "QLD");
  });
  it("no series → UNAVAILABLE (refuses to guess)", () => assert.equal(v23State(null, {}).state, "UNAVAILABLE"));
});

describe("v23: dislocation entry window — when to act", () => {
  const FULL = { state: "FULL" }, DEF = { state: "DEFENSIVE" };
  it("OPEN when a dislocation is present AND timing turned (FULL / fast re-entry / drawdown trigger)", () => {
    assert.equal(dislocationEntryWindow({ v23: FULL, regime: {}, anyDislocation: true }).window, "open");
    assert.equal(dislocationEntryWindow({ v23: DEF, regime: { fast_reentry: true }, anyDislocation: true }).window, "open");
    assert.equal(dislocationEntryWindow({ v23: DEF, regime: {}, drawdownFired: true, anyDislocation: true }).window, "open");
  });
  it("WAIT when dislocated but still defensive (don't catch the knife)", () => {
    assert.equal(dislocationEntryWindow({ v23: DEF, regime: { fast_reentry: false }, drawdownFired: false, anyDislocation: true }).window, "wait");
  });
  it("NONE when nothing is dislocated", () => {
    assert.equal(dislocationEntryWindow({ v23: FULL, regime: {}, anyDislocation: false }).window, "none");
  });
});
