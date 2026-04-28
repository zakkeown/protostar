import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SemanticEvalResult } from "./index.js";

import { shouldRunConsensus } from "./should-run-consensus.js";

function semantic(confidence: number): SemanticEvalResult {
  return {
    verdict: "pass",
    score: confidence,
    confidence,
    judges: []
  };
}

describe("shouldRunConsensus", () => {
  it("does not run consensus when confidence exceeds threshold", () => {
    assert.equal(shouldRunConsensus(semantic(0.9), 0.85), false);
  });

  it("runs consensus when confidence is below threshold", () => {
    assert.equal(shouldRunConsensus(semantic(0.7), 0.85), true);
  });

  it("does not run consensus at the threshold boundary", () => {
    assert.equal(shouldRunConsensus(semantic(0.85), 0.85), false);
  });
});
