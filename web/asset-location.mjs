// ASSET LOCATION — which account (Roth / Traditional / taxable) should hold each name to maximize
// after-tax terminal value. ADVISORY + transparent; never trades. Pure (browser + Node).
//
// Two robust, rate-arbitrage-agnostic rules (the part of asset location that holds regardless of your exact
// withdrawal-vs-contribution tax bracket):
//   1) SHELTER THE ANNUAL TAX DRAG — high dividend-yield / high-turnover names belong in a tax-advantaged
//      account; tax-efficient names (low yield, low turnover → qualified rates, step-up at death, loss
//      harvesting) belong in TAXABLE.
//   2) WITHIN tax-advantaged, the HIGHEST-EXPECTED-GROWTH names go to ROTH (the biggest balance compounds
//      tax-free forever), the income/lower-growth names to TRADITIONAL (shelter the ordinary-income drag).
// The numbers use explicit assumptions (below) you can override — this is guidance, not a guaranteed
// optimum, and it does NOT model your exact bracket arbitrage, RMDs, or estate plan.

export const DEFAULT_TAX = { ordinary: 0.35, qualified: 0.15, ltcg: 0.15 }; // marginal rates (overridable)
export const TURNOVER_REALIZED = 0.08; // fraction of a tactical sleeve's value realized as gains per year

const isDiv = (h) => h?.axis === "diversifier" || /diversifier|de-correlator/i.test(h?.role || "");

// Per-name tax character. Uses live data where present (dividend_yield), else documented per-axis defaults:
// diversifiers are dividend-heavy + low-growth + low-turnover; the build-out is low-yield + higher-growth,
// and its TACTICAL (IRA-tier) names turn over. All overridable via `overrides[ticker]`.
export function taxProfile(h, { quotes = {}, overrides = {} } = {}) {
  const div = isDiv(h);
  const q = quotes[h.ticker] || {};
  const tactical = h.account === "ira" || /tactical/i.test(h.role || "");
  const base = {
    yieldPct: Number.isFinite(q.dividend_yield) ? q.dividend_yield : (div ? 0.030 : 0.008),
    // Turnover is a SECONDARY shelter driver — kept small so the intrinsic DIVIDEND drag dominates the
    // location decision (turnover is a choice you make INSIDE the tax-advantaged account, not an asset
    // property; a name held in taxable would be held buy-and-hold).
    turnover: tactical ? 0.2 : 0.05,
    growth: div ? 0.04 : 0.09, // expected pre-tax annual growth (defensive vs build-out alpha)
    div,
  };
  return { ...base, ...(overrides[h.ticker] || {}) };
}

// Annual tax drag a name suffers IN A TAXABLE account: dividends taxed yearly at the qualified rate +
// the gains a high-turnover name realizes each year taxed at LTCG. Sheltering it avoids this.
export function annualDragRate(p, tax = DEFAULT_TAX) {
  return p.yieldPct * tax.qualified + p.turnover * TURNOVER_REALIZED * tax.ltcg;
}

