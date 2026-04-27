import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";

import {
  constructPlanTaskDependencyGraph,
  createPlanGraph,
  validatePlanGraph,
  type PlanAcceptanceCriterion,
  type PlanTaskDependencyGraph,
  type PlanGraphValidationViolation,
  type PlanTask,
  type PlanTaskRequiredCapabilities
} from "./index.js";
import { withAffectedPlanLocations } from "./test-support.js";

const admittedIntent = buildConfirmedIntentForTest({
  id: "intent_planning_missing_task_dependency",
  title: "Reject undeclared task dependency edges",
  problem: "Execution must never receive a plan whose dependency graph points at tasks that were not declared.",
  requester: "ouroboros-ac-20002",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_dependency_edges_declared",
      statement: "Every dependency edge in the admitted plan references a declared task id.",
      verification: "test"
    },
    {
      id: "ac_dependency_errors_precise",
      statement: "Missing dependency errors identify the dependent task, the missing task id, and the bad edge path.",
      verification: "test"
    }
  ],
  capabilityEnvelope: {
    repoScopes: [
      {
        workspace: "protostar",
        path: "packages/planning",
        access: "write"
      }
    ],
    toolPermissions: [
      {
        tool: "node:test",
        reason: "Run the missing task-dependency planning admission fixture.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["Planning admission must hard-reject undeclared dependency edges before execution."]
});

const acceptedCriteria: readonly PlanAcceptanceCriterion[] = admittedIntent.acceptanceCriteria.map(
  ({ id, statement, verification }) => ({
    id,
    statement,
    verification
  })
);

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

const missingDependencyCandidatePlanTasks: readonly PlanTask[] = [
  {
    id: "task-plan-contract",
    title: "Define the planning contract",
    kind: "design",
    dependsOn: ["task-missing-intent-sync", "task-missing-policy-sync"],
    covers: ["ac_dependency_edges_declared"],
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  },
  {
    id: "task-plan-validation",
    title: "Validate dependency edges",
    kind: "verification",
    dependsOn: ["task-plan-contract", "task-missing-execution-gate"],
    covers: ["ac_dependency_errors_precise"],
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  }
];

const validDependencyGraphCandidatePlanTasks: readonly PlanTask[] = [
  {
    id: "task-plan-contract",
    title: "Define the planning contract",
    kind: "design",
    dependsOn: [],
    covers: ["ac_dependency_edges_declared"],
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  },
  {
    id: "task-plan-validation",
    title: "Validate dependency edges",
    kind: "verification",
    dependsOn: ["task-plan-contract"],
    covers: ["ac_dependency_errors_precise"],
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  },
  {
    id: "task-plan-admission-evidence",
    title: "Record planning admission evidence",
    kind: "release",
    dependsOn: ["task-plan-contract", "task-plan-validation"],
    covers: ["ac_dependency_errors_precise"],
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  }
];

const expectedMissingDependencyViolations: readonly PlanGraphValidationViolation[] = withAffectedPlanLocations([
  {
    validator: "task-contracts",
    code: "missing-task-dependency",
    path: "tasks.task-plan-contract.dependsOn.0",
    taskId: "task-plan-contract",
    dependency: "task-missing-intent-sync",
    dependencyIndex: 0,
    message: "Task task-plan-contract depends on missing task task-missing-intent-sync."
  },
  {
    validator: "task-contracts",
    code: "missing-task-dependency",
    path: "tasks.task-plan-contract.dependsOn.1",
    taskId: "task-plan-contract",
    dependency: "task-missing-policy-sync",
    dependencyIndex: 1,
    message: "Task task-plan-contract depends on missing task task-missing-policy-sync."
  },
  {
    validator: "task-contracts",
    code: "missing-task-dependency",
    path: "tasks.task-plan-validation.dependsOn.1",
    taskId: "task-plan-validation",
    dependency: "task-missing-execution-gate",
    dependencyIndex: 1,
    message: "Task task-plan-validation depends on missing task task-missing-execution-gate."
  }
]);

describe("PlanGraph missing task-dependency admission boundary", () => {
  it("constructs a dependency graph from candidate-plan tasks with resolved edges", () => {
    const construction = constructPlanTaskDependencyGraph(validDependencyGraphCandidatePlanTasks);
    const expectedGraph: PlanTaskDependencyGraph = {
      nodes: [
        {
          taskId: "task-plan-contract",
          dependsOn: [],
          dependedOnBy: ["task-plan-validation", "task-plan-admission-evidence"]
        },
        {
          taskId: "task-plan-validation",
          dependsOn: ["task-plan-contract"],
          dependedOnBy: ["task-plan-admission-evidence"]
        },
        {
          taskId: "task-plan-admission-evidence",
          dependsOn: ["task-plan-contract", "task-plan-validation"],
          dependedOnBy: []
        }
      ],
      edges: [
        {
          dependentTaskId: "task-plan-validation",
          dependencyTaskId: "task-plan-contract",
          dependencyIndex: 0
        },
        {
          dependentTaskId: "task-plan-admission-evidence",
          dependencyTaskId: "task-plan-contract",
          dependencyIndex: 0
        },
        {
          dependentTaskId: "task-plan-admission-evidence",
          dependencyTaskId: "task-plan-validation",
          dependencyIndex: 1
        }
      ]
    };

    assert.equal(construction.ok, true);
    assert.deepEqual(construction.graph, expectedGraph);
    assert.deepEqual(construction.violations, []);
  });

  it("rejects dependency graph construction when candidate tasks reference unknown task IDs", () => {
    const construction = constructPlanTaskDependencyGraph(missingDependencyCandidatePlanTasks);

    assert.equal(construction.ok, false);
    assert.deepEqual(construction.violations, expectedMissingDependencyViolations);
    assert.deepEqual(construction.graph.edges, [
      {
        dependentTaskId: "task-plan-validation",
        dependencyTaskId: "task-plan-contract",
        dependencyIndex: 0
      }
    ]);
  });

  it("collects every undeclared dependency edge with precise validation metadata", () => {
    const validation = validatePlanGraph({
      graph: {
        planId: "plan_missing_task_dependency",
        intentId: admittedIntent.id,
        createdAt: "2026-04-26T00:00:00.000Z",
        strategy: "Attempt to admit dependency edges that point outside the candidate task set.",
        acceptanceCriteria: acceptedCriteria,
        tasks: missingDependencyCandidatePlanTasks
      },
      intent: admittedIntent
    });

    assert.equal(validation.ok, false);
    assert.deepEqual(validation.violations, expectedMissingDependencyViolations);
    assert.deepEqual(
      validation.errors,
      expectedMissingDependencyViolations.map((violation) => violation.message)
    );
  });

  it("hard-rejects missing dependency candidate plans before they can be admitted as a PlanGraph", () => {
    assert.throws(
      () =>
        createPlanGraph({
          planId: "plan_missing_task_dependency",
          intent: admittedIntent,
          strategy: "Attempt to admit dependency edges that point outside the candidate task set.",
          tasks: missingDependencyCandidatePlanTasks,
          createdAt: "2026-04-26T00:00:00.000Z"
        }),
      /Invalid plan graph: Task task-plan-contract depends on missing task task-missing-intent-sync\.; Task task-plan-contract depends on missing task task-missing-policy-sync\.; Task task-plan-validation depends on missing task task-missing-execution-gate\./
    );
  });
});
