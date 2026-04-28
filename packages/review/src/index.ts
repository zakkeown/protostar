import type { StageArtifactRef } from "@protostar/artifacts";
import {
  runExecutionDryRun,
  validateAdmittedPlanExecutionArtifact,
  type ExecutionAdmittedPlanAdmissionViolation,
  type ExecutionDryRunResult,
  type ExecutionRunPlan
} from "@protostar/execution";
import {
  PLANNING_ADMISSION_ARTIFACT_NAME,
  type AdmittedPlanExecutionArtifact
} from "@protostar/planning";

export * from "./repair-types.js";
export * from "./judge-types.js";
export * from "./delivery-authorization.js";
export * from "./lifecycle-events.js";
export * from "./run-review-repair-loop.js";
export * from "./persist-iteration.js";
export * from "./load-delivery-authorization.js";
export * from "./review-pile-result.js";
export * from "./review-pile-reviewer.js";

export type ReviewVerdict = "pass" | "repair" | "block";
export type ReviewSeverity = "info" | "minor" | "major" | "critical";
export type ReviewRuleId =
  | "execution-result-consistency"
  | "execution-completed"
  | "task-evidence-present"
  | "intent-acceptance-covered"
  | "acceptance-evidence-passed";

export interface ReviewFinding {
  readonly ruleId: ReviewRuleId;
  readonly severity: ReviewSeverity;
  readonly summary: string;
  readonly evidence: readonly StageArtifactRef[];
  readonly repairTaskId?: string;
}

/**
 * Phase 8 Q-01 mechanical evaluation source scores.
 *
 * Optional on ReviewGate so existing review producers remain backward
 * compatible until @protostar/mechanical-checks starts producing them.
 */
export interface MechanicalScores {
  readonly build: number;
  readonly lint: number;
  readonly diffSize: number;
  readonly acCoverage: number;
}

export interface ReviewGate {
  readonly planId: string;
  readonly runId: string;
  readonly verdict: ReviewVerdict;
  readonly findings: readonly ReviewFinding[];
  readonly mechanicalScores?: MechanicalScores;
}

export interface MechanicalReviewGateInput {
  readonly admittedPlan: AdmittedPlanExecutionArtifact;
  readonly execution: ExecutionRunPlan;
  readonly executionResult: ExecutionDryRunResult;
}

export type ReviewAdmittedPlanAdmissionViolationCode =
  | "review-admission-boundary-failed-planning-result"
  | "review-admission-boundary-failed-admission-result"
  | "review-admission-boundary-candidate-plan"
  | "review-admission-boundary-raw-plan"
  | "review-admission-boundary-invalid-artifact";

export interface ReviewAdmittedPlanAdmissionViolation {
  readonly code: ReviewAdmittedPlanAdmissionViolationCode;
  readonly path: string;
  readonly message: string;
  readonly executionViolationCode?: ExecutionAdmittedPlanAdmissionViolation["code"];
}

export type ReviewAdmittedPlanAdmissionValidation =
  | {
      readonly ok: true;
      readonly artifact: AdmittedPlanExecutionArtifact;
      readonly violations: readonly [];
      readonly errors: readonly [];
    }
  | {
      readonly ok: false;
      readonly violations: readonly ReviewAdmittedPlanAdmissionViolation[];
      readonly errors: readonly string[];
    };

export type ReviewExecutionLoopAction = "approved" | "repair-and-retry" | "blocked" | "repair-limit-reached";
export type ReviewExecutionLoopStatus = "approved" | "blocked" | "repair-limit-reached";

export interface ReviewExecutionLoopIteration {
  readonly attempt: number;
  readonly action: ReviewExecutionLoopAction;
  readonly executionResult: ExecutionDryRunResult;
  readonly reviewGate: ReviewGate;
  readonly repairTaskIds: readonly string[];
}

export interface ReviewExecutionLoopResult {
  readonly status: ReviewExecutionLoopStatus;
  readonly maxRepairLoops: number;
  readonly iterations: readonly ReviewExecutionLoopIteration[];
  readonly finalExecutionResult: ExecutionDryRunResult;
  readonly finalReviewGate: ReviewGate;
}

export interface ReviewExecutionLoopInput {
  readonly admittedPlan: AdmittedPlanExecutionArtifact;
  readonly execution: ExecutionRunPlan;
  readonly initialFailTaskIds?: readonly string[];
  readonly maxRepairLoops?: number;
  readonly now?: () => string;
}

