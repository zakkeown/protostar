import type { StageArtifactRef } from "@protostar/artifacts";
import type { PlanGraph, PlanTask } from "@protostar/planning";
import type { WorkspaceRef } from "@protostar/repo";

export type ExecutionTaskStatus = "pending" | "running" | "passed" | "failed" | "blocked";

export interface ExecutionTask {
  readonly planTaskId: string;
  readonly title: string;
  readonly status: ExecutionTaskStatus;
  readonly dependsOn: readonly string[];
}

export interface ExecutionRunPlan {
  readonly runId: string;
  readonly planId: string;
  readonly workspace: WorkspaceRef;
  readonly tasks: readonly ExecutionTask[];
}

export type ExecutionLifecycleEventType =
  | "task-pending"
  | "task-running"
  | "task-passed"
  | "task-failed"
  | "task-blocked";

export interface ExecutionLifecycleEvent {
  readonly type: ExecutionLifecycleEventType;
  readonly runId: string;
  readonly planTaskId: string;
  readonly at: string;
  readonly status: ExecutionTaskStatus;
  readonly reason?: string;
  readonly blockedBy?: readonly string[];
  readonly evidence?: readonly StageArtifactRef[];
}

export interface ExecutionDryRunTaskResult extends ExecutionTask {
  readonly status: "passed" | "failed" | "blocked";
  readonly evidence: readonly StageArtifactRef[];
  readonly reason?: string;
  readonly blockedBy?: readonly string[];
}

export interface ExecutionDryRunResult {
  readonly runId: string;
  readonly planId: string;
  readonly status: "passed" | "failed";
  readonly tasks: readonly ExecutionDryRunTaskResult[];
  readonly events: readonly ExecutionLifecycleEvent[];
  readonly evidence: readonly StageArtifactRef[];
}

export interface ExecutionDryRunOptions {
  readonly execution: ExecutionRunPlan;
  readonly failTaskIds?: readonly string[];
  readonly now?: () => string;
}

export function prepareExecutionRun(input: {
  readonly runId: string;
  readonly plan: PlanGraph;
  readonly workspace: WorkspaceRef;
}): ExecutionRunPlan {
  return {
    runId: input.runId,
    planId: input.plan.planId,
    workspace: input.workspace,
    tasks: topoSort(input.plan.tasks).map((task) => ({
      planTaskId: task.id,
      title: task.title,
      status: "pending",
      dependsOn: task.dependsOn
    }))
  };
}

export function runExecutionDryRun(options: ExecutionDryRunOptions): ExecutionDryRunResult {
  const failedTaskIds = new Set(options.failTaskIds ?? []);
  const now = options.now ?? (() => new Date().toISOString());
  const taskStatus = new Map<string, ExecutionDryRunTaskResult>();
  const events: ExecutionLifecycleEvent[] = [];
  const evidence: StageArtifactRef[] = [];

  for (const task of options.execution.tasks) {
    events.push({
      type: "task-pending",
      runId: options.execution.runId,
      planTaskId: task.planTaskId,
      at: now(),
      status: "pending"
    });

    const blockedBy = task.dependsOn.filter((dependencyId) => taskStatus.get(dependencyId)?.status !== "passed");
    if (blockedBy.length > 0) {
      const reason = `Blocked by unresolved or failed dependencies: ${blockedBy.join(", ")}.`;
      const result: ExecutionDryRunTaskResult = {
        ...task,
        status: "blocked",
        evidence: [],
        blockedBy,
        reason
      };
      taskStatus.set(task.planTaskId, result);
      events.push({
        type: "task-blocked",
        runId: options.execution.runId,
        planTaskId: task.planTaskId,
        at: now(),
        status: "blocked",
        blockedBy,
        reason
      });
      continue;
    }

    events.push({
      type: "task-running",
      runId: options.execution.runId,
      planTaskId: task.planTaskId,
      at: now(),
      status: "running"
    });

    if (failedTaskIds.has(task.planTaskId)) {
      const reason = "Injected dry-run failure.";
      const taskEvidence = [taskEvidenceRef(task.planTaskId, "failed")];
      evidence.push(...taskEvidence);
      const result: ExecutionDryRunTaskResult = {
        ...task,
        status: "failed",
        evidence: taskEvidence,
        reason
      };
      taskStatus.set(task.planTaskId, result);
      events.push({
        type: "task-failed",
        runId: options.execution.runId,
        planTaskId: task.planTaskId,
        at: now(),
        status: "failed",
        reason,
        evidence: taskEvidence
      });
      continue;
    }

    const taskEvidence = [taskEvidenceRef(task.planTaskId, "passed")];
    evidence.push(...taskEvidence);
    const result: ExecutionDryRunTaskResult = {
      ...task,
      status: "passed",
      evidence: taskEvidence
    };
    taskStatus.set(task.planTaskId, result);
    events.push({
      type: "task-passed",
      runId: options.execution.runId,
      planTaskId: task.planTaskId,
      at: now(),
      status: "passed",
      evidence: taskEvidence
    });
  }

  const tasks = options.execution.tasks.map((task) => {
    const result = taskStatus.get(task.planTaskId);
    if (!result) {
      throw new Error(`Execution dry run did not produce a result for task ${task.planTaskId}.`);
    }
    return result;
  });

  return {
    runId: options.execution.runId,
    planId: options.execution.planId,
    status: tasks.every((task) => task.status === "passed") ? "passed" : "failed",
    tasks,
    events,
    evidence
  };
}

function topoSort(tasks: readonly PlanTask[]): readonly PlanTask[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visited = new Set<string>();
  const sorted: PlanTask[] = [];

  function visit(task: PlanTask): void {
    if (visited.has(task.id)) {
      return;
    }
    visited.add(task.id);
    for (const dependency of task.dependsOn) {
      const dependencyTask = byId.get(dependency);
      if (dependencyTask) {
        visit(dependencyTask);
      }
    }
    sorted.push(task);
  }

  for (const task of tasks) {
    visit(task);
  }

  return sorted;
}

function taskEvidenceRef(planTaskId: string, status: "passed" | "failed"): StageArtifactRef {
  return {
    stage: "execution",
    kind: status === "passed" ? "dry-run-task-pass" : "dry-run-task-failure",
    uri: `execution-evidence/${planTaskId}.json`,
    description:
      status === "passed"
        ? `Dry-run evidence for completed task ${planTaskId}.`
        : `Dry-run evidence for failed task ${planTaskId}.`
  };
}
