import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runCommittee, proposeScarcityEdits } from "../scripts/lib/research.mjs";
import { seatPrompt, cioPrompt } from "../scripts/lib/research-prompts.mjs";

const copper = { id: "copper", scarcity: "Copper", priced_in: "high", bind_window: "2030+", non_consensus: false, thesis: "deficit" };

// Seat model fns are injected (no network). Route by role keyword in the prompt so one fake "model"
// can play every seat deterministically.
const seatFn = (byRole) => async (prompt) => {
  const role = /CIO chairing/.test(prompt) ? "cio"
    : /You are the BULL|the BULL \//.test(prompt) ? "bull"
    : /You are the BEAR|the BEAR \//.test(prompt) ? "bear"
    : /BASE-RATE SKEPTIC|the SKEPTIC/.test(prompt) ? "skeptic"
    : "cio";
  return byRole[role] ?? "";
};

describe("research-committee: seatPrompt / cioPrompt", () => {
  it("seatPrompt stamps the role mandate and asks for an honest priced_read", () => {
    const p = seatPrompt("bull", copper, {}, null);
    assert.match(p, /BULL/);
    assert.match(p, /priced_read/);
    assert.match(p, /Copper/);
  });
  it("bear seat is told to try to KILL the thesis (genuine disconfirmation)", () => {
    assert.match(seatPrompt("bear", copper, {}, null), /kill|short|wrong|de-?rate/i);
  });
  it("cioPrompt feeds the seat debate + dispersion and demands variant view + kill-criterion", () => {
    const p = cioPrompt(copper, { bull: { priced_read: "crowded" }, bear: { priced_read: "high" }, skeptic: { priced_read: "high" } }, { level: "moderate", agreement: 0.67 });
    assert.match(p, /variant_view/);
    assert.match(p, /kill_criterion/);
    assert.match(p, /moderate|dispersion|conviction/i);
  });
});

describe("research-committee: runCommittee (bull/bear/skeptic → CIO)", () => {
  it("runs all seats, computes dispersion from their reads, returns a CIO edit", async () => {
    const seats = [
      seatFn({ bull: '{"priced_read":"crowded","variant_view":"deficit holds","confidence":0.8}', cio: '{"priced_in":"crowded","confidence":0.8,"rationale":"r","variant_view":"v","kill_criterion":{"condition":"stocks +30%","by_date":"2027-12"}}' }),
      seatFn({ bear: '{"priced_read":"high","kill_risk":"new mines 2028","confidence":0.6}' }),
      seatFn({ skeptic: '{"priced_read":"high","base_rate":"shortages mean-revert","confidence":0.5}' }),
    ];
    const memo = await runCommittee({ scarcity: copper, evidence: {}, seats });
    assert.equal(memo.seats.bull.priced_read, "crowded");
    assert.equal(memo.seats.bear.priced_read, "high");
    assert.equal(memo.seats.skeptic.priced_read, "high");
    assert.equal(memo.dispersion.level, "moderate"); // high,high,crowded → strict majority "high"
    assert.equal(memo.cio.priced_in, "crowded");
    assert.equal(memo.cio.kill_criterion.by_date, "2027-12");
    assert.equal(memo.errors.length, 0);
  });

  it("degrades to fewer seats when only one model is available (role structure preserved)", async () => {
    const one = seatFn({
      bull: '{"priced_read":"crowded","confidence":0.7}', bear: '{"priced_read":"crowded","confidence":0.7}',
      skeptic: '{"priced_read":"crowded","confidence":0.7}',
      cio: '{"priced_in":"crowded","confidence":0.7,"rationale":"r"}',
    });
    const memo = await runCommittee({ scarcity: copper, evidence: {}, seats: [one] });
    assert.equal(memo.dispersion.level, "tight"); // all reads agree
    assert.equal(memo.cio.priced_in, "crowded");
  });

  it("captures a seat failure loudly without zeroing the committee (CIO still runs on survivors)", async () => {
    const seats = [
      seatFn({ bull: '{"priced_read":"crowded","confidence":0.8}', cio: '{"priced_in":"crowded","confidence":0.75,"rationale":"r"}' }),
      async () => { throw new Error("groq HTTP 429: quota"); },
      seatFn({ skeptic: '{"priced_read":"high","confidence":0.5}' }),
    ];
    const memo = await runCommittee({ scarcity: copper, evidence: {}, seats });
    assert.ok(memo.errors.some((e) => /429/.test(e)));
    assert.ok(memo.cio && memo.cio.priced_in === "crowded"); // survived
  });

  it("returns no cio when EVERY seat fails (so the caller records no-response, not a fake call)", async () => {
    const dead = async () => { throw new Error("HTTP 503"); };
    const memo = await runCommittee({ scarcity: copper, evidence: {}, seats: [dead, dead] });
    assert.equal(memo.cio, null);
    assert.ok(memo.errors.length >= 1);
  });
});

