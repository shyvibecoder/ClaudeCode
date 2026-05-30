import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { configStatus, browserKeyStatus, REPO_SECRETS, REPO_VARIABLES } from "../scripts/lib/admin.mjs";

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
