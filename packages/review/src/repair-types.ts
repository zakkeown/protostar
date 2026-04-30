import type {
  AdmittedPlanExecutionArtifact,
  RepairContext
} from "@protostar/planning";
import type { AdapterAttemptRef } from "@protostar/planning";

import type { JudgeCritique } from "./judge-types.js";
import type { ReviewFinding, ReviewGate, ReviewVerdict } from "./index.js";

export type { AdapterAttemptRef, RepairContext } from "@protostar/planning";

export interface RepairTask {
  readonly planTaskId: string;
  readonly mechanicalCritiques: readonly ReviewFinding[];
  readonly modelCritiques?: readonly JudgeCritique[];
}

export interface RepairPlan {
  readonly runId: string;
  readonly attempt: number;
  readonly repairs: readonly RepairTask[];
  readonly dependentTaskIds: readonly string[];
}

export interface MechanicalCheckCommandResult {
  readonly id: string;
  readonly argv: readonly string[];
  readonly exitCode: number;
  readonly durationMs: number;
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly stdoutTail?: string;
  readonly stderrTail?: string;
}

export interface MechanicalCheckResult {
  readonly schemaVersion: "1.0.0";
  readonly runId: string;
  readonly attempt: number;
  readonly commands: readonly MechanicalCheckCommandResult[];
  readonly diffNameOnly: readonly string[];
  readonly findings: readonly ReviewFinding[];
}

export interface ModelReviewInput {
  readonly admittedPlan: AdmittedPlanExecutionArtifact;
  readonly executionResult: unknown;
  readonly mechanicalGate: ReviewGate;
  readonly diff: {
    readonly nameOnly: readonly string[];
    readonly unifiedDiff: string;
  };
  readonly repairContext?: RepairContext;
}

export interface ModelReviewResult {
  readonly verdict: ReviewVerdict;
  readonly critiques: readonly JudgeCritique[];
}

export type ModelReviewer = (input: ModelReviewInput) => Promise<ModelReviewResult>;

export interface MechanicalCheckerInput {
  readonly admittedPlan: AdmittedPlanExecutionArtifact;
  readonly executionResult: unknown;
  readonly attempt: number;
  readonly runId: string;
}

export type MechanicalChecker = (input: MechanicalCheckerInput) => Promise<{
  readonly gate: ReviewGate;
  readonly result: MechanicalCheckResult;
}>;
