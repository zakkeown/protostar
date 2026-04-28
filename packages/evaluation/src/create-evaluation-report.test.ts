import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createEvaluationReport,
  type ConsensusEvalResult,
  type MechanicalEvalResult,
  type SemanticEvalResult
} from "./index.js";

function mechanical(overrides: Partial<MechanicalEvalResult> = {}): MechanicalEvalResult {
  return {
    verdict: "pass",
    score: 1,
    scores: { build: 1, lint: 1, diffSize: 1, acCoverage: 1 },
    ...overrides
  };
}

function semantic(overrides: Partial<SemanticEvalResult> = {}): SemanticEvalResult {
  return {
    verdict: "pass",
    score: 0.9,
    confidence: 0.92,
    judges: [],
    ...overrides
  };
}

function consensus(overrides: Partial<ConsensusEvalResult> = {}): ConsensusEvalResult {
  return {
    verdict: "pass",
    score: 0.9,
    judges: [],
    breakdown: {
      judgeMeans: [0.9],
      dimMeans: {
        acMet: 0.9,
        codeQuality: 0.9,
        security: 0.9,
        regressionRisk: 0.9,
        releaseReadiness: 0.9
      },
      meanOfJudgeMeans: 0.9,
      minOfJudgeMeans: 0.9,
      meanOfDimMeans: 0.9,
      minOfDimMeans: 0.9,
      thresholds: {
        tMeanJudges: 0.85,
        tMinJudges: 0.85,
        tMeanDims: 0.85,
        tMinDims: 0.85
      },
      thresholdsHit: []
    },
    ...overrides
  };
}

function assertOnlyRealVerdicts(report: ReturnType<typeof createEvaluationReport>): void {
  assert.equal(report.stages.every((stage) => stage.verdict === "pass" || stage.verdict === "fail"), true);
}

describe("createEvaluationReport", () => {
  it("passes when mechanical, semantic, and consensus all pass", () => {
    const report = createEvaluationReport({
      runId: "run_eval_all_pass",
      mechanical: mechanical(),
      semantic: semantic(),
      consensus: consensus()
    });

    assert.equal(report.verdict, "pass");
    assert.equal(report.stages.length, 3);
    assertOnlyRealVerdicts(report);
  });

  it("fails when mechanical fails while still emitting all supplied stages", () => {
    const report = createEvaluationReport({
      runId: "run_eval_mech_fail",
      mechanical: mechanical({ verdict: "fail", score: 0 }),
      semantic: semantic(),
      consensus: consensus()
    });

    assert.equal(report.verdict, "fail");
    assert.deepEqual(report.stages.map((stage) => stage.stage), ["mechanical", "semantic", "consensus"]);
    assertOnlyRealVerdicts(report);
  });

  it("fails when semantic fails", () => {
    const report = createEvaluationReport({
      runId: "run_eval_semantic_fail",
      mechanical: mechanical(),
      semantic: semantic({ verdict: "fail", score: 0.4, confidence: 0.4 }),
      consensus: consensus()
    });

    assert.equal(report.verdict, "fail");
    assertOnlyRealVerdicts(report);
  });

  it("fails when consensus fails", () => {
    const report = createEvaluationReport({
      runId: "run_eval_consensus_fail",
      mechanical: mechanical(),
      semantic: semantic(),
      consensus: consensus({ verdict: "fail", score: 0.7 })
    });

    assert.equal(report.verdict, "fail");
    assertOnlyRealVerdicts(report);
  });

  it("omits the consensus stage when consensus was not required", () => {
    const report = createEvaluationReport({
      runId: "run_eval_no_consensus_fail",
      mechanical: mechanical({ verdict: "fail", score: 0 }),
      semantic: semantic()
    });

    assert.equal(report.verdict, "fail");
    assert.deepEqual(report.stages.map((stage) => stage.stage), ["mechanical", "semantic"]);
    assertOnlyRealVerdicts(report);
  });

  it("passes without consensus when mechanical and semantic pass", () => {
    const report = createEvaluationReport({
      runId: "run_eval_no_consensus_pass",
      mechanical: mechanical(),
      semantic: semantic()
    });

    assert.equal(report.verdict, "pass");
    assert.equal(report.stages.length, 2);
    assertOnlyRealVerdicts(report);
  });

  it("includes score values in stage summaries", () => {
    const report = createEvaluationReport({
      runId: "run_eval_summaries",
      mechanical: mechanical({ score: 0.95, scores: { build: 1, lint: 1, diffSize: 1, acCoverage: 0.95 } }),
      semantic: semantic({ score: 0.875, confidence: 0.875 }),
      consensus: consensus({ score: 0.86 })
    });

    assert.match(report.stages[0]?.summary ?? "", /build=1/);
    assert.match(report.stages[0]?.summary ?? "", /min=0.95/);
    assert.match(report.stages[1]?.summary ?? "", /confidence=0.875/);
    assert.match(report.stages[1]?.summary ?? "", /T_CONF=/);
    assert.match(report.stages[2]?.summary ?? "", /Consensus/);
    assertOnlyRealVerdicts(report);
  });

  it("round-trips runId from input", () => {
    const report = createEvaluationReport({
      runId: "run_eval_round_trip",
      mechanical: mechanical(),
      semantic: semantic()
    });

    assert.equal(report.runId, "run_eval_round_trip");
    assertOnlyRealVerdicts(report);
  });
});
