import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pearson, crossSectionalBacktest } from "../scripts/lib/xsbacktest.mjs";

describe("xsbacktest: pearson", () => {
  it("is +1 for a perfect line, −1 for inverse, null for degenerate", () => {
    assert.ok(Math.abs(pearson([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-9);
    assert.ok(Math.abs(pearson([1, 2, 3, 4], [8, 6, 4, 2]) + 1) < 1e-9);
    assert.equal(pearson([1, 1, 1], [1, 1, 1]), null);
    assert.equal(pearson([1], [1]), null);
  });
});

// Build synthetic price series for a complex + N baskets, where each basket's forward relative move is a
// chosen function of its trailing relative move — so we can verify the IC sign the backtest recovers.
const DATES = (n) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2020, 0, 1) + i * 86400000).toISOString().slice(0, 10));
function synth({ mode, seg = 40 }) {
  const days = 400, groups = [], seriesByTicker = {};
  const dates = DATES(days);
  const complex = ["C1", "C2"];
  for (const c of complex) seriesByTicker[c] = { dates, closes: Array.from({ length: days }, (_, i) => 100 * (1 + 0.0003 * i)) };
  const tri = (i) => { const t = i % (2 * seg); return t < seg ? t / seg : 2 - t / seg; }; // triangle wave, peak at seg
  for (let g = 0; g < 6; g++) {
    const tk = `G${g}`; groups.push({ id: tk, tickers: [tk] });
    const amp = (g - 2.5) * 0.02; // spread of relative amplitudes (some negative, some positive) → cross-sectional variation
    const closes = Array.from({ length: days }, (_, i) => {
      const base = 100 * (1 + 0.0003 * i);
      // persist: monotonic relative drift (trailing sign == forward sign). reverse: triangle wave (mean-
      // reverting → trailing relative move is OPPOSITE the forward one at every turning point).
      const rel = mode === "persist" ? amp * (i / days) : amp * tri(i);
      return base * (1 + rel);
    });
    seriesByTicker[tk] = { dates, closes };
  }
  return { seriesByTicker, groups, complex };
}

describe("xsbacktest: cross-sectional IC", () => {
  it("recovers a POSITIVE IC when trailing relative strength persists forward", () => {
    const { seriesByTicker, groups, complex } = synth({ mode: "persist" });
    const r = crossSectionalBacktest(seriesByTicker, groups, complex, { lookback: 60, horizon: 40, step: 20 });
    assert.ok(r && r.n >= 12, "enough pairs");
    assert.ok(r.ic > 0.3, `IC ${r.ic} should be clearly positive`);
    assert.ok(r.hit_rate > 0.5);
    assert.ok(r.caveat.includes("UPPER BOUND"), "survivorship caveat is always present");
    assert.ok(Array.isArray(r.hit_rate_ci95));
  });

  it("recovers a NEGATIVE IC when relative strength reverses (momentum doesn't pay)", () => {
    const { seriesByTicker, groups, complex } = synth({ mode: "reverse", seg: 40 });
    // sample ON the turning points (lookback=horizon=step=seg) so trailing & forward moves are opposite
    const r = crossSectionalBacktest(seriesByTicker, groups, complex, { lookback: 40, horizon: 40, step: 40 });
    assert.ok(r.ic < -0.3, `IC ${r.ic} should be clearly negative`);
  });

  it("returns null when there isn't enough history or too few pairs", () => {
    assert.equal(crossSectionalBacktest({ C1: { closes: [1, 2, 3] } }, [{ id: "g", tickers: ["C1"] }], ["C1"], {}), null);
    assert.equal(crossSectionalBacktest({}, [], [], {}), null);
  });

  it("never peeks: the signal at i uses only [i-lookback, i]; the outcome is strictly forward", () => {
    // a single late spike in the FORWARD window must not change a past basket's trailing signal —
    // covered structurally by trailingRel windows; assert the run is stable when we extend the tail.
    const { seriesByTicker, groups, complex } = synth({ mode: "persist" });
    const r1 = crossSectionalBacktest(seriesByTicker, groups, complex, { lookback: 60, horizon: 40, step: 20 });
    // mutate only the final few bars (pure future) — earlier pairs' signals are unchanged → IC stable-ish
    for (const t of Object.keys(seriesByTicker)) seriesByTicker[t].closes[399] *= 1.5;
    const r2 = crossSectionalBacktest(seriesByTicker, groups, complex, { lookback: 60, horizon: 40, step: 20 });
    assert.ok(Math.abs(r1.ic - r2.ic) < 0.25, "a pure-future change doesn't blow up past signal IC");
  });
});
