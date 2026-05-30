// Research orchestration: deep-dive (model A) → red-team (model B) → synthesis (A),
// gated and sanitized so the bot can ONLY propose F9-owned fields with enough
// confidence. LLM functions are INJECTED, so the logic is fully unit-testable without
// network/keys (in prod they're bound to the free providers).
import { deepDivePrompt, redTeamPrompt, synthesisPrompt, RESEARCH_PROMPT_VERSION } from "./research-prompts.mjs";

const PRICED = ["low", "medium", "high", "crowded"];
const BIND = ["now", "2027", "2028-29", "2030+", "physics-floor"];

export function parseProposal(text) {
  if (typeof text !== "string") return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

// Enforce F9 ownership in CODE: keep only bot-owned, validated fields. Never thesis/tickers/id.
export function sanitizeEdit(scarcity, raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  if (PRICED.includes(raw.priced_in)) out.priced_in = raw.priced_in;
  if (BIND.includes(raw.bind_window)) out.bind_window = raw.bind_window;
  if (typeof raw.non_consensus === "boolean") out.non_consensus = raw.non_consensus;
  out.confidence = typeof raw.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0;
  if (typeof raw.rationale === "string") out.rationale = raw.rationale.slice(0, 600);
  return out;
}

// Ensemble gate: a priced_in reassessment is only robust if INDEPENDENT models agree.
// Take the deep-dive proposal from each model, require a strict majority on priced_in,
// and report the agreement ratio (used to scale confidence). A lone model's call — which
// could be a hallucination — never surfaces on its own. Pure + tested.
export function ensembleConsensus(proposals) {
  const vals = (proposals || []).map((p) => p?.priced_in).filter((v) => PRICED.includes(v));
  if (!vals.length) return { priced_in: null, agreement: 0, n: 0 };
  const counts = {};
  for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  const [top, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return { priced_in: topCount > vals.length / 2 ? top : null, agreement: +(topCount / vals.length).toFixed(2), n: vals.length };
}

const changed = (s, e) =>
  (e.priced_in && e.priced_in !== s.priced_in) ||
  (e.bind_window && e.bind_window !== s.bind_window) ||
  (typeof e.non_consensus === "boolean" && e.non_consensus !== s.non_consensus);

export async function proposeScarcityEdits({ scarcities, evidence = {}, analyst, analysts = null, redteam, scorecard = null, minConfidence = 0.6 }) {
  const pool = analysts && analysts.length ? analysts : (analyst ? [analyst] : []);
  const primary = pool[0];
  const proposals = [];
  for (const s of scarcities) {
    const ev = evidence[s.id] || {};
    // Deep-dive on every model in the pool (one call with a single analyst — unchanged).
    const raws = [];
    for (const fn of pool) { try { raws.push(parseProposal(await fn(deepDivePrompt(s, ev, scorecard)))); } catch { raws.push(null); } }
    let a = raws[0];
    if (!a) continue;
    // Multi-model: require a strict majority on priced_in, else this call isn't robust → skip.
    let ensemble = null;
    if (pool.length >= 2) {
      ensemble = ensembleConsensus(raws);
      if (!ensemble.priced_in) continue;
      a = { ...a, priced_in: ensemble.priced_in }; // the ensemble owns the direction
    }
    let critique = ""; try { critique = await redteam(redTeamPrompt(s, a)); } catch { critique = ""; }
    let finRaw; try { finRaw = parseProposal(await primary(synthesisPrompt(s, a, critique))) || a; } catch { finRaw = a; }
    const edit = sanitizeEdit(s, finRaw);
    if (edit && ensemble) {
      edit.priced_in = ensemble.priced_in;                              // ensemble direction is authoritative
      edit.confidence = +(edit.confidence * ensemble.agreement).toFixed(3); // split models → less confident
      edit.ensemble = { agreement: ensemble.agreement, models: ensemble.n };
    }
    if (edit && edit.confidence >= minConfidence && changed(s, edit)) {
      proposals.push({ id: s.id, ...edit, prompt_version: RESEARCH_PROMPT_VERSION });
    }
  }
  return { proposals, report: buildReport(proposals, scorecard) };
}

export function buildReport(proposals, scorecard) {
  const head = `# Auto-research proposals (prompt v${RESEARCH_PROMPT_VERSION})\n\n` +
    `Tilt hit-rate prior: ${scorecard?.hit_rate != null ? (scorecard.hit_rate * 100).toFixed(0) + "%" : "n/a"}. ` +
    `Human-approved only; bot-owned fields (priced_in/bind_window/non_consensus) per ARCHITECTURE §1.\n`;
  if (!proposals.length) return head + "\nNo changes proposed this run.\n";
  return head + "\n" + proposals.map((p) =>
    `- **${p.id}** → priced_in=${p.priced_in ?? "—"}, bind=${p.bind_window ?? "—"}, non_consensus=${p.non_consensus ?? "—"} (conf ${p.confidence}${p.ensemble ? `, ${Math.round(p.ensemble.agreement * 100)}% of ${p.ensemble.models} models agree` : ""})\n  - ${p.rationale || ""}`
  ).join("\n") + "\n";
}