export function validateReviewAdmittedPlanArtifact(
  value: unknown
): ReviewAdmittedPlanAdmissionValidation {
  const executionValidation = validateAdmittedPlanExecutionArtifact(value);
  if (executionValidation.ok) {
    return {
      ok: true,
      artifact: executionValidation.artifact,
      violations: [],
      errors: []
    };
  }

  const violations = executionValidation.violations.map(reviewAdmissionViolationFromExecution);
  return {
    ok: false,
    violations,
    errors: violations.map((violation) => violation.message)
  };
}

export function assertReviewAdmittedPlanArtifact(
  value: unknown
): asserts value is AdmittedPlanExecutionArtifact {
  const validation = validateReviewAdmittedPlanArtifact(value);
  if (!validation.ok) {
    throw new Error(`Invalid admitted plan review artifact: ${validation.errors.join("; ")}`);
  }
}

export function createReviewGate(input: {
  readonly admittedPlan: AdmittedPlanExecutionArtifact;
  readonly execution: ExecutionRunPlan;
  readonly findings?: readonly ReviewFinding[];
  readonly mechanicalScores?: MechanicalScores;
}): ReviewGate {
  assertReviewAdmittedPlanArtifact(input.admittedPlan);
  const findings = input.findings ?? [];
  const verdict: ReviewVerdict = findings.some((finding) => finding.severity === "critical")
    ? "block"
    : findings.length > 0
      ? "repair"
      : "pass";

  return {
    planId: input.admittedPlan.planId,
    runId: input.execution.runId,
    verdict,
    findings,
    ...(input.mechanicalScores !== undefined ? { mechanicalScores: input.mechanicalScores } : {})
  };
}

/**
 * @deprecated Use runReviewRepairLoop for strict mechanical-to-model review and repair.
 */
export function runMechanicalReviewExecutionLoop(input: ReviewExecutionLoopInput): ReviewExecutionLoopResult {
  assertReviewAdmittedPlanArtifact(input.admittedPlan);
  const maxRepairLoops = Math.max(0, input.maxRepairLoops ?? 0);
  const failTaskIds = new Set(input.initialFailTaskIds ?? []);
  const iterations: ReviewExecutionLoopIteration[] = [];

  for (let attempt = 0; attempt <= maxRepairLoops; attempt += 1) {
    const executionResult = runExecutionDryRun({
      execution: input.execution,
      failTaskIds: [...failTaskIds],
      ...(input.now !== undefined ? { now: input.now } : {})
    });
    const reviewGate = createMechanicalReviewGate({
      admittedPlan: input.admittedPlan,
      execution: input.execution,
      executionResult
    });
    const repairTaskIds = uniqueRepairTaskIds(reviewGate);

    if (reviewGate.verdict === "pass") {
      iterations.push({
        attempt,
        action: "approved",
        executionResult,
        reviewGate,
        repairTaskIds
      });
      return {
        status: "approved",
        maxRepairLoops,
        iterations,
        finalExecutionResult: executionResult,
        finalReviewGate: reviewGate
      };
    }

    if (reviewGate.verdict === "block") {
      iterations.push({
        attempt,
        action: "blocked",
        executionResult,
        reviewGate,
        repairTaskIds
      });
      return {
        status: "blocked",
        maxRepairLoops,
        iterations,
        finalExecutionResult: executionResult,
        finalReviewGate: reviewGate
      };
    }

    if (attempt >= maxRepairLoops || repairTaskIds.length === 0) {
      iterations.push({
        attempt,
        action: "repair-limit-reached",
        executionResult,
        reviewGate,
        repairTaskIds
      });
      return {
        status: "repair-limit-reached",
        maxRepairLoops,
        iterations,
        finalExecutionResult: executionResult,
        finalReviewGate: reviewGate
      };
    }

    iterations.push({
      attempt,
      action: "repair-and-retry",
      executionResult,
      reviewGate,
      repairTaskIds
    });
    for (const repairTaskId of repairTaskIds) {
      failTaskIds.delete(repairTaskId);
    }
  }

  throw new Error("Review execution loop exited unexpectedly.");
}

export function createMechanicalReviewGate(input: MechanicalReviewGateInput): ReviewGate {
  assertReviewAdmittedPlanArtifact(input.admittedPlan);
  const findings: ReviewFinding[] = [
    ...reviewExecutionConsistency(input),
    ...reviewExecutionCompletion(input.executionResult),
    ...reviewTaskEvidence(input.executionResult)
  ];

  return createReviewGate({
    admittedPlan: input.admittedPlan,
    execution: input.execution,
    findings
  });
}

