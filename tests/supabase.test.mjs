import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { supabaseConfigured, seriesToRows, upsertRows, selectRows, upsertPriceHistory } from "../scripts/lib/supabase.mjs";

const ENV = { SUPABASE_URL: "https://proj.supabase.co/", SUPABASE_SERVICE_KEY: "svc_key" };
// Capture-and-OK fake fetch.
function fakeFetch(captured) {
  return async (url, opts) => { captured.push({ url, opts }); return { ok: true, status: 200, async text() { return ""; }, async json() { return [{ ticker: "QQQ", close: 100 }]; } }; };
}

describe("supabase: configuration gate (graceful no-op without keys)", () => {
  it("configured only when BOTH url and key are present", () => {
    assert.equal(supabaseConfigured({}), false);
    assert.equal(supabaseConfigured({ SUPABASE_URL: "x" }), false);
    assert.equal(supabaseConfigured(ENV), true);
  });
  it("upsert/select skip cleanly when unconfigured — never throw, never fetch", async () => {
    const cap = [];
    assert.deepEqual(await upsertRows("price_history", [{ ticker: "A", d: "2026-01-01", close: 1 }], { env: {}, fetchImpl: fakeFetch(cap) }), { skipped: true, written: 0 });
    assert.deepEqual(await selectRows("price_history", { env: {}, fetchImpl: fakeFetch(cap) }), { skipped: true, rows: [] });
    assert.equal(cap.length, 0); // no network attempted
  });
});

describe("supabase: seriesToRows", () => {
  it("maps a fetchSeries result to rows, dropping bad closes", () => {
    const rows = seriesToRows({ ticker: "QQQ", dates: ["2026-01-01", "2026-01-02", "2026-01-03"], closes: [100, 0, 102] });
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], { ticker: "QQQ", d: "2026-01-01", close: 100, source: "yahoo" });
    assert.deepEqual(seriesToRows(null), []);
  });
});

describe("supabase: upsert request building", () => {
  it("posts to /rest/v1/<table> with on_conflict, auth headers, and merge-duplicates", async () => {
    const cap = [];
    const out = await upsertPriceHistory([{ ticker: "QQQ", d: "2026-01-01", close: 100 }], { env: ENV, fetchImpl: fakeFetch(cap) });
    assert.equal(out.written, 1);
    const { url, opts } = cap[0];
    assert.equal(url, "https://proj.supabase.co/rest/v1/price_history?on_conflict=ticker%2Cd"); // trailing slash trimmed
    assert.equal(opts.method, "POST");
    assert.equal(opts.headers.apikey, "svc_key");
    assert.equal(opts.headers.authorization, "Bearer svc_key");
    assert.match(opts.headers.prefer, /merge-duplicates/);
  });
  it("chunks large upserts into multiple requests", async () => {
    const cap = [];
    const rows = Array.from({ length: 1200 }, (_, i) => ({ ticker: "A", d: `d${i}`, close: i + 1 }));
    const out = await upsertRows("price_history", rows, { env: ENV, fetchImpl: fakeFetch(cap), chunk: 500 });
    assert.equal(out.written, 1200);
    assert.equal(cap.length, 3); // 500 + 500 + 200
  });
  it("throws with status + body on a non-ok response", async () => {
    const failing = async () => ({ ok: false, status: 401, async text() { return "no auth"; } });
    await assert.rejects(() => upsertRows("price_history", [{ ticker: "A", d: "x", close: 1 }], { env: ENV, fetchImpl: failing }), /supabase upsert price_history 401: no auth/);
  });
});

describe("supabase: select request building", () => {
  it("builds a PostgREST query with select/filters/limit + auth", async () => {
    const cap = [];
    const out = await selectRows("price_history", { select: "ticker,d,close", filters: "ticker=eq.QQQ&order=d.desc", limit: 10, env: ENV, fetchImpl: fakeFetch(cap) });
    assert.deepEqual(out.rows, [{ ticker: "QQQ", close: 100 }]);
    assert.equal(cap[0].url, "https://proj.supabase.co/rest/v1/price_history?select=ticker%2Cd%2Cclose&ticker=eq.QQQ&order=d.desc&limit=10");
    assert.equal(cap[0].opts.headers.apikey, "svc_key");
  });
});
