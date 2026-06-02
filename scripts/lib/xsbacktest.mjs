// G6 — cross-sectional signal backtest: does the alpha signal actually predict forward relative
// performance, measured on HISTORY (not just the slow live ledger)? Pure ESM, no deps.
//
// The signal under test is the price-derived RELATIVE STRENGTH that drives de-rating/inflecting:
// at each rebalance date, each scarcity basket's trailing return minus the deep-tech build-out complex's trailing
// return. The hypothesis (ALPHA.md Edge 3 + the de-rating thesis) is that trailing relative strength
// predicts FORWARD relative return. We walk the history, pair (signal, forward-relative-return) across
// all baskets × dates, and report the rank IC + sign hit-rate with a confidence interval.
//
// HONESTY CAVEAT (baked into every result, per the adversarial review): the basket→ticker membership is
// the CURRENT map (we lack point-in-time membership), so the universe carries selection/survivorship bias
// — the IC here is an UPPER BOUND on the real edge, not an unbiased estimate. Prices ARE point-in-time
// (trailing windows never peek past the rebalance date; forward windows are strictly future). It evidences
// whether the signal LOGIC has worked on these names — the live ledger remains the unbiased confirmation.

// Equal-weight basket return over [i-lookback, i] using only tickers priced at both ends (fixed membership).
function trailingRel(seriesByTicker, tickers, i, lookback) {
  const rs = [];
  for (const t of tickers || []) {
    const s = seriesByTicker[t]; if (!s) continue;
    const a = s.closes[i - lookback], b = s.closes[i];
    if (a > 0 && b > 0) rs.push(b / a - 1);
  }
  return rs.length ? rs.reduce((x, y) => x + y, 0) / rs.length : null;
}

export function pearson(xs, ys) {
  const n = xs.length; if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return (sxx > 0 && syy > 0) ? sxy / Math.sqrt(sxx * syy) : null;
}

// Rank transform (average ranks) → Spearman via pearson(rank(x),rank(y)); robust to outliers/heavy tails.
function ranks(v) {
  const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const r = Array(v.length);
  for (let k = 0; k < idx.length;) {
    let j = k; while (j + 1 < idx.length && idx[j + 1][0] === idx[k][0]) j++;
    const avg = (k + j) / 2 + 1;
    for (let m = k; m <= j; m++) r[idx[m][1]] = avg;
    k = j + 1;
  }
  return r;
}

// Align every series onto a UNION date axis (ragged histories OK — a late IPO is simply `undefined`
// before it lists, and trailingRel skips any ticker lacking a price at a window end). Requires `dates`.
function alignToUnion(seriesByTicker) {
  const all = new Set();
  for (const s of Object.values(seriesByTicker || {})) for (const d of s?.dates || []) all.add(d);
  const dates = [...all].sort();
  const aligned = {};
  for (const [t, s] of Object.entries(seriesByTicker || {})) {
    if (!s?.dates || !s?.closes) continue;
    const m = new Map(s.dates.map((d, i) => [d, s.closes[i]]));
    aligned[t] = { closes: dates.map((d) => m.get(d)) };
  }
  return { dates, aligned };
}

// Main: walk forward, collect (signal, forwardRel) pairs, report IC + hit-rate. `groups` = [{id, tickers}].
// Each series MUST carry { dates, closes }; series are aligned by date before the positional walk.
export function crossSectionalBacktest(rawSeries, groups, complexTickers, { lookback = 63, horizon = 42, step = 21 } = {}) {
  const { dates, aligned: seriesByTicker } = alignToUnion(rawSeries);
  const N = dates.length;
  if (!N || N < lookback + horizon + step) return null;
  const sig = [], fwd = [];
  for (let i = lookback; i + horizon < N; i += step) {
    const cTrail = trailingRel(seriesByTicker, complexTickers, i, lookback);
    const cFwd = trailingRel(seriesByTicker, complexTickers, i + horizon, horizon);
    if (cTrail == null || cFwd == null) continue;
    for (const g of groups || []) {
      const gTrail = trailingRel(seriesByTicker, g.tickers, i, lookback);
      const gFwd = trailingRel(seriesByTicker, g.tickers, i + horizon, horizon);
      if (gTrail == null || gFwd == null) continue;
      sig.push(gTrail - cTrail);          // trailing relative strength (the signal)
      fwd.push(gFwd - cFwd);              // forward relative return (the outcome)
    }
  }
  if (sig.length < 12) return null;
  const ic = pearson(ranks(sig), ranks(fwd));          // rank IC (Spearman)
  let hits = 0, scored = 0;
  for (let k = 0; k < sig.length; k++) { if (sig[k] === 0) continue; scored++; if (Math.sign(sig[k]) === Math.sign(fwd[k])) hits++; }
  const hit_rate = scored ? hits / scored : null;
  // approx 95% CI on the hit-rate (Wald) — wide at small n, which is the point.
  const se = scored ? Math.sqrt((hit_rate * (1 - hit_rate)) / scored) : null;
  return {
    n: sig.length, ic: ic == null ? null : +ic.toFixed(3),
    hit_rate: hit_rate == null ? null : +hit_rate.toFixed(3),
    hit_rate_ci95: se == null ? null : [+(hit_rate - 1.96 * se).toFixed(3), +(hit_rate + 1.96 * se).toFixed(3)],
    horizon, lookback, step,
    caveat: "current-membership universe (selection/survivorship bias) → IC is an UPPER BOUND; prices are point-in-time; live ledger is the unbiased confirmation.",
  };
}
