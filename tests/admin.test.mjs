import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { configStatus, browserKeyStatus, committeeRoster, REPO_SECRETS, REPO_VARIABLES } from "../scripts/lib/admin.mjs";

describe("admin: configuration status", () => {
  it("marks a secret configured when GitHub reports its name", () => {
    const s = configStatus(["SMTP_USER", "GEMINI_API_KEY"], []);
    assert.equal(s.secrets.find((x) => x.name === "SMTP_USER").configured, true);
    assert.equal(s.secrets.find((x) => x.name === "SMTP_PASS").configured, false);
  });
  it("marks a variable configured when present", () => {
    const s = configStatus([], ["ALERT_EMAIL_TO"]);
    assert.equal(s.variables.find((x) => x.name === "ALERT_EMAIL_TO").configured, true);
    assert.equal(s.variables.find((x) => x.name === "SEC_USER_AGENT").configured, false);
  });
  it("covers every known credential name", () => {
    assert.ok(REPO_SECRETS.some((s) => s.name === "SMTP_PASS"));
    assert.ok(REPO_VARIABLES.some((v) => v.name === "ALERT_EMAIL_TO"));
  });
  it("reflects browser-key + token presence", () => {
    const b = browserKeyStatus({ gemini: "x" }, true);
    assert.equal(b.find((x) => x.key === "gemini").configured, true);
    assert.equal(b.find((x) => x.key === "finnhub").configured, false);
    assert.equal(b.find((x) => x.store === "token").configured, true);
  });
});

describe("admin: committeeRoster — which LLM plays each role (mirrors llm.mjs preference)", () => {
  it("assigns seats in preference order: frontier first, then free tiers", () => {
    const r = committeeRoster(["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GROQ_API_KEY"]);
    assert.equal(r.bull, "Anthropic");
    assert.equal(r.bear, "OpenAI");
    assert.equal(r.skeptic, "Groq");
    assert.equal(r.cio, "Anthropic");        // the lead model chairs
  });

  it("CRO REQUIRES a frontier key (Anthropic/OpenAI) — null without one, even with 3 free models", () => {
    const free = committeeRoster(["GROQ_API_KEY", "OPENROUTER_API_KEY", "GEMINI_API_KEY"]);
    assert.equal(free.cro, null);
    assert.equal(free.croAvailable, false);
    const paid = committeeRoster(["OPENAI_API_KEY", "GROQ_API_KEY", "GEMINI_API_KEY"]);
    assert.equal(paid.cro, "OpenAI");          // the frontier model runs the risk review
    assert.equal(paid.croAvailable, true);
  });

  it("degrades when fewer keys: roles reuse the lead model, and it's honest about that", () => {
    const one = committeeRoster(["GROQ_API_KEY"]);
    assert.equal(one.bull, "Groq");
    assert.equal(one.bear, "Groq");            // reuses the only model
    assert.equal(one.skeptic, "Groq");
    assert.equal(one.cro, null);               // no frontier → no CRO
    assert.equal(one.singleModel, true);
  });

  it("reports no providers cleanly when no LLM key is set", () => {
    const none = committeeRoster([]);
    assert.equal(none.providers.length, 0);
    assert.equal(none.bull, null);
    assert.equal(none.cro, null);
  });

  it("prefers Anthropic over OpenAI for the CRO when both are present", () => {
    assert.equal(committeeRoster(["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]).cro, "Anthropic");
  });
});