// Locate each holding's dollars across accounts to maximize after-tax terminal value. FRACTIONAL: a single
// name can split across accounts, so capacity is always filled exactly — an oversized name never strands
// tax-advantaged room or dumps into taxable (the old whole-name greedy could). `capacities` = {roth,
// traditional, taxable} in $; if roth & traditional aren't both given we run a 2-way (combined
// tax-advantaged vs taxable) split. Returns one row per (ticker × account) allocation with value > 0.
export function locateAssets(holdings, { capacities = {}, tax = DEFAULT_TAX, horizonYears = 20, quotes = {}, overrides = {}, sleeveUsd = 0 } = {}) {
  const cap = { roth: +capacities.roth || 0, traditional: +capacities.traditional || 0, taxable: +capacities.taxable || 0, ira: +capacities.ira || 0 };
  const threeWay = cap.roth > 0 && cap.traditional > 0; // need BOTH split out for a Roth-vs-Traditional decision
  const items = (holdings || [])
    .filter((h) => h && h.ticker && (h.weight > 0 || h.target_usd > 0))
    .map((h) => {
      const value = Number.isFinite(h.target_usd) && h.target_usd > 0 ? h.target_usd : (h.weight || 0) * sleeveUsd;
      const p = taxProfile(h, { quotes, overrides });
      return { ticker: h.ticker, value, yieldPct: p.yieldPct, growth: p.growth, dragRate: annualDragRate(p, tax) };
    });

  const rem = new Map(items.map((it) => [it, it.value]));
  const alloc = []; // { ticker, account, value, yieldPct, growth, dragRate }
  const place = (it, account, amt) => { if (amt > 1e-6) { alloc.push({ ticker: it.ticker, account, value: amt, yieldPct: it.yieldPct, growth: it.growth, dragRate: it.dragRate }); rem.set(it, rem.get(it) - amt); } };
  const fill = (account, budget, order) => { let left = budget; for (const it of order) { if (left <= 1e-6) break; const amt = Math.min(rem.get(it), left); place(it, account, amt); left -= amt; } };
  const byGrowth = [...items].sort((a, b) => b.growth - a.growth);
  const byDrag = [...items].sort((a, b) => b.dragRate - a.dragRate);
  if (threeWay) {
    fill("roth", cap.roth, byGrowth);            // Roth ← highest expected growth (tax-free compounding)
    fill("traditional", cap.traditional, byDrag); // Traditional ← highest dividend/income drag (sheltered)
    for (const it of items) place(it, "taxable", rem.get(it)); // rest → taxable (tax-efficient, qualified rates, step-up)
  } else {
    fill("tax-advantaged", cap.roth + cap.traditional + cap.ira, byDrag);
    for (const it of items) place(it, "taxable", rem.get(it));
  }

  const rows = alloc.map((a) => ({
    ticker: a.ticker, account: a.account, value: Math.round(a.value), yieldPct: a.yieldPct, growth: a.growth,
    drag_rate: +a.dragRate.toFixed(4), annual_drag_avoided: a.account === "taxable" ? 0 : Math.round(a.value * a.dragRate),
  })).sort((a, b) => b.annual_drag_avoided - a.annual_drag_avoided || b.value - a.value);

  const annual = rows.reduce((s, r) => s + r.annual_drag_avoided, 0);
  // Future value of avoiding that yearly dividend drag, as an N-year ordinary annuity reinvested at 6%.
  const horizon_value = +(annual * ((Math.pow(1.06, horizonYears) - 1) / 0.06)).toFixed(0);
  return {
    three_way: threeWay, horizon_years: horizonYears, tax, rows,
    summary: {
      annual_drag_avoided: +annual.toFixed(0),
      horizon_drag_avoided: horizon_value,
      note: threeWay ? "Roth ← highest growth, Traditional ← income/drag, taxable ← tax-efficient." : "Only a combined tax-advantaged balance was given — add Roth + Traditional balances for the full 3-way split.",
    },
  };
}

