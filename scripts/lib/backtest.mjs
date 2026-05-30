// Regime backtest: does a trend brake (exit when the basket is below its moving
// average) actually cut drawdown and lift Calmar/Sortino vs. buy-and-hold — on THIS
// basket, with no look-ahead (decisions use yesterday's close vs yesterday's MA)?
// Pure; makes the timing dial's premise falsifiable rather than asserted.
import { portfolioMetrics, maxDrawdown } from "./metrics.mjs";

export function backtestRegime(values, { maPeriod = 200, periodsPerYear = 252 } = {}) {
  if (!Array.isArray(values) || values.length < maPeriod + 2) return null;
  const ma = values.map((_, i) => {
    if (i < maPeriod - 1) return null;
    let s = 0; for (let j = i - maPeriod + 1; j <= i; j++) s += values[j];
    return s / maPeriod;
  });
  const braked = [100], unb = [100], invested = [];
  let switches = 0, prevPos = null;
  for (let i = maPeriod; i < values.length; i++) {
    const pos = (ma[i - 1] != null && values[i - 1] > ma[i - 1]) ? 1 : 0; // decide on prior close (no look-ahead)
    invested.push(pos);
    if (prevPos !== null && pos !== prevPos) switches++;
    prevPos = pos;
    const ret = values[i] / values[i - 1];
    braked.push(braked[braked.length - 1] * (pos ? ret : 1));
    unb.push(unb[unb.length - 1] * ret);
  }
  if (braked.length < 3) return null;
  return {
    ma_period: maPeriod,
    braked: portfolioMetrics(braked, { periodsPerYear }),
    unbraked: portfolioMetrics(unb, { periodsPerYear }),
    dd_reduction: +(maxDrawdown(unb) - maxDrawdown(braked)).toFixed(4),
    whipsaws: switches,
    time_in_market: +(invested.reduce((a, b) => a + b, 0) / invested.length).toFixed(2),
    n: invested.length,
  };
}
