import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";

import {
  createPlanGraph,
  validatePlanGraph,
  type PlanGraph,
  type PlanGraphValidationViolation,
  type PlanTask,
  type PlanTaskRequiredCapabilities,
  type PlanTaskRiskDeclaration
} from "./index.js";

const admittedIntent = buildConfirmedIntentForTest({
  id: "intent_planning_task_risk_declaration",
  title: "Reject tasks without explicit risk declarations",
  problem: "Execution must not receive plan tasks whose task-level risk was inferred or omitted.",
  requester: "ouroboros-ac-5-1",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_task_risk_declaration",
      statement: "Every candidate plan task declares a low, medium, or high task risk before admission.",
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
        reason: "Run the task risk declaration planning admission fixture.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["Candidate plan tasks must declare task risk explicitly using the existing policy risk model."]
});

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

const acceptedCriteria = admittedIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
  id,
  statement,
  verification
}));

describe("PlanGraph task risk declaration admission boundary", () => {
  it("admits candidate plan tasks with explicit policy risk declarations", () => {
    const taskRisk = "medium" as const satisfies PlanTaskRiskDeclaration;
    const graph = createPlanGraph({
      planId: "plan_task_risk_declaration",
      intent: admittedIntent,
      strategy: "Admit only tasks with explicit task-level risk declarations.",
      tasks: [
        {
          id: "task-declare-risk",
          title: "Declare task risk before execution",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_task_risk_declaration"],
          requiredCapabilities: noRequiredCapabilities,
          risk: taskRisk
        }
      ],
      createdAt: "2026-04-26T00:00:00.000Z"
    });

    const validation = validatePlanGraph({
      graph,
      intent: admittedIntent
    });

    assert.equal(validation.ok, true);
    assert.equal(graph.tasks[0]?.risk, taskRisk);
    assert.deepEqual(validation.violations, []);
    assert.deepEqual(validation.errors, []);
  });

  it("collects missing and malformed task risk declarations in one validation pass", () => {
    const graph = {
      planId: "plan_task_risk_declaration_rejection",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Attempt to admit tasks with absent and invalid risk declarations.",
      acceptanceCriteria: acceptedCriteria,
      tasks: [
        {
          id: "task-missing-risk",
          title: "Omit task risk",
          kind: "implementation",
          dependsOn: [],
          covers: ["ac_task_risk_declaration"],
          requiredCapabilities: noRequiredCapabilities
        },
        {
          id: "task-malformed-risk",
          title: "Declare an unsupported task risk",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_task_risk_declaration"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "critical"
        }
      ]
    } as unknown as PlanGraph;

    const validation = validatePlanGraph({
      graph,
      intent: admittedIntent
    });

    const expectedViolations: readonly Pick<PlanGraphValidationViolation, "code" | "path" | "taskId" | "message">[] = [
      {
        code: "missing-task-risk",
        path: "tasks.task-missing-risk.risk",
        taskId: "task-missing-risk",
        message: "Task task-missing-risk risk must be explicitly declared as low, medium, or high."
      },
      {
        code: "malformed-task-risk",
        path: "tasks.task-malformed-risk.risk",
        taskId: "task-malformed-risk",
        message: "Task task-malformed-risk risk must be low, medium, or high."
      }
    ];

    assert.equal(validation.ok, false);
    assert.deepEqual(
      validation.violations.map(({ code, path, taskId, message }) => ({ code, path, taskId, message })),
      expectedViolations
    );
    assert.deepEqual(
      validation.errors,
      expectedViolations.map((violation) => violation.message)
    );
  });

  it("hard-rejects candidate plans with missing task risk before admission", () => {
    assert.throws(
      () =>
        createPlanGraph({
          planId: "plan_task_risk_declaration_hard_reject",
          intent: admittedIntent,
          strategy: "Attempt to admit a task without an explicit risk declaration.",
          tasks: [
            {
              id: "task-missing-risk",
              title: "Omit task risk",
              kind: "implementation",
              dependsOn: [],
              covers: ["ac_task_risk_declaration"],
              requiredCapabilities: noRequiredCapabilities
            }
          ] as unknown as readonly PlanTask[],
          createdAt: "2026-04-26T00:00:00.000Z"
        }),
      /Invalid plan graph: Task task-missing-risk risk must be explicitly declared as low, medium, or high\./
    );
  });
});
