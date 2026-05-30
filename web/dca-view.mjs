// DCA progress (F6 view): planned target vs. actually-deployed dollars per holding.
// Deployed = shares × cost_basis (what you've actually put in). Pure (browser+Node).
export function dcaProgress(plan, positions) {
  const holdings = (plan && plan.holdings) || {};
  const out = [];
  for (const [t, h] of Object.entries(holdings)) {
    const p = positions && positions[t];
    const deployed = p && p.shares > 0 && p.cost_basis > 0 ? p.shares * p.cost_basis : 0;
    const target = h.target_usd || 0;
    out.push({ ticker: t, tier: h.tier, target, deployed: Math.round(deployed), pct: target ? Math.min(100, Math.round((deployed / target) * 100)) : 0 });
  }
  return out;
}
