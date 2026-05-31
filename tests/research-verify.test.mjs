import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { verifyProposal } from "../scripts/lib/research-verify.mjs";

// optical: rated "crowded", basket up huge YTD. A proposal making it CHEAPER (more opportunity) is
// the momentum trap I caught by hand — code must catch it deterministically.
const optical = { id: "optical", scarcity: "Optical", priced_in: "crowded", bind_window: "2027", tickers: ["COHR", "LITE", "AVGO"] };
const gallium = { id: "gallium", scarcity: "Gallium", priced_in: "low", bind_window: "now", tickers: ["WOLF", "NVTS", "QRVO"] };
const manip = { id: "manipulation-data", scarcity: "Manipulation data", priced_in: "low", bind_window: "2027", tickers: ["(private: Physical Intelligence, Skild, Scale)"] };
const upBig = { quotes: { COHR: { ytd: 0.86, vs200: 0.3 }, LITE: { ytd: 1.21, vs200: 0.4 } } };

describe("research-verify: price-contradiction (the momentum trap, hard gate)", () => {
  it("HARD-fails a proposal that rates a name CHEAPER while its basket is up big YTD", () => {
    const v = verifyProposal(optical, { priced_in: "medium", confidence: 0.62 }, upBig);
    assert.equal(v.hardFail, true);
    assert.ok(v.flags.some((f) => f.code === "price-contradiction"));
  });
  it("does NOT flag a CONSERVATIVE move (cheaper→more-priced) — gallium low→medium is fine", () => {
    const v = verifyProposal(gallium, { priced_in: "medium", confidence: 0.55 }, { quotes: { WOLF: { ytd: 0.4, vs200: 0.1 } } });
    assert.equal(v.hardFail, false);
    assert.ok(!v.flags.some((f) => f.code === "price-contradiction"));
  });
  it("does not flag a cheaper-rating when the basket is NOT extended", () => {
    const v = verifyProposal(optical, { priced_in: "medium", confidence: 0.6 }, { quotes: { COHR: { ytd: 0.05, vs200: 0.0 } } });
    assert.ok(!v.flags.some((f) => f.code === "price-contradiction"));
  });
});

describe("research-verify: bind-acceleration (the 'everything binds now' bias, soft penalty)", () => {
  it("penalizes + flags moving bind_window EARLIER toward now", () => {
    const v = verifyProposal({ ...gallium, bind_window: "2028-29" }, { priced_in: "low", bind_window: "now", confidence: 0.58 }, {});
    assert.ok(v.flags.some((f) => f.code === "bind-acceleration"));
    assert.ok(v.penalty > 0);
    assert.equal(v.hardFail, false); // soft — surfaces + penalizes, doesn't auto-kill
  });
  it("does not penalize keeping or pushing the window LATER", () => {
    const v = verifyProposal({ ...gallium, bind_window: "now" }, { priced_in: "low", bind_window: "2027", confidence: 0.6 }, {});
    assert.ok(!v.flags.some((f) => f.code === "bind-acceleration"));
    assert.equal(v.penalty, 0);
  });
});

describe("research-verify: ticker grounding (catches a hallucinated centerpiece like ADNT, soft surface)", () => {
  it("flags a ticker named in the variant view that isn't in the scarcity's coverage", () => {
    const v = verifyProposal(manip, { priced_in: "low", confidence: 0.57, variant_view: "Consensus undervalues ADNT, a hidden humanoid-data moat." }, {});
    assert.ok(v.flags.some((f) => f.code === "unverified-ticker" && /ADNT/.test(f.detail)));
  });
  it("does NOT flag tickers that ARE in coverage, nor common acronyms", () => {
    const v = verifyProposal(gallium, { priced_in: "medium", confidence: 0.55, variant_view: "WOLF and NVTS gain as US and China escalate; GaN demand for EW radar rises." }, {});
    assert.ok(!v.flags.some((f) => f.code === "unverified-ticker"));
  });
  it("does not flag tickers named only in the bear_case (counter-arguments may cite anything)", () => {
    const v = verifyProposal(gallium, { priced_in: "medium", confidence: 0.55, variant_view: "WOLF benefits.", bear_case: "But AXTI and competitors could undercut." }, {});
    assert.ok(!v.flags.some((f) => f.code === "unverified-ticker"));
  });
});

describe("research-verify: thin-evidence vs high confidence (overconfidence gate)", () => {
  it("HARD-fails high confidence built on near-zero evidence", () => {
    const v = verifyProposal(gallium, { priced_in: "medium", confidence: 0.8 }, { evidence_count: { news_with_excerpt: 0, filing_passages: 0 } });
    assert.equal(v.hardFail, true);
    assert.ok(v.flags.some((f) => f.code === "thin-evidence-overconfident"));
  });
  it("allows modest confidence on thin evidence (it's honest about uncertainty)", () => {
    const v = verifyProposal(gallium, { priced_in: "medium", confidence: 0.5 }, { evidence_count: { news_with_excerpt: 0, filing_passages: 0 } });
    assert.ok(!v.flags.some((f) => f.code === "thin-evidence-overconfident"));
  });
});

describe("research-verify: aggregate shape", () => {
  it("returns flags/hardFail/penalty and is safe on empty inputs", () => {
    const v = verifyProposal(gallium, { priced_in: "medium", confidence: 0.5 }, {});
    assert.ok(Array.isArray(v.flags));
    assert.equal(typeof v.hardFail, "boolean");
    assert.equal(typeof v.penalty, "number");
    const v2 = verifyProposal(null, null, null);
    assert.equal(v2.hardFail, false);
  });
});
