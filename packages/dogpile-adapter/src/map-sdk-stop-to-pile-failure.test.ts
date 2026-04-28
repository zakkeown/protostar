import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { mapSdkStopToPileFailure } from "./map-sdk-stop-to-pile-failure.js";
import type { ResolvedPileBudget } from "./pile-failure-types.js";

const baseBudget: ResolvedPileBudget = {
  maxTokens: 12000,
  timeoutMs: 120000,
  maxCalls: 5
};

describe("mapSdkStopToPileFailure — Q-13 SDK→Protostar failure translation", () => {
  it("budget:timeout → pile-timeout with elapsedMs and configuredTimeoutMs", () => {
    const result = mapSdkStopToPileFailure("budget:timeout", {
      kind: "planning",
      elapsedMs: 130000,
      budget: baseBudget
    });
    assert.deepEqual(result, {
      kind: "planning",
      class: "pile-timeout",
      elapsedMs: 130000,
      configuredTimeoutMs: 120000
    });
  });

  it("budget:tokens → pile-budget-exhausted dimension=tokens with consumed/cap", () => {
    const result = mapSdkStopToPileFailure("budget:tokens", {
      kind: "review",
      elapsedMs: 50000,
      budget: baseBudget,
      tokensConsumed: 12500
    });
    assert.deepEqual(result, {
      kind: "review",
      class: "pile-budget-exhausted",
      dimension: "tokens",
      consumed: 12500,
      cap: 12000
    });
  });

  it("budget:iterations → pile-budget-exhausted dimension=calls", () => {
    const result = mapSdkStopToPileFailure("budget:iterations", {
      kind: "execution-coordination",
      elapsedMs: 80000,
      budget: baseBudget,
      iterationsConsumed: 5
    });
    assert.deepEqual(result, {
      kind: "execution-coordination",
      class: "pile-budget-exhausted",
      dimension: "calls",
      consumed: 5,
      cap: 5
    });
  });

  it("budget:iterations with envelope.maxCalls undefined → cap === Number.MAX_SAFE_INTEGER", () => {
    const noCallsBudget: ResolvedPileBudget = {
      maxTokens: 12000,
      timeoutMs: 120000
    };
    const result = mapSdkStopToPileFailure("budget:iterations", {
      kind: "planning",
      elapsedMs: 50000,
      budget: noCallsBudget,
      iterationsConsumed: 7
    });
    assert.deepEqual(result, {
      kind: "planning",
      class: "pile-budget-exhausted",
      dimension: "calls",
      consumed: 7,
      cap: Number.MAX_SAFE_INTEGER
    });
  });

  it("judge:rejected → pile-all-rejected structural placeholder", () => {
    const result = mapSdkStopToPileFailure("judge:rejected", {
      kind: "review",
      elapsedMs: 30000,
      budget: baseBudget
    });
    assert.deepEqual(result, {
      kind: "review",
      class: "pile-all-rejected",
      candidatesEvaluated: 0,
      judgeDecisions: []
    });
  });

  it("budget:cost → null (not a failure)", () => {
    const result = mapSdkStopToPileFailure("budget:cost", {
      kind: "planning",
      elapsedMs: 30000,
      budget: baseBudget
    });
    assert.equal(result, null);
  });

  it("convergence → null (not a failure)", () => {
    const result = mapSdkStopToPileFailure("convergence", {
      kind: "planning",
      elapsedMs: 30000,
      budget: baseBudget
    });
    assert.equal(result, null);
  });

  it("judge:accepted and judge:score-threshold both → null (not failures)", () => {
    const accepted = mapSdkStopToPileFailure("judge:accepted", {
      kind: "review",
      elapsedMs: 30000,
      budget: baseBudget
    });
    const scoreThreshold = mapSdkStopToPileFailure("judge:score-threshold", {
      kind: "review",
      elapsedMs: 30000,
      budget: baseBudget
    });
    assert.deepEqual([accepted, scoreThreshold], [null, null]);
  });
});
