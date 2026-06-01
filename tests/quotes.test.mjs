import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseStooqQuote, parseStooqHistory, isTradeable } from "../scripts/lib/quotes.mjs";

// Audit (Stooq-only staleness gap): a Stooq fallback quote must carry `asof` (from Stooq's dated bar)
// so it gets the SAME >N-day staleness check as a Yahoo quote — not silently bucketed "freshness unknown".
describe("quotes: parseStooqQuote (asof mapping for staleness)", () => {
  const HEADER = "Symbol,Date,Time,Open,High,Low,Close,Volume";

  it("maps Stooq's dated bar to asof + parses the close", () => {
    const q = parseStooqQuote("AAPL", `${HEADER}\nAAPL.US,2026-05-29,22:00:05,200,205,199,203.5,1000000`);
    assert.equal(q.ticker, "AAPL");
    assert.equal(q.price, 203.5);
    assert.equal(q.asof, "2026-05-29"); // the whole point: staleness-checkable, not null
    assert.equal(q.source, "stooq");
  });

  it("leaves asof null on a junk/undated row (e.g. Stooq 'N/D') rather than fabricating a date", () => {
    const q = parseStooqQuote("XYZ", `${HEADER}\nXYZ.US,N/D,N/D,N/D,N/D,N/D,12.34,0`);
    assert.equal(q.price, 12.34);
    assert.equal(q.asof, null); // unparseable date → "freshness unknown", never a fake fresh date
  });

  it("rejects a non-positive / non-finite close (plausibility floor)", () => {
    for (const bad of ["0", "-5", "N/D", ""]) {
      assert.throws(() => parseStooqQuote("T", `${HEADER}\nT.US,2026-05-29,22:00,1,1,1,${bad},0`));
    }
  });

  it("throws on an empty body (no data row)", () => {
    assert.throws(() => parseStooqQuote("T", HEADER));
    assert.throws(() => parseStooqQuote("T", ""));
  });
});

// Light guards on sibling pure helpers so this file documents the Stooq parsing surface.
describe("quotes: parseStooqHistory + isTradeable (sanity)", () => {
  it("parses a daily history CSV to aligned dates/closes, dropping bad rows", () => {
    const csv = "Date,Open,High,Low,Close,Volume\n2026-05-28,1,1,1,10,5\n2026-05-29,1,1,1,0,5\n2026-05-30,1,1,1,11,5";
    const h = parseStooqHistory("AAA", csv);
    assert.deepEqual(h.dates, ["2026-05-28", "2026-05-30"]); // 05-29 dropped (close 0)
    assert.deepEqual(h.closes, [10, 11]);
  });

  it("isTradeable rejects placeholders + cash, accepts real tickers", () => {
    assert.equal(isTradeable("(private: Scale)"), false);
    assert.equal(isTradeable("CASH-MMF"), false);
    assert.equal(isTradeable("6324.T"), true);
  });
});
