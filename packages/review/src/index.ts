import type { StageArtifactRef } from "@protostar/artifacts";
import { runExecutionDryRun, type ExecutionDryRunResult, type ExecutionRunPlan } from "@protostar/execution";
import type { ConfirmedIntent } from "@protostar/intent";
import type { PlanGraph } from "@protostar/planning";

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

export interface ReviewGate {
  readonly planId: string;
  readonly runId: string;
  readonly verdict: ReviewVerdict;
  readonly findings: readonly ReviewFinding[];
}

export interface MechanicalReviewGateInput {
  readonly intent: ConfirmedIntent;
  readonly plan: PlanGraph;
  readonly execution: ExecutionRunPlan;
  readonly executionResult: ExecutionDryRunResult;
}

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
  readonly intent: ConfirmedIntent;
  readonly plan: PlanGraph;
  readonly execution: ExecutionRunPlan;
  readonly initialFailTaskIds?: readonly string[];
  readonly maxRepairLoops?: number;
  readonly now?: () => string;
}

export function createReviewGate(input: {
  readonly plan: PlanGraph;
  readonly execution: ExecutionRunPlan;
  readonly findings?: readonly ReviewFinding[];
}): ReviewGate {
  const findings = input.findings ?? [];
  const verdict: ReviewVerdict = findings.some((finding) => finding.severity === "critical")
    ? "block"
    : findings.length > 0
      ? "repair"
      : "pass";

  return {
    planId: input.plan.planId,
    runId: input.execution.runId,
    verdict,
    findings
  };
}

export function runMechanicalReviewExecutionLoop(input: ReviewExecutionLoopInput): ReviewExecutionLoopResult {
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
      intent: input.intent,
      plan: input.plan,
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
  const findings: ReviewFinding[] = [
    ...reviewExecutionConsistency(input),
    ...reviewExecutionCompletion(input.executionResult),
    ...reviewTaskEvidence(input.executionResult),
    ...reviewAcceptanceCoverage(input),
    ...reviewAcceptancePassedEvidence(input)
  ];

  return createReviewGate({
    plan: input.plan,
    execution: input.execution,
    findings
  });
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
  const expectedTaskIds = new Set(input.plan.tasks.map((task) => task.id));
  const executionTaskIds = new Set(input.execution.tasks.map((task) => task.planTaskId));
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

  if (input.execution.planId !== input.plan.planId || input.executionResult.planId !== input.plan.planId) {
    findings.push(
      finding({
        ruleId: "execution-result-consistency",
        severity: "critical",
        summary: "Execution artifacts do not all reference the reviewed plan id.",
        evidence: [planArtifact(), executionPlanArtifact(), executionResultArtifact()]
      })
    );
  }

  for (const taskId of expectedTaskIds) {
    if (!executionTaskIds.has(taskId)) {
      findings.push(
        finding({
          ruleId: "execution-result-consistency",
          severity: "critical",
          summary: `Plan task ${taskId} is missing from the execution plan.`,
          evidence: [planArtifact(), executionPlanArtifact()]
        })
      );
    }
    if (!resultTaskIds.has(taskId)) {
      findings.push(
        finding({
          ruleId: "execution-result-consistency",
          severity: "critical",
          summary: `Plan task ${taskId} is missing from the execution result.`,
          evidence: [planArtifact(), executionResultArtifact()]
        })
      );
    }
  }

  for (const taskId of [...executionTaskIds, ...resultTaskIds]) {
    if (!expectedTaskIds.has(taskId)) {
      findings.push(
        finding({
          ruleId: "execution-result-consistency",
          severity: "critical",
          summary: `Execution artifacts reference task ${taskId}, which is not in the reviewed plan.`,
          evidence: [planArtifact(), executionPlanArtifact(), executionResultArtifact()]
        })
      );
    }
  }

  return findings;
}

function reviewExecutionCompletion(executionResult: ExecutionDryRunResult): readonly ReviewFinding[] {
  if (executionResult.status === "passed") {
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

    if (task.status === "blocked") {
      return [
        finding({
          ruleId: "execution-completed",
          severity: "major",
          summary: `Execution task ${task.planTaskId} was blocked by ${task.blockedBy?.join(", ") ?? "unknown dependencies"}.`,
          evidence: [executionResultArtifact()],
          repairTaskId: task.planTaskId
        })
      ];
    }

    if (task.evidence.length === 0) {
      return [
        finding({
          ruleId: "task-evidence-present",
          severity: "major",
          summary: `Passed execution task ${task.planTaskId} has no evidence artifact.`,
          evidence: [executionResultArtifact()],
          repairTaskId: task.planTaskId
        })
      ];
    }

    return [];
  });
}

function reviewAcceptanceCoverage(input: MechanicalReviewGateInput): readonly ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const criterionIds = new Set(input.intent.acceptanceCriteria.map((criterion) => criterion.id));
  const coveredCriterionIds = new Set(input.plan.tasks.flatMap((task) => task.covers));

  for (const criterion of input.intent.acceptanceCriteria) {
    if (!coveredCriterionIds.has(criterion.id)) {
      findings.push(
        finding({
          ruleId: "intent-acceptance-covered",
          severity: "critical",
          summary: `Acceptance criterion ${criterion.id} is not covered by the plan.`,
          evidence: [intentArtifact(), planArtifact()]
        })
      );
    }
  }

  for (const coveredCriterionId of coveredCriterionIds) {
    if (!criterionIds.has(coveredCriterionId)) {
      findings.push(
        finding({
          ruleId: "intent-acceptance-covered",
          severity: "major",
          summary: `Plan covers unknown acceptance criterion ${coveredCriterionId}.`,
          evidence: [intentArtifact(), planArtifact()]
        })
      );
    }
  }

  return findings;
}

function reviewAcceptancePassedEvidence(input: MechanicalReviewGateInput): readonly ReviewFinding[] {
  const resultByTaskId = new Map(input.executionResult.tasks.map((task) => [task.planTaskId, task]));

  return input.intent.acceptanceCriteria.flatMap((criterion): ReviewFinding[] => {
    const coveringTasks = input.plan.tasks.filter((task) => task.covers.includes(criterion.id));
    if (coveringTasks.length === 0) {
      return [];
    }

    if (
      coveringTasks.some((task) => {
        const taskResult = resultByTaskId.get(task.id);
        return taskResult?.status === "passed" && taskResult.evidence.length > 0;
      })
    ) {
      return [];
    }

    const repairTaskId = coveringTasks.find((task) => resultByTaskId.get(task.id)?.status !== "passed")?.id;
    return [
      finding({
        ruleId: "acceptance-evidence-passed",
        severity: "major",
        summary: `Acceptance criterion ${criterion.id} has no passed execution evidence.`,
        evidence: [planArtifact(), executionResultArtifact()],
        ...(repairTaskId !== undefined ? { repairTaskId } : {})
      })
    ];
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

function intentArtifact(): StageArtifactRef {
  return {
    stage: "intent",
    kind: "confirmed-intent",
    uri: "intent.json",
    description: "Normalized confirmed intent input."
  };
}

function planArtifact(): StageArtifactRef {
  return {
    stage: "planning",
    kind: "plan-graph",
    uri: "plan.json",
    description: "Plan graph parsed and validated from the planning pile result."
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

function executionResultArtifact(): StageArtifactRef {
  return {
    stage: "execution",
    kind: "execution-result",
    uri: "execution-result.json",
    description: "Dry-run execution result."
  };
}
