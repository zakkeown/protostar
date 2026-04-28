import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PileFailure } from "./pile-failure-types.js";

function assertNever(value: never): never {
  throw new Error(`Unexpected pile failure variant: ${JSON.stringify(value)}`);
}

const consensusBreakdown = {
  judgeMeans: [0.92, 0.8],
  dimMeans: {
    acMet: 0.9,
    codeQuality: 0.84,
    security: 0.95,
    regressionRisk: 0.82,
    releaseReadiness: 0.85
  },
  meanOfJudgeMeans: 0.86,
  minOfJudgeMeans: 0.8,
  meanOfDimMeans: 0.872,
  minOfDimMeans: 0.82,
  thresholds: {
    tMeanJudges: 0.85,
    tMinJudges: 0.85,
    tMeanDims: 0.85,
    tMinDims: 0.85
  },
  thresholdsHit: ["minJudges", "minDims"]
} as const;

function describeFailure(failure: PileFailure): string {
  switch (failure.class) {
    case "pile-timeout":
      return `${failure.kind}:${failure.class}:${failure.elapsedMs}`;
    case "pile-budget-exhausted":
      return `${failure.kind}:${failure.class}:${failure.dimension}`;
    case "pile-schema-parse":
      return `${failure.kind}:${failure.class}:${failure.sourceOfTruth}`;
    case "pile-all-rejected":
      return `${failure.kind}:${failure.class}:${failure.candidatesEvaluated}`;
    case "pile-network":
      return `${failure.kind}:${failure.class}:${failure.attempt}`;
    case "pile-cancelled":
      return `${failure.kind}:${failure.class}:${failure.reason}`;
    case "eval-consensus-block":
      return `${failure.kind}:${failure.class}:${failure.thresholdsHit.join(",")}`;
    default:
      return assertNever(failure);
  }
}

describe("PileFailure", () => {
  it("still accepts an existing pile-timeout failure", () => {
    const failure: PileFailure = {
      kind: "planning",
      class: "pile-timeout",
      elapsedMs: 120_000,
      configuredTimeoutMs: 60_000
    };

    assert.equal(describeFailure(failure), "planning:pile-timeout:120000");
  });

  it("accepts an evaluation consensus block with threshold evidence", () => {
    const failure: PileFailure = {
      kind: "evaluation",
      class: "eval-consensus-block",
      breakdown: consensusBreakdown,
      thresholdsHit: ["meanJudges"]
    };

    assert.equal(failure.kind, "evaluation");
    assert.equal(describeFailure(failure), "evaluation:eval-consensus-block:meanJudges");
  });
});
