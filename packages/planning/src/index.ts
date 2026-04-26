import type { AcceptanceCriterionId, CapabilityEnvelope, ConfirmedIntent, IntentId, RiskLevel } from "@protostar/intent";

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

export interface CreatePlanGraphInput {
  readonly planId: string;
  readonly intent: ConfirmedIntent;
  readonly strategy: string;
  readonly tasks: readonly PlanTask[];
  readonly createdAt?: string;
}

export interface ValidatePlanGraphInput {
  readonly graph: PlanGraph;
  readonly intent: ConfirmedIntent;
}

export function createPlanGraph(input: CreatePlanGraphInput): PlanGraph {
  const graph = {
    planId: input.planId,
    intentId: input.intent.id,
    createdAt: input.createdAt ?? new Date().toISOString(),
    strategy: input.strategy,
    tasks: input.tasks
  };
  const validation = validatePlanGraph({
    graph,
    intent: input.intent
  });
  if (!validation.ok) {
    throw new Error(`Invalid plan graph: ${validation.errors.join("; ")}`);
  }
  return graph;
}

export function validatePlanGraph(input: ValidatePlanGraphInput): PlanGraphValidation {
  const graph = input.graph;
  const intent = input.intent;
  const errors: string[] = [];
  const taskIds = new Set(graph.tasks.map((task) => task.id));
  const acceptanceCriterionIds = new Set(intent.acceptanceCriteria.map((criterion) => criterion.id));
  const coveredAcceptanceCriterionIds = new Set<AcceptanceCriterionId>();

  if (graph.intentId !== intent.id) {
    errors.push(`Plan graph intent ${graph.intentId} must match confirmed intent ${intent.id}.`);
  }

  for (const task of graph.tasks) {
    if (task.covers.length === 0) {
      errors.push(`Task ${task.id} must cover at least one acceptance criterion.`);
    }
    for (const criterionId of task.covers) {
      if (!acceptanceCriterionIds.has(criterionId)) {
        errors.push(`Task ${task.id} covers acceptance criterion ${criterionId} outside confirmed intent ${intent.id}.`);
      } else {
        coveredAcceptanceCriterionIds.add(criterionId);
      }
    }
    for (const dependency of task.dependsOn) {
      if (!taskIds.has(dependency)) {
        errors.push(`Task ${task.id} depends on missing task ${dependency}.`);
      }
    }
  }

  for (const criterion of intent.acceptanceCriteria) {
    if (!coveredAcceptanceCriterionIds.has(criterion.id)) {
      errors.push(`Acceptance criterion ${criterion.id} is not covered by any plan task.`);
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
