#!/usr/bin/env node
// Scarcity SCOUT runner (docs/SCOUT-DESIGN.md). Surveils SEC full-text for CONSTRAINT-language
// complaints, clusters filers under broad supply stress into candidate NEW scarcities, synthesizes a
// draft for each, and runs it through the SAME investment committee that scores the known 24. Only
// committee-approved survivors are published to a SEPARATE scout feed (web/data/scout-candidates.json)
// for human PR approval (F9 — humans own scarcities.json). The DECISION logic is the pure, tested
// scout.mjs + research.mjs; this runner just injects the real I/O. Best-effort: any hiccup logs and
// exits 0 (the scout must never fail the workflow), and it's hard-budgeted so a sweep can't run away.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { availableProviders, probeProviders, planCommittee, seatCaller, llm } from "./lib/llm.mjs";
import { DEFAULT_CONSTRAINT_PHRASES, approvedPhrases, constraintShadowLeads, bomLadderLeads, arxivLeads, evaluateLeads, draftFromLead, leadEvidenceHash, searchArxiv } from "./lib/scout.mjs";
import { runCommittee, sanitizeEdit } from "./lib/research.mjs";
import { searchFts, discoverProxies } from "./lib/edgar-fts.mjs";
import { newsForQuery } from "./lib/news.mjs";
import { buildEvidenceBundle } from "./lib/research-sources.mjs";

const read = (p) => { try { return JSON.parse(readFileSync(new URL(`../web/data/${p}`, import.meta.url))); } catch { return null; } };
const date = new Date().toISOString().slice(0, 10);

const scar = read("scarcities.json");
const knownTickers = [...new Set((scar?.scarcities || []).flatMap((s) => s.tickers || []))];

// Budget knobs (D-cadence/budget): keep a weekly sweep bounded + cheap. Tunable via repo variables.
const maxSearches = Math.max(1, Number(process.env.SCOUT_MAX_SEARCHES) || 12);
const maxCandidates = Math.max(1, Number(process.env.SCOUT_MAX_CANDIDATES) || 6);
const minPhrases = Math.max(1, Number(process.env.SCOUT_MIN_PHRASES) || 2);

const providers = availableProviders();
if (!providers.length) { console.log("scout: skipped — no LLM key set"); process.exit(0); }

// Same committee wiring as research-run: liveness probe → independent chair + live seats.
const frontier = providers.find((p) => p === "anthropic" || p === "openai") || null;
const probes = await probeProviders(providers);
const live = Object.fromEntries(probes.map((r) => [r.provider, r.ok]));
for (const r of probes) console.log(`  ${r.ok ? "✓" : "✗"} ${r.provider} ${r.ok ? "live" : "DOWN — " + r.error}`);
const plan = planCommittee(providers);
const seats = plan.seats.map((s) => (live[s.provider] === false && frontier && live[frontier] ? seatCaller(frontier, null) : seatCaller(s.provider, s.model)));
const chair = plan.chair && live[plan.chair.provider] ? seatCaller(plan.chair.provider, plan.chair.model) : null;
console.log(`scout: committee chair=${plan.chair?.provider} | budget: ${maxSearches} searches, ${maxCandidates} candidates, minPhrases=${minPhrases}`);

// Real FTS sweep: wrap searchFts (pure parse already tested) + be polite to SEC between calls.
// 350ms between calls (was 150) — EDGAR FTS sheds load with transient 500s when hit too fast; the
// gap + searchFts's built-in 5xx retry together stop a phrase being silently dropped.
const searchPhrase = async (phrase) => { const hits = await searchFts(phrase); await new Promise((r) => setTimeout(r, 350)); return hits; };

// The committee IS the gate (committee-first, SCOUT-DESIGN): gather light evidence for the draft, run
// the adversarial seats + CIO, and approve only a confident, changed call (mirrors proposeScarcityEdits).
const evaluate = async (draft) => {
  let news = [];
  try { news = await newsForQuery(draft.scarcity, { limit: 4 }); } catch { /* evidence is best-effort */ }
  const evidence = buildEvidenceBundle({ scarcity: draft, news });
  const memo = await runCommittee({ scarcity: draft, evidence, seats, chair });
  if (!memo.cio) return { approved: false, reason: `no committee response${memo.errors.length ? `: ${memo.errors[0]}` : ""}` };
  const edit = sanitizeEdit(draft, memo.cio);
  // A scout lead is worth surfacing if the committee gives it a confident read; the human still
  // approves admission to the watchlist (F9). We do NOT require "changed" here (it's a NEW scarcity).
  if (!edit || (edit.confidence ?? 0) < 0.5) return { approved: false, reason: `low committee confidence (${edit?.confidence ?? 0})` };
  return { approved: true, proposal: { ...edit, scarcity: draft.scarcity, dispersion: memo.dispersion, complaining_filer: draft.complaining_filer } };
};

