#!/usr/bin/env node
// Scout D1: generate candidate CONSTRAINT phrases with the frontier model, merge them into
// web/data/scout-phrases.json as `pending`, and commit for HUMAN review. A generated phrase NEVER
// triggers a SEC search until a human approves it on the Scout tab (vet-before-search gate). Run
// occasionally (workflow_dispatch), NOT every weekly sweep — the approved list is cached. Best-effort:
// any hiccup logs and exits 0. The DECISION logic is the pure, tested scout.mjs; this just does I/O.
import { readFileSync, writeFileSync } from "node:fs";
import { availableProviders, seatCaller } from "./lib/llm.mjs";
import { generateConstraintPhrases, mergePhraseDoc } from "./lib/scout.mjs";

const url = (p) => new URL(`../web/data/${p}`, import.meta.url);
const read = (p) => { try { return JSON.parse(readFileSync(url(p))); } catch { return null; } };
const today = new Date().toISOString().slice(0, 10);
const count = Math.max(4, Number(process.env.SCOUT_PHRASE_COUNT) || 18);

const providers = availableProviders();
// Generate on the strongest synthesizer (the frontier chair), matching the committee's lead model.
const gen = providers.find((p) => p === "anthropic" || p === "openai") || providers[0];
if (!gen) { console.log("scout-phrases: skipped — no LLM key set"); process.exit(0); }

try {
  const complete = seatCaller(gen, null);
  const phrases = await generateConstraintPhrases({ complete, count });
  if (!phrases.length) { console.log("scout-phrases: model returned no usable phrases (left existing list unchanged)"); process.exit(0); }
  const prev = read("scout-phrases.json");
  const doc = mergePhraseDoc(prev, phrases, { today });
  const pending = doc.phrases.filter((p) => p.status === "pending").length;
  const approved = doc.phrases.filter((p) => p.status === "approved").length;
  writeFileSync(url("scout-phrases.json"), JSON.stringify({ ...doc, generated: today, generator: gen }, null, 2) + "\n");
  console.log(`scout-phrases: generated ${phrases.length} via ${gen} → ${pending} pending / ${approved} approved total. Approve on the Scout tab before they're searched.`);
} catch (e) {
  console.log(`scout-phrases: errored (non-fatal): ${e.message}`);
}
