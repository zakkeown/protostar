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
