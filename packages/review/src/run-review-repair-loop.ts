import { synthesizeRepairPlan, computeRepairSubgraph } from "@protostar/repair";
import type { ConfirmedIntent } from "@protostar/intent";
import type { AdmittedPlanExecutionArtifact, ExecutionRunResult } from "@protostar/planning";

import {
  mintDeliveryAuthorization,
  type DeliveryAuthorization,
  type ReviewDecisionArtifact
} from "./delivery-authorization.js";
import type { ReviewLifecycleEvent } from "./lifecycle-events.js";
import type {
  MechanicalChecker,
  ModelReviewResult,
  ModelReviewer,
  RepairPlan
} from "./repair-types.js";
import type { ReviewFinding, ReviewGate } from "./index.js";

export interface ReviewRepairLoopInput {
  readonly runId: string;
  readonly confirmedIntent: ConfirmedIntent;
  readonly admittedPlan: AdmittedPlanExecutionArtifact;
  readonly initialExecution: ExecutionRunResult;
  readonly executor: TaskExecutorService;
  readonly mechanicalChecker: MechanicalChecker;
  readonly modelReviewer: ModelReviewer;
  readonly persistence: ReviewPersistence;
  readonly now?: () => Date;
}

export interface TaskExecutorService {
  executeRepairTasks(input: {
    readonly repairPlan: RepairPlan;
    readonly admittedPlan: AdmittedPlanExecutionArtifact;
    readonly attempt: number;
  }): Promise<ExecutionRunResult>;
}

export interface ReviewPersistence {
  writeIterationDir(input: {
    readonly runId: string;
    readonly attempt: number;
    readonly mechanical: unknown;
    readonly model?: unknown;
    readonly repairPlan?: RepairPlan;
  }): Promise<void>;
  writeReviewDecision(input: {
    readonly runId: string;
    readonly artifact: unknown;
  }): Promise<{ readonly decisionPath: string }>;
  writeReviewBlock(input: {
    readonly runId: string;
    readonly artifact: unknown;
  }): Promise<{ readonly blockPath: string }>;
  appendLifecycleEvent(input: {
    readonly runId: string;
    readonly event: ReviewLifecycleEvent;
  }): Promise<void>;
}

export type ReviewRepairLoopResult =
  | {
      readonly status: "approved";
      readonly authorization: DeliveryAuthorization;
      readonly finalAttempt: number;
      readonly decisionPath: string;
    }
  | {
      readonly status: "blocked";
      readonly reason: "budget-exhausted" | "critical-finding" | "mechanical-block" | "model-block";
      readonly finalAttempt: number;
      readonly blockPath: string;
    };

export class MissingMaxRepairLoopsError extends Error {
  constructor() {
    super("confirmedIntent.capabilityEnvelope.budget.maxRepairLoops is required.");
    this.name = "MissingMaxRepairLoopsError";
  }
}

interface ReviewIterationRecord {
  readonly attempt: number;
  readonly mechanical: unknown;
  readonly mechanicalGate: ReviewGate;
  readonly model?: ModelReviewResult;
  readonly repairPlan?: RepairPlan;
}