// Tax-located REBALANCE [D2]: net the committee-aware target against what you ACTUALLY hold (per account) →
// BUY rows (net-new dollars located into AVAILABLE room: Roth←growth, Traditional←income, taxable←efficient)
// and SELL/trim rows (in-place; a taxable lot is buy-and-hold unless its ticker is in `taxableAnchorTrimOk`
// — we don't realize gains just to relocate). All-cash reduces to the deploy plan (held empty → all buys).
// `held` = { ticker: { roth, traditional, taxable, ira } } in $. Pure + deterministic.
export function rebalanceLocated(holdings, { held = {}, capacities = {}, tax = DEFAULT_TAX, taxableAnchorTrimOk = [], quotes = {}, overrides = {} } = {}) {
  const cap = { roth: +capacities.roth || 0, traditional: +capacities.traditional || 0, taxable: +capacities.taxable || 0, ira: +capacities.ira || 0 };
  const threeWay = cap.roth > 0 && cap.traditional > 0;
  const capOf = threeWay ? { roth: cap.roth, traditional: cap.traditional, taxable: cap.taxable } : { "tax-advantaged": cap.roth + cap.traditional + cap.ira, taxable: cap.taxable };
  const accts = Object.keys(capOf);
  const bookTotal = accts.reduce((a, k) => a + capOf[k], 0);
  const normAcct = (k) => k === "taxable" ? "taxable" : (threeWay ? (k === "ira" ? "traditional" : k) : "tax-advantaged");
  const okSet = new Set(taxableAnchorTrimOk);

  const items = (holdings || []).filter((h) => h && h.ticker && h.weight > 0).map((h) => { const p = taxProfile(h, { quotes, overrides }); return { ticker: h.ticker, weight: h.weight, growth: p.growth, yieldPct: p.yieldPct, dragRate: annualDragRate(p, tax) }; });
  const wsum = items.reduce((a, it) => a + it.weight, 0) || 1;
  items.forEach((it) => { it.target = (it.weight / wsum) * bookTotal; });

  const heldA = {}; // ticker -> { acct: $ } (normalized to capOf's account keys)
  for (const t in (held || {})) { heldA[t] = {}; for (const k in held[t]) { const a = normAcct(k); heldA[t][a] = (heldA[t][a] || 0) + (held[t][k] || 0); } }
  const heldTot = (t) => Object.values(heldA[t] || {}).reduce((a, b) => a + b, 0);
  const heldInAcct = {}; accts.forEach((a) => heldInAcct[a] = 0);
  for (const t in heldA) for (const a in heldA[t]) heldInAcct[a] = (heldInAcct[a] || 0) + heldA[t][a];

  const rows = [], buyLegs = [];
  const sellOrder = [...accts].sort((a, b) => (a === "taxable" ? 1 : 0) - (b === "taxable" ? 1 : 0)); // sell tax-advantaged first, taxable last
  const sellName = (t, amount, yieldPct, notInPlan) => {
    let need = amount;
    for (const a of sellOrder) { if (need <= 1) break; const have = Math.round(heldA[t]?.[a] || 0); if (have <= 0) continue; const amt = Math.min(have, need); const blocked = a === "taxable" && !okSet.has(t); rows.push({ ticker: t, account: a, action: blocked ? "hold (taxable anchor — trim bar not met)" : (notInPlan ? "sell (not in plan)" : "trim"), amount: amt, blocked, yieldPct }); need -= amt; }
  };
  for (const it of items) { const d = Math.round(it.target - heldTot(it.ticker)); if (d < -1) sellName(it.ticker, -d, it.yieldPct, false); else if (d > 1) buyLegs.push({ ...it, buy: d }); }
  for (const t in heldA) if (!items.some((it) => it.ticker === t)) sellName(t, Math.round(heldTot(t)), 0, true); // held but dropped from the plan → exit

  // Buys go into AVAILABLE room only: capacity − held + (non-blocked sells that free cash in that account).
  const freed = {}; accts.forEach((a) => freed[a] = 0);
  for (const r of rows) if (!r.blocked && (r.action === "trim" || r.action.startsWith("sell"))) freed[r.account] += r.amount;
  const avail = {}; accts.forEach((a) => avail[a] = Math.max(0, capOf[a] - heldInAcct[a] + freed[a]));
  const rem = new Map(buyLegs.map((b) => [b, b.buy]));
  const fill = (acct, order) => { let left = avail[acct]; for (const b of order) { if (left <= 1) break; const amt = Math.min(rem.get(b), left); if (amt > 1) { rows.push({ ticker: b.ticker, account: acct, action: "buy", amount: Math.round(amt), yieldPct: b.yieldPct, annual_drag_avoided: acct === "taxable" ? 0 : Math.round(amt * b.dragRate) }); rem.set(b, rem.get(b) - amt); left -= amt; } } };
  if (threeWay) { fill("roth", [...buyLegs].sort((a, b) => b.growth - a.growth)); fill("traditional", [...buyLegs].sort((a, b) => b.dragRate - a.dragRate)); fill("taxable", [...buyLegs].sort((a, b) => a.yieldPct - b.yieldPct)); }
  else { fill("tax-advantaged", [...buyLegs].sort((a, b) => b.dragRate - a.dragRate)); fill("taxable", buyLegs); }
  const needs_new_cash = [...rem.values()].reduce((a, b) => a + Math.max(0, b), 0); // buys that didn't fit available room

  const sumOf = (pred) => Math.round(rows.filter(pred).reduce((a, r) => a + r.amount, 0));
  return {
    three_way: threeWay, rows,
    summary: {
      buy_usd: sumOf((r) => r.action === "buy"),
      sell_usd: sumOf((r) => !r.blocked && (r.action === "trim" || r.action.startsWith("sell"))),
      blocked_usd: sumOf((r) => r.blocked),
      needs_new_cash_usd: Math.round(needs_new_cash),
      annual_drag_avoided: rows.reduce((a, r) => a + (r.annual_drag_avoided || 0), 0),
    },
  };
}
