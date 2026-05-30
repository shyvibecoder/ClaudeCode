import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseProposal, sanitizeEdit, proposeScarcityEdits, ensembleConsensus } from "../scripts/lib/research.mjs";

describe("research: ensemble consensus across independent models", () => {
  it("returns the strict-majority priced_in and the agreement ratio", () => {
    const c = ensembleConsensus([{ priced_in: "crowded" }, { priced_in: "crowded" }, { priced_in: "high" }]);
    assert.equal(c.priced_in, "crowded"); assert.equal(c.agreement, +(2 / 3).toFixed(2)); assert.equal(c.n, 3);
  });
  it("returns no consensus on a split (no strict majority)", () => {
    assert.equal(ensembleConsensus([{ priced_in: "crowded" }, { priced_in: "high" }]).priced_in, null);
  });
  it("ignores invalid/missing values", () => {
    const c = ensembleConsensus([{ priced_in: "crowded" }, { priced_in: "ULTRA" }, null]);
    assert.equal(c.priced_in, "crowded"); assert.equal(c.n, 1);
  });
});

describe("research: ensemble GATE in proposeScarcityEdits (multi-model)", () => {
  const scarcities = [{ id: "copper", scarcity: "Copper", priced_in: "high", bind_window: "2030+", non_consensus: false, thesis: "..." }];
  const mk = (pi, conf) => async (p) => p.includes("Reconcile")
    ? `{"priced_in":"${pi}","confidence":${conf},"rationale":"r"}`
    : `{"priced_in":"${pi}","confidence":${conf},"rationale":"r"}`;
  it("surfaces a change when independent models agree, with confidence scaled by agreement", async () => {
    const analysts = [mk("crowded", 0.9), mk("crowded", 0.9), mk("high", 0.9)]; // 2/3 agree crowded
    const { proposals } = await proposeScarcityEdits({ scarcities, analysts, redteam: async () => "", minConfidence: 0.5 });
    assert.equal(proposals.length, 1);
    assert.equal(proposals[0].priced_in, "crowded");
    assert.ok(proposals[0].confidence < 0.9 && proposals[0].confidence > 0.5); // ×(2/3) ≈ 0.6
    assert.equal(proposals[0].ensemble.agreement, +(2 / 3).toFixed(2));
  });
  it("drops the proposal entirely when models split (no robust majority)", async () => {
    const analysts = [mk("crowded", 0.9), mk("low", 0.9)]; // 1-1 split
    const { proposals } = await proposeScarcityEdits({ scarcities, analysts, redteam: async () => "", minConfidence: 0.5 });
    assert.equal(proposals.length, 0);
  });
});
import { deepDivePrompt, RESEARCH_PROMPT_VERSION } from "../scripts/lib/research-prompts.mjs";

describe("research: prompt is calibrated on the MATCHING call type (alpha edge), not just tilts", () => {
  const sc = { hit_rate: 0.7, total: { n: 40 }, by_signal: { underperform: { n: 6, hits: 2 }, outperform: { n: 4, hits: 1 } } };
  it("injects the de-rating/inflecting accuracy when by_signal exists (the call it's actually making)", () => {
    const p = deepDivePrompt({ id: "x", scarcity: "X" }, {}, sc);
    // 3/10 = 30% on the matching priced-in→de-rating call type → prompt must cite THAT, humbly
    assert.match(p, /de-rating\/inflecting|relative call|alpha/i);
    assert.match(p, /30%/);
  });
  it("falls back to the tilt hit-rate when no relative calls have resolved yet", () => {
    const p = deepDivePrompt({ id: "x", scarcity: "X" }, {}, { hit_rate: 0.55, total: { n: 12 } });
    assert.match(p, /55%/);
  });
  it("keeps a modest prior with no track record at all", () => {
    assert.match(deepDivePrompt({ id: "x", scarcity: "X" }, {}, null), /modest|0\.6/i);
  });
  it("prompt version advanced past 1 (prompts improve over time)", () => {
    assert.ok(RESEARCH_PROMPT_VERSION >= 2);
  });
});

describe("research: parse + F9 ownership enforcement", () => {
  it("parses JSON embedded in model text", () => {
    assert.equal(parseProposal('sure: {"priced_in":"high","confidence":0.8} done').priced_in, "high");
    assert.equal(parseProposal("no json"), null);
  });
  it("sanitizeEdit DROPS non-owned fields (thesis/tickers) and validates enums", () => {
    const e = sanitizeEdit({ priced_in: "low" }, { priced_in: "crowded", bind_window: "now", thesis: "HACKED", tickers: ["EVIL"], confidence: 2 });
    assert.equal(e.priced_in, "crowded"); assert.equal(e.bind_window, "now");
    assert.ok(!("thesis" in e) && !("tickers" in e));
    assert.equal(e.confidence, 1); // clamped
  });
  it("rejects invalid enum values", () => {
    const e = sanitizeEdit({}, { priced_in: "ULTRA", bind_window: "2099", confidence: 0.9 });
    assert.ok(!("priced_in" in e) && !("bind_window" in e));
  });
});

describe("research: orchestration with injected LLMs (no network)", () => {
  const scarcities = [{ id: "copper", scarcity: "Copper", priced_in: "high", bind_window: "2030+", non_consensus: false, thesis: "..." }];
  it("proposes a change only when confident, and never beyond bot-owned fields", async () => {
    const analyst = async (p) => p.includes("Reconcile")
      ? '{"priced_in":"crowded","confidence":0.75,"rationale":"de-rating","thesis":"X"}'
      : '{"priced_in":"crowded","confidence":0.8,"rationale":"strong relative weakness","thesis":"X"}';
    const redteam = async () => "- maybe already priced";
    const { proposals, report } = await proposeScarcityEdits({ scarcities, analyst, redteam, minConfidence: 0.6 });
    assert.equal(proposals.length, 1);
    assert.equal(proposals[0].priced_in, "crowded");
    assert.ok(!("thesis" in proposals[0]));
    assert.match(report, /copper/);
  });
  it("drops low-confidence proposals", async () => {
    const analyst = async () => '{"priced_in":"crowded","confidence":0.3}';
    const { proposals } = await proposeScarcityEdits({ scarcities, analyst, redteam: async () => "", minConfidence: 0.6 });
    assert.equal(proposals.length, 0);
  });
});