function reviewAdmissionViolationFromExecution(
  violation: ExecutionAdmittedPlanAdmissionViolation
): ReviewAdmittedPlanAdmissionViolation {
  if (violation.code === "admitted-plan-artifact-failed-planning-result") {
    return {
      code: "review-admission-boundary-failed-planning-result",
      path: violation.path,
      executionViolationCode: violation.code,
      message:
        "Review admission rejects failed planning results at the planning boundary; pass only the admitted-plan execution artifact created from persisted planning-admission.json handoff evidence. " +
        violation.message
    };
  }

  if (violation.code === "admitted-plan-artifact-failed-admission-result") {
    return {
      code: "review-admission-boundary-failed-admission-result",
      path: violation.path,
      executionViolationCode: violation.code,
      message:
        "Review admission rejects failed planning admission results at the planning boundary; pass only the admitted-plan execution artifact created from persisted planning-admission.json handoff evidence. " +
        violation.message
    };
  }

  if (violation.code === "admitted-plan-artifact-candidate-plan-object") {
    return {
      code: "review-admission-boundary-candidate-plan",
      path: violation.path,
      executionViolationCode: violation.code,
      message:
        "Review admission rejects candidate PlanGraph objects at the planning boundary; pass only the admitted-plan execution artifact created from persisted planning-admission.json handoff evidence."
    };
  }

  if (violation.code === "admitted-plan-artifact-raw-plan-object") {
    return {
      code: "review-admission-boundary-raw-plan",
      path: violation.path,
      executionViolationCode: violation.code,
      message:
        "Review admission rejects candidate or raw PlanGraph inputs at the planning boundary; pass only the admitted-plan execution artifact created from persisted planning-admission.json handoff evidence."
    };
  }

  return {
    code: "review-admission-boundary-invalid-artifact",
    path: violation.path,
    executionViolationCode: violation.code,
    message: `Review admission requires an admitted-plan execution artifact from planning-admission.json handoff evidence: ${violation.message}`
  };
}

function uniqueRepairTaskIds(reviewGate: ReviewGate): readonly string[] {
  return [
    ...new Set(
      reviewGate.findings.flatMap((finding) =>
        finding.repairTaskId !== undefined ? [finding.repairTaskId] : []
      )
    )
  ];
}

function reviewExecutionConsistency(input: MechanicalReviewGateInput): readonly ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const admittedPlan = input.admittedPlan;
  const expectedTaskById = new Map(admittedPlan.tasks.map((task) => [task.planTaskId, task]));
  const expectedTaskIds = new Set(expectedTaskById.keys());
  const expectedTaskIdsForMembership = new Set<string>(expectedTaskIds);
  const executionTaskById = new Map(input.execution.tasks.map((task) => [task.planTaskId, task]));
  const executionTaskIds = new Set(input.execution.tasks.map((task) => task.planTaskId));
  const resultTaskById = new Map(input.executionResult.tasks.map((task) => [task.planTaskId, task]));
  const resultTaskIds = new Set(input.executionResult.tasks.map((task) => task.planTaskId));

  if (input.execution.runId !== input.executionResult.runId) {
    findings.push(
      finding({
        ruleId: "execution-result-consistency",
        severity: "critical",
        summary: `Execution result runId ${input.executionResult.runId} does not match execution runId ${input.execution.runId}.`,
        evidence: [executionResultArtifact()]
      })
    );
  }

  if (input.execution.planId !== admittedPlan.planId || input.executionResult.planId !== admittedPlan.planId) {
    findings.push(
      finding({
        ruleId: "execution-result-consistency",
        severity: "critical",
        summary: "Execution artifacts do not all reference the admitted plan id.",
        evidence: [planningAdmissionArtifact(), executionPlanArtifact(), executionResultArtifact()]
      })
    );
  }

  if (!sameAdmittedPlanEvidence(input.execution.admittedPlan, admittedPlan.evidence)) {
    findings.push(
      finding({
        ruleId: "execution-result-consistency",
        severity: "critical",
        summary: "Execution plan was not derived from the reviewed admitted plan artifact evidence.",
        evidence: [planningAdmissionArtifact(), executionPlanArtifact()]
      })
    );
  }

  for (const taskId of expectedTaskIds) {
    const admittedTask = expectedTaskById.get(taskId);
    const executionTask = executionTaskById.get(taskId);
    const resultTask = resultTaskById.get(taskId);

    if (executionTask === undefined) {
      findings.push(
        finding({
          ruleId: "execution-result-consistency",
          severity: "critical",
          summary: `Plan task ${taskId} is missing from the execution plan.`,
          evidence: [planningAdmissionArtifact(), executionPlanArtifact()]
        })
      );
    } else if (
      admittedTask !== undefined &&
      (executionTask.title !== admittedTask.title || !sameOrderedValues(executionTask.dependsOn, admittedTask.dependsOn))
    ) {
      findings.push(
        finding({
          ruleId: "execution-result-consistency",
          severity: "critical",
          summary: `Execution plan task ${taskId} does not match the admitted plan artifact task contract.`,
          evidence: [planningAdmissionArtifact(), executionPlanArtifact()]
        })
      );
    }
    if (resultTask === undefined) {
      findings.push(
        finding({
          ruleId: "execution-result-consistency",
          severity: "critical",
          summary: `Plan task ${taskId} is missing from the execution result.`,
          evidence: [planningAdmissionArtifact(), executionResultArtifact()]
        })
      );
    } else if (
      admittedTask !== undefined &&
      (resultTask.title !== admittedTask.title || !sameOrderedValues(resultTask.dependsOn, admittedTask.dependsOn))
    ) {
      findings.push(
        finding({
          ruleId: "execution-result-consistency",
          severity: "critical",
          summary: `Execution result task ${taskId} does not match the admitted plan artifact task contract.`,
          evidence: [planningAdmissionArtifact(), executionResultArtifact()]
        })
      );
    }
  }

  for (const taskId of [...executionTaskIds, ...resultTaskIds]) {
    if (!expectedTaskIdsForMembership.has(taskId)) {
      findings.push(
        finding({
          ruleId: "execution-result-consistency",
          severity: "critical",
          summary: `Execution artifacts reference task ${taskId}, which is not in the reviewed plan.`,
          evidence: [planningAdmissionArtifact(), executionPlanArtifact(), executionResultArtifact()]
        })
      );
    }
  }

  return findings;
}

