import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { triangulate } from "../scripts/lib/research.mjs";
import { seatPrompt } from "../scripts/lib/research-prompts.mjs";

// A scarcity currently rated "crowded"/"high" (consensus loves it) whose TAPE is de-rating is the
// classic fundamentals-vs-price divergence — the most interesting setup.
const bundle = (over = {}) => ({
  id: "copper", scarcity: "Copper", priced_in: "high",
  signals: { de_rating: null, rs: null, opportunity: null, forced_flow: null },
  news: [], filings: [], quotes: {},
  evidence_count: { news: 0, news_with_excerpt: 0, filings: 0, filing_passages: 0 },
  ...over,
});

describe("research-triangulate: typed evidence lanes", () => {
  it("reports which lanes carry data", () => {
    const t = triangulate(bundle({
      filings: [{ passages: ["x"] }], news: [{ excerpt: "y" }],
      quotes: { FCX: { ytd: 0.1, vs200: 0.05, mom_1m: 0.02 } },
      evidence_count: { news: 1, news_with_excerpt: 1, filings: 1, filing_passages: 1 },
    }));
    assert.equal(t.lanes.filings, 1);
    assert.equal(t.lanes.news, 1);
    assert.equal(t.lanes.tape, true);
    assert.equal(t.lanes.positioning, false);
  });

  it("flags THIN evidence when no lane has substance", () => {
    const t = triangulate(bundle());
    assert.equal(t.divergence, "thin-evidence");
  });

  it("derives a WEAK tape lean from a de-rating flag + negative momentum", () => {
    const t = triangulate(bundle({
      signals: { de_rating: "de-rating", rs: -0.1, opportunity: 60, forced_flow: null },
      quotes: { FCX: { ytd: -0.2, vs200: -0.1, mom_1m: -0.05 } },
      filings: [{ passages: ["backlog strong"] }],
      evidence_count: { filings: 1, filing_passages: 1, news: 0, news_with_excerpt: 0 },
    }));
    assert.equal(t.tape.lean, "weak");
  });

  it("flags FUNDAMENTALS-VS-PRICE divergence when a high/crowded thesis is de-rating on the tape", () => {
    const t = triangulate(bundle({
      priced_in: "crowded",
      signals: { de_rating: "de-rating", rs: -0.12, opportunity: 60, forced_flow: null },
      quotes: { FCX: { ytd: -0.25, vs200: -0.12, mom_1m: -0.06 } },
      filings: [{ passages: ["record backlog"] }],
      evidence_count: { filings: 1, filing_passages: 1, news: 0, news_with_excerpt: 0 },
    }));
    assert.equal(t.divergence, "fundamentals-vs-price");
    assert.match(t.note, /de-rat|price|tape/i);
  });

  it("no divergence when tape and a strong-priced thesis agree (both firm)", () => {
    const t = triangulate(bundle({
      priced_in: "high",
      signals: { de_rating: null, rs: 0.05, opportunity: 30, forced_flow: null },
      quotes: { FCX: { ytd: 0.3, vs200: 0.1, mom_1m: 0.04 } },
      filings: [{ passages: ["x"] }], evidence_count: { filings: 1, filing_passages: 1, news: 0, news_with_excerpt: 0 },
    }));
    assert.equal(t.divergence, null);
  });

  it("is safe on a missing/empty bundle", () => {
    assert.equal(triangulate(null).divergence, "thin-evidence");
    assert.equal(triangulate({}).lanes.tape, false);
  });
});

describe("research-triangulate: seatPrompt surfaces the triangulation note", () => {
  it("injects the divergence note so seats weight independent corroboration", () => {
    const ev = bundle({
      priced_in: "crowded",
      signals: { de_rating: "de-rating", rs: -0.1, opportunity: 60, forced_flow: null },
      quotes: { FCX: { ytd: -0.2, vs200: -0.1, mom_1m: -0.05 } },
      filings: [{ passages: ["record backlog"] }],
      evidence_count: { filings: 1, filing_passages: 1, news: 0, news_with_excerpt: 0 },
    });
    const p = seatPrompt("bear", ev, ev, null);
    assert.match(p, /TRIANGULATION|divergence|fundamentals-vs-price/i);
  });
});
