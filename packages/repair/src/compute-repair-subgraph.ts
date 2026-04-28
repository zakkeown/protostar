import type { AdmittedPlanExecutionArtifact } from "@protostar/planning";

export interface ComputeRepairSubgraphInput {
  readonly plan: AdmittedPlanExecutionArtifact;
  readonly repairTaskIds: readonly string[];
}

export class UnknownRepairTaskError extends Error {
  constructor(readonly repairTaskId: string) {
    super(`Unknown repair task id: ${repairTaskId}`);
    this.name = "UnknownRepairTaskError";
  }
}

export function computeRepairSubgraph(input: ComputeRepairSubgraphInput): readonly string[] {
  const taskIds = new Set<string>(input.plan.tasks.map((task) => task.planTaskId));

  for (const repairTaskId of input.repairTaskIds) {
    if (!taskIds.has(repairTaskId)) {
      throw new UnknownRepairTaskError(repairTaskId);
    }
  }

  if (input.repairTaskIds.length === 0) {
    return [];
  }

  const dependentsByTaskId = new Map<string, string[]>();
  for (const task of input.plan.tasks) {
    for (const dependency of task.dependsOn) {
      const dependents = dependentsByTaskId.get(dependency) ?? [];
      dependents.push(task.planTaskId);
      dependentsByTaskId.set(dependency, dependents);
    }
  }

  const selected = new Set<string>();
  const pending = [...input.repairTaskIds];

  while (pending.length > 0) {
    const taskId = pending.shift();
    if (taskId === undefined || selected.has(taskId)) {
      continue;
    }

    selected.add(taskId);
    for (const dependent of dependentsByTaskId.get(taskId) ?? []) {
      pending.push(dependent);
    }
  }

  return input.plan.tasks
    .map((task) => task.planTaskId)
    .filter((taskId) => selected.has(taskId));
}
