// Free, keyless SEC EDGAR watcher. Lists recent material filings (8-K / 10-Q /
// 10-K / 6-K / 20-F) per company and decodes 8-K item codes into human labels,
// so the scanner can surface backlog / capacity / guidance / pricing events for
// each holding. SEC requires a descriptive User-Agent with contact info (else 403)
// and asks for < 10 req/s — we send a UA and sleep between calls.
// Override the UA with SEC_USER_AGENT (e.g. "Your Name you@email.com").

const UA = process.env.SEC_USER_AGENT
  || "puck-scarcity-radar (github.com/shyvibecoder/deep-tech-market-research)";
const HEADERS = { "user-agent": UA, accept: "application/json" };

// The high-signal 8-K item codes for this thesis (backlog/capacity/guidance/deals).
const ITEM_LABELS = {
  "1.01": "Material agreement",
  "1.02": "Termination of material agreement",
  "2.01": "Completed acquisition/disposition",
  "2.02": "Results / guidance",
  "2.03": "New material debt",
  "2.05": "Costs from exit/disposal",
  "3.02": "Unregistered equity sale",
  "5.02": "Exec/board change",
  "7.01": "Reg FD disclosure",
  "8.01": "Other material event",
};

const WATCH_FORMS = new Set(["8-K", "8-K/A", "10-Q", "10-Q/A", "10-K", "10-K/A", "6-K", "20-F", "20-F/A"]);

let _tickerMap = null;
// ticker -> zero-padded 10-digit CIK, from SEC's public company_tickers.json.
export async function loadTickerMap() {
  if (_tickerMap) return _tickerMap;
  const r = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: HEADERS, signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`company_tickers ${r.status}`);
  const j = await r.json();
  const map = {};
  for (const row of Object.values(j)) {
    if (row?.ticker) map[String(row.ticker).toUpperCase()] = String(row.cik_str).padStart(10, "0");
  }
  _tickerMap = map;
  return map;
}

// Recent watched-form filings for one ticker within the lookback window.
export async function recentFilings(ticker, { sinceDays = 21, map } = {}) {
  const T = ticker.toUpperCase();
  const cik = (map || await loadTickerMap())[T];
  if (!cik) return { ticker: T, cik: null, filings: [], skipped: true };
  const r = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
    headers: HEADERS, signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`submissions ${r.status}`);
  const rec = (await r.json())?.filings?.recent;
  if (!rec?.accessionNumber) return { ticker: T, cik, filings: [] };
  const cutoff = Date.now() - sinceDays * 86400000;
  const filings = [];
  for (let i = 0; i < rec.accessionNumber.length; i++) {
    const form = rec.form[i];
    if (!WATCH_FORMS.has(form)) continue;
    const date = rec.filingDate[i];
    if (new Date(date).getTime() < cutoff) continue;
    const acc = rec.accessionNumber[i].replace(/-/g, "");
    const items = (rec.items?.[i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    filings.push({
      ticker: T, form, date,
      items: items.map((c) => ITEM_LABELS[c] || c),
      url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc}/${rec.primaryDocument[i] || ""}`,
    });
  }
  return { ticker: T, cik, filings };
}

// Watch a list of tickers; returns newest-first filings plus skipped/errored lists.
export async function watchFilings(tickers, opts = {}) {
  let map;
  try { map = await loadTickerMap(); }
  catch (e) { return { filings: [], skipped: [], errors: [`edgar tickermap: ${e.message}`] }; }
  const filings = [], skipped = [], errors = [];
  for (const t of [...new Set(tickers)]) {
    try {
      const r = await recentFilings(t, { ...opts, map });
      if (r.skipped) skipped.push(r.ticker);
      else filings.push(...r.filings);
    } catch (e) { errors.push(`edgar ${t}: ${e.message}`); }
    await new Promise((res) => setTimeout(res, 150)); // polite to SEC
  }
  filings.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { filings, skipped, errors };
}
