import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MechanicalScores, ReviewGate } from "./index.js";

describe("ReviewGate mechanicalScores extension", () => {
  it("keeps ReviewGate object literals without mechanicalScores valid", () => {
    const gate: ReviewGate = {
      planId: "plan-a",
      runId: "run-a",
      verdict: "pass",
      findings: []
    };

    assert.equal(gate.mechanicalScores, undefined);
  });

  it("preserves strict four-field mechanical scores when supplied", () => {
    const scores: MechanicalScores = { build: 1, lint: 1, diffSize: 1, acCoverage: 0.8 };
    const gate: ReviewGate = {
      planId: "plan-a",
      runId: "run-a",
      verdict: "repair",
      findings: [],
      mechanicalScores: scores
    };

    assert.deepEqual(gate.mechanicalScores, scores);

    // @ts-expect-error mechanical scores require all four fields.
    const _missing: MechanicalScores = { build: 1 };
    void _missing;

    const _extra: MechanicalScores = {
      build: 1,
      lint: 1,
      diffSize: 1,
      acCoverage: 0.8,
      // @ts-expect-error mechanical scores reject excess fields.
      extra: 1
    };
    void _extra;
  });
});
