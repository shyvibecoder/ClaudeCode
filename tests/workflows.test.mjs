import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const wf = (f) => readFileSync(fileURLToPath(new URL(`../.github/workflows/${f}`, import.meta.url)), "utf8");

describe("workflows: pushes to main rebase first (race guard, red-team R3)", () => {
  for (const f of ["scan.yml", "docs.yml"]) {
    it(`${f} rebases before pushing to main`, () => {
      const y = wf(f);
      if (/git push(?!\s+-u)/.test(y)) assert.ok(/pull --rebase/.test(y), `${f} pushes to main without 'git pull --rebase' — commit-race risk`);
    });
  }
  it("no workflow uses the inline-flow env trap (env: { X: ${{...}} })", () => {
    for (const f of ["scan.yml", "docs.yml", "research.yml", "ci.yml", "e2e.yml"]) {
      assert.ok(!/env:\s*\{[^}]*\$\{\{/.test(wf(f)), `${f} has an inline-flow env with \${{ }} — YAML startup-failure trap`);
    }
  });
});
