import type {
  ConsensusEvalResult,
  EvaluationReport,
  EvaluationStageResult,
  EvaluationVerdict,
  MechanicalEvalResult,
  SemanticEvalResult
} from "./index.js";
import { T_CONF } from "./index.js";

export interface CreateEvaluationReportInput {
  readonly runId: string;
  readonly mechanical: MechanicalEvalResult;
  readonly semantic: SemanticEvalResult;
  readonly consensus?: ConsensusEvalResult;
}

export function createEvaluationReport(input: CreateEvaluationReportInput): EvaluationReport {
  const stages: EvaluationStageResult[] = [
    {
      stage: "mechanical",
      verdict: input.mechanical.verdict,
      score: input.mechanical.score,
      scores: input.mechanical.scores,
      summary:
        `Mechanical scores: build=${input.mechanical.scores.build}, lint=${input.mechanical.scores.lint}, ` +
        `diffSize=${input.mechanical.scores.diffSize}, acCoverage=${input.mechanical.scores.acCoverage}; ` +
        `min=${input.mechanical.score}`
    },
    {
      stage: "semantic",
      verdict: input.semantic.verdict,
      score: input.semantic.score,
      summary: `Semantic confidence=${input.semantic.confidence.toFixed(3)}; T_CONF=${T_CONF}`
    }
  ];

  if (input.consensus !== undefined) {
    stages.push({
      stage: "consensus",
      verdict: input.consensus.verdict,
      score: input.consensus.score,
      scores: input.consensus.breakdown.dimMeans,
      summary: input.consensus.breakdown.thresholdsHit.length === 0
        ? `Consensus passed all four harsh thresholds; score=${input.consensus.score}`
        : `Consensus thresholdsHit: ${input.consensus.breakdown.thresholdsHit.join(", ")}; score=${input.consensus.score}`
    });
  }

  const verdict: EvaluationVerdict = stages.every((stage) => stage.verdict === "pass") ? "pass" : "fail";
  return { runId: input.runId, verdict, stages };
}
