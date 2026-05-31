// Deeper, multi-source research evidence — the substance that makes the research LLMs'
// reasoning comprehensive instead of a headline skim. All PURE + unit-tested; the thin network
// fetchers live in news.mjs / edgar.mjs and feed these. Standing rule: real sources only, cited;
// no fabricated "research" (excerpts/passages are quoted from fetched text, never invented).

const subjectOf = (s) => (s.news_query || s.scarcity || s.id || "").trim();
// Keep the first 1–3 salient words of the subject as the anchor every angle query must include.
const anchorOf = (s) => subjectOf(s).split(/\s+/).slice(0, 3).join(" ");

// Multiple ANGLES per thesis so the search covers the whole causal chain, not one phrasing:
// supply/scarcity, demand/growth, capacity/capex, policy/export-controls, and the base query.
export function thesisQueries(s) {
  const anchor = anchorOf(s) || (s.scarcity || s.id || "");
  const base = subjectOf(s) || anchor;
  const angles = [
    base,
    `${anchor} shortage supply deficit`,
    `${anchor} demand growth forecast`,
    `${anchor} capacity capex expansion investment`,
    `${anchor} export controls policy tariff`,
    `${anchor} bottleneck lead time backlog`,
  ];
  // distinct, non-empty, trimmed
  return [...new Set(angles.map((q) => q.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

// HTML → a clean, capped plain-text excerpt (drops scripts/styles/tags, collapses whitespace).
export function extractExcerpt(html, { maxChars = 600 } = {}) {
  if (!html || typeof html !== "string") return "";
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxChars ? text.slice(0, maxChars).trim() : text;
}

const domainOf = (link) => { try { return new URL(link).hostname.replace(/^www\./, ""); } catch { return `__nolink_${link || ""}`; } };

// Cap items per source domain so one outlet can't dominate the evidence (source diversity).
export function dedupeByDomain(items, { perDomain = 2 } = {}) {
  const counts = {}, out = [];
  for (const it of items || []) {
    const d = domainOf(it.link);
    counts[d] = (counts[d] || 0) + 1;
    if (counts[d] <= perDomain) out.push(it);
  }
  return out;
}

// Extract the relevant PASSAGES of a filing's text: a context window around each keyword hit,
// merged when overlapping, capped. This is how we read 10-K/10-Q substance (MD&A, risk factors)
// without dumping the whole document into the LLM. Quoted verbatim — never paraphrased here.
export function extractPassages(text, keywords, { window = 240, max = 4 } = {}) {
  if (!text || typeof text !== "string" || !keywords?.length) return [];
  const lower = text.toLowerCase();
  const spans = [];
  for (const kw of keywords) {
    const k = String(kw).toLowerCase().trim();
    if (!k) continue;
    let from = 0, idx;
    while ((idx = lower.indexOf(k, from)) !== -1) {
      spans.push([Math.max(0, idx - window), Math.min(text.length, idx + k.length + window)]);
      from = idx + k.length;
      if (spans.length > 200) break; // safety
    }
  }
  if (!spans.length) return [];
  spans.sort((a, b) => a[0] - b[0]);
  // merge overlapping/adjacent spans
  const merged = [spans[0].slice()];
  for (let i = 1; i < spans.length; i++) {
    const last = merged[merged.length - 1];
    if (spans[i][0] <= last[1]) last[1] = Math.max(last[1], spans[i][1]);
    else merged.push(spans[i].slice());
  }
  return merged.slice(0, max).map(([a, b]) => text.slice(a, b).replace(/\s+/g, " ").trim());
}

// Assemble the evidence bundle the research LLM actually reasons over: the live signals it
// previously couldn't see (de-rating / forced-flow / opportunity), news WITH excerpts, filing
// PASSAGES, and the quote snapshot — plus a count so the prompt can state how much it's grounded on.
export function buildEvidenceBundle({ scarcity, signals = null, news = [], filings = [], quotes = {} } = {}) {
  const newsClean = (news || []).map((n) => ({ title: n.title, date: n.date, link: n.link, excerpt: n.excerpt || null }));
  const filingsClean = (filings || []).map((f) => ({ ticker: f.ticker, form: f.form, date: f.date, url: f.url || null, passages: f.passages || [] }));
  return {
    id: scarcity?.id,
    scarcity: scarcity?.scarcity,
    thesis: scarcity?.thesis,
    tickers: scarcity?.tickers || [],
    signals: signals || null,
    news: newsClean,
    filings: filingsClean,
    quotes: quotes || {},
    evidence_count: {
      news: newsClean.length,
      news_with_excerpt: newsClean.filter((n) => n.excerpt).length,
      filings: filingsClean.length,
      filing_passages: filingsClean.reduce((a, f) => a + (f.passages?.length || 0), 0),
    },
  };
}
