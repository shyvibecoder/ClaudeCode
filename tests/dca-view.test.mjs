import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dcaProgress } from "../scripts/lib/dca-view.mjs";

const plan = { holdings: { MU: { tier: "B", target_usd: 90000 }, GEV: { tier: "B", target_usd: 60000 } } };

describe("dca-view: planned vs deployed", () => {
  it("computes deployed $ and % of target from positions (shares × cost basis)", () => {
    const p = dcaProgress(plan, { MU: { shares: 500, cost_basis: 90 } }); // 45,000 = 50% of 90k
    const mu = p.find((x) => x.ticker === "MU");
    assert.equal(mu.deployed, 45000);
    assert.equal(mu.pct, 50);
  });
  it("treats a holding with no position as 0% deployed", () => {
    const gev = dcaProgress(plan, { MU: { shares: 500, cost_basis: 90 } }).find((x) => x.ticker === "GEV");
    assert.equal(gev.deployed, 0);
    assert.equal(gev.pct, 0);
  });
  it("caps deployed at 100% of target", () => {
    const mu = dcaProgress(plan, { MU: { shares: 2000, cost_basis: 90 } }).find((x) => x.ticker === "MU");
    assert.equal(mu.pct, 100);
  });
  it("is safe with empty/absent inputs", () => {
    assert.deepEqual(dcaProgress(null, null), []);
    assert.deepEqual(dcaProgress({ holdings: {} }, {}), []);
  });
});
