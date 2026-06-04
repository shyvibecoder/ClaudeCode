// Keyless "⟳ Refresh" — Vercel serverless function.
//
// The dashboard's Refresh button POSTs here (same-origin, NO user key). This function holds the
// GitHub dispatch token SERVER-SIDE — in the `GH_DISPATCH_TOKEN` env var, never shipped to the
// browser — and fires the `scan` workflow via repository_dispatch. So a visitor can trigger a live
// scan on demand without pasting any token.
//
// Configure once on Vercel: Project → Settings → Environment Variables → add `GH_DISPATCH_TOKEN`
// = a fine-grained PAT scoped to this repo with **Contents: Read and write** (the minimum that lets
// repository_dispatch fire the Action). Optionally override `DISPATCH_REPO`.
//
// If the token env var is NOT set on a deployment, this returns 501 so the front-end transparently
// falls back to its bring-your-own-token prompt (and `file://`/other hosts keep working). The token
// is never exposed: the browser only ever sees this endpoint's small JSON status.

const REPO = process.env.DISPATCH_REPO || "shyvibecoder/deep-tech-market-research";
const TOKEN = process.env.GH_DISPATCH_TOKEN || process.env.GITHUB_DISPATCH_TOKEN || "";

// Soft cooldown within a warm instance to blunt accidental double-taps / casual spam. Vercel
// instances are ephemeral, so this is best-effort (the workflow's own `concurrency: scan-commit`
// is the real serializer); it just avoids firing a burst of dispatches from one warm lambda.
let lastDispatch = 0;
const COOLDOWN_MS = 20_000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!TOKEN) {
    // Keyless dispatch not configured on this deployment → client uses its own-token fallback.
    return res.status(501).json({ error: "dispatch_not_configured" });
  }
  const now = Date.now();
  if (now - lastDispatch < COOLDOWN_MS) {
    return res.status(429).json({ error: "cooldown", retry_ms: COOLDOWN_MS - (now - lastDispatch) });
  }
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
        "user-agent": "puck-refresh",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({ event_type: "scan" }),
    });
    if (r.status === 204) {
      lastDispatch = now;
      return res.status(202).json({ ok: true, dispatched: true });
    }
    const detail = (await r.text().catch(() => "")).slice(0, 500);
    // Map GitHub's auth/permission failures so the client can tell config errors from transient ones,
    // but never echo the token or full GitHub payloads.
    return res.status(502).json({ error: "github_dispatch_failed", status: r.status, detail });
  } catch (e) {
    return res.status(502).json({ error: "dispatch_error", detail: String(e?.message || e) });
  }
}
