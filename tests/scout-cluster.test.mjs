import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clusterConstraintHits, DEFAULT_CONSTRAINT_PHRASES } from "../scripts/lib/scout.mjs";

// The constraint-shadow idea (SCOUT-DESIGN §engine 1): a binding constraint shows up FIRST as
// downstream filers complaining ("lead times extended", "unable to secure allocation"). We search
// each phrase, then CLUSTER which filers show cross-phrase supply stress. A filer griping under
// MANY distinct constraint phrases is a strong lead; one already explained by a known scarcity is
// not novel and is dropped. The clustering core is pure → fixture-tested without network.
const results = [
  { phrase: "lead times extended", hits: [
    { ticker: "AAA", company: "Alpha Inc", mentions: 3 },
    { ticker: "BBB", company: "Beta Corp", mentions: 1 },
    { ticker: "NVDA", company: "Nvidia", mentions: 1 },  // known (HBM etc.) → should drop
  ] },
  { phrase: "unable to secure allocation", hits: [
    { ticker: "AAA", company: "Alpha Inc", mentions: 2 },
    { ticker: "CCC", company: "Gamma Ltd", mentions: 4 },
  ] },
  { phrase: "qualified a second source", hits: [
    { ticker: "AAA", company: "Alpha Inc", mentions: 1 },
    { ticker: "CCC", company: "Gamma Ltd", mentions: 1 },
  ] },
];

describe("scout: clusterConstraintHits", () => {
  it("ranks filers by CROSS-PHRASE supply stress (breadth of distinct phrases, then intensity)", () => {
    const { candidates } = clusterConstraintHits(results, { knownTickers: ["NVDA"], minPhrases: 2 });
    // AAA appears under all 3 phrases → strongest lead; CCC under 2; both beat single-phrase filers.
    assert.equal(candidates[0].ticker, "AAA");
    assert.equal(candidates[0].phraseCount, 3);
    assert.deepEqual(candidates[0].phrases.sort(), ["lead times extended", "qualified a second source", "unable to secure allocation"]);
    assert.equal(candidates[1].ticker, "CCC");
    assert.equal(candidates[1].phraseCount, 2);
  });

  it("DROPS filers already explained by a known scarcity (novelty filter), reports the count", () => {
    const { candidates, droppedKnown } = clusterConstraintHits(results, { knownTickers: ["NVDA"], minPhrases: 1 });
    assert.ok(!candidates.some((c) => c.ticker === "NVDA"), "NVDA is known → must not be a candidate");
    assert.equal(droppedKnown, 1);
  });

  it("requires cross-phrase corroboration: a single-phrase filer is below the minPhrases bar", () => {
    const { candidates } = clusterConstraintHits(results, { knownTickers: [], minPhrases: 2 });
    // BBB appears under only ONE phrase → excluded at minPhrases=2 (weak, uncorroborated).
    assert.ok(!candidates.some((c) => c.ticker === "BBB"));
  });

  it("score rewards breadth over raw mentions (a broad-stress filer beats a one-phrase loudmouth)", () => {
    const r = [
      { phrase: "p1", hits: [{ ticker: "WIDE", company: "W", mentions: 1 }] },
      { phrase: "p2", hits: [{ ticker: "WIDE", company: "W", mentions: 1 }] },
      { phrase: "p1", hits: [{ ticker: "LOUD", company: "L", mentions: 50 }] }, // one phrase, huge count
    ];
    const { candidates } = clusterConstraintHits(r, { minPhrases: 1 });
    assert.equal(candidates[0].ticker, "WIDE", "2 distinct phrases should outrank 1 phrase even with far fewer mentions");
  });

  it("respects max and is deterministic (stable order for equal scores)", () => {
    const { candidates } = clusterConstraintHits(results, { minPhrases: 1, max: 2 });
    assert.equal(candidates.length, 2);
    const again = clusterConstraintHits(results, { minPhrases: 1, max: 2 }).candidates;
    assert.deepEqual(candidates.map((c) => c.ticker), again.map((c) => c.ticker));
  });

  it("handles empty / malformed input without throwing", () => {
    assert.deepEqual(clusterConstraintHits([], {}).candidates, []);
    assert.deepEqual(clusterConstraintHits(null, {}).candidates, []);
    assert.deepEqual(clusterConstraintHits([{ phrase: "x" }], {}).candidates, []); // no hits key
  });

  it("ships a non-empty default constraint-phrase seed list (placeholder until LLM-generated+vetted per D1)", () => {
    assert.ok(Array.isArray(DEFAULT_CONSTRAINT_PHRASES));
    assert.ok(DEFAULT_CONSTRAINT_PHRASES.length >= 8);
    assert.ok(DEFAULT_CONSTRAINT_PHRASES.every((p) => typeof p === "string" && p.length > 4));
  });
});
