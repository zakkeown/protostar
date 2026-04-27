import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";

import {
  createPlanGraph,
  validatePlanGraph,
  type PlanGraph,
  type PlanTask,
  type PlanTaskRequiredCapabilities
} from "./index.js";

const confirmedIntent = buildConfirmedIntentForTest({
  id: "intent_planning_acceptance_criteria_contract",
  title: "Represent accepted acceptance criteria inside the plan graph",
  problem: "Planning must carry the accepted criteria it is proving, not just task-local references.",
  requester: "ouroboros-ac-1",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_plan_graph_alpha",
      statement: "The accepted alpha criterion is represented by stable id in the plan graph.",
      verification: "test"
    },
    {
      id: "ac_plan_graph_beta",
      statement: "The accepted beta criterion is represented by stable id in the plan graph.",
      verification: "manual",
      justification: "Manual acceptance remains an intent concern; the plan carries the admitted verification mode."
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
        reason: "Verify the planning PlanGraph contract.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["PlanGraph acceptance criteria must mirror the confirmed intent admission output."]
});

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

const planTasks: readonly PlanTask[] = [
  {
    id: "task-plan-acceptance-alpha",
    title: "Cover the accepted alpha criterion",
    kind: "verification",
    dependsOn: [],
    covers: ["ac_plan_graph_alpha"],
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  },
  {
    id: "task-plan-acceptance-beta",
    title: "Cover the accepted beta criterion",
    kind: "verification",
    dependsOn: ["task-plan-acceptance-alpha"],
    covers: ["ac_plan_graph_beta"],
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  }
];

