import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertAdmittedPlanHandoff,
  createPlanGraph,
  createPlanningAdmissionArtifact,
  PLANNING_ADMISSION_ARTIFACT_NAME,
  type PlanTaskRequiredCapabilities
} from "@protostar/planning";
import { defineWorkspace } from "@protostar/repo";
import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";

import {
  prepareExecutionRun,
  runExecutionDryRun,
  type ExecutionLifecycleEventType,
  type ExecutionTaskStatus
} from "./index.js";

const STATUSES: readonly ExecutionTaskStatus[] = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "timeout",
  "cancelled"
] as const;

const EVENTS: readonly ExecutionLifecycleEventType[] = [
  "task-pending",
  "task-running",
  "task-succeeded",
  "task-failed",
  "task-timeout",
  "task-cancelled"
] as const;

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

const intent = buildConfirmedIntentForTest({
  id: "intent_execution_lifecycle_vocab",
  title: "Pin execution lifecycle vocabulary",
  problem: "Execution lifecycle events must use the EXEC-01 vocabulary.",
  requester: "ouroboros-ac-exec-01",
  confirmedAt: "2026-04-27T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_execution_lifecycle_vocab",
      statement: "Execution emits the EXEC-01 task lifecycle vocabulary.",
      verification: "test"
    }
  ],
  capabilityEnvelope: {
    repoScopes: [],
    toolPermissions: [],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["No compatibility shim for passed or blocked task states."],
  stopConditions: []
});

describe("execution lifecycle vocabulary", () => {
  it("pins the EXEC-01 task status literals", () => {
    assert.deepEqual(STATUSES, [
      "pending",
      "running",
      "succeeded",
      "failed",
      "timeout",
      "cancelled"
    ]);
    assert.equal(STATUSES.includes("passed" as ExecutionTaskStatus), false);
    assert.equal(STATUSES.includes("blocked" as ExecutionTaskStatus), false);
  });

  it("pins the EXEC-01 lifecycle event literals", () => {
    assert.deepEqual(EVENTS, [
      "task-pending",
      "task-running",
      "task-succeeded",
      "task-failed",
      "task-timeout",
      "task-cancelled"
    ]);
    assert.equal(EVENTS.includes("task-passed" as ExecutionLifecycleEventType), false);
    assert.equal(EVENTS.includes("task-blocked" as ExecutionLifecycleEventType), false);
  });

  it("covers every task status in an exhaustive helper", () => {
    assert.deepEqual(
      STATUSES.map((status) => describeStatus(status)),
      ["pending", "running", "succeeded", "failed", "timeout", "cancelled"]
    );
  });

  it("emits pending and succeeded events for a one-task dry run", () => {
    const execution = prepareExecutionRun({
      runId: "run_execution_lifecycle_vocab",
      admittedPlan: createOneTaskAdmittedPlan(),
      workspace: defineWorkspace({
        root: "/tmp/protostar-execution-lifecycle",
        trust: "trusted",
        defaultBranch: "main"
      })
    });

    const result = runExecutionDryRun({
      execution,
      now: () => "2026-04-27T00:00:00.000Z"
    });

    assert.deepEqual(
      result.events.map((event) => event.type),
      ["task-pending", "task-running", "task-succeeded"]
    );
    assert.deepEqual(
      result.tasks.map((task) => task.status),
      ["succeeded"]
    );
  });
});

function describeStatus(status: ExecutionTaskStatus): string {
  switch (status) {
    case "pending":
    case "running":
    case "succeeded":
    case "failed":
    case "timeout":
    case "cancelled":
      return status;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function createOneTaskAdmittedPlan() {
  const graph = createPlanGraph({
    planId: "plan_execution_lifecycle_vocab",
    intent,
    strategy: "Pin the dry-run execution lifecycle event names.",
    tasks: [
      {
        id: "task-execution-lifecycle-vocab",
        title: "Emit one dry-run lifecycle",
        kind: "verification",
        dependsOn: [],
        covers: ["ac_execution_lifecycle_vocab"],
        requiredCapabilities: noRequiredCapabilities,
        risk: "low"
      }
    ],
    createdAt: "2026-04-27T00:00:00.000Z"
  });
  const planningAdmission = createPlanningAdmissionArtifact({
    graph,
    intent,
    planGraphUri: "plan.json",
    admittedAt: "2026-04-27T00:00:00.000Z"
  });
  const handoff = assertAdmittedPlanHandoff({
    plan: graph,
    planningAdmission,
    planningAdmissionArtifact: {
      artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
      uri: PLANNING_ADMISSION_ARTIFACT_NAME,
      persisted: true
    },
    planGraphUri: "plan.json"
  });

  return handoff.executionArtifact;
}
