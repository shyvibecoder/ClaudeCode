# Puck — TODO / what-to-do-next

Living checklist and the source of truth for "what's next". Update every session.
Audit findings are detailed in `ARCHITECTURE.md`; the timing layer in `REGIME.md`.

## ⭐ North star: alpha (scarcity thesis) → timing (regime) → cash
The thesis picks *what* to own; a literature-grounded timing layer decides *when* to deploy / go
all-in vs. apply the brakes into cash. See `REGIME.md` for the evidence base.
- [x] **Timing/regime layer v1** — trend(200-DMA) + 12m abs-momentum + vol-state + drawdown → risk
  posture (risk-on / neutral / caution / defensive). Grounded in Faber'07, MOP'12, Moreira-Muir'17,
  Hurst-Ooi-Pedersen'17; breadth down-weighted (basket ~1.0 corr). Surfaced on dashboard + digest inputs.
- [ ] **Timing v2** — per-name signed TSMOM sizing (not just one portfolio posture); cross-asset
  trend (rates/USD); longer look-back history store; whipsaw dampening. (See REGIME.md "limitations".)
- [ ] **Timing v2 — lessons from the V2.3 QLD strategy** (see REGIME.md "Lessons from an adjacent system"):
  - [ ] Exit-only, **AND-gated macro-stress overlay**: VIX term-structure (VIX>VIX3M) **and** HY credit velocity → force defensive (independent of the price-based score). Free data: `^VIX`/`^VIX3M`/`HYG` (Yahoo) or FRED `BAMLH0A0HYM2`.
  - [ ] **Fast re-entry override** (e.g., 20-DMA reclaim / breadth thrust) — re-risk quickly after defensive (Daniel-Moskowitz fix).
  - [ ] Compute regime on a **clean composite underlying**, not an average of 19 noisy names.
  - [ ] **Account-aware posture**: timing drives the IRA/Roth sleeve; taxable = buy-and-hold anchors.
  - [x] **Options fair-value module** — Black-Scholes IV vs realized-vol "cheap/fair/rich" verdict + greeks (`web/options.mjs`, **Options check** tab; CI-tested via parity + IV round-trip).
  - [~] **Options-based action suggestions** — Options tab already suggests a defined-risk structure from the live regime (defensive→put/put-spread; risk-on→LEAPS call). *Full Timing-v2: have the regime engine emit the suggestion + a suggested strike/expiry band.*
  - [ ] **Options execution rules (DEFINED-RISK ONLY — assume NO naked options, both accounts)** — risk-on → long LEAPS calls (GEV/ASML/index); defensive/macro-stress → protective puts / debit put spreads / collars on correlated cyclicals. Active rolling in IRA (tax-free); long-dated catastrophe hedges in taxable (mind holding-period/constructive-sale/wash-sale). See POSITION-SIZING §3a.
  - [ ] Version the regime engine (v1→v2) + keep thresholds coarse/economically-motivated (anti-overfit); do NOT port QQQ-tuned params onto short-history single names; no leverage.

## ⚠ Data integrity / anti-injection hardening (next priority)
Current guards: HTTPS-only sources, fail-loud schema validation (in+out), every ticker "resolved or
errored explicitly" (never silently filled), errors captured + graceful degrade, single controlled
writer (Actions → committed `signals.json`). **Gaps to close:**
- [ ] **Cross-source corroboration** — when Yahoo *and* Stooq both return, compare; flag/error if they diverge >~2–3% (use Stooq as a validator, not just a fallback).
- [ ] **Plausibility bounds** — reject price≤0/non-finite (Yahoo path lacks the `isFinite` guard Stooq has); flag implausible day-over-day or vs-52w-high moves; bound vol/ytd.
- [ ] **Anomaly vs last run** — diff new price against the prior committed `signals.json`; flag jumps >~35% (likely bad print / unadjusted split) and withhold from triggers.
- [ ] **Per-quote freshness** — use Yahoo's last-bar timestamp; flag stale/halted/delisted quotes.
- [ ] **Fail-safe triggers** — don't fire auto-triggers (drawdown/sleeve) on a degraded run (too many errors/anomalies) or until **two consecutive scans agree**.
- [ ] **Provenance** — keep `source` per quote (done) + summarize Yahoo/Stooq mix; treat heavy fallback as degraded. Untrusted EDGAR/news text stays read-only (never agentic) to avoid prompt-injection.