describe("PlanGraph accepted acceptance criteria contract", () => {
  it("admits confirmed intent acceptance criteria as first-class PlanGraph entries", () => {
    const graph = createPlanGraph({
      planId: "plan_acceptance_criteria_contract",
      intent: confirmedIntent,
      strategy: "Carry accepted criteria inside the plan graph and use task covers as proof links.",
      tasks: planTasks,
      createdAt: "2026-04-26T00:00:00.000Z"
    });

    assert.deepEqual(graph.acceptanceCriteria, [
      {
        id: "ac_plan_graph_alpha",
        statement: "The accepted alpha criterion is represented by stable id in the plan graph.",
        verification: "test"
      },
      {
        id: "ac_plan_graph_beta",
        statement: "The accepted beta criterion is represented by stable id in the plan graph.",
        verification: "manual"
      }
    ]);

    const validation = validatePlanGraph({
      graph,
      intent: confirmedIntent
    });

    assert.equal(validation.ok, true);
    assert.deepEqual(validation.violations, []);
    assert.deepEqual(validation.errors, []);
  });

  it("rejects PlanGraph acceptance criteria without required stable ids or confirmed-intent parity", () => {
    const validGraph = createPlanGraph({
      planId: "plan_acceptance_criteria_rejection",
      intent: confirmedIntent,
      strategy: "Start valid, then corrupt only the accepted criteria boundary.",
      tasks: planTasks,
      createdAt: "2026-04-26T00:00:00.000Z"
    });
    const graph = {
      ...validGraph,
      acceptanceCriteria: [
        {
          statement: "Missing stable id cannot be admitted.",
          verification: "test"
        },
        {
          id: "criterion_not_stable",
          statement: "Wrong id namespace cannot be admitted.",
          verification: "test"
        },
        {
          id: "ac_plan_graph_extra",
          statement: "Unknown criteria cannot be smuggled into the graph.",
          verification: "evidence"
        },
        {
          id: "ac_plan_graph_alpha",
          statement: "Tampered statement for the alpha criterion.",
          verification: "test"
        },
        {
          id: "ac_plan_graph_alpha",
          statement: "Duplicate alpha criterion.",
          verification: "test"
        },
        {
          id: "ac_plan_graph_beta",
          statement: "The accepted beta criterion is represented by stable id in the plan graph.",
          verification: "evidence"
        },
        {
          id: "ac_plan_graph_empty_statement",
          statement: "",
          verification: "manual"
        },
        {
          id: "ac_plan_graph_bad_verification",
          statement: "Bad verification mode is rejected.",
          verification: "robot"
        }
      ]
    } as unknown as PlanGraph;

    const validation = validatePlanGraph({
      graph,
      intent: confirmedIntent
    });

    assert.equal(validation.ok, false);
    assert.deepEqual(
      validation.violations.map(({ code, path, acceptanceCriterionId, message }) => ({
        code,
        path,
        acceptanceCriterionId,
        message
      })),
      [
        {
          code: "invalid-accepted-criterion-id",
          path: "acceptanceCriteria.0.id",
          acceptanceCriterionId: undefined,
          message: "Plan graph acceptanceCriteria.0.id must be a stable ac_ acceptance criterion id."
        },
        {
          code: "invalid-accepted-criterion-id",
          path: "acceptanceCriteria.1.id",
          acceptanceCriterionId: undefined,
          message: "Plan graph acceptanceCriteria.1.id must be a stable ac_ acceptance criterion id."
        },
        {
          code: "unknown-accepted-criterion",
          path: "acceptanceCriteria.2.id",
          acceptanceCriterionId: "ac_plan_graph_extra",
          message:
            "Plan graph acceptanceCriteria.2.id references acceptance criterion ac_plan_graph_extra outside confirmed intent intent_planning_acceptance_criteria_contract."
        },
        {
          code: "drifted-accepted-criterion",
          path: "acceptanceCriteria.3.statement",
          acceptanceCriterionId: "ac_plan_graph_alpha",
          message:
            "Plan graph acceptanceCriteria.3.statement must match confirmed intent criterion ac_plan_graph_alpha."
        },
        {
          code: "duplicate-accepted-criterion-id",
          path: "acceptanceCriteria.4.id",
          acceptanceCriterionId: "ac_plan_graph_alpha",
          message: "Plan graph acceptanceCriteria.4.id duplicates accepted criterion ac_plan_graph_alpha."
        },
        {
          code: "drifted-accepted-criterion",
          path: "acceptanceCriteria.5.verification",
          acceptanceCriterionId: "ac_plan_graph_beta",
          message:
            "Plan graph acceptanceCriteria.5.verification must match confirmed intent criterion ac_plan_graph_beta."
        },
        {
          code: "malformed-accepted-criterion",
          path: "acceptanceCriteria.6.statement",
          acceptanceCriterionId: undefined,
          message: "Plan graph acceptanceCriteria.6.statement must be a non-empty string."
        },
        {
          code: "unknown-accepted-criterion",
          path: "acceptanceCriteria.6.id",
          acceptanceCriterionId: "ac_plan_graph_empty_statement",
          message:
            "Plan graph acceptanceCriteria.6.id references acceptance criterion ac_plan_graph_empty_statement outside confirmed intent intent_planning_acceptance_criteria_contract."
        },
        {
          code: "malformed-accepted-criterion",
          path: "acceptanceCriteria.7.verification",
          acceptanceCriterionId: undefined,
          message: "Plan graph acceptanceCriteria.7.verification must be test, evidence, or manual."
        },
        {
          code: "unknown-accepted-criterion",
          path: "acceptanceCriteria.7.id",
          acceptanceCriterionId: "ac_plan_graph_bad_verification",
          message:
            "Plan graph acceptanceCriteria.7.id references acceptance criterion ac_plan_graph_bad_verification outside confirmed intent intent_planning_acceptance_criteria_contract."
        },
        {
          code: "unaccepted-task-coverage-accepted-criterion-id",
          path: "tasks.task-plan-acceptance-alpha.covers.0",
          acceptanceCriterionId: "ac_plan_graph_alpha",
          message:
            "Task task-plan-acceptance-alpha covers acceptance criterion ac_plan_graph_alpha, but that criterion is not in an accepted PlanGraph state."
        },
        {
          code: "unaccepted-task-coverage-accepted-criterion-id",
          path: "tasks.task-plan-acceptance-beta.covers.0",
          acceptanceCriterionId: "ac_plan_graph_beta",
          message:
            "Task task-plan-acceptance-beta covers acceptance criterion ac_plan_graph_beta, but that criterion is not in an accepted PlanGraph state."
        },
        {
          code: "uncovered-acceptance-criterion",
          path: "acceptanceCriteria",
          acceptanceCriterionId: "ac_plan_graph_alpha",
          message: "Acceptance criterion ac_plan_graph_alpha is not covered by any plan task."
        },
        {
          code: "uncovered-acceptance-criterion",
          path: "acceptanceCriteria",
          acceptanceCriterionId: "ac_plan_graph_beta",
          message: "Acceptance criterion ac_plan_graph_beta is not covered by any plan task."
        }
      ]
    );
  });

  it("requires PlanGraph acceptanceCriteria to exist as a first-class array", () => {
    const validGraph = createPlanGraph({
      planId: "plan_acceptance_criteria_required_array",
      intent: confirmedIntent,
      strategy: "Start valid, then remove the first-class criteria collection.",
      tasks: planTasks,
      createdAt: "2026-04-26T00:00:00.000Z"
    });
    const graph = {
      ...validGraph,
      acceptanceCriteria: undefined
    } as unknown as PlanGraph;

    const validation = validatePlanGraph({
      graph,
      intent: confirmedIntent
    });

    assert.equal(validation.ok, false);
    assert.equal(validation.violations[0]?.code, "accepted-criteria-not-array");
    assert.equal(validation.violations[0]?.message, "Plan graph acceptanceCriteria must be an array of accepted criteria.");
  });
});
