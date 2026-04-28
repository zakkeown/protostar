/**
 * Phase 8 Plan 08-05 — evaluation pile mission builder.
 *
 * The evaluation pile scores completed run evidence. It is not the review-loop
 * verdict surface; callers parse the model JSON through @protostar/evaluation.
 *
 * Pure: no I/O, no clock reads.
 */

import type { ConfirmedIntent } from "@protostar/intent";
import type { AdmittedPlan } from "@protostar/planning";

import {
  evaluationPilePreset,
  type FactoryPileMission
} from "./index.js";

export interface EvaluationMissionInput {
  readonly intent: ConfirmedIntent;
  readonly plan: AdmittedPlan;
  readonly diffNameOnly: readonly string[];
  readonly executionEvidence: {
    readonly buildExitCode?: number;
    readonly lintExitCode?: number;
    readonly stdoutTail?: string;
  };
}

const STDOUT_TAIL_LIMIT = 2000;
const EVALUATION_RUBRIC_DIMENSIONS = [
  "acMet",
  "codeQuality",
  "security",
  "regressionRisk",
  "releaseReadiness"
] as const;

function truncateStdoutTail(stdoutTail: string | undefined): string | undefined {
  if (stdoutTail === undefined) return undefined;
  return stdoutTail.length <= STDOUT_TAIL_LIMIT ? stdoutTail : stdoutTail.slice(-STDOUT_TAIL_LIMIT);
}

export function buildEvaluationMission(input: EvaluationMissionInput): FactoryPileMission {
  const stdoutTail = truncateStdoutTail(input.executionEvidence.stdoutTail);

  return {
    preset: evaluationPilePreset,
    intent: [
      "You are an evaluation judge. Score the completed factory run against this fixed rubric:",
      EVALUATION_RUBRIC_DIMENSIONS.join(", "),
      "",
      "Each rubric value MUST be a number in [0,1].",
      "Return JSON only with this exact shape:",
      JSON.stringify({
        judgeCritiques: [
          {
            judgeId: "eval-baseline",
            model: "model-name",
            rubric: Object.fromEntries(EVALUATION_RUBRIC_DIMENSIONS.map((dimension) => [dimension, 0])),
            verdict: "pass|fail",
            rationale: "brief explanation"
          }
        ]
      }),
      "",
      `Intent title: ${input.intent.title}`,
      `Intent problem: ${input.intent.problem}`,
      "",
      "Acceptance criteria:",
      ...input.intent.acceptanceCriteria.map((criterion) => `- ${criterion.id}: ${criterion.statement}`),
      "",
      "Admitted plan:",
      `- planId: ${input.plan.planId}`,
      `- strategy: ${input.plan.strategy}`,
      ...input.plan.tasks.map((task) => `- task: ${task.id} ${task.title}`),
      "",
      "Diff name-only files:",
      ...(input.diffNameOnly.length > 0 ? input.diffNameOnly.map((file) => `- ${file}`) : ["- none"]),
      "",
      "Execution evidence:",
      `- build: ${input.executionEvidence.buildExitCode ?? "unknown"}`,
      `- lint: ${input.executionEvidence.lintExitCode ?? "unknown"}`,
      ...(stdoutTail !== undefined ? ["", "stdoutTail:", stdoutTail] : [])
    ].join("\n")
  };
}
