# Setup — deploy the Puck dashboard & scanner (iPhone-friendly, all in Safari)

This repo (renamed to `deep-tech-market-research`) contains the full research + the Puck scarcity-radar app. Deploy in two steps, no terminal required.

## 1. Host the dashboard on Vercel
1. Go to **vercel.com** → sign in with GitHub.
2. **Add New → Project** → pick **`deep-tech-market-research`** → **Deploy**.
3. Vercel reads `vercel.json` automatically (Output Directory = `web`, no build step) and gives you a live dashboard URL. Done.

## 2. Turn on the auto-scanner (free)
The scanner lives in `.github/workflows/scan.yml` and runs on GitHub Actions (free) — it pulls free market quotes, recomputes crowding scores + trigger status, commits `web/data/signals.json`, and opens an Issue when a deploy/exit trigger fires.
- It runs on a weekday schedule automatically once the repo is on GitHub.
- **To run it on demand:** repo → **Actions** tab → **scan** → **Run workflow**.
- It also watches **SEC EDGAR** filings (8-K/10-Q/etc) per holding and pulls **Google-News RSS** per scarcity — both free/keyless — and surfaces them on the dashboard's "Filings & news" tab.
- **(Optional) LLM "analyst + red-team" digest:** create a free key at **aistudio.google.com** (Gemini) → add it in the repo as **Settings → Secrets and variables → Actions → New repository secret** named `GEMINI_API_KEY`. Groq is also supported via `GROQ_API_KEY` (free at **console.groq.com**). **Set BOTH keys to get a true cross-model adversarial review** — the analyst pass runs on Gemini and the red-team pass on Groq (one model attacks the other instead of grading itself). With one key, both passes use it; with none, the digest is skipped (everything else still runs).

## 3. (Optional) Wire up the dashboard **Refresh** button
The Refresh button can kick the scan on demand from the dashboard via GitHub's `repository_dispatch`. It needs a token, which is **never committed** — it lives only in your browser's `localStorage`.
1. GitHub → **Settings → Developer settings → Fine-grained personal access tokens → Generate new token.**
2. **Resource owner** = your account; **Repository access** = only `deep-tech-market-research`; **Permissions → Repository → Contents = Read and write.** Generate and copy it.
3. On the dashboard, tap **⟳ Refresh** and paste the token when prompted. It's saved to this browser only and POSTed straight to GitHub; the `scan` workflow runs, and the dashboard **auto-polls and live-reloads** when the fresh `signals.json` lands (~1–3 min) — no manual reload.
- A bad/expired token is auto-cleared so you can re-paste. No token? Refresh just points you to the manual **Actions → scan → Run workflow**.

## 3b. (Optional) Enable the cost-basis trim rule + live sleeve cap
Copy `web/data/positions.local.example.json` to **`web/data/positions.local.json`** (this filename is **gitignored — never committed**) and fill in your real `shares` / `cost_basis` per ticker (and `cash_usd` dry powder). The scanner then computes the **trim rule** (a name > 2× cost basis **and** > 50× forward P/E → trim ~⅓) and the **live sleeve-cap** trigger (sleeve value vs the ~$1.72mm cap). `forward_pe` is fetched automatically where a free source allows; set it per position to override.

## 3c. (Optional) Email alerts when a trigger fires
The scanner already opens a GitHub Issue when a deploy/exit trigger fires (and you get GitHub's email if you "watch" the repo). To get a **direct email** instead — sent only when a trigger **newly** fires (a state change, not every run) — add these to the repo:
1. **Secrets** (Settings → Secrets and variables → Actions → *Secrets*): `SMTP_USER` and `SMTP_PASS`. The easy free route is **Gmail**: use your Gmail address as `SMTP_USER` and a **Gmail App Password** as `SMTP_PASS` (Google Account → Security → 2-Step Verification → App passwords). Optional `SMTP_HOST`/`SMTP_PORT` (default `smtp.gmail.com` / `465`).
2. **Variable** (same page → *Variables*): `ALERT_EMAIL_TO` = the address to notify.
That's it — no email is sent unless `SMTP_USER` is set, so this stays off until you opt in. (The email step uses the `dawidd6/action-send-mail` action; pin it to a commit SHA if you prefer.)

## 4. Reliability (already on)
- A **stale-data banner** appears on the dashboard if the last scan is more than ~3 days old.
- The **`ci`** GitHub Action runs on every PR/push: it does an offline scan and asserts the data files + generated `signals.json` are schema-valid and that every portfolio ticker resolved or errored. The scanner itself fails loudly on malformed `web/data/*.json`.
- Run the same checks locally with `npm test`.

## 5. Keeping it current
- Edit theses/holdings/triggers directly in `web/data/*.json` (GitHub web editor works on iPhone). Schema validation will reject malformed edits on the next scan/CI run.
- The dashboard re-reads those files on every load; the scanner refreshes `signals.json` on its schedule.

## Where things are
- `research/MASTER-THESIS.md` — start here. `research/PORTFOLIO.md` + `research/POSITION-SIZING.md` — the $1.5M plan.
- `web/` — the dashboard. `scripts/scan.mjs` — the scanner. `APP.md` — full architecture.

> Not financial advice. The radar reflects the committed research; verify before acting.