// Discover public proxies for an inferred input/topic (reuses the chokepoint-discovery FTS path).
const discover = async (term) => { try { return (await discoverProxies([term], { max: 3 })).proxies.map((p) => p.ticker); } catch { return []; } };
// BOM-ladder prompt: ask the chair model for UPSTREAM dependencies of a known scarcity (one layer up).
const bomPrompt = (s) => `Supply-chain laddering. The scarcity "${s.scarcity}" (${s.thesis || ""}) is a KNOWN bottleneck. ` +
  `List 2-3 UPSTREAM inputs THIS scarcity itself critically depends on — the material/component/equipment one layer up that, ` +
  `if it became constrained, would bottleneck "${s.scarcity}". Format each as "input — one-line why". GENERIC inputs only ` +
  `(no company names, no products we'd already track). If nothing non-obvious, return nothing.`;
const DEFAULT_ARXIV_QUERIES = ["cryogenic CMOS", "rare earth separation", "solid state cooling", "neutron detector", "photonic interconnect", "advanced packaging substrate"];

// Which engines run this sweep (default the two filing-grounded, high-signal ones; arXiv is opt-in).
const engines = (process.env.SCOUT_ENGINES || "constraint-shadow,bom-ladder").split(",").map((s) => s.trim()).filter(Boolean);
const maxSeeds = Math.max(1, Number(process.env.SCOUT_MAX_SEEDS) || 6);
const maxPerSeed = Math.max(1, Number(process.env.SCOUT_MAX_PER_SEED) || 2);

try {
  const leads = [], errors = [];
  if (engines.includes("constraint-shadow")) {
    // D1 search gate: only HUMAN-APPROVED phrases (web/data/scout-phrases.json); else the seed list.
    const phraseDoc = read("scout-phrases.json");
    const phrases = approvedPhrases(phraseDoc, { fallback: DEFAULT_CONSTRAINT_PHRASES });
    const approvedCount = (phraseDoc?.phrases || []).filter((p) => p.status === "approved").length;
    const r = await constraintShadowLeads({ phrases, knownTickers, minPhrases, maxSearches, maxCandidates, searchPhrase });
    leads.push(...r.leads); errors.push(...r.errors);
    console.log(`scout[constraint-shadow]: ${r.phrasesSearched} ${approvedCount ? "approved" : "seed"} phrases → ${r.leads.length} lead(s), dropped ${r.droppedKnown} known`);
  }
  if (engines.includes("bom-ladder") && chair) {
    const r = await bomLadderLeads({ scarcities: scar.scarcities, propose: (s) => chair(bomPrompt(s)), discover, knownTickers, maxSeeds, maxPerSeed });
    leads.push(...r.leads); errors.push(...r.errors);
    console.log(`scout[bom-ladder]: ${r.leads.length} upstream lead(s) from ${Math.min(maxSeeds, scar.scarcities.length)} seed scarcities`);
  }
  if (engines.includes("arxiv")) {
    const r = await arxivLeads({ queries: DEFAULT_ARXIV_QUERIES, search: (q) => searchArxiv(q), discover, maxQueries: maxSearches });
    leads.push(...r.leads); errors.push(...r.errors);
    console.log(`scout[arxiv]: ${r.leads.length} research-signal lead(s)`);
  }

  // D2 memory: suppress previously-rejected leads (unchanged evidence) → committee → survivors.
  const seenDoc = read("scout-seen.json") || { schema_version: 1, seen: {} };
  const ev = await evaluateLeads(leads, { evaluate, maxCandidates, seenState: seenDoc });
  errors.push(...ev.errors);
  const out = { proposals: ev.proposals, considered: ev.considered, errors,
    health: { engines, leads: leads.length, suppressed: ev.suppressed.length, candidates: leads.length, proposals: ev.proposals.length, errors: errors.length } };
  console.log(`scout: ${leads.length} lead(s) → ${ev.suppressed.length} suppressed (seen) → ${ev.proposals.length} proposal(s). errors=${errors.length}`);
  for (const e of errors) console.log(`  ⚠ ${e}`);

  // D2 persistence: record this run's verdicts so a rejected candidate isn't re-proposed next week
  // (unless its evidence_hash changes). proposals→"proposed", committee-rejected→"rejected".
  const idHash = {}; for (const L of leads) idHash[draftFromLead(L).id] = leadEvidenceHash(L);
  const seen = { ...seenDoc.seen };
  for (const c of ev.considered) if (idHash[c.id]) seen[c.id] = { status: "rejected", evidence_hash: idHash[c.id], updated: date };
  for (const p of ev.proposals) if (idHash[p.id]) seen[p.id] = { status: "proposed", evidence_hash: idHash[p.id], updated: date };
  mkdirSync(new URL("../web/data/", import.meta.url), { recursive: true });
  writeFileSync(new URL("../web/data/scout-seen.json", import.meta.url), JSON.stringify({ schema_version: 1, updated: date, seen }, null, 2) + "\n");

  // Publish to the SEPARATE scout feed (D3) — distinct from the committee's re-scores of the known 24.
  writeFileSync(new URL("../web/data/scout-candidates.json", import.meta.url),
    JSON.stringify({ schema_version: 1, generated: date, chair: plan.chair?.provider || null, health: out.health, candidates: out.proposals, considered: out.considered }, null, 2) + "\n");
  console.log(`scout: wrote web/data/scout-candidates.json (${out.proposals.length} candidate scarcities for human review)`);
} catch (e) {
  console.log(`scout: errored (non-fatal): ${e.message}`);
}
