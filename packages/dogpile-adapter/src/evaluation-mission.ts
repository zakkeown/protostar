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
  readonly judgeId?: string;
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
  const judgeId = input.judgeId ?? "eval-baseline";

  return {
    preset: evaluationPilePreset,
    intent: [
      "You are an evaluation judge. Score the completed factory run against this fixed rubric:",
      EVALUATION_RUBRIC_DIMENSIONS.join(", "),
      "",
      "Each rubric value MUST be a number in [0,1], where 1 is best/ready/safe and 0 is worst/not ready/unsafe.",
      "For regressionRisk, score low regression risk near 1 and high regression risk near 0.",
      'Set verdict to exactly "pass" or exactly "fail"; do not copy a union literal or any other value.',
      `Use judgeId "${judgeId}" in every critique you return.`,
      "The JSON object below is a schema example only. Replace the model, rubric numbers, verdict, and rationale with evidence-based values.",
      "Never return placeholder all-zero rubric values unless the evidence is completely absent or failing.",
      "Do not wrap the response in markdown fences.",
      "Return JSON only with this exact shape:",
      JSON.stringify({
        judgeCritiques: [
          {
            judgeId,
            model: "model-name",
            rubric: Object.fromEntries(EVALUATION_RUBRIC_DIMENSIONS.map((dimension) => [dimension, 0])),
            verdict: "pass",
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
      "Command evidence values are exit codes/status, not rubric scores: 0 means the command succeeded/passed; any nonzero exit code means the command failed.",
      `- buildExitCode: ${input.executionEvidence.buildExitCode ?? "unknown"}`,
      `- lintExitCode: ${input.executionEvidence.lintExitCode ?? "unknown"}`,
      ...(stdoutTail !== undefined ? ["", "stdoutTail:", stdoutTail] : [])
    ].join("\n")
  };
}
