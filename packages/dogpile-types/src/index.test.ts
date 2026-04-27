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

    const tier: DogpileOptions["tier"] = "quality";
    const optionsBudget: DogpileOptions["budget"] = { maxTokens: 1000 };
    const protocol: DogpileOptions["protocol"] = { kind: "broadcast", maxRounds: 2 };
    const agents: NonNullable<DogpileOptions["agents"]> = [{ id: "p", role: "planner" }];
    const terminate: DogpileOptions["terminate"] = budget({ maxTokens: 1000 });

    assert.equal(tier, "quality");
    assert.equal(optionsBudget.maxTokens, 1000);
    assert.equal(protocol.kind, "broadcast");
    assert.equal(agents[0]?.id, "p");
    assert.equal(terminate?.kind, "budget");
  });

  it("budget() returns a JSON-serializable upstream SDK condition", () => {
    const condition = budget({ maxTokens: 24000, timeoutMs: 120000 });
    assert.equal(condition.kind, "budget");
    assert.equal(condition.maxTokens, 24000);
    assert.equal(condition.timeoutMs, 120000);
    assert.doesNotThrow(() => JSON.stringify(condition));
  });

  it("convergence() returns a JSON-serializable upstream SDK condition", () => {
    const condition = convergence({ stableTurns: 2, minSimilarity: 0.86 });
    assert.equal(condition.kind, "convergence");
    assert.equal(condition.stableTurns, 2);
    assert.equal(condition.minSimilarity, 0.86);
  });

  it("firstOf() composes upstream SDK conditions", () => {
    const composite = firstOf(
      budget({ maxTokens: 100 }),
      convergence({ stableTurns: 1, minSimilarity: 0.9 })
    );
    assert.equal(composite.kind, "firstOf");
    assert.equal(composite.conditions.length, 2);
    assert.equal(composite.conditions[0]?.kind, "budget");
    assert.equal(composite.conditions[1]?.kind, "convergence");
  });
});
