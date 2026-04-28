import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createEvaluationReport,
  EVALUATION_RUBRIC_DIMENSIONS,
  T_CONF,
  T_MEAN_DIMS,
  T_MEAN_JUDGES,
  T_MECH,
  T_MIN_DIMS,
  T_MIN_JUDGES,
  type ConsensusBreakdown,
  type EvaluationRubricDimension,
  type EvaluationStageStatus,
  type MechanicalEvalResult,
  type SemanticEvalResult
} from "./index.js";

// @ts-expect-error Q-11 removes skipped from evaluation stage verdicts.
const skippedStatus: EvaluationStageStatus = "skipped";
void skippedStatus;

describe("Phase 8 evaluation type surface", () => {
  it("exports the fixed five-dimension rubric as literals", () => {
    assert.deepEqual(EVALUATION_RUBRIC_DIMENSIONS, [
      "acMet",
      "codeQuality",
      "security",
      "regressionRisk",
      "releaseReadiness"
    ]);
    assert.equal(EVALUATION_RUBRIC_DIMENSIONS.length, 5);
    const dimension: EvaluationRubricDimension = EVALUATION_RUBRIC_DIMENSIONS[0];
    assert.equal(dimension, "acMet");
  });

  it("exports the Phase 8 placeholder thresholds as numeric literals", () => {
    assert.equal(T_MECH, 0.95);
    assert.equal(T_CONF, 0.85);
    assert.equal(T_MEAN_JUDGES, 0.85);
    assert.equal(T_MIN_JUDGES, 0.85);
    assert.equal(T_MEAN_DIMS, 0.85);
    assert.equal(T_MIN_DIMS, 0.85);
  });

  it("keeps MechanicalEvalResult scores strict to the four mechanical dimensions", () => {
    const result: MechanicalEvalResult = {
      verdict: "pass",
      score: 0.95,
      scores: { build: 1, lint: 1, diffSize: 1, acCoverage: 0.8 }
    };

    assert.equal(result.scores.acCoverage, 0.8);

    const _missingScores: MechanicalEvalResult = {
      verdict: "fail",
      score: 0,
      // @ts-expect-error mechanical scores require all four fields.
      scores: { build: 1 }
    };
    void _missingScores;

    const _extraScores: MechanicalEvalResult = {
      verdict: "fail",
      score: 0,
      // @ts-expect-error mechanical scores reject excess fields.
      scores: { build: 1, lint: 1, diffSize: 1, acCoverage: 0.8, extra: 1 }
    };
    void _extraScores;
  });

  it("keys semantic judge rubrics by the fixed rubric dimensions", () => {
    const result: SemanticEvalResult = {
      verdict: "pass",
      score: 0.9,
      confidence: 0.99,
      judges: [
        {
          judgeId: "judge-a",
          model: "qwen",
          rubric: {
            acMet: 1,
            codeQuality: 0.9,
            security: 1,
            regressionRisk: 0.8,
            releaseReadiness: 0.9
          }
        }
      ]
    };

    assert.equal(result.judges[0]?.rubric.releaseReadiness, 0.9);
  });

  it("allows consensus breakdown threshold-hit evidence", () => {
    const breakdown: ConsensusBreakdown = {
      judgeMeans: [0.8, 0.9],
      dimMeans: {
        acMet: 0.9,
        codeQuality: 0.8,
        security: 0.9,
        regressionRisk: 0.8,
        releaseReadiness: 0.9
      },
      meanOfJudgeMeans: 0.85,
      minOfJudgeMeans: 0.8,
      meanOfDimMeans: 0.86,
      minOfDimMeans: 0.8,
      thresholds: {
        tMeanJudges: T_MEAN_JUDGES,
        tMinJudges: T_MIN_JUDGES,
        tMeanDims: T_MEAN_DIMS,
        tMinDims: T_MIN_DIMS
      },
      thresholdsHit: ["minJudges", "minDims"]
    };

    assert.deepEqual(breakdown.thresholdsHit, ["minJudges", "minDims"]);
  });

  it("keeps the legacy createEvaluationReport overload degraded and non-throwing", () => {
    const report = createEvaluationReport({
      runId: "run_eval_degraded",
      reviewGate: {
        planId: "plan-a",
        runId: "run_eval_degraded",
        verdict: "pass",
        findings: []
      }
    });

    assert.equal(report.verdict, "fail");
    assert.equal(report.stages.length, 3);
    for (const stage of report.stages) {
      assert.equal(stage.verdict, "fail");
      assert.equal(stage.score, 0);
      assert.equal(stage.summary, "Phase 8 Plan 08-07 replaces this call site.");
      assert.equal(JSON.stringify(stage).includes("skipped"), false);
    }
  });
});
