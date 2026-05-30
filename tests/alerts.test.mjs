import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { newlyFired } from "../scripts/lib/alerts.mjs";

// Email/issue should fire only on a STATE CHANGE (newly fired), not every run while
// a condition persists — avoids alert spam.
describe("alerts: newly-fired detection", () => {
  it("reports a trigger that fired now but not last run", () => {
    const cur = { drawdown: { fired: true }, sleeve_cap: { fired: false } };
    const prev = { drawdown: { fired: false }, sleeve_cap: { fired: false } };
    assert.deepEqual(newlyFired(cur, prev), ["drawdown"]);
  });
  it("does NOT re-report a trigger that was already fired", () => {
    const cur = { drawdown: { fired: true } };
    const prev = { drawdown: { fired: true } };
    assert.deepEqual(newlyFired(cur, prev), []);
  });
  it("treats an absent previous state as not-fired (so it's newly fired)", () => {
    assert.deepEqual(newlyFired({ trim_rule: { fired: true } }, {}), ["trim_rule"]);
    assert.deepEqual(newlyFired({ trim_rule: { fired: true } }, undefined), ["trim_rule"]);
  });
  it("returns nothing when nothing is fired", () => {
    assert.deepEqual(newlyFired({ drawdown: { fired: false } }, { drawdown: { fired: false } }), []);
  });
});
