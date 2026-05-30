// Research LLM prompts — VERSIONED so they improve over time and we can tell which
// prompt version produced which proposal (and whether newer prompts are better-
// calibrated, judged by the scorecard). The research loop re-derives each scarcity's
// priced_in/bind_window/confidence from current evidence; prompts are anchored to the
// objective and the F9 ownership rule (the bot may NEVER touch thesis/tickers).
export const RESEARCH_PROMPT_VERSION = 1;

const OBJECTIVE = "Objective: maximize 10-year return while keeping max drawdown < 35% (best Calmar/Sortino).";
const OWNERSHIP = "You may ONLY propose: priced_in (low|medium|high|crowded), bind_window (now|2027|2028-29|2030+|physics-floor), non_consensus (bool), confidence (0..1), rationale, sources[]. NEVER change thesis, tickers, id, or sector.";

const calib = (sc) => sc?.hit_rate != null
  ? `Calibration prior: the system's per-name tilt hit-rate is ${(sc.hit_rate * 100).toFixed(0)}% over ${sc.total?.n || 0} resolved calls — be appropriately humble; do not assert high confidence the track record doesn't support.`
  : "Calibration prior: no resolved track record yet — keep confidence modest (<=0.6).";

export function deepDivePrompt(scarcity, evidence = {}, scorecard = null) {
  return [
    `You are a structural-tech-scarcity research analyst. ${OBJECTIVE}`,
    `Reassess ONE scarcity from current evidence and propose updated fields as STRICT JSON only.`,
    OWNERSHIP, calib(scorecard),
    `Current state: ${JSON.stringify({ id: scarcity.id, scarcity: scarcity.scarcity, priced_in: scarcity.priced_in, bind_window: scarcity.bind_window, non_consensus: scarcity.non_consensus, thesis: scarcity.thesis })}`,
    `Evidence (quotes/de-rating/news/filings): ${JSON.stringify(evidence).slice(0, 8000)}`,
    `Output JSON: {"priced_in":...,"bind_window":...,"non_consensus":...,"confidence":0..1,"rationale":"...","sources":["..."]}`,
  ].join("\n");
}

export function redTeamPrompt(scarcity, proposal) {
  return [
    `You are a skeptical red-team (a different model than the analyst). Attack this proposed reassessment of "${scarcity.scarcity}".`,
    `Which claims are over-stated, already-priced, unsupported by the evidence, or a momentum/whipsaw artifact? Should confidence be lower?`,
    `Proposal: ${JSON.stringify(proposal)}`,
    `Reply with 3-5 sharp bullets.`,
  ].join("\n");
}

export function synthesisPrompt(scarcity, proposal, critique) {
  return [
    `Reconcile the analyst proposal with the red-team critique into a FINAL proposed edit. ${OWNERSHIP}`,
    `If the critique lands, lower confidence or revert toward the current state.`,
    `Proposal: ${JSON.stringify(proposal)}`,
    `Critique: ${critique}`,
    `Output the same STRICT JSON shape only.`,
  ].join("\n");
}
