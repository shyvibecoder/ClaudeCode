# Research engine — premier hedge-fund-grade design

Status: in build (TDD, 3 phases). This documents the *why* and the data contracts so the
implementation and the prompts stay honest. The bot still only ever PROPOSES bot-owned fields
(`priced_in` / `bind_window` / `non_consensus`); a human approves via PR (F9, ARCHITECTURE §1).

## The bar: what makes research "premier", not theatre

More models voting on the same question with the same evidence is an echo chamber, not rigour.
Real edge has five properties the v3 engine lacked:

1. **Variant perception** — an explicit "what do we believe that consensus doesn't, and what
   catalyst forces the market to agree?" (not just a `non_consensus` boolean).
2. **Disconfirmation** — a genuine short-seller seat trying to *kill* the thesis (supply response,
   demand air-pocket, substitution, policy reversal), not a polite red-team.
3. **Triangulation** — filings vs. tape vs. news vs. positioning, with edge living where they
   *diverge* — instead of one undifferentiated evidence blob.
4. **Falsifiability** — every call pre-registers "I'm wrong if X by date Y", graded later by the
   scorecard. This is the only thing that compounds into a track record.
5. **Second-order thinking** — if the shortage is real, what's *already priced*, and who's the
   non-obvious beneficiary?

Honest caveat: this upgrades research *quality* (better-reasoned, documented, falsifiable, gradable
calls). It does NOT guarantee better returns — the scorecard measures that over time. Premier
*process* ≠ premier *returns*; it just stops us fooling ourselves.

## Architecture: a synthetic Investment Committee

Per scarcity, replace `deep-dive → red-team → synthesis` with adversarial **seats**, each on a
different model family (via the provider pool: Groq / OpenRouter-DeepSeek-Qwen-GLM / Gemini) so they
don't echo. Each seat argues its mandate AND gives an honest neutral `priced_in` read (the read,
not the mandate, drives dispersion — see below).

| Seat | Mandate | Model preference |
|---|---|---|
| **Bull** | Strongest variant-perception case + the catalyst | pool[0] (Groq) |
| **Bear** | The specific thing that kills it; is it already priced? | pool[1] (DeepSeek/OpenRouter) — different brain |
| **Skeptic** | Outside view: how often do "structural shortage" stories mean-revert? | pool[2] or pool[0] |
| **CIO** | Weighs the debate; sets the fields; MUST emit variant view, steelmanned bear case, a falsifiable kill-criterion, and a dispersion-aware confidence | strongest available |

Degrades gracefully: with one key, seats run on the same model (less diversity, still the role
structure); with none, the run is skipped (unchanged).

### Dispersion (conviction proxy)
Each seat returns an honest `priced_read` ∈ {low,medium,high,crowded} *regardless of its mandate*.
Dispersion = agreement across those reads (reuse `ensembleConsensus`):
- **tight** (unanimous/strict majority) → higher conviction, confidence may stand.
- **wide** (no majority) → low conviction; the CIO must cut confidence / size-small note.
Limitation (documented, not hidden): a seat's mandate can bias even its "neutral" read; dispersion
is a soft signal, not ground truth. The report shows the raw reads so a human can judge.

## Data contract — the committee memo

`runCommittee(...)` returns, per scarcity, a `memo`:

```
{
  id, scarcity,
  seats: {
    bull:    { priced_read, variant_view, catalyst, confidence, raw },
    bear:    { priced_read, kill_risk, already_priced, confidence, raw },
    skeptic: { priced_read, base_rate, outside_view, confidence, raw },
  },
  dispersion: { level: "tight|moderate|wide", agreement: 0..1, reads: {...} },
  cio: {                      // the proposal payload (F9-sanitized downstream)
    priced_in, bind_window, non_consensus, confidence,
    variant_view,            // what we see that consensus doesn't (1-2 sentences)
    bear_case,               // steelmanned counter, in the bear's terms
    kill_criterion: { condition, by_date },   // falsifiable, dated
    rationale, sources[]
  },
  errors: []                 // per-seat failures, surfaced loudly (never silent)
}
```

The existing `sanitizeEdit` still gates the CIO output down to bot-owned fields + the new
structured-but-safe fields (variant_view / bear_case / kill_criterion are descriptive, never
mutate scarcities.json — they ride along on the proposal for the human reviewer and the report).

## Evidence triangulation (phase 3)

Split the one 24KB blob into typed lanes the seats can reason over independently and the report can
flag divergence on:
- **filings** (what management commits to: backlog/capacity/guidance/pricing)
- **tape** (price action: ytd / vs-200dma / 1m momentum / the de-rating + forced-flow signals)
- **news** (narrative: multi-angle excerpts)
- **positioning** (crowding/heat proxies where available)

A `divergence` note is computed when lanes disagree (e.g. filings bullish on backlog but tape
de-rating → "fundamentals vs. price divergence" — often the most interesting setup). Seats are told
to weight independent corroboration over a single loud source.

## Falsifiability + scoring

Each accepted proposal records `kill_criterion {condition, by_date}`. The existing scorecard /
track-record loop (which already grades de-rating/inflecting calls relative to the complex) is
extended over time to mark a call **invalidated** if its kill-criterion triggers before resolution.
No new infra in the first cut — the criterion is recorded now so it can be graded later; "prompts
get better and better" by being judged on pre-registered, falsifiable claims.

## Build phases (each: pure logic + tests first, then wire in, then commit)

1. **Falsifiability + dispersion + variant view** — extend the proposal/report schema and prompts so
   every call carries a variant view, a dated kill-criterion, and a dispersion read. (~60% of value.)
2. **Adversarial committee** — `runCommittee` with bull/bear/skeptic/CIO seats across model families,
   replacing the deep-dive→redteam→synthesis path. Report renders the debate.
3. **Evidence triangulation** — typed evidence lanes + divergence detection feeding the seats and
   the report.

Versioning: `RESEARCH_PROMPT_VERSION` bumps to 4 so the scorecard can tell committee-era calls from
v3, and we can verify newer prompts are better-calibrated (not just different).
```
