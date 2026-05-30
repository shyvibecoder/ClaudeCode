#!/usr/bin/env node
// The v3 research engine entry: runs the versioned research prompts on the free LLMs
// (deep-dive → red-team → synthesis), gated + sanitized to bot-owned fields, and writes
// a dated proposal report. The workflow opens a PR for HUMAN approval (F9). Best-effort:
// no-op (writes a stub) when no LLM key is set or evidence is missing.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { llm, availableProviders } from "./lib/llm.mjs";
import { proposeScarcityEdits } from "./lib/research.mjs";

const read = (p) => { try { return JSON.parse(readFileSync(new URL(`../web/data/${p}`, import.meta.url))); } catch { return null; } };
const date = new Date().toISOString().slice(0, 10);
const dir = new URL("../research/auto/", import.meta.url);
mkdirSync(dir, { recursive: true });
const write = (name, txt) => writeFileSync(new URL(name, dir), txt);

const scar = read("scarcities.json"); const sig = read("signals.json") || {};
const providers = availableProviders();
if (!scar || !providers.length) {
  write(`${date}.md`, `# Auto-research ${date}\n\nSkipped: ${!providers.length ? "no LLM key set" : "no scarcities"}.\n`);
  console.log("research: skipped (no key or data)"); process.exit(0);
}

// Evidence per scarcity from the latest scan (de-rating signal, its news, quote snapshot).
const newsBy = {}; for (const n of sig.news || []) (newsBy[n.scarcity] ||= []).push({ title: n.title, date: n.date });
const evidence = {};
for (const s of scar.scarcities) {
  evidence[s.id] = {
    de_rating: sig.scarcity_signals?.[s.id] || null,
    news: (newsBy[s.id] || []).slice(0, 4),
    quotes: Object.fromEntries(s.tickers.filter((t) => sig.quotes?.[t] && !sig.quotes[t].error)
      .map((t) => [t, { ytd: sig.quotes[t].ytd, vs200: sig.quotes[t].pct_vs_ma200, mom_1m: sig.quotes[t].mom_1m }])),
  };
}

const analyst = (p) => llm(p, providers[0]);
const redteam = (p) => llm(p, providers[1] || providers[0]); // cross-model when 2 keys
// Ensemble the deep-dive across every available model so a priced_in call needs a strict
// majority to surface (no single-model hallucination). With one key, falls back to the
// single analyst (unchanged behavior).
const analysts = providers.length >= 2 ? providers.map((pr) => (p) => llm(p, pr)) : null;
const { proposals, report } = await proposeScarcityEdits({ scarcities: scar.scarcities, evidence, analyst, analysts, redteam, scorecard: sig.scorecard, minConfidence: 0.6 });
write(`${date}.md`, report);
write(`${date}.proposals.json`, JSON.stringify(proposals, null, 2) + "\n");
console.log(`research: ${proposals.length} proposal(s) written to research/auto/${date}.*`);