function reviewExecutionCompletion(executionResult: ExecutionDryRunResult): readonly ReviewFinding[] {
  if (executionResult.status === "succeeded") {
    return [];
  }

  return [
    finding({
      ruleId: "execution-completed",
      severity: "major",
      summary: "Execution did not pass; review gate requires repair before release.",
      evidence: [executionResultArtifact()]
    })
  ];
}

function reviewTaskEvidence(executionResult: ExecutionDryRunResult): readonly ReviewFinding[] {
  return executionResult.tasks.flatMap((task): ReviewFinding[] => {
    if (task.status === "failed") {
      return [
        finding({
          ruleId: "execution-completed",
          severity: "major",
          summary: `Execution task ${task.planTaskId} failed: ${task.reason ?? "no reason recorded"}`,
          evidence: task.evidence.length > 0 ? task.evidence : [executionResultArtifact()],
          repairTaskId: task.planTaskId
        })
      ];
    }

    if (task.evidence.length === 0) {
      return [
        finding({
          ruleId: "task-evidence-present",
          severity: "major",
          summary: `Succeeded execution task ${task.planTaskId} has no evidence artifact.`,
          evidence: [executionResultArtifact()],
          repairTaskId: task.planTaskId
        })
      ];
    }

    return [];
  });
}

function finding(input: {
  readonly ruleId: ReviewRuleId;
  readonly severity: ReviewSeverity;
  readonly summary: string;
  readonly evidence: readonly StageArtifactRef[];
  readonly repairTaskId?: string;
}): ReviewFinding {
  return {
    ruleId: input.ruleId,
    severity: input.severity,
    summary: input.summary,
    evidence: input.evidence,
    ...(input.repairTaskId !== undefined ? { repairTaskId: input.repairTaskId } : {})
  };
}

function planningAdmissionArtifact(): StageArtifactRef {
  return {
    stage: "planning",
    kind: "planning-admission",
    uri: PLANNING_ADMISSION_ARTIFACT_NAME,
    description: "Planning admission evidence that admitted the reviewed plan."
  };
}

function executionPlanArtifact(): StageArtifactRef {
  return {
    stage: "execution",
    kind: "execution-plan",
    uri: "execution-plan.json",
    description: "Execution task ordering derived from the plan graph."
  };
}

function sameAdmittedPlanEvidence(
  left: ExecutionRunPlan["admittedPlan"],
  right: AdmittedPlanExecutionArtifact["evidence"]
): boolean {
  return left.planId === right.planId &&
    left.intentId === right.intentId &&
    left.planGraphUri === right.planGraphUri &&
    left.planningAdmissionArtifact === right.planningAdmissionArtifact &&
    left.planningAdmissionUri === right.planningAdmissionUri &&
    left.validationSource === right.validationSource &&
    left.proofSource === right.proofSource;
}

function sameOrderedValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function executionResultArtifact(): StageArtifactRef {
  return {
    stage: "execution",
    kind: "execution-result",
    uri: "execution-result.json",
    description: "Dry-run execution result."
  };
}
