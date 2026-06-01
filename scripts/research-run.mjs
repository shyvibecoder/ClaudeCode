#!/usr/bin/env node
// The v3 research engine entry: runs the versioned research prompts on the free LLMs
// (deep-dive → red-team → synthesis), gated + sanitized to bot-owned fields, and writes
// a dated proposal report. The workflow opens a PR for HUMAN approval (F9). Best-effort:
// no-op (writes a stub) when no LLM key is set or evidence is missing.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { llm, availableProviders, probeProviders, planCommittee, seatCaller } from "./lib/llm.mjs";
import { proposeScarcityEdits } from "./lib/research.mjs";
import { committeeRoster, researchPreflight } from "./lib/admin.mjs";
import { newsForQuery } from "./lib/news.mjs";
import { thesisQueries, extractExcerpt, dedupeByDomain, buildEvidenceBundle } from "./lib/research-sources.mjs";
import { searchFilings, fetchFilingPassages } from "./lib/edgar.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Thesis keywords for filing full-text search + passage extraction (multi-word phrases first).
const thesisKeywords = (s) => {
  const subj = (s.news_query || s.scarcity || "").toLowerCase();
  const words = subj.split(/\s+/).filter((w) => w.length > 3);
  return [...new Set([subj.split(/\s+/).slice(0, 2).join(" "), ...words])].filter(Boolean).slice(0, 6);
};

const read = (p) => { try { return JSON.parse(readFileSync(new URL(`../web/data/${p}`, import.meta.url))); } catch { return null; } };
const date = new Date().toISOString().slice(0, 10);
const dir = new URL("../research/auto/", import.meta.url);
mkdirSync(dir, { recursive: true });
const write = (name, txt) => writeFileSync(new URL(name, dir), txt);

const scar = read("scarcities.json"); const sig = read("signals.json") || {};

// PREFLIGHT: confirm the keys/config we need are present BEFORE gathering evidence or calling models.
// Build the "present secrets/vars" lists from the environment the workflow injects, then report
// readiness up-front. A missing LLM key is the only hard stop; the rest are logged as warnings so a
// degraded run is obvious in the log instead of silently weak.
const SECRET_ENVS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "GEMINI_API_KEY"];
const presentSecrets = SECRET_ENVS.filter((k) => (process.env[k] || "").trim());
const presentVars = ["SEC_USER_AGENT"].filter((k) => (process.env[k] || "").trim());
const preflight = researchPreflight(presentSecrets, presentVars);
console.log(`research preflight: ${preflight.summary}`);
for (const w of preflight.warnings) console.log(`  ⚠ ${w}`);
for (const e of preflight.errors) console.log(`  ✗ ${e}`);

const providers = availableProviders();
if (!scar || !preflight.ok) {
  const reason = !preflight.ok ? preflight.errors.join(" ") : "no scarcities";
  write(`${date}.md`, `# Auto-research ${date}\n\nSkipped: ${reason}\n`);
  console.log("research: skipped — " + reason); process.exit(0);
}

