import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  budget,
  convergence,
  firstOf,
  type AgentSpec,
  type DogpileOptions
} from "./index.js";

describe("@protostar/dogpile-types public surface", () => {
  it("exposes the five symbols dogpile-adapter consumes", () => {
    assert.equal(typeof budget, "function");
    assert.equal(typeof convergence, "function");
    assert.equal(typeof firstOf, "function");

    // Type-only symbols verified via structural assignment below.
    const agent: AgentSpec = { id: "a", role: "r" };
    assert.equal(agent.id, "a");

    const opts: DogpileOptions = {
      tier: "quality",
      budget: { maxTokens: 1000 },
      protocol: { kind: "broadcast", maxRounds: 2 },
      agents: [{ id: "p", role: "planner" }],
      terminate: budget({ maxTokens: 1000 })
    };
    assert.equal(opts.tier, "quality");
  });

  it("budget() returns a frozen, JSON-serializable condition", () => {
    const condition = budget({ maxTokens: 24000, timeoutMs: 120000 });
    assert.equal(condition.kind, "budget");
    assert.equal(condition.maxTokens, 24000);
    assert.equal(condition.timeoutMs, 120000);
    assert.equal(Object.isFrozen(condition), true);
    assert.doesNotThrow(() => JSON.stringify(condition));
  });

  it("convergence() returns a frozen, JSON-serializable condition", () => {
    const condition = convergence({ stableTurns: 2, minSimilarity: 0.86 });
    assert.equal(condition.kind, "convergence");
    assert.equal(condition.stableTurns, 2);
    assert.equal(condition.minSimilarity, 0.86);
    assert.equal(Object.isFrozen(condition), true);
  });

  it("firstOf() composes conditions and freezes the result", () => {
    const composite = firstOf(
      budget({ maxTokens: 100 }),
      convergence({ stableTurns: 1, minSimilarity: 0.9 })
    );
    assert.equal(composite.kind, "firstOf");
    assert.equal(composite.conditions.length, 2);
    assert.equal(composite.conditions[0]?.kind, "budget");
    assert.equal(composite.conditions[1]?.kind, "convergence");
    assert.equal(Object.isFrozen(composite), true);
    assert.equal(Object.isFrozen(composite.conditions), true);
  });
});
