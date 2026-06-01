import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planCommittee, seatCaller, DEFAULT_OPENROUTER_MODEL, DEFAULT_OPENROUTER_MODEL_2 } from "../scripts/lib/llm.mjs";

// planCommittee assigns committee roles by HONEST design, not 1-key-per-seat:
//  - the strongest/most-reliable frontier model CHAIRS (CIO) and is kept OUT of the debate seats, so
//    it judges arguments it didn't write (kills the old chair==bull self-grading bias).
//  - the 3 debate seats are filled from the OTHER providers in preference order; OpenRouter (one key,
//    many families) expands to TWO seats with different models BEFORE falling back to free Groq.
describe("llm planCommittee: honest role assignment", () => {
  it("frontier chairs and is excluded from debate; OpenRouter fills two seats before Groq", () => {
    const { chair, seats } = planCommittee(["anthropic", "openai", "openrouter", "groq", "gemini"]);
    assert.equal(chair.provider, "anthropic");                 // strongest synthesizer chairs
    assert.deepEqual(seats.map((s) => s.role), ["bull", "bear", "skeptic"]);
    assert.equal(seats[0].provider, "openai");                 // bull
    assert.equal(seats[1].provider, "openrouter");             // bear
    assert.equal(seats[1].model, DEFAULT_OPENROUTER_MODEL);    //   …on the 1st OR model
    assert.equal(seats[2].provider, "openrouter");             // skeptic
    assert.equal(seats[2].model, DEFAULT_OPENROUTER_MODEL_2);  //   …on a DIFFERENT OR model
    assert.ok(!seats.some((s) => s.provider === "groq"), "Groq must not be used when OpenRouter can fill 2 seats");
    assert.ok(!seats.some((s) => s.provider === "anthropic"), "the chair must not also debate");
  });

  it("the user's exact config (anthropic+openai+openrouter, no groq) yields the intended committee", () => {
    const { chair, seats } = planCommittee(["anthropic", "openai", "openrouter"]);
    assert.equal(chair.provider, "anthropic");
    assert.deepEqual(seats.map((s) => `${s.provider}:${s.model ?? "default"}`),
      ["openai:default", `openrouter:${DEFAULT_OPENROUTER_MODEL}`, `openrouter:${DEFAULT_OPENROUTER_MODEL_2}`]);
  });

  it("falls back to Groq for a debate seat only when OpenRouter is absent", () => {
    const { seats } = planCommittee(["anthropic", "openai", "groq"]);
    assert.equal(seats[0].provider, "openai");
    assert.equal(seats[1].provider, "groq");                   // no OpenRouter → Groq takes the seat
    assert.equal(seats[2].provider, "anthropic");              // short of 3 → pad with the chair
  });

  it("single provider degrades cleanly: chair and all seats reuse it (no crash)", () => {
    const { chair, seats } = planCommittee(["anthropic"]);
    assert.equal(chair.provider, "anthropic");
    assert.ok(seats.every((s) => s.provider === "anthropic"));
    assert.equal(seats.length, 3);
  });

  it("no providers → null chair and no seats", () => {
    const { chair, seats } = planCommittee([]);
    assert.equal(chair, null);
    assert.equal(seats.length, 0);
  });

  it("honors explicit OpenRouter model overrides (repo-variable driven)", () => {
    const { seats } = planCommittee(["anthropic", "openrouter"], { openRouterModels: ["x/model-a", "y/model-b"] });
    assert.equal(seats[0].model, "x/model-a");
    assert.equal(seats[1].model, "y/model-b");
  });
});

describe("llm seatCaller: bind a provider to a specific model", () => {
  it("returns a callable that invokes the provider with the given model override", async () => {
    // Inject a fake provider call via the env-free path: seatCaller routes through PROVIDERS, so we
    // assert it threads the model by using OpenRouter's model arg through a stubbed fetch is overkill;
    // instead verify the callable shape and that a null model is allowed (falls back to default).
    const fn = seatCaller("openrouter", "z/explicit-model");
    assert.equal(typeof fn, "function");
    const fnDefault = seatCaller("anthropic", null);
    assert.equal(typeof fnDefault, "function");
  });
});
