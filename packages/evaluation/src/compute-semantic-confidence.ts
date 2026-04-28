import type { JudgeCritique } from "@protostar/review";

import { EVALUATION_RUBRIC_DIMENSIONS } from "./index.js";

export function computeSemanticConfidence(critiques: readonly JudgeCritique[]): number {
  if (critiques.length < 2) {
    return 0;
  }

  const judgeMeans = critiques.map((critique) => {
    const values = EVALUATION_RUBRIC_DIMENSIONS.map((dimension) => critique.rubric[dimension] ?? 0);
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  });
  const mean = judgeMeans.reduce((sum, value) => sum + value, 0) / judgeMeans.length;
  const variance = judgeMeans.reduce((sum, value) => sum + (value - mean) ** 2, 0) / judgeMeans.length;

  return Math.max(0, Math.min(1, 1 - variance));
}
