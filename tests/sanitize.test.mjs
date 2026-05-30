import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { esc, safeUrl } from "../scripts/lib/sanitize.mjs";

describe("sanitize: HTML escaping (XSS)", () => {
  it("neutralizes an onerror img payload", () => {
    assert.equal(esc('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
  it("escapes &, <, >, \", '", () => assert.equal(esc(`a&b<c>"'`), "a&amp;b&lt;c&gt;&quot;&#39;"));
  it("handles null/undefined", () => { assert.equal(esc(null), ""); assert.equal(esc(undefined), ""); });
});
describe("sanitize: URL allowlist", () => {
  it("blocks javascript: and data: schemes", () => {
    assert.equal(safeUrl("javascript:alert(1)"), "#");
    assert.equal(safeUrl("data:text/html,<script>"), "#");
  });
  it("passes http(s) URLs through", () => {
    assert.equal(safeUrl("https://www.sec.gov/x"), "https://www.sec.gov/x");
    assert.ok(safeUrl("http://news.example/a").startsWith("http://"));
  });
  it("rejects garbage", () => { assert.equal(safeUrl(null), "#"); assert.equal(safeUrl("not a url"), "#"); });
});
