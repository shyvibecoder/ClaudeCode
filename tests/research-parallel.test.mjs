import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapLimit, runCommittee, proposeScarcityEdits } from "../scripts/lib/research.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe("mapLimit: bounded-concurrency map", () => {
  it("preserves input order in the output regardless of completion order", async () => {
    const out = await mapLimit([30, 10, 20, 5], 2, async (ms) => { await sleep(ms); return ms; });
    assert.deepEqual(out, [30, 10, 20, 5]);
  });
  it("never exceeds the concurrency limit in flight", async () => {
    let inFlight = 0, peak = 0;
    await mapLimit([1, 2, 3, 4, 5, 6], 2, async () => {
      inFlight++; peak = Math.max(peak, inFlight); await sleep(5); inFlight--;
    });
    assert.ok(peak <= 2, `peak ${peak} exceeded limit 2`);
  });
  it("actually runs concurrently (limit>1 finishes faster than serial)", async () => {
    const t0 = Date.now();
    await mapLimit([20, 20, 20, 20], 4, async (ms) => sleep(ms));
    assert.ok(Date.now() - t0 < 70, "4-wide should finish ~1 batch, not 4×20ms serial");
  });
  it("is safe on empty + limit larger than the list", async () => {
    assert.deepEqual(await mapLimit([], 3, async (x) => x), []);
    assert.deepEqual(await mapLimit([1, 2], 10, async (x) => x * 2), [2, 4]);
  });
  it("propagates a worker error (doesn't swallow)", async () => {
    await assert.rejects(mapLimit([1, 2], 2, async (x) => { if (x === 2) throw new Error("boom"); return x; }), /boom/);
  });
});

describe("proposeScarcityEdits: scarcities processed concurrently but reported DETERMINISTICALLY", () => {
  const mk = (id, priced) => ({ id, scarcity: id, priced_in: priced, bind_window: "now", non_consensus: false, thesis: "x", tickers: [id.toUpperCase()] });
  // 5 scarcities; one proposes a change, the rest are no-change. Order must be stable run-to-run.
  const scarcities = [mk("a", "low"), mk("b", "high"), mk("c", "low"), mk("d", "high"), mk("e", "low")];
  const ev = Object.fromEntries(scarcities.map((s) => [s.id, { evidence_count: { news_with_excerpt: 3, filing_passages: 2 } }]));
  const seatFor = () => async (prompt) => {
    await sleep(15);
    // 'c' proposes low→medium (a real, verifiable change); everyone else holds.
    const isC = /"c"|Scarcity under review: "c"|on "c"/.test(prompt);
    if (/CIO chairing/.test(prompt)) {
      const id = (prompt.match(/committee on "(\w)"/) || [])[1];
      return id === "c" ? '{"priced_in":"medium","confidence":0.6,"rationale":"c moves","variant_view":"v"}'
                        : `{"priced_in":"${/on "[bd]"/.test(prompt) ? "high" : "low"}","confidence":0.6,"rationale":"hold"}`;
    }
    return '{"priced_read":"low","confidence":0.6}';
  };

  it("yields the SAME proposals/considered ordering as a serial run (order-stable under concurrency)", async () => {
    const seats = [seatFor(), seatFor(), seatFor()];
    const r1 = await proposeScarcityEdits({ scarcities, evidence: ev, seats, minConfidence: 0.5, concurrency: 4 });
    const r2 = await proposeScarcityEdits({ scarcities, evidence: ev, seats, minConfidence: 0.5, concurrency: 1 });
    assert.deepEqual(r1.considered.map((c) => c.id), r2.considered.map((c) => c.id));
    assert.deepEqual(r1.proposals.map((p) => p.id), r2.proposals.map((p) => p.id));
    assert.equal(r1.proposals.length, 1);
    assert.equal(r1.proposals[0].id, "c");
  });

  it("is faster than serial (concurrency>1 overlaps the per-scarcity latency)", async () => {
    const seats = [seatFor(), seatFor(), seatFor()];
    const t0 = Date.now();
    await proposeScarcityEdits({ scarcities, evidence: ev, seats, minConfidence: 0.5, concurrency: 5 });
    assert.ok(Date.now() - t0 < 120, "5 scarcities × ~2 rounds should overlap, not run fully serial");
  });
});

describe("runCommittee: seats run CONCURRENTLY (same result, faster)", () => {
  const scarcity = { id: "copper", scarcity: "Copper", priced_in: "high", bind_window: "2030+", non_consensus: false, thesis: "x", tickers: ["FCX"] };
  // Each seat sleeps; if seats were sequential, 3×40ms≈120ms. Concurrent ≈ one 40ms round + CIO.
  const slowSeat = (read) => async (prompt) => {
    await sleep(40);
    if (/CIO chairing/.test(prompt)) return `{"priced_in":"crowded","confidence":0.7,"rationale":"r"}`;
    return `{"priced_read":"${read}","confidence":0.7}`;
  };
  it("produces the same memo shape with concurrent seats", async () => {
    const memo = await runCommittee({ scarcity, evidence: { evidence_count: { news_with_excerpt: 3, filing_passages: 2 } }, seats: [slowSeat("crowded"), slowSeat("crowded"), slowSeat("high")] });
    assert.equal(Object.keys(memo.seats).length, 3);
    assert.equal(memo.dispersion.level, "moderate");
    assert.equal(memo.cio.priced_in, "crowded");
  });
  it("runs the 3 seats in parallel (wall-clock ≈ 2 rounds, not 4)", async () => {
    const t0 = Date.now();
    await runCommittee({ scarcity, evidence: {}, seats: [slowSeat("crowded"), slowSeat("crowded"), slowSeat("high")] });
    const ms = Date.now() - t0;
    assert.ok(ms < 110, `expected ~2 rounds (~80ms), got ${ms}ms — seats likely still sequential`);
  });
  it("still captures a single seat failure without losing the others (parallel-safe)", async () => {
    const memo = await runCommittee({ scarcity, evidence: {}, seats: [slowSeat("crowded"), async () => { throw new Error("429 quota"); }, slowSeat("high")] });
    assert.ok(memo.errors.some((e) => /429/.test(e)));
    assert.ok(memo.cio); // survivors still produce a CIO call
  });
});
