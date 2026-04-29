import { budget, convergence, firstOf } from "@protostar/dogpile-types";
import type { AgentSpec, DogpileOptions } from "@protostar/dogpile-types";
import type { ConfirmedIntent } from "@protostar/intent";
import {
  assertCandidatePlanFromPlanningPileResult,
  assertPlanningPileResult,
  parsePlanningPileResult,
  type CandidatePlanGraph,
  type PlanningAdmissionAcceptedArtifactPayload,
  type PlanningPileParseResult,
  type PlanningPileResult
} from "@protostar/planning";

export type FactoryPileKind = "planning" | "review" | "execution-coordination" | "evaluation";

export {
  assertCandidatePlanFromPlanningPileResult,
  assertPlanningPileResult,
  parsePlanningPileResult
};
export type {
  CandidatePlanGraph,
  PlanningPileParseResult,
  PlanningPileResult
};

// Phase 6 Plan 06-03: failure taxonomy + budget reconciliation surface.
// Plan 06-04 (`runFactoryPile`) consumes these via the barrel.
export type {
  EnvelopeBudget,
  JudgeDecisionRef,
  PileFailure,
  PileKind,
  PileSourceOfTruth,
  PresetBudget,
  ResolvedPileBudget
} from "./pile-failure-types.js";
export { resolvePileBudget } from "./resolve-pile-budget.js";
export {
  mapSdkStopToPileFailure,
  type MapSdkStopContext
} from "./map-sdk-stop-to-pile-failure.js";

// Phase 6 Plan 06-04: network-only SDK invocation seam.
export { runFactoryPile } from "./run-factory-pile.js";
export type {
  PileRunContext,
  PileRunOutcome,
  RunFactoryPileDeps
} from "./run-factory-pile.js";

// Phase 6 Plan 06-04 (Q-15): two-trigger execution-coordination mission builder.
export { buildExecutionCoordinationMission } from "./execution-coordination-mission.js";
export type {
  ExecutionCoordinationMissionInput,
  ExecutionCoordinationMode
} from "./execution-coordination-mission.js";
export { buildEvaluationMission } from "./evaluation-mission.js";
export type { EvaluationMissionInput } from "./evaluation-mission.js";

export interface FactoryPilePreset {
  readonly kind: FactoryPileKind;
  readonly description: string;
  readonly protocol: NonNullable<DogpileOptions["protocol"]>;
  readonly tier: NonNullable<DogpileOptions["tier"]>;
  readonly agents: readonly FactoryAgentSpec[];
  readonly budget: NonNullable<DogpileOptions["budget"]>;
  readonly terminate: NonNullable<DogpileOptions["terminate"]>;
}

export interface FactoryAgentSpec extends AgentSpec {
  readonly model?: string;
}

export interface FactoryPileMission {
  readonly preset: FactoryPilePreset;
  readonly intent: string;
}

export interface PriorGenerationSummary {
  readonly generation: number;
  readonly snapshotFields: readonly { readonly name: string; readonly type: string; readonly description?: string }[];
  readonly evolutionReason: string;
  readonly priorVerdict: "pass" | "fail";
  readonly priorEvaluationVerdict: "pass" | "fail";
  readonly includePriorCodeHints: boolean;
  readonly priorDiffNameOnly?: readonly string[];
}

export const planningPilePreset: FactoryPilePreset = {
  kind: "planning",
  description: "A planning coordinator integrates independent risk and verification input into one candidate-plan result.",
  protocol: { kind: "coordinator", maxTurns: 3 },
  tier: "quality",
  agents: [
    { id: "planner-architecture", role: "architecture-planner" },
    { id: "planner-risk", role: "risk-planner" },
    { id: "planner-tests", role: "verification-planner" }
  ],
  budget: {
    maxTokens: 24000,
    timeoutMs: 300000
  },
  terminate: firstOf(
    budget({ maxTokens: 24000, timeoutMs: 300000 }),
    convergence({ stableTurns: 2, minSimilarity: 0.86 })
  )
};

export const reviewPilePreset: FactoryPilePreset = {
  kind: "review",
  description: "Independent reviewers inspect artifacts for correctness, regressions, missing evidence, and release risk.",
  protocol: { kind: "broadcast", maxRounds: 2 },
  tier: "quality",
  agents: [
    { id: "review-correctness", role: "correctness-reviewer" },
    { id: "review-security", role: "security-reviewer" },
    { id: "review-release", role: "release-gate-reviewer" }
  ],
  budget: {
    maxTokens: 20000,
    timeoutMs: 120000
  },
  terminate: firstOf(
    budget({ maxTokens: 20000, timeoutMs: 120000 }),
    convergence({ stableTurns: 2, minSimilarity: 0.9 })
  )
};

