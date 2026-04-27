import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";

import {
  collectPlanTaskCoverageLinks,
  createPlanGraph,
  validatePlanGraph,
  type PlanAcceptanceCriterion,
  type PlanGraph,
  type PlanGraphValidationViolation,
  type PlanTask,
  type PlanTaskRequiredCapabilities
} from "./index.js";
import { withAffectedPlanLocations } from "./test-support.js";

const admittedIntent = buildConfirmedIntentForTest({
  id: "intent_planning_task_coverage_links",
  title: "Represent task-to-accepted-AC coverage links",
  problem: "Execution must receive task coverage links that point only from stable task ids to admitted AC ids.",
  requester: "ouroboros-ac-2",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_task_coverage_links",
      statement: "Plan tasks expose stable task-to-accepted-AC coverage links.",
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
        reason: "Run task coverage link contract fixtures.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["Task coverage links must not reference unstable task or acceptance-criterion ids."]
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

const validCoverageTasks: readonly PlanTask[] = [
  {
    id: "task-plan-coverage-contract",
    title: "Define task-to-accepted-AC coverage links",
    kind: "design",
    dependsOn: [],
    covers: ["ac_task_coverage_links"],
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  }
];

const invalidCoverageTasks = [
  {
    id: "step-plan-coverage-contract",
    title: "Attempt to use unstable task and coverage ids",
    kind: "design",
    dependsOn: ["phase-bootstrap", "task-valid-coverage"],
    covers: ["criterion_task_coverage_links", "ac_unknown_task_coverage_links"],
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  },
  {
    id: "task-valid-coverage",
    title: "Keep the admitted criterion covered while another task is invalid",
    kind: "verification",
    dependsOn: [],
    covers: ["ac_task_coverage_links"],
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  }
] as unknown as readonly PlanTask[];

describe("PlanGraph task coverage link contract", () => {
  it("derives thin task-to-accepted-AC coverage links from stable PlanGraph tasks", () => {
    const graph = createPlanGraph({
      planId: "plan_task_coverage_links",
      intent: admittedIntent,
      strategy: "Represent proof links without duplicating accepted criterion evidence.",
      tasks: validCoverageTasks,
      createdAt: "2026-04-26T00:00:00.000Z"
    });

    assert.deepEqual(collectPlanTaskCoverageLinks(graph), [
      {
        taskId: "task-plan-coverage-contract",
        acceptedCriterionId: "ac_task_coverage_links"
      }
    ]);
  });

  it("collects unstable task and coverage link ids in one validation pass", () => {
    const validation = validatePlanGraph({
      graph: {
        planId: "plan_invalid_task_coverage_links",
        intentId: admittedIntent.id,
        createdAt: "2026-04-26T00:00:00.000Z",
        strategy: "Attempt to admit unstable task and coverage ids.",
        acceptanceCriteria: acceptedCriteria,
        tasks: invalidCoverageTasks
      },
      intent: admittedIntent
    });

    const expectedViolations: readonly PlanGraphValidationViolation[] = withAffectedPlanLocations([
      {
        validator: "task-contracts",
        code: "invalid-task-id",
        path: "tasks.step-plan-coverage-contract.id",
        taskId: "step-plan-coverage-contract",
        message: "Task step-plan-coverage-contract id must be a stable task- task id."
      },
      {
        validator: "task-contracts",
        code: "invalid-task-coverage-accepted-criterion-id",
        path: "tasks.step-plan-coverage-contract.covers.0",
        taskId: "step-plan-coverage-contract",
        coverageIndex: 0,
        acceptanceCriterionId: "criterion_task_coverage_links",
        message:
          "Task step-plan-coverage-contract coverage link 0 must reference a stable ac_ accepted criterion id."
      },
      {
        validator: "task-contracts",
        code: "unknown-acceptance-criterion",
        path: "tasks.step-plan-coverage-contract.covers.1",
        taskId: "step-plan-coverage-contract",
        coverageIndex: 1,
        acceptanceCriterionId: "ac_unknown_task_coverage_links",
        message:
          "Task step-plan-coverage-contract covers acceptance criterion ac_unknown_task_coverage_links outside confirmed intent intent_planning_task_coverage_links."
      },
      {
        validator: "task-contracts",
        code: "invalid-task-dependency-id",
        path: "tasks.step-plan-coverage-contract.dependsOn.0",
        taskId: "step-plan-coverage-contract",
        dependency: "phase-bootstrap",
        dependencyIndex: 0,
        message: "Task step-plan-coverage-contract dependency phase-bootstrap must reference a stable task- task id."
      }
    ]);

    assert.equal(validation.ok, false);
    assert.deepEqual(validation.violations, expectedViolations);
    assert.deepEqual(
      validation.errors,
      expectedViolations.map((violation) => violation.message)
    );
  });

  it("hard-rejects unstable task coverage candidate plans before PlanGraph admission", () => {
    assert.throws(
      () =>
        createPlanGraph({
          planId: "plan_invalid_task_coverage_links",
          intent: admittedIntent,
          strategy: "Attempt to admit unstable task and coverage ids.",
          tasks: invalidCoverageTasks,
          createdAt: "2026-04-26T00:00:00.000Z"
        }),
      /Invalid plan graph: Task step-plan-coverage-contract id must be a stable task- task id\.; Task step-plan-coverage-contract coverage link 0 must reference a stable ac_ accepted criterion id\.; Task step-plan-coverage-contract covers acceptance criterion ac_unknown_task_coverage_links outside confirmed intent intent_planning_task_coverage_links\.; Task step-plan-coverage-contract dependency phase-bootstrap must reference a stable task- task id\./
    );
  });
});
