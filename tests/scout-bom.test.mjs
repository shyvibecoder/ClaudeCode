import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseLadderResponse, bomLadderLeads } from "../scripts/lib/scout.mjs";

// Engine 2 (SCOUT-DESIGN): walk UP the dependency stack from the 24 KNOWN scarcities — "what does
// HBM itself depend on one layer up?" The supplier of a scarce thing is the highest-prior place to
// find the next scarce thing. The model proposes upstream inputs; we discover proxies; each becomes
// a lead. propose() + discover() are injected so the engine is testable offline.
describe("scout engine 2: parseLadderResponse", () => {
  it("parses 'input — why' lines into structured upstream dependencies", () => {
    const out = parseLadderResponse(`1. ABF substrate — the resin carrier HBM packaging needs\n- Photoresist: lithography input\n* electronic-grade quartz`);
    assert.equal(out.length, 3);
    assert.equal(out[0].input, "ABF substrate");
    assert.match(out[0].why, /resin carrier/);
    assert.equal(out[1].input, "Photoresist");
    assert.equal(out[2].input, "electronic-grade quartz");
    assert.equal(out[2].why, "");
  });
  it("also accepts a JSON array of {input, why}", () => {
    const out = parseLadderResponse('[{"input":"neon gas","why":"laser source"}]');
    assert.equal(out[0].input, "neon gas");
    assert.equal(out[0].why, "laser source");
  });
  it("drops junk / too-short inputs", () => {
    assert.deepEqual(parseLadderResponse("ok\n—\nrare resin").map((x) => x.input), ["rare resin"]);
  });
});

describe("scout engine 2: bomLadderLeads", () => {
  const scarcities = [
    { id: "hbm", scarcity: "HBM", tickers: ["MU"] },
    { id: "optical", scarcity: "Optical", tickers: ["COHR"] },
  ];
  const propose = async (s) => s.id === "hbm"
    ? "ABF substrate — carrier HBM needs\nphotoresist — lithography"
    : "electronic-grade quartz — fiber input";
  const discover = async (input) => ({ "ABF substrate": ["AJ", "SHW"], "photoresist": ["TOK"], "electronic-grade quartz": ["QTZ"] }[input] || []);

  it("produces upstream leads from the known scarcities, tagged engine + ladder source", async () => {
    const { leads } = await bomLadderLeads({ scarcities, propose, discover, maxSeeds: 2, maxPerSeed: 2 });
    assert.ok(leads.length >= 2);
    const abf = leads.find((l) => l.subject === "ABF substrate");
    assert.equal(abf.engine, "bom-ladder");
    assert.deepEqual(abf.tickers, ["AJ", "SHW"]);
    assert.equal(abf.lead.ladder_from, "hbm");
    assert.match(abf.lead.why, /carrier/);
  });

  it("ENFORCES budget: at most maxSeeds propose-calls and maxPerSeed inputs each", async () => {
    let proposeCalls = 0;
    const countProposed = async (s) => { proposeCalls++; return propose(s); };
    const { leads } = await bomLadderLeads({ scarcities, propose: countProposed, discover, maxSeeds: 1, maxPerSeed: 1 });
    assert.equal(proposeCalls, 1);            // only 1 seed
    assert.equal(leads.length, 1);            // only 1 input from that seed
  });

  it("drops an upstream input that maps to a KNOWN scarcity's ticker (novelty filter)", async () => {
    // photoresist→TOK is novel; but if discover returns a known ticker we should drop it.
    const discKnown = async (input) => input === "ABF substrate" ? ["MU"] : ["TOK"]; // MU is HBM's known ticker
    const { leads } = await bomLadderLeads({ scarcities: [scarcities[0]], propose, discover: discKnown, knownTickers: ["MU"], maxSeeds: 1, maxPerSeed: 2 });
    assert.ok(!leads.some((l) => l.subject === "ABF substrate"), "an input whose only proxy is already-known is not novel");
    assert.ok(leads.some((l) => l.subject === "photoresist"));
  });

  it("is resilient: a failing propose() for one seed doesn't sink the others", async () => {
    const flaky = async (s) => { if (s.id === "hbm") throw new Error("llm 529"); return propose(s); };
    const { leads, errors } = await bomLadderLeads({ scarcities, propose: flaky, discover, maxSeeds: 2, maxPerSeed: 2 });
    assert.ok(errors.some((e) => /529/.test(e)));
    assert.ok(leads.some((l) => l.subject === "electronic-grade quartz"));   // optical seed still produced
  });
});