describe("research-committee: CIO fail-over (a dead lead/frontier key can't tank the run)", () => {
  const cioJson = '{"priced_in":"crowded","confidence":0.8,"rationale":"r","variant_view":"v"}';
  // pool[0] is the lead (e.g. an unfunded frontier key). It answers its SEAT fine but the CIO call
  // throws — historically that meant cio:null → zero proposal. Now it must fail over to pool[1].
  it("falls over to the next provider when the lead CIO call throws, still producing a CIO edit", async () => {
    let leadCioCalls = 0, backupCioCalls = 0;
    const lead = async (prompt) => {
      if (/CIO chairing/.test(prompt)) { leadCioCalls++; throw new Error("anthropic 400 credit balance too low"); }
      return '{"priced_read":"crowded","confidence":0.8}';
    };
    const backup = async (prompt) => {
      if (/CIO chairing/.test(prompt)) { backupCioCalls++; return cioJson; }
      return '{"priced_read":"high","confidence":0.6}';
    };
    const memo = await runCommittee({ scarcity: copper, evidence: {}, seats: [lead, backup, backup] });
    assert.ok(memo.cio, "expected a CIO edit via fail-over, got null");
    assert.equal(memo.cio.priced_in, "crowded");
    assert.equal(leadCioCalls, 1);          // tried the lead first
    assert.equal(backupCioCalls, 1);        // then failed over to the backup
    assert.ok(memo.errors.some((e) => /credit balance/.test(e)), "the lead failure is still surfaced");
  });

  it("returns cio:null only when EVERY provider's CIO call fails (true no-response)", async () => {
    const seatOk = (p) => /CIO chairing/.test(p) ? Promise.reject(new Error("529 overloaded")) : Promise.resolve('{"priced_read":"high","confidence":0.6}');
    const memo = await runCommittee({ scarcity: copper, evidence: {}, seats: [seatOk, seatOk] });
    assert.equal(memo.cio, null);
    assert.ok(memo.errors.some((e) => /529/.test(e)));
  });

  it("does not double-call when the lead CIO succeeds (fail-over only on failure)", async () => {
    let cioCalls = 0;
    const lead = async (prompt) => {
      if (/CIO chairing/.test(prompt)) { cioCalls++; return cioJson; }
      return '{"priced_read":"crowded","confidence":0.8}';
    };
    const backup = async (prompt) => /CIO chairing/.test(prompt) ? '{"priced_in":"low","confidence":0.5}' : '{"priced_read":"high","confidence":0.6}';
    const memo = await runCommittee({ scarcity: copper, evidence: {}, seats: [lead, backup] });
    assert.equal(cioCalls, 1);
    assert.equal(memo.cio.priced_in, "crowded");   // the lead's call, not the backup's
  });
});

describe("research-committee: deterministic verification gate (trust layer)", () => {
  // optical-style momentum trap: crowded thesis, basket up huge, model says "cheaper" → hard-fail.
  const optical = { id: "optical", scarcity: "Optical", priced_in: "crowded", bind_window: "2027", non_consensus: false, thesis: "ran 5x", tickers: ["COHR", "LITE"] };
  it("HARD-fails the momentum trap (cheaper rating on an extended basket) → not proposed, audit-trailed", async () => {
    const ev = { optical: { quotes: { COHR: { ytd: 0.86, vs200: 0.3 }, LITE: { ytd: 1.21, vs200: 0.4 } }, evidence_count: { news_with_excerpt: 4, filing_passages: 2 } } };
    const seats = [
      seatFn({ bull: '{"priced_read":"medium","confidence":0.7}', cio: '{"priced_in":"medium","confidence":0.7,"rationale":"inflection","variant_view":"supply breakthrough"}' }),
      seatFn({ bear: '{"priced_read":"medium","confidence":0.6}' }),
      seatFn({ skeptic: '{"priced_read":"medium","confidence":0.6}' }),
    ];
    const { proposals, considered } = await proposeScarcityEdits({ scarcities: [optical], evidence: ev, seats, minConfidence: 0.5 });
    assert.equal(proposals.length, 0);
    assert.equal(considered[0].reason, "verification-failed");
    assert.match(considered[0].rationale + (considered[0].error || ""), /price-contradiction|momentum/i);
  });

  it("soft flags (bind-acceleration) dock confidence and ride on the proposal + report", async () => {
    const gal = { id: "gallium", scarcity: "Gallium", priced_in: "low", bind_window: "2028-29", non_consensus: true, thesis: "x", tickers: ["WOLF"] };
    const ev = { gallium: { quotes: { WOLF: { ytd: 0.1, vs200: 0.0 } }, evidence_count: { news_with_excerpt: 3, filing_passages: 1 } } };
    const seats = [
      seatFn({ bull: '{"priced_read":"low","confidence":0.66}', cio: '{"priced_in":"low","bind_window":"now","confidence":0.66,"rationale":"binds now","variant_view":"WOLF gains"}' }),
      seatFn({ bear: '{"priced_read":"low","confidence":0.6}' }),
      seatFn({ skeptic: '{"priced_read":"low","confidence":0.6}' }),
    ];
    const { proposals, report } = await proposeScarcityEdits({ scarcities: [gal], evidence: ev, seats, minConfidence: 0.5 });
    assert.equal(proposals.length, 1);
    assert.ok(proposals[0].confidence < 0.66);                 // penalty applied
    assert.ok(proposals[0].verify_flags.some((f) => f.code === "bind-acceleration"));
    assert.match(report, /Checks:|bind-acceleration/);
  });
});

