// F6: make the 9-month DCA calendar MACHINE-READABLE (it was prose-only in
// POSITION-SIZING.md). Derived deterministically from each holding's tier rule
// (portfolio.json `tiers`), so it stays in sync with the plan. The planned-vs-
// DEPLOYED *view* (v4) compares this against positions.local.json over time.
import { writeFileSync } from "node:fs";

const round = (x) => Math.round(x);
const split = (amount, months) => {
  // even split across the given month indices, integer dollars, remainder on last
  const per = Math.floor(amount / months.length);
  const o = {}; let used = 0;
  months.forEach((m, i) => { const v = i === months.length - 1 ? amount - used : per; o[`m${m}`] = round(v); used += per; });
  return o;
};

// Tier -> deployment schedule as fractions of target (now + months 1..9).
export function scheduleFor(tier, target) {
  const t = target || 0;
  if (tier === "A" || tier === "D") return { now: round(t) };
  if (tier === "B") return { now: round(t * 0.5), ...split(round(t * 0.5), [1, 2, 3]) };
  if (tier === "C") return { now: round(t * 0.25), ...split(round(t * 0.75), [1, 2, 3, 4, 5, 6, 7, 8, 9]) };
  return { now: 0 }; // DRY / held for triggers
}

export function buildDcaPlan(portfolio, today) {
  const holdings = {};
  for (const h of portfolio.holdings) {
    holdings[h.ticker] = { tier: h.tier, target_usd: h.target_usd, account: h.account, schedule: scheduleFor(h.tier, h.target_usd) };
  }
  return {
    schema_version: 1,
    updated: today,
    note: "Planned DCA schedule derived from portfolio tiers (A/D=100% now; B=50% now+m1-3; C=25% now+m1-9; DRY=held). Deployed side comes from positions.local.json (v4 view).",
    holdings,
  };
}

export function writeDcaPlan(url, portfolio, today) {
  const plan = buildDcaPlan(portfolio, today);
  writeFileSync(url, JSON.stringify(plan, null, 2) + "\n");
  return plan;
}
