// Free, keyless news via Google News RSS, keyed off each scarcity's thesis terms.
// Returns deduped recent headlines that feed the LLM digest. No API key, no parser
// dependency — a tiny regex RSS reader is enough for title/link/date.

const decode = (s) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
  .trim();

function parseRss(xml, limit) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) && items.length < limit) {
    const b = m[1];
    const title = decode((b.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "");
    const link = decode((b.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "");
    const pub = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "";
    const d = pub ? new Date(pub) : null;
    if (title) items.push({ title, link, date: d && !isNaN(d) ? d.toISOString().slice(0, 10) : null });
  }
  return items;
}

export async function newsForQuery(query, { limit = 5 } = {}) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`news ${r.status}`);
  return parseRss(await r.text(), limit);
}

// One query per scarcity (uses `news_query` if set in scarcities.json, else the
// scarcity label). Deduped across scarcities by title; capped to keep runs cheap.
export async function watchNews(scarcities, { perScarcity = 2, maxTotal = 24 } = {}) {
  const seen = new Set();
  const news = [], errors = [];
  for (const s of scarcities) {
    if (news.length >= maxTotal) break;
    const query = s.news_query || s.scarcity;
    try {
      const items = await newsForQuery(query, { limit: perScarcity + 3 });
      let added = 0;
      for (const it of items) {
        const key = it.title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        news.push({ scarcity: s.id, ...it });
        if (++added >= perScarcity) break;
      }
    } catch (e) { errors.push(`news ${s.id}: ${e.message}`); }
    await new Promise((res) => setTimeout(res, 120));
  }
  return { news, errors };
}