export async function runReviewRepairLoop(
  input: ReviewRepairLoopInput
): Promise<ReviewRepairLoopResult> {
  const maxRepairLoops = readMaxRepairLoops(input.confirmedIntent);
  const now = input.now ?? (() => new Date());
  const iterations: ReviewIterationRecord[] = [];
  let execution = input.initialExecution;

  for (let attempt = 0; attempt <= maxRepairLoops; attempt += 1) {
    await append(input, {
      kind: "review-iteration-started",
      runId: input.runId,
      attempt,
      at: nowIso(now)
    });

    const mechanical = await input.mechanicalChecker({
      admittedPlan: input.admittedPlan,
      executionResult: execution,
      attempt,
      runId: input.runId
    });

    await append(input, {
      kind: "mechanical-verdict",
      runId: input.runId,
      attempt,
      verdict: mechanical.gate.verdict,
      findingsCount: mechanical.gate.findings.length,
      at: nowIso(now)
    });

    if (mechanical.gate.verdict === "block") {
      const iteration = recordIteration({
        attempt,
        mechanical: mechanical.result,
        mechanicalGate: mechanical.gate
      });
      iterations.push(iteration);
      await input.persistence.writeIterationDir({
        runId: input.runId,
        attempt,
        mechanical: mechanical.result
      });
      return block(input, {
        reason: "mechanical-block",
        attempt,
        iterations,
        maxRepairLoops,
        execution,
        now
      });
    }

    let model: ModelReviewResult | undefined;
    if (mechanical.gate.verdict === "pass") {
      model = await input.modelReviewer({
        admittedPlan: input.admittedPlan,
        executionResult: execution,
        mechanicalGate: mechanical.gate,
        diff: {
          nameOnly: mechanical.result.diffNameOnly,
          unifiedDiff: ""
        }
      });

      await append(input, {
        kind: "model-verdict",
        runId: input.runId,
        attempt,
        verdict: model.verdict,
        judgeIds: model.critiques.map((critique) => critique.judgeId),
        at: nowIso(now)
      });

      if (model.verdict === "pass") {
        const iteration = recordIteration({
          attempt,
          mechanical: mechanical.result,
          mechanicalGate: mechanical.gate,
          model
        });
        iterations.push(iteration);
        await input.persistence.writeIterationDir({
          runId: input.runId,
          attempt,
          mechanical: mechanical.result,
          model
        });
        const artifact = reviewDecisionArtifact(input, {
          attempt,
          execution,
          authorizedAt: nowIso(now)
        });
        const { decisionPath } = await input.persistence.writeReviewDecision({
          runId: input.runId,
          artifact
        });
        const authorization = mintDeliveryAuthorization({
          runId: input.runId,
          decisionPath
        });
        await append(input, {
          kind: "loop-approved",
          runId: input.runId,
          finalAttempt: attempt,
          decisionUri: decisionPath,
          at: nowIso(now)
        });
        return {
          status: "approved",
          authorization,
          finalAttempt: attempt,
          decisionPath
        };
      }

      if (model.verdict === "block") {
        const iteration = recordIteration({
          attempt,
          mechanical: mechanical.result,
          mechanicalGate: mechanical.gate,
          model
        });
        iterations.push(iteration);
        await input.persistence.writeIterationDir({
          runId: input.runId,
          attempt,
          mechanical: mechanical.result,
          model
        });
        return block(input, {
          reason: "model-block",
          attempt,
          iterations,
          maxRepairLoops,
          execution,
          now
        });
      }
    }

    if (attempt === maxRepairLoops) {
      const iteration = recordIteration({
        attempt,
        mechanical: mechanical.result,
        mechanicalGate: mechanical.gate,
        ...(model !== undefined ? { model } : {})
      });
      iterations.push(iteration);
      await input.persistence.writeIterationDir({
        runId: input.runId,
        attempt,
        mechanical: mechanical.result,
        ...(model !== undefined ? { model } : {})
      });
      return budgetExhausted(input, {
        attempt,
        iterations,
        maxRepairLoops,
        execution,
        now
      });
    }

    const repairTaskIds = uniqueRepairTaskIds(mechanical.gate, model);
    const dependentTaskIds = computeRepairSubgraph({
      plan: input.admittedPlan,
      repairTaskIds
    });
    const repairPlan = synthesizeRepairPlan({
      runId: input.runId,
      attempt,
      plan: input.admittedPlan,
      mechanical: mechanical.gate,
      ...(model !== undefined && model.verdict !== "pass" ? { model } : {}),
      dependentTaskIds
    });

    await append(input, {
      kind: "repair-plan-emitted",
      runId: input.runId,
      attempt,
      repairTaskIds: repairPlan.repairs.map((repair) => repair.planTaskId),
      at: nowIso(now)
    });

    const iteration = recordIteration({
      attempt,
      mechanical: mechanical.result,
      mechanicalGate: mechanical.gate,
      ...(model !== undefined ? { model } : {}),
      repairPlan
    });
    iterations.push(iteration);
    await input.persistence.writeIterationDir({
      runId: input.runId,
      attempt,
      mechanical: mechanical.result,
      ...(model !== undefined ? { model } : {}),
      repairPlan
    });

    execution = await input.executor.executeRepairTasks({
      repairPlan,
      admittedPlan: input.admittedPlan,
      attempt: attempt + 1
    });
  }

  throw new Error("Review repair loop exited unexpectedly.");
}

async function append(input: ReviewRepairLoopInput, event: ReviewLifecycleEvent): Promise<void> {
  await input.persistence.appendLifecycleEvent({
    runId: input.runId,
    event
  });
}

