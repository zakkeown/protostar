import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ReviewGate } from "@protostar/review";

import { computeMechanicalScores, type MechanicalScoreInput } from "./compute-mechanical-scores.js";

const reviewGate: ReviewGate = {
  planId: "plan_eval",
  runId: "run_eval",
  verdict: "pass",
  findings: []
};

function mechanicalInput(overrides: Partial<MechanicalScoreInput> = {}): MechanicalScoreInput {
  return {
    reviewGate,
    archetype: "cosmetic-tweak",
    buildExitCode: 0,
    lintExitCode: 0,
    diffNameOnly: ["src/button.ts"],
    totalAcCount: 5,
    coveredAcCount: 5,
    ...overrides
  };
}

describe("computeMechanicalScores", () => {
  it("passes when build, lint, cosmetic diff size, and AC coverage all pass", () => {
    const result = computeMechanicalScores(mechanicalInput());

    assert.deepEqual(result.scores, {
      build: 1,
      lint: 1,
      diffSize: 1,
      acCoverage: 1
    });
    assert.equal(result.score, 1);
    assert.equal(result.verdict, "pass");
  });

  it("fails when lint exits non-zero", () => {
    const result = computeMechanicalScores(mechanicalInput({ lintExitCode: 1 }));

    assert.equal(result.scores.lint, 0);
    assert.equal(result.score, 0);
    assert.equal(result.verdict, "fail");
  });

  it("fails a cosmetic tweak when more than one file changed", () => {
    const result = computeMechanicalScores(mechanicalInput({ diffNameOnly: ["src/a.ts", "src/b.ts"] }));

    assert.equal(result.scores.diffSize, 0);
    assert.equal(result.score, 0);
    assert.equal(result.verdict, "fail");
  });

  it("uses partial acceptance-criteria coverage as the minimum score", () => {
    const result = computeMechanicalScores(mechanicalInput({ coveredAcCount: 3, totalAcCount: 5 }));

    assert.equal(result.scores.acCoverage, 0.6);
    assert.equal(result.score, 0.6);
    assert.equal(result.verdict, "fail");
  });

  it("treats zero acceptance criteria as fully covered", () => {
    const result = computeMechanicalScores(mechanicalInput({ coveredAcCount: 0, totalAcCount: 0 }));

    assert.equal(result.scores.acCoverage, 1);
  });
});
