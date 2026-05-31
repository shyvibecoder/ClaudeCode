import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseFtsFilings, WATCH_FORMS_WIDE, filingTextToPassages } from "../scripts/lib/edgar.mjs";

describe("edgar-content: parse FTS hits into filing references for a thesis", () => {
  const json = { hits: { hits: [
    { _id: "0000320193-26-000010:doc.htm", _source: { display_names: ["Apple Inc. (AAPL) (CIK 0000320193)"], form: "10-K", file_date: "2026-02-01", cik: "0000320193" } },
    { _id: "0001018724-26-000005:a.htm", _source: { display_names: ["Amazon (AMZN) (CIK 0001018724)"], form: "10-Q", file_date: "2026-04-01", cik: "1018724" } },
    { _source: { display_names: [] } }, // garbage → skipped
  ] } };
  it("returns ticker/form/date/accession/url per hit, newest-first", () => {
    const out = parseFtsFilings(json);
    assert.equal(out.length, 2);
    assert.equal(out[0].ticker, "AMZN"); // 2026-04 newer than 2026-02
    assert.equal(out[1].ticker, "AAPL");
    assert.equal(out[1].form, "10-K");
    assert.ok(out[1].url.includes("320193") && out[1].url.includes("doc.htm"));
  });
  it("is safe on empty/garbage", () => assert.deepEqual(parseFtsFilings({}), []));
});

describe("edgar-content: expanded watch-form set", () => {
  it("covers the new-entrant + activism + proxy forms in addition to the core set", () => {
    for (const f of ["8-K", "10-Q", "10-K", "20-F", "S-1", "424B4", "SC 13D", "SC 13G", "DEF 14A"]) {
      assert.ok(WATCH_FORMS_WIDE.has(f), `missing ${f}`);
    }
  });
});

describe("edgar-content: filing text → thesis passages", () => {
  it("delegates to the passage extractor over the keywords", () => {
    const text = "Risk Factors. " + "x ".repeat(50) + "Gallium procurement is concentrated in a single country. " + "y ".repeat(50);
    const ps = filingTextToPassages(text, ["gallium"], { window: 50, max: 2 });
    assert.ok(ps.length >= 1 && /Gallium procurement/i.test(ps[0]));
  });
  it("empty on no match / empty input", () => {
    assert.deepEqual(filingTextToPassages("", ["x"]), []);
    assert.deepEqual(filingTextToPassages("text", []), []);
  });
});
