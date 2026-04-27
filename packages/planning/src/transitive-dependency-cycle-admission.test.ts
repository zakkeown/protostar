import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";

import {
  createPlanGraph,
  validatePlanGraph,
  type PlanAcceptanceCriterion,
  type PlanGraphValidationViolation,
  type PlanTask,
  type PlanTaskRequiredCapabilities
} from "./index.js";
import { withAffectedPlanLocations } from "./test-support.js";

const admittedIntent = buildConfirmedIntentForTest({
  id: "intent_planning_transitive_dependency_cycle",
  title: "Reject transitive task dependency cycles before execution",
  problem: "Execution must never receive a plan whose indirect prerequisites form a closed loop.",
  requester: "ouroboros-ac-20103",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_transitive_dependency_cycle_rejected",
      statement: "A multi-task dependency loop is rejected before the plan is admitted.",
      verification: "test"
    },
    {
      id: "ac_transitive_dependency_cycle_path_reported",
      statement: "Transitive dependency-cycle errors report the complete cycle path.",
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
        reason: "Run the transitive dependency-cycle planning admission fixture.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["Planning admission must hard-reject transitive dependency loops before execution."]
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

const transitiveDependencyCycleCandidatePlanTasks: readonly PlanTask[] = [
  {
    id: "task-plan-contract",
    title: "Define the planning contract",
    kind: "design",
    dependsOn: ["task-plan-validation"],
    covers: ["ac_transitive_dependency_cycle_rejected"],
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  },
  {
    id: "task-plan-validation",
    title: "Validate transitive dependency cycles",
    kind: "verification",
    dependsOn: ["task-plan-admission-evidence"],
    covers: ["ac_transitive_dependency_cycle_path_reported"],
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  },
  {
    id: "task-plan-admission-evidence",
    title: "Record planning admission evidence",
    kind: "release",
    dependsOn: ["task-plan-contract"],
    covers: ["ac_transitive_dependency_cycle_path_reported"],
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  }
];

const expectedTransitiveDependencyCycleViolation: PlanGraphValidationViolation = withAffectedPlanLocations([
  {
  validator: "transitive-dependency-cycles",
  code: "dependency-cycle",
  path: "tasks.task-plan-admission-evidence.dependsOn.0",
  taskId: "task-plan-admission-evidence",
  dependency: "task-plan-contract",
  dependencyIndex: 0,
  cyclePath: [
    "task-plan-contract",
    "task-plan-validation",
    "task-plan-admission-evidence",
    "task-plan-contract"
  ],
  message:
    "Task dependency cycle detected: task-plan-contract -> task-plan-validation -> " +
    "task-plan-admission-evidence -> task-plan-contract."
  }
])[0]!;

describe("PlanGraph transitive dependency-cycle admission boundary", () => {
  it("reports the complete cycle path for a multi-task dependency loop", () => {
    const validation = validatePlanGraph({
      graph: {
        planId: "plan_transitive_dependency_cycle",
        intentId: admittedIntent.id,
        createdAt: "2026-04-26T00:00:00.000Z",
        strategy: "Attempt to admit a candidate plan whose indirect prerequisites loop.",
        acceptanceCriteria: acceptedCriteria,
        tasks: transitiveDependencyCycleCandidatePlanTasks
      },
      intent: admittedIntent
    });

    assert.equal(validation.ok, false);
    assert.deepEqual(validation.violations.slice(0, 2), [
      expectedTransitiveDependencyCycleViolation,
      ...withAffectedPlanLocations([{
        validator: "dependency-cycle-summary",
        code: "dependency-cycle",
        path: "tasks.dependsOn",
        message: "Plan graph contains a dependency cycle."
      }])
    ]);
    assert.deepEqual(validation.errors, [
      expectedTransitiveDependencyCycleViolation.message,
      "Plan graph contains a dependency cycle."
    ]);
  });

  it("hard-rejects transitive dependency-loop candidate plans before they can be admitted as a PlanGraph", () => {
    assert.throws(
      () =>
        createPlanGraph({
          planId: "plan_transitive_dependency_cycle",
          intent: admittedIntent,
          strategy: "Attempt to admit a transitive dependency loop.",
          tasks: transitiveDependencyCycleCandidatePlanTasks,
          createdAt: "2026-04-26T00:00:00.000Z"
        }),
      /Invalid plan graph: Task dependency cycle detected: task-plan-contract -> task-plan-validation -> task-plan-admission-evidence -> task-plan-contract\.; Plan graph contains a dependency cycle\./
    );
  });
});