// DEEP multi-source evidence per scarcity: multi-angle news WITH article excerpts (domain-
// deduped for source diversity), SEC filing PASSAGES read from full-text search, the live
// signals (de-rating / forced-flow / opportunity) the LLM previously couldn't see, and the
// quote snapshot — all real, cited, never fabricated. Best-effort: each fetch degrades to the
// committed signals.json data on failure, so the loop still runs offline / rate-limited.
const OFFLINE = process.argv.includes("--offline") || process.env.RESEARCH_OFFLINE === "1";
const evidence = {};
for (const s of scar.scarcities) {
  // 1) Multi-angle news + excerpts (fall back to the scan's committed headlines on failure).
  let news = [];
  if (!OFFLINE) {
    for (const q of thesisQueries(s).slice(0, 4)) {
      try {
        const items = await newsForQuery(q, { limit: 4 });
        for (const it of items) {
          let excerpt = null;
          try { const r = await fetch(it.link, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000) }); if (r.ok) excerpt = extractExcerpt(await r.text(), { maxChars: 500 }); } catch { /* headline only */ }
          news.push({ ...it, excerpt });
          await sleep(120);
        }
      } catch { /* skip angle */ }
      await sleep(150);
    }
    news = dedupeByDomain(news, { perDomain: 2 }).slice(0, 10);
  }
  if (!news.length) news = (sig.news || []).filter((n) => n.scarcity === s.id).map((n) => ({ title: n.title, date: n.date, link: n.link }));

  // 2) SEC filing passages from thesis full-text search. Search SHORT high-signal phrases (the
  // 1–2 word key terms that actually appear in filings) — NOT the whole long news_query as one
  // exact phrase (no 10-K contains "merchant power IPP electricity demand data center"). Try the
  // top terms until one returns hits.
  const filings = [];
  if (!OFFLINE) {
    const kws = thesisKeywords(s);
    const searchTerms = [...new Set([kws[0], kws.slice(1, 3).join(" "), ...kws.slice(1, 4)].filter((t) => t && t.length >= 3))];
    let hits = [];
    for (const term of searchTerms) {
      try { hits = await searchFilings(term, { limit: 4 }); } catch { hits = []; }
      await sleep(200);
      if (hits.length) break; // first term that finds filings wins
    }
    for (const f of hits) {
      try { const passages = await fetchFilingPassages(f, kws, { window: 240, max: 2 }); if (passages.length) filings.push({ ticker: f.ticker, form: f.form, date: f.date, url: f.url, passages }); }
      catch { /* skip filing */ }
      await sleep(200);
    }
  }

  // 3) Signals the LLM previously couldn't see + quotes.
  const ss = sig.scarcity_signals?.[s.id] || {};
  evidence[s.id] = buildEvidenceBundle({
    scarcity: s,
    signals: { de_rating: ss.flag || null, rs: ss.rs ?? null, opportunity: ss.score ?? null, forced_flow: ss.forced_flow?.flag || null },
    news, filings,
    quotes: Object.fromEntries(s.tickers.filter((t) => sig.quotes?.[t] && !sig.quotes[t].error)
      .map((t) => [t, { ytd: sig.quotes[t].ytd, vs200: sig.quotes[t].pct_vs_ma200, mom_1m: sig.quotes[t].mom_1m }])),
  });
}
const totalPassages = Object.values(evidence).reduce((a, e) => a + (e.evidence_count?.filing_passages || 0), 0);
const totalExcerpts = Object.values(evidence).reduce((a, e) => a + (e.evidence_count?.news_with_excerpt || 0), 0);
console.log(`research evidence: ${totalExcerpts} news excerpts, ${totalPassages} filing passages across ${scar.scarcities.length} scarcities`);

// LIVENESS PROBE (root-cause guard): a present key does NOT mean its configured model is alive —
// free providers silently retire slugs, which is what collapsed past runs to a 1-of-3 monologue.
// Ping every provider's configured model BEFORE doing 18 min of work; reassign any dead seat to the
// funded frontier and announce it LOUDLY so degraded diversity is never silent.
const frontier = providers.find((p) => p === "anthropic" || p === "openai") || null;
// COMMITTEE PLAN (honest roles): the frontier model CHAIRS (CIO) and is held OUT of the debate so it
// judges arguments it didn't write; the 3 debate seats are the other providers, with OpenRouter
// expanding to TWO seats (different models, one key) before any free Groq. See planCommittee().
const plan = planCommittee(providers);
// Probe ONLY the providers that actually staff the chair/a seat — not unused keys (e.g. a 503-ing
// Gemini that never plays a role), which just waste a call and add noise every run.
const usedProviders = [...new Set([plan.chair?.provider, ...plan.seats.map((s) => s.provider)].filter(Boolean))];
const probes = await probeProviders(usedProviders);
const live = Object.fromEntries(probes.map((r) => [r.provider, r.ok]));
for (const r of probes) console.log(`  ${r.ok ? "✓" : "✗"} ${r.provider} model ${r.ok ? "live" : "DOWN"}${r.ok ? "" : ` — ${r.error}`}`);
// Apply liveness to each debate seat: a dead provider's seat falls back to the live frontier, loudly.
const swaps = [];
const liveSeats = plan.seats.map((seat) => {
  if (live[seat.provider] === false && frontier && live[frontier] && seat.provider !== frontier) {
    swaps.push({ role: seat.role, from: seat.provider, to: frontier });
    return { ...seat, provider: frontier, model: null };
  }
  return seat;
});
for (const s of swaps) console.log(`  ⚠ seat fallback: ${s.from} (${s.role}) model is down → reassigning to ${s.to} (cross-model diversity reduced, loudly)`);

