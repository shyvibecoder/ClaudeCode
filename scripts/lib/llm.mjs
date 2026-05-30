// Free-LLM abstraction. Uses whichever free key is present, else no-op.
//   GEMINI_API_KEY  -> Google Gemini (free tier, generous)   [default]
//   GROQ_API_KEY    -> Groq (free tier, fast Llama)           [fallback]
// This is where the "research / red-team agents" run in CI on a free model.

export function llmAvailable() {
  return !!(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY);
}

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

export async function llm(prompt) {
  if (process.env.GEMINI_API_KEY) return callGemini(prompt);
  if (process.env.GROQ_API_KEY) return callGroq(prompt);
  return ""; // no key -> caller skips LLM features
}

// Two-pass "analyst + red-team" digest over fresh signals/filings/news, free model.
export async function analystRedteamDigest({ signals, filings = [], headlines = [], scarcities }) {
  if (!llmAvailable()) return "";
  const ctx = JSON.stringify({ signals, filings, headlines, scarcities }, null, 0).slice(0, 24000);
  const analyst = await llm(
    `You are a markets analyst tracking structural-tech-scarcity theses.\n` +
    `Given this JSON of fresh quotes, recent SEC filings (8-K/10-Q items), news headlines, ` +
    `and the scarcity map, write 6-10 terse bullets: what materially changed for any ` +
    `scarcity/holding — prioritize SEC filings that touch backlog, capacity, guidance, or ` +
    `pricing — and whether any deploy/exit trigger looks closer. ` +
    `Be specific and cite the ticker/scarcity/filing. JSON:\n${ctx}`
  );
  const redteam = await llm(
    `You are a skeptical red-team. Attack this analyst digest: which claims are over-stated, already-priced, ` +
    `or not supported by the data? Keep it to 4-6 sharp bullets.\n\nDIGEST:\n${analyst}`
  );
  return `## Analyst\n${analyst}\n\n## Red-team\n${redteam}`.trim();
}