### Free market-data sources (multi-source corroboration — all free)
Build a provider abstraction (like the LLM one) that tries keyless first, optionally free-key, and cross-checks.
- **Quotes/history (keyless):** Yahoo chart (primary), Stooq CSV (fallback+validator). Add as corroborators →
  **Yahoo options endpoint** (`/v7/finance/options/{t}` — real chains + IV, keyless), **exchangerate.host/Frankfurter** (FX).
- **Quotes (free-key, optional, generous):** Finnhub (60/min), Twelve Data (800/day), Alpha Vantage (25/day), Tiingo, FMP — keys stored as repo secrets / Settings; used to corroborate the keyless feed.
- **Fundamentals/forward multiple:** Yahoo quoteSummary (flaky), Finnhub/FMP/Alpha Vantage OVERVIEW, **SEC EDGAR XBRL companyfacts** (keyless, authoritative for *reported* figures).
- **Options chains + IV:** **Yahoo options endpoint** (keyless) to auto-pull real IV into the Options tab; Tradier sandbox (free key) as alt.
- **Macro (Timing v2 overlay):** keyless `^VIX`/`^VIX3M`/`^TNX`/`HYG` (Yahoo); FRED `BAMLH0A0HYM2` (free key) for HY OAS.

## Audit fixes (ARCHITECTURE.md F1–F11)
- [x] **F1** — dedupe trigger-alert issues in `scan.yml` (don't reopen while one is open)
- [x] **F2** — capture per-quote `currency`; **skip + flag** non-USD lots in the sleeve value
- [x] **F3** — `securities.json` registry (type/foreign) + validator; wired to skip forward-P/E on ETFs
- [x] **F4** — `scarcity-history.json` per-run snapshots (change-only) + radar "drift" marker
- [x] **F5** — `last_reviewed` set on every scarcity + optional `confidence` (0..1) schema support (`confidence` filled by v3)
- [x] **F6 (data layer)** — `dca.json` machine-readable plan generated from tier rules (was prose-only). *Planned-vs-deployed VIEW = v4.*
- [x] **F7** — `seen.state.json` delta tracking → filings/news show **NEW** badges; trigger fire-times recorded
- [x] **F8** — `schema_version` on all data files + validator errors on unknown version
- [x] **F9** — ownership model documented (ARCHITECTURE §1: bot-proposable vs human-only fields)
- [x] **F10** — `signals.json` kept snapshot-only; time-series live in `scarcity-history.json` / `seen.state.json`
- [ ] **F11** — (later) key manual policy triggers to news/filing signals
- [ ] **F2b** — full FX conversion (fetch `${CUR}USD=X`) so foreign lots count in the sleeve value

### Remaining audit/back-fill (next)
- [ ] **F6 view** — DCA planned-vs-deployed dashboard (pairs with v4; data layer done)
- [ ] **F2b** FX conversion for foreign lots
- [ ] **F11** wire manual policy triggers to news/filings

## UX / onboarding (shipped)
- [x] **⚙ Settings/onboarding** — per-account holdings editor + dry-powder cash + API keys/token (localStorage only); live "Your holdings" panel; export/import `positions.local.json`; in-browser Gemini digest.
- [x] **Options check** tab — Black-Scholes fair-value (IV vs realized vol) + greeks; regime-linked defined-risk suggestion.
- [x] **Site-wide help (`?`)** — contextual explainers on every section. **Convention: all future features ship with a `?` help entry** (ARCHITECTURE §5).

## v2 status — complete
- [x] SEC EDGAR 8-K/10-Q watch
- [x] News RSS per scarcity
- [x] Cost-basis trim rule + live sleeve cap
- [x] Forward-multiple (forward P/E) fetch
- [x] Multi-model cross-adversarial digest (extra)
- [x] On-demand Refresh: dispatch + auto-poll + live-reload (extra)

## v3 — re-run the research loop (the differentiator)
- [ ] Scheduled 8 deep-dives → 4 red-teams → synthesis on free LLMs → dated `research/auto/<date>.md` + diff vs last run
- [ ] Versioned `priced_in`/`bind_window` drift (uses F4) + `confidence` (F5)
- [ ] Auto-open PR with proposed `scarcities.json` edits when confidence crosses a threshold (bot-owned fields only; human approves)

## v4 — tracking & alerts
- [ ] DCA planned-vs-deployed view (uses F6)
- [ ] Push alerts (ntfy.sh / Telegram) on trigger fire (uses F7 for dedupe across channels)
- [ ] Rebalance helper: flag any holding >±25% from target weight

## Nice-to-haves
- [ ] Private/foreign chokepoint watchlist (SpaceX, Anduril, ASML, Lynas, Harmonic Drive) + "how to access" notes
- [ ] Crowding-vs-durability scatter view
