import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { JudgeCritique } from "@protostar/review";

import { computeSemanticConfidence } from "./compute-semantic-confidence.js";

function critique(judgeId: string, score: number): JudgeCritique {
  return {
    judgeId,
    model: `${judgeId}-model`,
    verdict: "pass",
    rationale: "test critique",
    taskRefs: [],
    rubric: {
      acMet: score,
      codeQuality: score,
      security: score,
      regressionRisk: score,
      releaseReadiness: score
    }
  };
}

describe("computeSemanticConfidence", () => {
  it("returns zero for a single critique to force consensus", () => {
    assert.equal(computeSemanticConfidence([critique("judge-a", 1)]), 0);
  });

  it("returns one when judge means are identical", () => {
    assert.equal(computeSemanticConfidence([critique("judge-a", 0.8), critique("judge-b", 0.8)]), 1);
  });

  it("returns inverse variance across judge means", () => {
    assert.equal(computeSemanticConfidence([critique("judge-a", 0.8), critique("judge-b", 0.4)]), 0.96);
  });

  it("returns zero for empty critiques", () => {
    assert.equal(computeSemanticConfidence([]), 0);
  });
});
