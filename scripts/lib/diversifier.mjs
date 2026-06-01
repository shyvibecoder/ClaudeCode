// DIVERSIFIER SCOUT — Stage 1 (the quantitative, BOOK-AWARE screen). The AI-capex Scout hunts supply-
// CONSTRAINED chokepoints; the second axis is the opposite — defensive DEMAND sleeves held to LOWER the
// book's drawdown. Those can't be found by constraint-shadow, so we screen a candidate universe through
// the same axis-check gate AND against the plan you already hold: a sleeve qualifies when it has low
// market beta, a NON-positive AI-capex loading (it must not amplify the build-out it's meant to hedge),
// a contained drawdown, AND it actually lowers the *combined* drawdown of the current plan (a sleeve that
// duplicates planned exposure — e.g. water when FIW is already planned — barely moves it, and surfaces
// as low ddReduction). Pure + read-only: given price series it ranks candidates and writes nothing.
// Stages 2 (committee conviction) and 3 (sleeve-budget → plan PR) build on this; this stage can't touch
// the AI-capex feed, the plan, or any shared file (collision-safe by construction).
import { basketStats, aiCapexLoading, blendIndex } from "./axis.mjs";
import { gateAiCapex } from "./scout.mjs";

// Candidate universe — defensive equity sleeves to screen. Deliberately NOT AI-narrative names. Edit here
// to widen the funnel; the SCREEN (not this list) decides what actually qualifies as a diversifier.
export const DIVERSIFIER_UNIVERSE = [
  { id: "health-defensive", sector: "Health", scarcity: "Defensive health demand (pharma / devices)", tickers: ["JNJ", "PFE", "MRK", "ABT", "MDT"] },
  { id: "water-climate", sector: "Climate-adaptation", scarcity: "Water / climate-adaptation infrastructure", tickers: ["PHO", "AWK", "WTRG"] },
  { id: "consumer-staples", sector: "Consumer staples", scarcity: "Consumer staples (inelastic demand)", tickers: ["PG", "KO", "PEP", "COST", "WMT"] },
  { id: "regulated-utilities", sector: "Utilities", scarcity: "Regulated utilities (rate-base)", tickers: ["NEE", "DUK", "SO", "D", "AEP"] },
  { id: "waste-environmental", sector: "Environmental services", scarcity: "Waste / environmental services (local monopolies)", tickers: ["WM", "RSG", "WCN"] },
  { id: "discount-retail", sector: "Consumer defensive", scarcity: "Discount / trade-down retail", tickers: ["DG", "DLTR", "TJX"] },
];

// Screen one candidate sleeve. Returns the full metric row + a qualify decision with a human reason.
// `qualifies` requires ALL of: gate pass (aiβ not positive), market beta ≤ betaMax, maxDD ≤ cap. When
// `planTickers` is supplied we ALSO compute the incremental drawdown reduction the sleeve gives the plan
// (planMaxDD − blendedMaxDD); a non-positive value means the sleeve is redundant with what's already held.
export function screenCandidate(seriesByTicker, c, marketTickers, complexTickers, { planTickers = [], aiBetaMax = 0.3, betaMax = 0.95, maxDDCap = 0.5, minDays = 60 } = {}) {
  const base = { id: c.id, sector: c.sector, scarcity: c.scarcity, tickers: c.tickers };
  const stats = basketStats(seriesByTicker, c.tickers);
  const load = aiCapexLoading(seriesByTicker, c.tickers, marketTickers, complexTickers, { aiBetaMax, minDays });
  if (!stats || !load) return { ...base, qualifies: false, reason: "insufficient price history" };

  const gate = gateAiCapex(load, { axis: "diversifier", aiBetaMax });
  const lowBeta = load.marketBeta <= betaMax;
  const ddOk = stats.maxDD <= maxDDCap;

  // Book-awareness: exact-ticker overlap with the plan, and the incremental drawdown reduction from
  // blending this sleeve 50/50 with the planned book (the sectoral-redundancy signal — e.g. water vs FIW).
  const heldOverlap = (c.tickers || []).filter((t) => planTickers.includes(t));
  let planMaxDD = null, blendedMaxDD = null, ddReduction = null;
  if (planTickers.length) {
    const planStats = basketStats(seriesByTicker, planTickers);
    const blend = blendIndex(seriesByTicker, [planTickers, c.tickers]);
    const blendStats = blend.closes.length ? basketStats({ B: { dates: blend.dates, closes: blend.closes } }, ["B"]) : null;
    if (planStats && blendStats) {
      planMaxDD = planStats.maxDD;
      blendedMaxDD = blendStats.maxDD;
      ddReduction = +(planMaxDD - blendedMaxDD).toFixed(4); // positive = adding this sleeve lowers the plan's drawdown
    }
  }

  const qualifies = gate.pass && lowBeta && ddOk;
  const reason = !gate.pass ? gate.reason
    : !lowBeta ? `market beta ${load.marketBeta} > ${betaMax} (moves too much with the market to diversify)`
    : !ddOk ? `maxDD ${(stats.maxDD * 100).toFixed(0)}% > ${(maxDDCap * 100).toFixed(0)}% cap`
    : heldOverlap.length ? `qualifies, but overlaps planned holdings (${heldOverlap.join(", ")}) — net the overlap before sizing`
    : ddReduction != null && ddReduction <= 0 ? "qualifies on the gate, but adds ~no drawdown reduction vs the current plan (redundant exposure)"
    : "qualifies — low-beta, non-amplifying, lowers the plan's drawdown";

  return {
    ...base,
    years: stats.years, cagr: stats.cagr, maxDD: stats.maxDD, sharpe: stats.sharpe,
    marketBeta: load.marketBeta, mktBeta: load.marketBeta, // marketBeta is canonical; mktBeta is the display alias the radar reads
    aiBeta: load.aiBeta, aiT: load.aiT,
    heldOverlap, planMaxDD, blendedMaxDD, ddReduction,
    gate, qualifies, reason,
  };
}

// Screen the whole universe and RANK: qualifiers first, then — since the sleeve's JOB is lowering the
// plan's drawdown — by the largest incremental drawdown reduction, then best Sharpe, then lowest maxDD.
// (With no plan supplied, ddReduction is null for all, so it falls through to Sharpe.) Ties broken by id
// so output is deterministic/stable.
export function screenDiversifiers(seriesByTicker, universe, marketTickers, complexTickers, opts = {}) {
  const rows = (universe || []).map((c) => screenCandidate(seriesByTicker, c, marketTickers, complexTickers, opts));
  return rows.sort((a, b) =>
    (b.qualifies ? 1 : 0) - (a.qualifies ? 1 : 0) ||
    (b.ddReduction ?? -Infinity) - (a.ddReduction ?? -Infinity) ||
    (b.sharpe ?? -Infinity) - (a.sharpe ?? -Infinity) ||
    (a.maxDD ?? Infinity) - (b.maxDD ?? Infinity) ||
    a.id.localeCompare(b.id));
}
