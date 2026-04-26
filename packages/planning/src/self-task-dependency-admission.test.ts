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
  id: "intent_planning_self_task_dependency",
  title: "Reject task dependency edges that point back to the declaring task",
  problem: "Execution must never receive a plan with a task that can schedule itself as its own prerequisite.",
  requester: "ouroboros-ac-20003",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_self_dependency_rejected",
      statement: "Tasks that declare dependencies on themselves are rejected as invalid self-dependencies.",
      verification: "test"
    },
    {
      id: "ac_self_dependency_errors_precise",
      statement: "Self-dependency errors identify the dependent task and the bad edge path.",
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
        reason: "Run the self task-dependency planning admission fixture.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["Planning admission must hard-reject self-dependency edges before execution."]
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

const selfDependencyCandidatePlanTasks: readonly PlanTask[] = [
  {
    id: "task-plan-contract",
    title: "Define the planning contract",
    kind: "design",
    dependsOn: ["task-plan-contract"],
    covers: ["ac_self_dependency_rejected"],
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  },
  {
    id: "task-plan-validation",
    title: "Validate self-dependency edges",
    kind: "verification",
    dependsOn: ["task-plan-contract", "task-plan-validation"],
    covers: ["ac_self_dependency_errors_precise"],
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  }
];

describe("PlanGraph self task-dependency admission boundary", () => {
  it("collects every self-dependency edge with precise validation metadata", () => {
    const validation = validatePlanGraph({
      graph: {
        planId: "plan_self_task_dependency",
        intentId: admittedIntent.id,
        createdAt: "2026-04-26T00:00:00.000Z",
        strategy: "Attempt to admit tasks that list themselves as prerequisites.",
        acceptanceCriteria: acceptedCriteria,
        tasks: selfDependencyCandidatePlanTasks
      },
      intent: admittedIntent
    });

    const expectedSelfDependencyViolations: readonly PlanGraphValidationViolation[] = withAffectedPlanLocations([
      {
        validator: "task-contracts",
        code: "self-task-dependency",
        path: "tasks.task-plan-contract.dependsOn.0",
        taskId: "task-plan-contract",
        dependency: "task-plan-contract",
        dependencyIndex: 0,
        message: "Task task-plan-contract cannot depend on itself."
      },
      {
        validator: "task-contracts",
        code: "self-task-dependency",
        path: "tasks.task-plan-validation.dependsOn.1",
        taskId: "task-plan-validation",
        dependency: "task-plan-validation",
        dependencyIndex: 1,
        message: "Task task-plan-validation cannot depend on itself."
      }
    ]);

    assert.equal(validation.ok, false);
    assert.deepEqual(validation.violations.slice(0, 2), expectedSelfDependencyViolations);
    assert.equal(validation.violations.at(-1)?.code, "dependency-cycle");
    assert.deepEqual(validation.errors, [
      ...expectedSelfDependencyViolations.map((violation) => violation.message),
      "Plan graph contains a dependency cycle."
    ]);
  });

  it("hard-rejects self-dependency candidate plans before they can be admitted as a PlanGraph", () => {
    assert.throws(
      () =>
        createPlanGraph({
          planId: "plan_self_task_dependency",
          intent: admittedIntent,
          strategy: "Attempt to admit self-dependency edges.",
          tasks: selfDependencyCandidatePlanTasks,
          createdAt: "2026-04-26T00:00:00.000Z"
        }),
      /Invalid plan graph: Task task-plan-contract cannot depend on itself\.; Task task-plan-validation cannot depend on itself\.; Plan graph contains a dependency cycle\./
    );
  });
});
