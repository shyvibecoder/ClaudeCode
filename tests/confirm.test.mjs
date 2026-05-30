import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { confirmFired } from "../scripts/lib/alerts.mjs";

// Two-consecutive-scans confirmation: an auto trigger only counts as FIRED when its
// raw condition is met now AND was met in the previous scan — kills single-scan
// false fires (a bad print, a one-day spike).
describe("alerts: two-scan confirmation", () => {
  it("fires only when the condition is met in BOTH scans", () => {
    assert.equal(confirmFired(true, true), true);
  });
  it("is pending (not fired) on the first scan the condition is met", () => {
    assert.equal(confirmFired(true, false), false);
    assert.equal(confirmFired(true, undefined), false);
  });
  it("is not fired when the condition is not met now", () => {
    assert.equal(confirmFired(false, true), false);
    assert.equal(confirmFired(false, false), false);
  });
});