// Build the seat callers (each bound to its specific provider+model) and the INDEPENDENT chair.
const seats = liveSeats.map((s) => seatCaller(s.provider, s.model));
const chair = plan.chair && live[plan.chair.provider] ? seatCaller(plan.chair.provider, plan.chair.model) : null;
// Chief-Risk-Officer review (trust lever #3): independent fuzzy-check pass (hallucinated tickers,
// illogical thesis, momentum-chasing). Runs ONLY on a LIVE frontier model — a free model grading its
// siblings isn't a real check; without a live frontier key the CRO is disabled (gate + committee run).
const cro = frontier && live[frontier] ? (p) => llm(p, frontier) : null;
// The TRUE role→model map for THIS run (after planning + liveness), published to the dashboard so the
// Research tab shows which LLM actually played each role + the exact model.
const lbl = (s) => s ? `${s.provider[0].toUpperCase()}${s.provider.slice(1)}${s.model ? ` (${s.model})` : ""}` : null;
const roster = { ...preflight.roster, chair: lbl(plan.chair), bull: lbl(liveSeats[0]), bear: lbl(liveSeats[1]), skeptic: lbl(liveSeats[2]), cio: lbl(plan.chair), seat_swaps: swaps };
// Resilient: a transient LLM/network error must NOT fail the workflow — write a stub + exit 0
// so the run is green and the evidence summary is still visible.
try {
  // Process N scarcities at once (seats within each also run in parallel). Higher = faster but more
  // bursty; on a Tier-1 paid key (low RPM/TPM) the bursts trigger 429 backoff and SLOW the run, so
  // set RESEARCH_CONCURRENCY=2 (or 1) for a fresh paid key. Default 4 suits free tiers / higher tiers.
  const concurrency = Math.max(1, Number(process.env.RESEARCH_CONCURRENCY) || 4);
  console.log(`research: committee concurrency=${concurrency}`);
  const { proposals, report, committeeHealth } = await proposeScarcityEdits({ scarcities: scar.scarcities, evidence, seats, chair, cro, scorecard: sig.scorecard, minConfidence: 0.5, concurrency });
  write(`${date}.md`, report);
  write(`${date}.proposals.json`, JSON.stringify(proposals, null, 2) + "\n");
  // Surface committee health in the LOG too (not just the report) — a degraded run with a flaky free
  // provider must be visible in the Actions output, which is the first place you look.
  if (committeeHealth?.degraded) {
    console.log(`research: ⚠ DEGRADED committee — bull=${committeeHealth.roleAnswered.bull} bear=${committeeHealth.roleAnswered.bear} skeptic=${committeeHealth.roleAnswered.skeptic} of ${committeeHealth.scarcities}`);
    for (const e of committeeHealth.errors) console.log(`  ✗ seat error: ${e}`);
  }
  // Also publish the latest proposals to the dashboard-readable data tier so the front-end
  // Accept/Reject review can show them (the UI opens a PR via the user's token; F9-guarded).
  writeFileSync(new URL("../web/data/research-proposals.json", import.meta.url),
    JSON.stringify({ schema_version: 1, generated: date, prompt_version: proposals[0]?.prompt_version ?? null, roster, committee_health: committeeHealth ?? null, proposals }, null, 2) + "\n");
  console.log(`research: ${proposals.length} proposal(s) written to research/auto/${date}.* + web/data/research-proposals.json`);
} catch (e) {
  write(`${date}.md`, `# Auto-research ${date}\n\nEvidence gathered (${totalExcerpts} news excerpts, ${totalPassages} filing passages) but the LLM step errored: ${e.message}\n`);
  console.log(`research: LLM step errored (non-fatal): ${e.message}`);
}
