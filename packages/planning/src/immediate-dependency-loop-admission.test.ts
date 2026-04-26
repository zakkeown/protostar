import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { defineConfirmedIntent } from "@protostar/intent";

import {
  createPlanGraph,
  validatePlanGraph,
  type PlanAcceptanceCriterion,
  type PlanGraphValidationViolation,
  type PlanTask,
  type PlanTaskRequiredCapabilities
} from "./index.js";
import { withAffectedPlanLocations } from "./test-support.js";

const admittedIntent = defineConfirmedIntent({
  id: "intent_planning_immediate_dependency_loop",
  title: "Reject immediate task dependency loops before execution",
  problem: "Execution must never receive a plan whose task prerequisites can block each other forever.",
  requester: "ouroboros-ac-20102",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_immediate_dependency_loop_rejected",
      statement: "A two-task dependency loop is rejected before the plan is admitted.",
      verification: "test"
    },
    {
      id: "ac_immediate_dependency_loop_errors_precise",
      statement: "Immediate dependency-loop errors identify both offending edges.",
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
        reason: "Run the immediate dependency-loop planning admission fixture.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["Planning admission must hard-reject immediate dependency loops before execution."]
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

const immediateDependencyLoopCandidatePlanTasks: readonly PlanTask[] = [
  {
    id: "task-plan-contract",
    title: "Define the planning contract",
    kind: "design",
    dependsOn: ["task-plan-validation"],
    covers: ["ac_immediate_dependency_loop_rejected"],
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  },
  {
    id: "task-plan-validation",
    title: "Validate immediate dependency loops",
    kind: "verification",
    dependsOn: ["task-plan-contract"],
    covers: ["ac_immediate_dependency_loop_errors_precise"],
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  }
];

const expectedImmediateDependencyLoopViolations: readonly PlanGraphValidationViolation[] = withAffectedPlanLocations([
  {
    validator: "immediate-dependency-cycles",
    code: "dependency-cycle",
    path: "tasks.task-plan-contract.dependsOn.0",
    taskId: "task-plan-contract",
    dependency: "task-plan-validation",
    dependencyIndex: 0,
    message:
      "Task task-plan-contract cannot depend on task-plan-validation because task-plan-validation already depends on task-plan-contract."
  },
  {
    validator: "immediate-dependency-cycles",
    code: "dependency-cycle",
    path: "tasks.task-plan-validation.dependsOn.0",
    taskId: "task-plan-validation",
    dependency: "task-plan-contract",
    dependencyIndex: 0,
    message:
      "Task task-plan-validation cannot depend on task-plan-contract because task-plan-contract already depends on task-plan-validation."
  }
]);

describe("PlanGraph immediate dependency-loop admission boundary", () => {
  it("collects both edges of an immediate dependency loop with precise validation metadata", () => {
    const validation = validatePlanGraph({
      graph: {
        planId: "plan_immediate_dependency_loop",
        intentId: admittedIntent.id,
        createdAt: "2026-04-26T00:00:00.000Z",
        strategy: "Attempt to admit a candidate plan whose tasks immediately depend on each other.",
        acceptanceCriteria: acceptedCriteria,
        tasks: immediateDependencyLoopCandidatePlanTasks
      },
      intent: admittedIntent
    });

    assert.equal(validation.ok, false);
    assert.deepEqual(validation.violations.slice(0, 2), expectedImmediateDependencyLoopViolations);
    assert.equal(validation.violations.at(-1)?.code, "dependency-cycle");
    assert.deepEqual(validation.errors, [
      ...expectedImmediateDependencyLoopViolations.map((violation) => violation.message),
      "Plan graph contains a dependency cycle."
    ]);
  });

  it("hard-rejects immediate dependency-loop candidate plans before they can be admitted as a PlanGraph", () => {
    assert.throws(
      () =>
        createPlanGraph({
          planId: "plan_immediate_dependency_loop",
          intent: admittedIntent,
          strategy: "Attempt to admit an immediate dependency loop.",
          tasks: immediateDependencyLoopCandidatePlanTasks,
          createdAt: "2026-04-26T00:00:00.000Z"
        }),
      /Invalid plan graph: Task task-plan-contract cannot depend on task-plan-validation because task-plan-validation already depends on task-plan-contract\.; Task task-plan-validation cannot depend on task-plan-contract because task-plan-contract already depends on task-plan-validation\.; Plan graph contains a dependency cycle\./
    );
  });
});
