// Free-LLM abstraction with MULTI-MODEL adversarial review.
//   GEMINI_API_KEY -> Google Gemini (free tier)   [analyst by default]
//   GROQ_API_KEY   -> Groq (free tier, Llama)      [red-team by default]
// If BOTH keys are set, the analyst and red-team passes run on DIFFERENT models,
// so the critique is genuinely adversarial (one model attacks the other's output)
// instead of a model grading itself. With one key, both passes use it.
// This is where the "research / red-team agents" run in CI on free models.

async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    signal: AbortSignal.timeout(60000),
  });
  const j = await r.json();
  return j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callGroq(prompt) {
  const key = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(60000),
  });
  const j = await r.json();
  return j?.choices?.[0]?.message?.content || "";
}

const PROVIDERS = {
  gemini: { env: "GEMINI_API_KEY", label: () => `gemini:${process.env.GEMINI_MODEL || "gemini-2.0-flash"}`, call: callGemini },
  groq: { env: "GROQ_API_KEY", label: () => `groq:${process.env.GROQ_MODEL || "llama-3.3-70b-versatile"}`, call: callGroq },
};

// Providers with a key present, in analyst-first preference order.
export function availableProviders() {
  return Object.keys(PROVIDERS).filter((p) => process.env[PROVIDERS[p].env]);
}
export function llmAvailable() { return availableProviders().length > 0; }

// Call a specific provider (falls back to the first available one).
export async function llm(prompt, provider) {
  const avail = availableProviders();
  const p = provider && avail.includes(provider) ? provider : avail[0];
  return p ? PROVIDERS[p].call(prompt) : "";
}

// Two-pass "analyst + red-team" digest over fresh signals/filings/news.
// Analyst runs on the first available model; red-team on a DIFFERENT model when a
// second free key exists — a true cross-model adversarial review.
export async function analystRedteamDigest({ signals, filings = [], headlines = [], scarcities }) {
  const avail = availableProviders();
  if (!avail.length) return "";
  const analystP = avail[0];
  const redteamP = avail[1] || avail[0];
  const crossModel = analystP !== redteamP;
  const ctx = JSON.stringify({ signals, filings, headlines, scarcities }, null, 0).slice(0, 24000);

  const analyst = await PROVIDERS[analystP].call(
    `You are a markets analyst tracking structural-tech-scarcity theses.\n` +
    `Given this JSON of fresh quotes (incl. forward P/E where available), recent SEC ` +
    `filings (8-K/10-Q items), news headlines, and the scarcity map, write 6-10 terse ` +
    `bullets: what materially changed for any scarcity/holding — prioritize SEC filings ` +
    `that touch backlog, capacity, guidance, or pricing — and whether any deploy/exit ` +
    `trigger looks closer. Note where a name "went up a lot" but is still cheap on ` +
    `forward multiples. Be specific and cite the ticker/scarcity/filing. JSON:\n${ctx}`
  );
  const redteam = await PROVIDERS[redteamP].call(
    `You are a skeptical red-team${crossModel ? ` (a different model than the analyst)` : ""}. ` +
    `Attack this analyst digest: which claims are over-stated, already-priced, or not ` +
    `supported by the data (quotes/filings/news provided)? Keep it to 4-6 sharp bullets.\n\n` +
    `DIGEST:\n${analyst}`
  );

  const header = `_Analyst: ${PROVIDERS[analystP].label()} · Red-team: ${PROVIDERS[redteamP].label()} ` +
    `${crossModel ? "(cross-model adversarial review)" : "(single model — set a 2nd free key, e.g. GROQ_API_KEY, for cross-model review)"}_`;
  return `${header}\n\n## Analyst\n${analyst}\n\n## Red-team\n${redteam}`.trim();
}
