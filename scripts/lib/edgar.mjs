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

// ── CONTENT layer: read filing SUBSTANCE for thesis research (not just a recency list) ──
import { extractExcerpt, extractPassages } from "./research-sources.mjs";

// Expanded form set for thesis evidence: core periodic/8-K + new-entrant (S-1/424B),
// activism (13D/G), and proxy (DEF 14A) forms that signal structural change.
export const WATCH_FORMS_WIDE = new Set([
  "8-K", "8-K/A", "10-Q", "10-Q/A", "10-K", "10-K/A", "6-K", "20-F", "20-F/A",
  "S-1", "S-1/A", "424B4", "424B5", "SC 13D", "SC 13D/A", "SC 13G", "SC 13G/A", "DEF 14A",
]);

// Parse EDGAR full-text-search hits into filing references (ticker/form/date/accession/url),
// newest-first. The FTS _id is "<accession-with-dashes>:<primary-doc>".
export function parseFtsFilings(json) {
  const hits = json?.hits?.hits || [];
  const out = [];
  for (const h of hits) {
    const dn = (h?._source?.display_names || [])[0] || "";
    const m = dn.match(/^(.*?)\s+\(([A-Z0-9.\-]+)\)\s+\(CIK\s*(\d+)/);
    if (!m) continue;
    const [accNoDash = "", doc = ""] = String(h._id || "").split(":");
    const cikNum = Number(m[3] || h._source?.cik || 0);
    const accClean = accNoDash.replace(/-/g, "");
    out.push({
      ticker: m[2], company: m[1].trim(), form: h._source?.form || null,
      date: h._source?.file_date || null, cik: cikNum, accession: accNoDash,
      url: cikNum && accClean ? `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accClean}/${doc}` : null,
    });
  }
  return out.sort((a, b) => (String(a.date) < String(b.date) ? 1 : -1));
}

// Filing text → the relevant thesis passages (delegates to the tested passage extractor).
export function filingTextToPassages(text, keywords, opts = {}) {
  return extractPassages(text, keywords, opts);
}

// Thin fetchers (network; the parsers above are pure + tested).
// Full-text search for a thesis phrase, restricted to substantive forms.
export async function searchFilings(query, { forms = "10-K,10-Q,8-K,S-1,DEF 14A", limit = 10, tries = 3, base = 400, fetchImpl = fetch, sleepImpl = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  // P9: retry 5xx/429 with backoff (parity with edgar-fts.searchFts) — EDGAR FTS transiently sheds
  // load under sequential requests; without this a single 500 silently dropped the filing lookup.
  const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${query}"`)}&forms=${encodeURIComponent(forms)}`;
  let last = "";
  for (let i = 0; i < tries; i++) {
    let r;
    try { r = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) }); }
    catch (e) { last = e.message; if (i < tries - 1) { await sleepImpl(base * 2 ** i); continue; } throw new Error(`fts ${last}`); }
    if (r.ok) return parseFtsFilings(await r.json()).slice(0, limit);
    if (r.status === 429 || r.status >= 500) { last = `fts ${r.status}`; if (i < tries - 1) { await sleepImpl(base * 2 ** i); continue; } }
    throw new Error(`fts ${r.status}`);
  }
  throw new Error(last || "fts failed");
}

// Fetch a filing document and extract the thesis passages from its text.
export async function fetchFilingPassages(filing, keywords, { window = 240, max = 3, maxChars = 400000 } = {}) {
  if (!filing?.url) return [];
  const r = await fetch(filing.url, { headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`filing ${r.status}`);
  const html = (await r.text()).slice(0, maxChars); // cap pathological 10-Ks
  const text = extractExcerpt(html, { maxChars: Number.MAX_SAFE_INTEGER }); // strip HTML, keep full text
  return extractPassages(text, keywords, { window, max });
}
