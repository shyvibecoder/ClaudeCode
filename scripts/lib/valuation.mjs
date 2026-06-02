// VALUATION leg for the per-name entry read — "is this expensive?", corroborated across TWO sources so a
// single bad/blocked feed can't drive the call (same philosophy as the price corroboration).
//   • EDGAR XBRL companyfacts (keyless, authoritative REPORTED figures) → trailing P/E (price ÷ TTM diluted
//     EPS) + revenue YoY + net margin. Forward P/E isn't recoverable keyless (Yahoo quoteSummary is
//     crumb-gated), so we use authoritative TRAILING earnings instead.
//   • Tiingo fundamentals daily (free key) → its reported peRatio.
// Pure parsers + a corroboration join (reuses marketdata.corroborate). Fetchers are thin and live in the
// scanner; everything here is unit-testable with fixtures (the sandbox can't reach SEC/Tiingo).
import { corroborate } from "./marketdata.mjs";

const REV_CONCEPTS = ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"];
const num = (v) => (Number.isFinite(v) ? v : null);

// Latest ANNUAL value (10-K / fp "FY") for a us-gaap concept; returns { val, end } or null.
function latestAnnual(facts, concept, unit) {
  const arr = facts?.facts?.["us-gaap"]?.[concept]?.units?.[unit];
  if (!Array.isArray(arr)) return null;
  const annual = arr.filter((e) => (e.fp === "FY" || e.form === "10-K") && Number.isFinite(e.val) && e.end);
  if (!annual.length) return null;
  annual.sort((a, b) => (a.end < b.end ? 1 : -1));
  return { val: annual[0].val, end: annual[0].end };
}

// Trailing-twelve-month diluted EPS: sum the 4 most recent distinct ~quarterly values (10-Q, ~3-month
// duration); fall back to the latest annual diluted EPS when quarters aren't cleanly available.
function epsTTM(facts) {
  const arr = facts?.facts?.["us-gaap"]?.EarningsPerShareDiluted?.units?.["USD/shares"];
  if (!Array.isArray(arr)) return null;
  const isQtr = (e) => e.start && e.end && Number.isFinite(e.val) && Math.abs((new Date(e.end) - new Date(e.start)) / 86400000 - 91) <= 25;
  const q = [...new Map(arr.filter(isQtr).map((e) => [e.end, e])).values()].sort((a, b) => (a.end < b.end ? 1 : -1));
  if (q.length >= 4) return +(q.slice(0, 4).reduce((a, e) => a + e.val, 0)).toFixed(2);
  const ann = latestAnnual(facts, "EarningsPerShareDiluted", "USD/shares");
  return ann ? ann.val : null;
}

// Parse EDGAR companyfacts → trailing valuation/fundamentals. `price` = current share price (for P/E).
export function parseEdgarFacts(facts, { price } = {}) {
  const eps = epsTTM(facts);
  const pe = (Number.isFinite(eps) && eps > 0 && Number.isFinite(price) && price > 0) ? +(price / eps).toFixed(1) : null;
  let revC = null; for (const c of REV_CONCEPTS) { if (facts?.facts?.["us-gaap"]?.[c]) { revC = c; break; } }
  const revArr = revC ? facts.facts["us-gaap"][revC].units?.USD : null;
  let revenue_yoy = null, net_margin = null, revNow = null;
  if (Array.isArray(revArr)) {
    const annual = revArr.filter((e) => (e.fp === "FY" || e.form === "10-K") && Number.isFinite(e.val) && e.end).sort((a, b) => (a.end < b.end ? 1 : -1));
    if (annual.length >= 2 && annual[1].val > 0) revenue_yoy = +(annual[0].val / annual[1].val - 1).toFixed(3);
    revNow = annual[0]?.val ?? null;
  }
  const ni = latestAnnual(facts, "NetIncomeLoss", "USD");
  if (ni && revNow > 0) net_margin = +(ni.val / revNow).toFixed(3);
  return { source: "edgar", eps_ttm: eps, pe, revenue_yoy, net_margin };
}

// Parse Tiingo fundamentals/daily rows → latest reported peRatio.
export function parseTiingoFundamentals(rows) {
  if (!Array.isArray(rows) || !rows.length) return { source: "tiingo", pe: null };
  const withPe = rows.filter((r) => Number.isFinite(r?.peRatio) && r.peRatio > 0).sort((a, b) => (a.date < b.date ? 1 : -1));
  return { source: "tiingo", pe: withPe.length ? +withPe[0].peRatio.toFixed(1) : null };
}

// Corroborate the trailing P/E across the sources; carry EDGAR's growth/margin (Tiingo daily lacks them).
// divergence is wider than prices (15%): reported-vs-vendor P/E differ on EPS definitions/timing.
export function corroborateValuation({ edgar = null, tiingo = null } = {}, divergence = 0.15) {
  const c = corroborate({ ...(edgar?.pe ? { edgar: edgar.pe } : {}), ...(tiingo?.pe ? { tiingo: tiingo.pe } : {}) }, divergence);
  if (!c) return null;
  return {
    pe: c.used, sources: c.sources, n: c.n, spread: c.spread, ok: c.ok,
    single_source: c.n < 2,
    revenue_yoy: edgar?.revenue_yoy ?? null,
    net_margin: edgar?.net_margin ?? null,
  };
}

// Label P/E relative to the plan's PEER MEDIAN when given (more honest than absolute thresholds across very
// different businesses); else a crude absolute band. Returns { tag: cheap|fair|rich, label }.
export function valuationLabel(v, { peerMedianPe = null } = {}) {
  const pe = v?.pe;
  if (!Number.isFinite(pe) || pe <= 0) return { tag: null, label: "no P/E" };
  if (Number.isFinite(peerMedianPe) && peerMedianPe > 0) {
    const r = pe / peerMedianPe;
    const tag = r < 0.8 ? "cheap" : r > 1.25 ? "rich" : "fair";
    return { tag, label: `${tag} (${pe}x · ${r.toFixed(2)}× peers)`, ratio: +r.toFixed(2) };
  }
  const tag = pe < 15 ? "cheap" : pe > 30 ? "rich" : "fair";
  return { tag, label: `${tag} (${pe}x)` };
}
