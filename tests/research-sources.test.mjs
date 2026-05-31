import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  thesisQueries, extractExcerpt, dedupeByDomain, extractPassages, buildEvidenceBundle,
} from "../scripts/lib/research-sources.mjs";

describe("research-sources: multi-angle query generation per thesis", () => {
  const s = { id: "copper", scarcity: "Copper supply", thesis: "Grid copper demand outruns mine supply", news_query: "copper grid demand", tickers: ["FCX", "TECK"] };
  it("emits several distinct angle queries (supply/demand/capex/policy), seeded by the thesis", () => {
    const qs = thesisQueries(s);
    assert.ok(qs.length >= 4, `expected >=4 angles, got ${qs.length}`);
    assert.equal(new Set(qs).size, qs.length); // all distinct
    assert.ok(qs.some((q) => /shortage|supply|deficit/i.test(q)));
    assert.ok(qs.some((q) => /capacity|capex|expansion|investment/i.test(q)));
    assert.ok(qs.every((q) => /copper/i.test(q))); // all anchored to the subject
  });
  it("falls back to the scarcity label when news_query is absent", () => {
    const qs = thesisQueries({ id: "x", scarcity: "Gallium export controls" });
    assert.ok(qs.length >= 4);
    assert.ok(qs.every((q) => /gallium/i.test(q)));
  });
});

describe("research-sources: HTML → clean excerpt", () => {
  it("strips tags/scripts/styles and collapses whitespace to a capped excerpt", () => {
    const html = `<html><head><style>.a{color:red}</style><script>evil()</script></head>
      <body><h1>Copper Deficit</h1><p>Mine   supply   is\n\n tightening sharply.</p></body></html>`;
    const ex = extractExcerpt(html, { maxChars: 80 });
    assert.ok(!/[<>]/.test(ex)); // no tags
    assert.ok(!/evil|color:red/.test(ex)); // script/style gone
    assert.match(ex, /Copper Deficit Mine supply is tightening/);
    assert.ok(ex.length <= 80);
  });
  it("is safe on empty/garbage", () => {
    assert.equal(extractExcerpt("", {}), "");
    assert.equal(extractExcerpt(null, {}), "");
  });
});

describe("research-sources: dedupe by domain (source diversity)", () => {
  it("keeps at most N items per domain, preserving order", () => {
    const items = [
      { title: "a", link: "https://x.com/1" }, { title: "b", link: "https://x.com/2" },
      { title: "c", link: "https://x.com/3" }, { title: "d", link: "https://y.com/1" },
    ];
    const out = dedupeByDomain(items, { perDomain: 2 });
    assert.equal(out.length, 3); // 2 from x.com + 1 from y.com
    assert.deepEqual(out.map((i) => i.title), ["a", "b", "d"]);
  });
  it("treats missing/garbage links as their own bucket, never throws", () => {
    const out = dedupeByDomain([{ title: "a" }, { title: "b", link: "not a url" }], { perDomain: 1 });
    assert.equal(out.length, 2);
  });
});

describe("research-sources: extract relevant passages from filing text (keyword-anchored)", () => {
  const text = "Item 1A. Risk Factors. " + "padding ".repeat(40) +
    "Our gallium supply depends on a single foreign source and could be disrupted by export controls. " +
    "more ".repeat(40) + "Unrelated boilerplate about stock plans.";
  it("returns a window of context around each keyword hit", () => {
    const ps = extractPassages(text, ["gallium", "export controls"], { window: 60, max: 3 });
    assert.ok(ps.length >= 1);
    assert.ok(ps.some((p) => /gallium supply depends/i.test(p)));
    // bounded: each passage is far smaller than the full text (we extract windows, not the doc)
    assert.ok(ps.every((p) => p.length < text.length));
  });
  it("merges overlapping hits and caps the count", () => {
    const ps = extractPassages(text, ["gallium", "supply", "export"], { window: 80, max: 1 });
    assert.equal(ps.length, 1);
  });
  it("returns [] when no keyword appears", () => {
    assert.deepEqual(extractPassages(text, ["lithium"], {}), []);
    assert.deepEqual(extractPassages("", ["x"], {}), []);
  });
});

describe("research-sources: buildEvidenceBundle (what the LLM actually sees)", () => {
  const scarcity = { id: "copper", scarcity: "Copper", thesis: "t", tickers: ["FCX"] };
  const bundle = buildEvidenceBundle({
    scarcity,
    signals: { de_rating: { flag: "inflecting", score: 80 }, forced_flow: { flag: "accumulate" }, opportunity: 80 },
    news: [{ title: "Copper deficit looms", date: "2026-05-01", link: "https://r.com/a", excerpt: "Mine supply tightening." }],
    filings: [{ ticker: "FCX", form: "10-K", date: "2026-02-01", passages: ["Copper output constrained by permitting."] }],
    quotes: { FCX: { ytd: 0.2, vs200: 0.1, mom_1m: 0.03 } },
  });
  it("includes signals, news-with-excerpts, filing passages, and quotes — and is JSON-serializable", () => {
    assert.equal(bundle.id, "copper");
    assert.ok(bundle.signals && bundle.news[0].excerpt && bundle.filings[0].passages.length);
    assert.doesNotThrow(() => JSON.stringify(bundle));
  });
  it("counts evidence so the prompt can report depth", () => {
    assert.equal(bundle.evidence_count.news, 1);
    assert.equal(bundle.evidence_count.filing_passages, 1);
  });
  it("is safe with missing sections", () => {
    const b = buildEvidenceBundle({ scarcity });
    assert.equal(b.news.length, 0); assert.equal(b.filings.length, 0);
    assert.equal(b.evidence_count.news, 0);
  });
});