describe("research-committee: proposeScarcityEdits in committee mode", () => {
  const scarcities = [copper];
  it("uses the committee when 'seats' are provided and proposes the CIO call with dispersion attached", async () => {
    const seats = [
      seatFn({ bull: '{"priced_read":"crowded","confidence":0.8}', cio: '{"priced_in":"crowded","confidence":0.8,"rationale":"de-rating","variant_view":"glut is wrong","kill_criterion":{"condition":"stocks +30%","by_date":"2027-12"}}' }),
      seatFn({ bear: '{"priced_read":"crowded","confidence":0.7}' }),
      seatFn({ skeptic: '{"priced_read":"crowded","confidence":0.6}' }),
    ];
    // High confidence needs real evidence to clear the verification gate (else thin-evidence-overconfident).
    const ev = { copper: { quotes: {}, evidence_count: { news_with_excerpt: 4, filing_passages: 3 } } };
    const { proposals, report } = await proposeScarcityEdits({ scarcities, evidence: ev, seats, minConfidence: 0.6 });
    assert.equal(proposals.length, 1);
    assert.equal(proposals[0].priced_in, "crowded");
    assert.equal(proposals[0].dispersion.level, "tight");
    assert.match(report, /Variant: glut is wrong/);
    assert.match(report, /Wrong if: stocks \+30%/);
  });

  it("attaches a fundamentals-vs-price divergence flag from triangulation and shows it in the report", async () => {
    const loved = [{ id: "copper", scarcity: "Copper", priced_in: "crowded", bind_window: "2030+", non_consensus: false, thesis: "x" }];
    const ev = { copper: { id: "copper", priced_in: "crowded", signals: { de_rating: "de-rating" }, quotes: { FCX: { ytd: -0.2, vs200: -0.1, mom_1m: -0.05 } }, filings: [{ passages: ["backlog"] }], evidence_count: { filings: 1, filing_passages: 1, news: 0, news_with_excerpt: 0 } } };
    const seats = [
      seatFn({ bull: '{"priced_read":"high","confidence":0.7}', cio: '{"priced_in":"high","confidence":0.7,"rationale":"tape rolling over"}' }),
      seatFn({ bear: '{"priced_read":"high","confidence":0.7}' }),
      seatFn({ skeptic: '{"priced_read":"high","confidence":0.7}' }),
    ];
    const { proposals, report } = await proposeScarcityEdits({ scarcities: loved, evidence: ev, seats, minConfidence: 0.6 });
    assert.equal(proposals.length, 1);
    assert.equal(proposals[0].divergence_flag, "fundamentals-vs-price");
    assert.match(report, /Divergence: fundamentals-vs-price/);
  });

  it("a wide-dispersion committee that lands below threshold is recorded as considered (auditable)", async () => {
    const seats = [
      seatFn({ bull: '{"priced_read":"crowded","confidence":0.5}', cio: '{"priced_in":"crowded","confidence":0.45,"rationale":"split"}' }),
      seatFn({ bear: '{"priced_read":"low","confidence":0.5}' }),
      seatFn({ skeptic: '{"priced_read":"high","confidence":0.5}' }),
    ];
    const { proposals, considered } = await proposeScarcityEdits({ scarcities, seats, minConfidence: 0.6 });
    assert.equal(proposals.length, 0);
    assert.equal(considered[0].reason, "below-confidence");
  });
});
