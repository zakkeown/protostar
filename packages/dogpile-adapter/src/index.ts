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

export type FactoryPileKind = "planning" | "review" | "execution-coordination";

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

export interface FactoryPilePreset {
  readonly kind: FactoryPileKind;
  readonly description: string;
  readonly protocol: NonNullable<DogpileOptions["protocol"]>;
  readonly tier: NonNullable<DogpileOptions["tier"]>;
  readonly agents: readonly AgentSpec[];
  readonly budget: NonNullable<DogpileOptions["budget"]>;
  readonly terminate: NonNullable<DogpileOptions["terminate"]>;
}

export interface FactoryPileMission {
  readonly preset: FactoryPilePreset;
  readonly intent: string;
}

export const planningPilePreset: FactoryPilePreset = {
  kind: "planning",
  description: "Independent planners propose a DAG, risks, capabilities, and acceptance coverage before synthesis.",
  protocol: { kind: "broadcast", maxRounds: 2 },
  tier: "quality",
  agents: [
    { id: "planner-architecture", role: "architecture-planner" },
    { id: "planner-risk", role: "risk-planner" },
    { id: "planner-tests", role: "verification-planner" }
  ],
  budget: {
    maxTokens: 24000,
    timeoutMs: 120000
  },
  terminate: firstOf(
    budget({ maxTokens: 24000, timeoutMs: 120000 }),
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

export function buildPlanningMission(intent: ConfirmedIntent): FactoryPileMission {
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
      "Each task requiredCapabilities must use the normalized capability-envelope shape: repoScopes array, toolPermissions array, optional executeGrants array, and budget object."
    ].join("\n")
  };
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
