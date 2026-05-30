// Best-effort, keyless forward P/E from Yahoo's quoteSummary. Yahoo increasingly
// crumb-gates these fundamentals endpoints, so this returns null on failure —
// the cost-basis trim rule then falls back to a user-supplied `forward_pe` in
// positions.local.json. Surfacing forward P/E keeps the thesis's key correction
// live: "went up a lot" != "expensive" (e.g. MU at ~10-12x forward).

export async function getForwardPE(ticker) {
  const modules = "summaryDetail,defaultKeyStatistics";
  for (const host of ["query1", "query2"]) {
    try {
      const url = `https://${host}.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}`;
      const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000) });
      if (!r.ok) continue;
      const res = (await r.json())?.quoteSummary?.result?.[0];
      const fpe = res?.summaryDetail?.forwardPE?.raw ?? res?.defaultKeyStatistics?.forwardPE?.raw ?? null;
      if (fpe != null && isFinite(fpe) && fpe > 0) return fpe;
    } catch { /* try next host */ }
  }
  return null;
}

export async function getForwardPEs(tickers) {
  const out = {};
  for (const t of [...new Set(tickers)]) {
    out[t] = await getForwardPE(t);
    await new Promise((res) => setTimeout(res, 150)); // be polite
  }
  return out;
}
