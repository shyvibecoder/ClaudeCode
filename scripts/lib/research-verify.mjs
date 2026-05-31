// Deterministic verification of an LLM committee proposal — the trust layer that does NOT depend on
// the model behaving. Code reliably catches the failure modes a non-expert can't: a momentum-trap
// "it's cheaper" call on a name already up huge, a hallucinated centerpiece ticker, an unsupported
// timing acceleration, and high confidence on no evidence. Hard fails are auto-rejected upstream;
// soft flags surface in the report and dock confidence. Pure + fully tested.

const PRICED = ["low", "medium", "high", "crowded"];   // index ↑ = MORE priced-in (less opportunity)
const BIND = ["now", "2027", "2028-29", "2030+", "physics-floor"]; // index ↑ = LATER
// Words that look like tickers (2-5 caps) but are common acronyms, not equities — don't flag these.
const ACRONYMS = new Set(["US", "USA", "CEO", "CFO", "AI", "ML", "EW", "RF", "GIT", "EV", "EVS", "GAN", "SIC", "DOE", "SEC", "OEM", "OEMS", "CDU", "CDUS", "HBM", "HVDC", "RL", "GMP", "II", "III", "IV", "MOU", "YTD", "DR", "DRS", "ADR", "ADRS", "MW", "GW", "EU", "UK", "PJM", "SBSP", "CIGS", "GAAS", "PIC", "PICS", "CPO", "LPO"]);

const idx = (arr, v) => arr.indexOf(v);

export function verifyProposal(scarcity, edit, evidence) {
  const flags = [];
  let penalty = 0;
  let hardFail = false;
  if (!scarcity || !edit) return { flags, penalty, hardFail };

  const ev = evidence || {};
  const quotes = ev.quotes || {};
  const cur = scarcity.priced_in;
  const next = edit.priced_in;

  // 1) PRICE CONTRADICTION (hard): the proposal makes the thesis CHEAPER / more-opportunity
  // (priced_in index goes DOWN) while the basket is clearly extended (big YTD / well above 200-DMA).
  // This is the momentum trap — "COHR is up 86% YTD but underpriced." Code kills it.
  if (PRICED.includes(cur) && PRICED.includes(next) && idx(PRICED, next) < idx(PRICED, cur)) {
    const qs = (scarcity.tickers || []).map((t) => quotes[t]).filter((q) => q && !q.error);
    const extended = qs.some((q) => (typeof q.ytd === "number" && q.ytd >= 0.5) || (typeof q.vs200 === "number" && q.vs200 >= 0.2));
    if (extended) {
      hardFail = true;
      flags.push({ code: "price-contradiction", detail: `rates ${scarcity.id} cheaper (${cur}→${next}) while its basket is up sharply YTD / far above its 200-DMA — likely a momentum trap.` });
    }
  }

  // 2) BIND ACCELERATION (soft): pulling bind_window EARLIER toward "now" was the systematic model
  // bias. Surface + dock confidence; a human/CRO can still accept with dated evidence.
  if (BIND.includes(scarcity.bind_window) && BIND.includes(edit.bind_window) && idx(BIND, edit.bind_window) < idx(BIND, scarcity.bind_window)) {
    penalty += 0.1;
    flags.push({ code: "bind-acceleration", detail: `moves bind_window earlier (${scarcity.bind_window}→${edit.bind_window}); requires dated, concrete evidence — common model recency bias.` });
  }

  // 3) UNVERIFIED TICKER (soft): a ticker presented in the VARIANT VIEW (the centerpiece) that isn't
  // in this scarcity's coverage list is probably a hallucinated fit (e.g. ADNT for robotics data).
  // Only the variant view — bear/counter-args may legitimately cite outside names.
  const coverage = new Set((scarcity.tickers || []).join(" ").match(/[A-Z]{2,5}/g) || []);
  const cited = (typeof edit.variant_view === "string" ? edit.variant_view.match(/\b[A-Z]{2,5}\b/g) || [] : []);
  for (const t of new Set(cited)) {
    if (!coverage.has(t) && !ACRONYMS.has(t)) {
      flags.push({ code: "unverified-ticker", detail: `${t} is cited in the variant view but is not in this scarcity's coverage — verify it isn't a hallucinated/misattributed name.` });
      penalty += 0.05;
    }
  }

  // 4) THIN-EVIDENCE OVERCONFIDENCE (hard): high confidence with essentially no grounding evidence.
  const ec = ev.evidence_count || {};
  const evidenceN = (ec.news_with_excerpt || 0) + (ec.filing_passages || 0);
  if (evidenceN === 0 && typeof edit.confidence === "number" && edit.confidence >= 0.65) {
    hardFail = true;
    flags.push({ code: "thin-evidence-overconfident", detail: `confidence ${edit.confidence} with no news excerpts or filing passages — unsupported.` });
  }

  return { flags, penalty: +penalty.toFixed(3), hardFail };
}
