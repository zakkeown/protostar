import type { JudgeCritique } from "@protostar/review";

import type { ConsensusBreakdown, ConsensusEvalResult, EvaluationRubricDimension } from "./index.js";

const EVALUATION_RUBRIC_DIMENSIONS = [
  "acMet",
  "codeQuality",
  "security",
  "regressionRisk",
  "releaseReadiness"
] as const satisfies readonly EvaluationRubricDimension[];
const T_MEAN_JUDGES = 0.85;
const T_MIN_JUDGES = 0.85;
const T_MEAN_DIMS = 0.85;
const T_MIN_DIMS = 0.85;

export interface ConsensusThresholds {
  readonly tMeanJudges: number;
  readonly tMinJudges: number;
  readonly tMeanDims: number;
  readonly tMinDims: number;
}

export const DEFAULT_CONSENSUS_THRESHOLDS: ConsensusThresholds = {
  tMeanJudges: T_MEAN_JUDGES,
  tMinJudges: T_MIN_JUDGES,
  tMeanDims: T_MEAN_DIMS,
  tMinDims: T_MIN_DIMS
};

export function evaluateConsensus(
  critiques: readonly JudgeCritique[],
  thresholds: ConsensusThresholds = DEFAULT_CONSENSUS_THRESHOLDS
): ConsensusEvalResult {
  if (critiques.length === 0) {
    throw new Error("evaluateConsensus requires at least one critique");
  }

  for (const critique of critiques) {
    for (const dimension of EVALUATION_RUBRIC_DIMENSIONS) {
      if (typeof critique.rubric[dimension] !== "number") {
        throw new Error(`evaluateConsensus: critique ${critique.judgeId} missing rubric dimension ${dimension}`);
      }
    }
  }

  const judgeMeans = critiques.map((critique) =>
    EVALUATION_RUBRIC_DIMENSIONS.reduce((sum, dimension) => sum + (critique.rubric[dimension] as number), 0) /
    EVALUATION_RUBRIC_DIMENSIONS.length
  );
  const dimMeansEntries = EVALUATION_RUBRIC_DIMENSIONS.map((dimension) => {
    const mean = critiques.reduce((sum, critique) => sum + (critique.rubric[dimension] as number), 0) / critiques.length;
    return [dimension, mean] as const;
  });
  const dimMeans = Object.fromEntries(dimMeansEntries) as Record<EvaluationRubricDimension, number>;
  const dimMeanValues = dimMeansEntries.map(([, value]) => value);

  const meanOfJudgeMeans = mean(judgeMeans);
  const minOfJudgeMeans = Math.min(...judgeMeans);
  const meanOfDimMeans = mean(dimMeanValues);
  const minOfDimMeans = Math.min(...dimMeanValues);

  const thresholdsHit: string[] = [];
  if (meanOfJudgeMeans < thresholds.tMeanJudges) thresholdsHit.push("meanJudges");
  if (minOfJudgeMeans < thresholds.tMinJudges) thresholdsHit.push("minJudges");
  if (meanOfDimMeans < thresholds.tMeanDims) thresholdsHit.push("meanDims");
  if (minOfDimMeans < thresholds.tMinDims) thresholdsHit.push("minDims");

  const breakdown: ConsensusBreakdown = {
    judgeMeans,
    dimMeans,
    meanOfJudgeMeans,
    minOfJudgeMeans,
    meanOfDimMeans,
    minOfDimMeans,
    thresholds: {
      tMeanJudges: thresholds.tMeanJudges,
      tMinJudges: thresholds.tMinJudges,
      tMeanDims: thresholds.tMeanDims,
      tMinDims: thresholds.tMinDims
    },
    thresholdsHit
  };
  const judges = critiques.map((critique) => ({
    judgeId: critique.judgeId,
    model: critique.model,
    rubric: Object.fromEntries(
      EVALUATION_RUBRIC_DIMENSIONS.map((dimension) => [dimension, critique.rubric[dimension] as number])
    ) as Record<EvaluationRubricDimension, number>
  }));

  return {
    verdict: thresholdsHit.length === 0 ? "pass" : "fail",
    score: meanOfJudgeMeans,
    breakdown,
    judges
  };
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
