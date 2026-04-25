import type { AcceptanceCriterionId, CapabilityEnvelope, IntentId, RiskLevel } from "@protostar/intent";

export type PlanTaskKind = "research" | "design" | "implementation" | "verification" | "release";

export interface PlanTask {
  readonly id: string;
  readonly title: string;
  readonly kind: PlanTaskKind;
  readonly dependsOn: readonly string[];
  readonly covers: readonly AcceptanceCriterionId[];
  readonly requiredCapabilities: Partial<CapabilityEnvelope>;
  readonly risk: RiskLevel;
}

export interface PlanGraph {
  readonly planId: string;
  readonly intentId: IntentId;
  readonly createdAt: string;
  readonly strategy: string;
  readonly tasks: readonly PlanTask[];
}

export interface PlanGraphValidation {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

export function createPlanGraph(input: {
  readonly planId: string;
  readonly intentId: IntentId;
  readonly strategy: string;
  readonly tasks: readonly PlanTask[];
  readonly createdAt?: string;
}): PlanGraph {
  const graph = {
    planId: input.planId,
    intentId: input.intentId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    strategy: input.strategy,
    tasks: input.tasks
  };
  const validation = validatePlanGraph(graph);
  if (!validation.ok) {
    throw new Error(`Invalid plan graph: ${validation.errors.join("; ")}`);
  }
  return graph;
}

export function validatePlanGraph(graph: PlanGraph): PlanGraphValidation {
  const errors: string[] = [];
  const taskIds = new Set(graph.tasks.map((task) => task.id));

  for (const task of graph.tasks) {
    if (task.covers.length === 0) {
      errors.push(`Task ${task.id} must cover at least one acceptance criterion.`);
    }
    for (const dependency of task.dependsOn) {
      if (!taskIds.has(dependency)) {
        errors.push(`Task ${task.id} depends on missing task ${dependency}.`);
      }
    }
  }

  if (hasCycle(graph.tasks)) {
    errors.push("Plan graph contains a dependency cycle.");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function hasCycle(tasks: readonly PlanTask[]): boolean {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(taskId: string): boolean {
    if (visited.has(taskId)) {
      return false;
    }
    if (visiting.has(taskId)) {
      return true;
    }

    visiting.add(taskId);
    const task = byId.get(taskId);
    for (const dependency of task?.dependsOn ?? []) {
      if (visit(dependency)) {
        return true;
      }
    }
    visiting.delete(taskId);
    visited.add(taskId);
    return false;
  }

  return tasks.some((task) => visit(task.id));
}
