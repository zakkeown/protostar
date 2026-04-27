import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";

import { createPlanGraph, validatePlanGraph, type PlanTask, type PlanTaskRequiredCapabilities } from "./index.js";
import { withAffectedPlanLocations } from "./test-support.js";

const admittedIntent = buildConfirmedIntentForTest({
  id: "intent_planning_duplicate_task_id",
  title: "Reject duplicate task IDs during collect-all plan admission",
  problem: "Planning admission needs unambiguous task identity while still surfacing independent dependency defects.",
  requester: "ouroboros-ac-20001",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_duplicate_task_ids_rejected",
      statement: "Duplicate task IDs in candidate plans are rejected during the collect-all admission pass.",
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
        reason: "Run the duplicate task-id planning admission fixture.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["Planning admission must reject ambiguous task identity and collect independent dependency defects."]
});

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

const duplicateTaskIdCandidatePlanTasks: readonly PlanTask[] = [
  {
    id: "task-duplicate-id",
    title: "First candidate task with a dependency that must not be evaluated yet",
    kind: "implementation",
    dependsOn: ["task-missing-dependency"],
    covers: ["ac_duplicate_task_ids_rejected"],
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  },
  {
    id: "task-duplicate-id",
    title: "Second candidate task reusing the same task id",
    kind: "verification",
    dependsOn: ["task-duplicate-id"],
    covers: ["ac_duplicate_task_ids_rejected"],
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  }
];

describe("PlanGraph duplicate task-id admission boundary", () => {
  it("collects duplicate task IDs and dependency defects in one validation pass", () => {
    const validation = validatePlanGraph({
      graph: {
        planId: "plan_duplicate_task_id",
        intentId: admittedIntent.id,
        createdAt: "2026-04-26T00:00:00.000Z",
        strategy: "Attempt to admit ambiguous task identity into execution.",
        acceptanceCriteria: admittedIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
          id,
          statement,
          verification
        })),
        tasks: duplicateTaskIdCandidatePlanTasks
      },
      intent: admittedIntent
    });

    assert.equal(validation.ok, false);
    assert.deepEqual(
      validation.violations.map((violation) => violation.code),
      ["duplicate-task-id", "missing-task-dependency"]
    );
    assert.deepEqual(
      validation.violations.map((violation) => violation.path),
      ["tasks.1.id", "tasks.task-duplicate-id.dependsOn.0"]
    );
    assert.deepEqual(validation.errors, [
      "Task task-duplicate-id duplicates task id from tasks.0.",
      "Task task-duplicate-id depends on missing task task-missing-dependency."
    ]);
    assert.deepEqual(
      validation.violations.find((violation) => violation.code === "missing-task-dependency"),
      withAffectedPlanLocations([{
        validator: "task-contracts",
        code: "missing-task-dependency",
        path: "tasks.task-duplicate-id.dependsOn.0",
        taskId: "task-duplicate-id",
        dependency: "task-missing-dependency",
        dependencyIndex: 0,
        message: "Task task-duplicate-id depends on missing task task-missing-dependency."
      }])[0]
    );
    assert.equal(
      validation.violations.some((violation) => violation.code === "dependency-cycle"),
      false
    );
  });

  it("hard-rejects duplicate task-id candidate plans before they can be admitted as a PlanGraph", () => {
    assert.throws(
      () =>
        createPlanGraph({
          planId: "plan_duplicate_task_id",
          intent: admittedIntent,
          strategy: "Attempt to admit duplicate task IDs.",
          tasks: duplicateTaskIdCandidatePlanTasks,
          createdAt: "2026-04-26T00:00:00.000Z"
        }),
      /Invalid plan graph: Task task-duplicate-id duplicates task id from tasks\.0\.; Task task-duplicate-id depends on missing task task-missing-dependency\./
    );
  });
});
