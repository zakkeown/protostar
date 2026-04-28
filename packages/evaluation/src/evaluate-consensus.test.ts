import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { JudgeCritique } from "@protostar/review";

import {
  DEFAULT_CONSENSUS_THRESHOLDS,
  evaluateConsensus,
  type ConsensusThresholds
} from "./evaluate-consensus.js";
import { EVALUATION_RUBRIC_DIMENSIONS, T_MEAN_DIMS, T_MEAN_JUDGES, T_MIN_DIMS, T_MIN_JUDGES } from "./index.js";

type ThresholdName = "meanJudges" | "minJudges" | "meanDims" | "minDims";

function makeCritique(judgeId: string, rubricValues: readonly number[]): JudgeCritique {
  return {
    judgeId,
    model: `${judgeId}-model`,
    verdict: "pass",
    rationale: "test critique",
    taskRefs: [],
    rubric: Object.fromEntries(
      EVALUATION_RUBRIC_DIMENSIONS.map((dimension, index) => [dimension, rubricValues[index] ?? 0])
    )
  };
}

function baseCritiques(): readonly JudgeCritique[] {
  return [
    makeCritique("judge-a", [1, 1, 1, 1, 1]),
    makeCritique("judge-b", [0.2, 0.7, 0.7, 0.7, 0.7])
  ];
}

function thresholdsFor(failures: ReadonlySet<ThresholdName>): ConsensusThresholds {
  return {
    tMeanJudges: failures.has("meanJudges") ? 0.81 : 0.8,
    tMinJudges: failures.has("minJudges") ? 0.61 : 0.6,
    tMeanDims: failures.has("meanDims") ? 0.81 : 0.8,
    tMinDims: failures.has("minDims") ? 0.61 : 0.6
  };
}

describe("evaluateConsensus", () => {
  describe("4-way threshold truth table", () => {
    it("truth table: all thresholds pass", () => runTruthTableCase([]));
    it("truth table: meanJudges fails", () => runTruthTableCase(["meanJudges"]));
    it("truth table: minJudges fails", () => runTruthTableCase(["minJudges"]));
    it("truth table: meanJudges and minJudges fail", () => runTruthTableCase(["meanJudges", "minJudges"]));
    it("truth table: meanDims fails", () => runTruthTableCase(["meanDims"]));
    it("truth table: meanJudges and meanDims fail", () => runTruthTableCase(["meanJudges", "meanDims"]));
    it("truth table: minJudges and meanDims fail", () => runTruthTableCase(["minJudges", "meanDims"]));
    it("truth table: meanJudges, minJudges, and meanDims fail", () =>
      runTruthTableCase(["meanJudges", "minJudges", "meanDims"]));
    it("truth table: minDims fails", () => runTruthTableCase(["minDims"]));
    it("truth table: meanJudges and minDims fail", () => runTruthTableCase(["meanJudges", "minDims"]));
    it("truth table: minJudges and minDims fail", () => runTruthTableCase(["minJudges", "minDims"]));
    it("truth table: meanJudges, minJudges, and minDims fail", () =>
      runTruthTableCase(["meanJudges", "minJudges", "minDims"]));
    it("truth table: meanDims and minDims fail", () => runTruthTableCase(["meanDims", "minDims"]));
    it("truth table: meanJudges, meanDims, and minDims fail", () =>
      runTruthTableCase(["meanJudges", "meanDims", "minDims"]));
    it("truth table: minJudges, meanDims, and minDims fail", () =>
      runTruthTableCase(["minJudges", "meanDims", "minDims"]));
    it("truth table: all four thresholds fail", () =>
      runTruthTableCase(["meanJudges", "minJudges", "meanDims", "minDims"]));
  });

  it("throws when no critiques are provided", () => {
    assert.throws(() => evaluateConsensus([]), /requires at least one critique/);
  });

  it("throws with the critique and dimension when a rubric key is missing", () => {
    const critique: JudgeCritique = {
      judgeId: "judge-missing",
      model: "model",
      verdict: "pass",
      rationale: "missing acMet",
      taskRefs: [],
      rubric: {
        codeQuality: 1,
        security: 1,
        regressionRisk: 1,
        releaseReadiness: 1
      }
    };

    assert.throws(() => evaluateConsensus([critique]), /judge-missing missing rubric dimension acMet/);
  });

  it("uses the default consensus thresholds when omitted", () => {
    assert.deepEqual(DEFAULT_CONSENSUS_THRESHOLDS, {
      tMeanJudges: T_MEAN_JUDGES,
      tMinJudges: T_MIN_JUDGES,
      tMeanDims: T_MEAN_DIMS,
      tMinDims: T_MIN_DIMS
    });

    const result = evaluateConsensus([
      makeCritique("judge-a", [0.85, 0.85, 0.85, 0.85, 0.85]),
      makeCritique("judge-b", [0.85, 0.85, 0.85, 0.85, 0.85])
    ]);

    assert.equal(result.verdict, "pass");
    assert.deepEqual(result.breakdown.thresholds, DEFAULT_CONSENSUS_THRESHOLDS);
  });
});

function runTruthTableCase(expectedFailures: readonly ThresholdName[]): void {
  const result = evaluateConsensus(baseCritiques(), thresholdsFor(new Set(expectedFailures)));

  assert.equal(result.verdict, expectedFailures.length === 0 ? "pass" : "fail");
  assert.deepEqual(result.breakdown.thresholdsHit, expectedFailures);
  assert.equal(result.score, 0.8);
  assert.deepEqual(result.breakdown.judgeMeans, [1, 0.6]);
  assert.equal(result.breakdown.meanOfJudgeMeans, 0.8);
  assert.equal(result.breakdown.minOfJudgeMeans, 0.6);
  assert.equal(result.breakdown.meanOfDimMeans, 0.8);
  assert.equal(result.breakdown.minOfDimMeans, 0.6);
}
