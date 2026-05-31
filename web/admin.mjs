// Admin/credentials catalog + status logic (pure ESM, browser + Node).
// One place that knows every credential the app uses, where it lives, and whether
// it's configured. The UI reads GitHub's secret/variable NAMES (values are never
// returned by GitHub) to mark each ✓ configured.

// Repo SECRETS power the GitHub Actions scanner (server-side). Encrypted by GitHub;
// they can be read-for-existence and used, but only WRITTEN via GitHub's UI/API with
// libsodium encryption (not from this static page).
export const REPO_SECRETS = [
  { name: "ANTHROPIC_API_KEY", label: "Anthropic — frontier reasoning (paid, optional)" },
  { name: "OPENAI_API_KEY", label: "OpenAI — frontier reasoning (paid, optional)" },
  { name: "GROQ_API_KEY", label: "Groq — primary analyst (high free limit)" },
  { name: "OPENROUTER_API_KEY", label: "OpenRouter — DeepSeek/Qwen/GLM/Kimi (one key)" },
  { name: "GEMINI_API_KEY", label: "Gemini — LLM digest / 2nd opinion" },
  { name: "FINNHUB_API_KEY", label: "Finnhub — data cross-check" },
  { name: "TWELVE_DATA_API_KEY", label: "Twelve Data — data cross-check" },
  { name: "ALPHAVANTAGE_API_KEY", label: "Alpha Vantage — data cross-check" },
  { name: "SMTP_USER", label: "Email sender (Gmail address)" },
  { name: "SMTP_PASS", label: "Email app password" },
  { name: "SMTP_HOST", label: "SMTP host (optional)" },
  { name: "SMTP_PORT", label: "SMTP port (optional)" },
  { name: "SUPABASE_SERVICE_KEY", label: "Supabase service_role key — price-history DB" },
];

// Repo VARIABLES are non-secret — settable directly from the UI via the GitHub API.
export const REPO_VARIABLES = [
  { name: "ALERT_EMAIL_TO", label: "Alert recipient email" },
  { name: "SEC_USER_AGENT", label: "SEC User-Agent (optional)" },
  { name: "SUPABASE_URL", label: "Supabase project URL — price-history DB" },
];

// BROWSER keys live only in localStorage and power client-side features.
export const BROWSER_KEYS = [
  { key: "gemini", label: "Gemini — in-browser digest" },
  { key: "finnhub", label: "Finnhub — live price check" },
  { key: "dispatch", label: "GitHub dispatch token — Refresh", store: "token" },
];

// Given the names GitHub reports as existing, mark each catalog item configured.
export function configStatus(existingSecrets = [], existingVariables = []) {
  const ss = new Set(existingSecrets), vs = new Set(existingVariables);
  return {
    secrets: REPO_SECRETS.map((s) => ({ ...s, kind: "secret", configured: ss.has(s.name) })),
    variables: REPO_VARIABLES.map((v) => ({ ...v, kind: "variable", configured: vs.has(v.name) })),
  };
}

// Browser-key status from the localStorage maps the app already keeps.
export function browserKeyStatus(keys = {}, hasToken = false) {
  return BROWSER_KEYS.map((b) => ({ ...b, configured: b.store === "token" ? !!hasToken : !!keys[b.key] }));
}

// Which LLM plays each committee role, derived from the secrets actually present. MUST mirror the
// PREFERENCE order in scripts/lib/llm.mjs (frontier first) and the seat/CRO wiring in research-run.mjs
// so the dashboard shows the TRUE live assignment. Frontier = Anthropic/OpenAI; the CRO risk review
// runs ONLY on a frontier model (a free model grading its free-tier siblings isn't a real check).
const LLM_PREFERENCE = [
  { secret: "ANTHROPIC_API_KEY", label: "Anthropic", frontier: true },
  { secret: "OPENAI_API_KEY", label: "OpenAI", frontier: true },
  { secret: "GROQ_API_KEY", label: "Groq", frontier: false },
  { secret: "OPENROUTER_API_KEY", label: "OpenRouter", frontier: false },
  { secret: "GEMINI_API_KEY", label: "Gemini", frontier: false },
];
export function committeeRoster(existingSecrets = []) {
  const ss = new Set(existingSecrets);
  const present = LLM_PREFERENCE.filter((p) => ss.has(p.secret));
  const providers = present.map((p) => p.label);
  const at = (i) => providers[i] || providers[0] || null;   // degrade: reuse the lead model
  const frontier = present.find((p) => p.frontier) || null; // Anthropic preferred over OpenAI
  return {
    providers,
    bull: at(0), bear: at(1), skeptic: at(2), cio: providers[0] || null,
    cro: frontier ? frontier.label : null,        // null unless a frontier key is set
    croAvailable: !!frontier,
    singleModel: providers.length === 1,
  };
}