export const executionCoordinationPilePreset: FactoryPilePreset = {
  kind: "execution-coordination",
  description: "A coordinator decomposes ready work, assigns worker slices, and synthesizes repair requests.",
  protocol: { kind: "coordinator", maxTurns: 3 },
  tier: "balanced",
  agents: [
    { id: "execution-lead", role: "execution-coordinator" },
    { id: "worker-implementation", role: "implementation-worker" },
    { id: "worker-verification", role: "verification-worker" }
  ],
  budget: {
    maxTokens: 16000,
    timeoutMs: 90000
  },
  terminate: firstOf(
    budget({ maxTokens: 16000, timeoutMs: 90000 }),
    convergence({ stableTurns: 2, minSimilarity: 0.84 })
  )
};

export const evaluationPilePreset: FactoryPilePreset = {
  kind: "evaluation",
  // evaluationPilePreset is intentionally baseline-only; factory-cli appends consensus when required.
  description: "A semantic evaluation judge scores completed run evidence against the fixed Phase 8 rubric.",
  protocol: { kind: "broadcast", maxRounds: 2 },
  tier: "quality",
  agents: [
    { id: "eval-baseline", role: "semantic-judge", model: "Qwen3-Next-80B-A3B-MLX-4bit" }
  ],
  budget: {
    maxTokens: 20000,
    timeoutMs: 120000
  },
  terminate: firstOf(
    budget({ maxTokens: 20000, timeoutMs: 120000 }),
    convergence({ stableTurns: 2, minSimilarity: 0.9 })
  )
};

export const EVAL_CONSENSUS_AGENT_DEFAULT = {
  id: "eval-consensus",
  role: "consensus-judge",
  model: "DeepSeek-Coder-V2-Lite-Instruct"
} as const satisfies FactoryAgentSpec;

export function buildPlanningMission(intent: ConfirmedIntent, prior?: PriorGenerationSummary): FactoryPileMission {
  return {
    preset: planningPilePreset,
    intent: [
      `Confirmed intent: ${intent.title}`,
      "",
      intent.problem,
      "",
      "Acceptance criteria:",
      ...intent.acceptanceCriteria.map((criterion) => `- ${criterion.id}: ${criterion.statement}`),
      "",
      "Return candidate-plan JSON only: task ids, dependencies, verification gates, release risks, and required capabilities.",
      "Dogpile planning output is not an admitted plan, execution-ready plan, or downstream handoff.",
      "Do not include admittedPlan, handoff, executionPlan, readyForExecution, status, admittedCapabilities, or budget.admitted fields.",
      "Each task requiredCapabilities must use the normalized capability-envelope shape: repoScopes array, toolPermissions array, optional executeGrants array, and budget object.",
      ...previousGenerationSummaryLines(prior)
    ].join("\n")
  };
}

function previousGenerationSummaryLines(prior: PriorGenerationSummary | undefined): readonly string[] {
  if (prior === undefined) return [];

  return [
    "",
    "## Previous Generation Summary",
    `Generation: ${prior.generation}`,
    `Prior verdict: ${prior.priorVerdict}`,
    `Prior evaluation verdict: ${prior.priorEvaluationVerdict}`,
    `Reason: ${prior.evolutionReason}`,
    "Snapshot fields:",
    ...prior.snapshotFields.map((field) => `- ${field.name}: ${field.type}${field.description === undefined ? "" : ` — ${field.description}`}`),
    ...(prior.includePriorCodeHints && prior.priorDiffNameOnly !== undefined
      ? [`Prior diff: ${prior.priorDiffNameOnly.join(", ")}`]
      : [])
  ];
}

export function buildReviewMission(
  intent: ConfirmedIntent,
  planningAdmission: PlanningAdmissionAcceptedArtifactPayload
): FactoryPileMission {
  return {
    preset: reviewPilePreset,
    intent: [
      `Review factory run for: ${intent.title}`,
      "",
      `Admitted plan: ${planningAdmission.planId}`,
      `Review input artifact: ${planningAdmission.artifact}`,
      `Planning admission decision: ${planningAdmission.decision}`,
      `Planning admission status: ${planningAdmission.admissionStatus}`,
      `Plan proof source: ${planningAdmission.candidateSource.sourceOfTruth} at ${planningAdmission.candidateSource.uri}`,
      "",
      "Review execution evidence quality, planning-admission consistency, unsafe authority expansion, and release readiness.",
      "Do not consume candidate-plan objects; planning-admission.json is the review admission boundary."
    ].join("\n")
  };
}