async function block(
  input: ReviewRepairLoopInput,
  details: {
    readonly reason: "critical-finding" | "mechanical-block" | "model-block";
    readonly attempt: number;
    readonly iterations: readonly ReviewIterationRecord[];
    readonly maxRepairLoops: number;
    readonly execution: ExecutionRunResult;
    readonly now: () => Date;
  }
): Promise<ReviewRepairLoopResult> {
  const artifact = reviewBlockArtifact(input, details);
  const { blockPath } = await input.persistence.writeReviewBlock({
    runId: input.runId,
    artifact
  });
  await append(input, {
    kind: "loop-blocked",
    runId: input.runId,
    reason: details.reason,
    finalAttempt: details.attempt,
    blockUri: blockPath,
    at: nowIso(details.now)
  });
  return {
    status: "blocked",
    reason: details.reason,
    finalAttempt: details.attempt,
    blockPath
  };
}

async function budgetExhausted(
  input: ReviewRepairLoopInput,
  details: {
    readonly attempt: number;
    readonly iterations: readonly ReviewIterationRecord[];
    readonly maxRepairLoops: number;
    readonly execution: ExecutionRunResult;
    readonly now: () => Date;
  }
): Promise<ReviewRepairLoopResult> {
  const artifact = reviewBlockArtifact(input, {
    ...details,
    reason: "budget-exhausted"
  });
  const { blockPath } = await input.persistence.writeReviewBlock({
    runId: input.runId,
    artifact
  });
  await append(input, {
    kind: "loop-budget-exhausted",
    runId: input.runId,
    attempted: details.attempt,
    blockUri: blockPath,
    at: nowIso(details.now)
  });
  await append(input, {
    kind: "loop-blocked",
    runId: input.runId,
    reason: "budget-exhausted",
    finalAttempt: details.attempt,
    blockUri: blockPath,
    at: nowIso(details.now)
  });
  return {
    status: "blocked",
    reason: "budget-exhausted",
    finalAttempt: details.attempt,
    blockPath
  };
}

function reviewDecisionArtifact(
  input: ReviewRepairLoopInput,
  details: {
    readonly attempt: number;
    readonly execution: ExecutionRunResult;
    readonly authorizedAt: string;
  }
): ReviewDecisionArtifact {
  return {
    schemaVersion: "1.0.0",
    runId: input.runId,
    planId: input.admittedPlan.planId,
    mechanical: "pass",
    model: "pass",
    authorizedAt: details.authorizedAt,
    finalIteration: details.attempt,
    finalDiffArtifact: finalDiffArtifact(details.execution)
  };
}

function reviewBlockArtifact(
  input: ReviewRepairLoopInput,
  details: {
    readonly reason: "budget-exhausted" | "critical-finding" | "mechanical-block" | "model-block";
    readonly attempt: number;
    readonly iterations: readonly ReviewIterationRecord[];
    readonly maxRepairLoops: number;
    readonly execution: ExecutionRunResult;
  }
) {
  return {
    schemaVersion: "1.0.0",
    runId: input.runId,
    planId: input.admittedPlan.planId,
    status: "block" as const,
    reason: details.reason,
    iterations: details.iterations,
    finalDiffArtifact: finalDiffArtifact(details.execution),
    exhaustedBudget: {
      maxRepairLoops: details.maxRepairLoops,
      attempted: details.attempt
    }
  };
}

function recordIteration(input: ReviewIterationRecord): ReviewIterationRecord {
  return input;
}

function uniqueRepairTaskIds(
  mechanical: ReviewGate,
  model: ModelReviewResult | undefined
): readonly string[] {
  return [
    ...new Set([
      ...mechanical.findings.flatMap((finding) =>
        finding.repairTaskId !== undefined ? [finding.repairTaskId] : []
      ),
      ...(model?.critiques.flatMap((critique) => critique.taskRefs) ?? [])
    ])
  ];
}

function finalDiffArtifact(execution: ExecutionRunResult) {
  return execution.diffArtifact ?? execution.journalArtifact;
}

function readMaxRepairLoops(confirmedIntent: ConfirmedIntent): number {
  const value = confirmedIntent.capabilityEnvelope.budget.maxRepairLoops;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new MissingMaxRepairLoopsError();
  }
  return value;
}

function nowIso(now: () => Date): string {
  return now().toISOString();
}
