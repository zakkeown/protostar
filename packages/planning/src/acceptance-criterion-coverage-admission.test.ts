import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { defineConfirmedIntent } from "@protostar/intent";

import {
  createPlanGraph,
  validatePlanGraph,
  type PlanAcceptanceCriterion,
  type PlanGraph,
  type PlanGraphValidationViolation,
  type PlanTask,
  type PlanTaskRequiredCapabilities
} from "./index.js";
import { withAffectedPlanLocations } from "./test-support.js";

const admittedIntent = defineConfirmedIntent({
  id: "intent_planning_ac_coverage_admission",
  title: "Reject malformed acceptance-criterion and coverage ids",
  problem:
    "Planning admission must not let duplicate, missing, or dangling acceptance-criterion proof ids reach execution.",
  requester: "ouroboros-ac-3",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_admission_alpha",
      statement: "The alpha accepted criterion is present exactly once in the admitted PlanGraph.",
      verification: "test"
    },
    {
      id: "ac_admission_beta",
      statement: "The beta accepted criterion is covered by a valid task coverage link.",
      verification: "test"
    },
    {
      id: "ac_admission_gamma",
      statement: "The gamma accepted criterion cannot disappear from the PlanGraph or coverage proof.",
      verification: "evidence"
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
        reason: "Run the acceptance-criterion coverage admission fixture.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: [
    "Planning admission must collect duplicate, missing, and dangling acceptance-criterion defects in one pass."
  ]
});

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

const acceptedCriteriaWithDuplicateMissingAndDanglingIds: readonly PlanAcceptanceCriterion[] = [
  {
    id: "ac_admission_alpha",
    statement: "The alpha accepted criterion is present exactly once in the admitted PlanGraph.",
    verification: "test"
  },
  {
    id: "ac_admission_alpha",
    statement: "The alpha accepted criterion is duplicated and must be rejected.",
    verification: "test"
  },
  {
    id: "ac_admission_beta",
    statement: "The beta accepted criterion is covered by a valid task coverage link.",
    verification: "test"
  },
  {
    id: "ac_candidate_extra",
    statement: "A candidate-only criterion cannot be smuggled into the admitted PlanGraph.",
    verification: "manual"
  }
];

const coverageWithDuplicateMissingAndDanglingIds: readonly PlanTask[] = [
  {
    id: "task-ac-coverage-alpha",
    title: "Attempt duplicate and dangling alpha coverage links",
    kind: "verification",
    dependsOn: [],
    covers: ["ac_admission_alpha", "ac_admission_alpha", "ac_candidate_extra"],
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  },
  {
    id: "task-ac-coverage-empty",
    title: "Attempt missing coverage ids",
    kind: "verification",
    dependsOn: ["task-ac-coverage-alpha"],
    covers: [],
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  },
  {
    id: "task-ac-coverage-beta",
    title: "Keep beta coverage valid while gamma remains uncovered",
    kind: "verification",
    dependsOn: ["task-ac-coverage-alpha"],
    covers: ["ac_admission_beta"],
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  }
];

describe("PlanGraph acceptance-criterion and coverage admission boundary", () => {
  it("collects duplicate, missing, and dangling accepted criteria and coverage ids in one pass", () => {
    const validation = validatePlanGraph({
      graph: {
        planId: "plan_ac_coverage_rejection",
        intentId: admittedIntent.id,
        createdAt: "2026-04-26T00:00:00.000Z",
        strategy: "Attempt to admit malformed accepted criteria and task coverage proof ids.",
        acceptanceCriteria: acceptedCriteriaWithDuplicateMissingAndDanglingIds,
        tasks: coverageWithDuplicateMissingAndDanglingIds
      } as unknown as PlanGraph,
      intent: admittedIntent
    });

    const expectedViolations: readonly PlanGraphValidationViolation[] = withAffectedPlanLocations([
      {
        validator: "accepted-criteria",
        code: "duplicate-accepted-criterion-id",
        path: "acceptanceCriteria.1.id",
        acceptanceCriterionId: "ac_admission_alpha",
        message: "Plan graph acceptanceCriteria.1.id duplicates accepted criterion ac_admission_alpha."
      },
      {
        validator: "accepted-criteria",
        code: "unknown-accepted-criterion",
        path: "acceptanceCriteria.3.id",
        acceptanceCriterionId: "ac_candidate_extra",
        message:
          "Plan graph acceptanceCriteria.3.id references acceptance criterion ac_candidate_extra outside confirmed intent intent_planning_ac_coverage_admission."
      },
      {
        validator: "accepted-criteria",
        code: "missing-accepted-criterion",
        path: "acceptanceCriteria",
        acceptanceCriterionId: "ac_admission_gamma",
        message:
          "Plan graph acceptanceCriteria must include accepted criterion ac_admission_gamma from confirmed intent intent_planning_ac_coverage_admission."
      },
      {
        validator: "task-contracts",
        code: "duplicate-task-coverage-accepted-criterion-id",
        path: "tasks.task-ac-coverage-alpha.covers.1",
        taskId: "task-ac-coverage-alpha",
        coverageIndex: 1,
        firstIndex: 0,
        duplicateIndex: 1,
        acceptanceCriterionId: "ac_admission_alpha",
        message: "Task task-ac-coverage-alpha covers acceptance criterion ac_admission_alpha more than once."
      },
      {
        validator: "task-contracts",
        code: "unknown-acceptance-criterion",
        path: "tasks.task-ac-coverage-alpha.covers.2",
        taskId: "task-ac-coverage-alpha",
        coverageIndex: 2,
        acceptanceCriterionId: "ac_candidate_extra",
        message:
          "Task task-ac-coverage-alpha covers acceptance criterion ac_candidate_extra outside confirmed intent intent_planning_ac_coverage_admission."
      },
      {
        validator: "task-contracts",
        code: "empty-task-coverage",
        path: "tasks.task-ac-coverage-empty.covers",
        taskId: "task-ac-coverage-empty",
        message: "Task task-ac-coverage-empty must cover at least one acceptance criterion."
      },
      {
        validator: "acceptance-coverage",
        code: "uncovered-acceptance-criterion",
        path: "acceptanceCriteria",
        acceptanceCriterionId: "ac_admission_gamma",
        message: "Acceptance criterion ac_admission_gamma is not covered by any plan task."
      }
    ]);

    assert.equal(validation.ok, false);
    assert.deepEqual(validation.violations, expectedViolations);
    assert.deepEqual(
      validation.errors,
      expectedViolations.map((violation) => violation.message)
    );
  });

  it("hard-rejects duplicate, missing, and dangling task coverage ids before PlanGraph admission", () => {
    assert.throws(
      () =>
        createPlanGraph({
          planId: "plan_ac_coverage_rejection",
          intent: admittedIntent,
          strategy: "Attempt to admit malformed task coverage proof ids.",
          tasks: coverageWithDuplicateMissingAndDanglingIds,
          createdAt: "2026-04-26T00:00:00.000Z"
        }),
      /Invalid plan graph: Task task-ac-coverage-alpha covers acceptance criterion ac_admission_alpha more than once\.; Task task-ac-coverage-alpha covers acceptance criterion ac_candidate_extra outside confirmed intent intent_planning_ac_coverage_admission\.; Task task-ac-coverage-empty must cover at least one acceptance criterion\.; Acceptance criterion ac_admission_gamma is not covered by any plan task\./
    );
  });

  it("rejects candidate plans when any accepted criterion has zero covering tasks", () => {
    const candidateTasks: readonly PlanTask[] = [
      {
        id: "task-ac-coverage-alpha-only",
        title: "Cover alpha while leaving beta and gamma uncovered",
        kind: "implementation",
        dependsOn: [],
        covers: ["ac_admission_alpha"],
        requiredCapabilities: noRequiredCapabilities,
        risk: "low"
      }
    ];

    const validation = validatePlanGraph({
      graph: {
        planId: "plan_ac_zero_covering_tasks",
        intentId: admittedIntent.id,
        createdAt: "2026-04-26T00:00:00.000Z",
        strategy: "Attempt to admit a candidate plan with accepted criteria that have no task proof.",
        acceptanceCriteria: admittedIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
          id,
          statement,
          verification
        })),
        tasks: candidateTasks
      },
      intent: admittedIntent
    });

    assert.equal(validation.ok, false);
    assert.deepEqual(validation.violations, withAffectedPlanLocations([
      {
        validator: "acceptance-coverage",
        code: "uncovered-acceptance-criterion",
        path: "acceptanceCriteria",
        acceptanceCriterionId: "ac_admission_beta",
        message: "Acceptance criterion ac_admission_beta is not covered by any plan task."
      },
      {
        validator: "acceptance-coverage",
        code: "uncovered-acceptance-criterion",
        path: "acceptanceCriteria",
        acceptanceCriterionId: "ac_admission_gamma",
        message: "Acceptance criterion ac_admission_gamma is not covered by any plan task."
      }
    ]));

    assert.throws(
      () =>
        createPlanGraph({
          planId: "plan_ac_zero_covering_tasks",
          intent: admittedIntent,
          strategy: "Attempt to admit a candidate plan with accepted criteria that have no task proof.",
          tasks: candidateTasks,
          createdAt: "2026-04-26T00:00:00.000Z"
        }),
      /Invalid plan graph: Acceptance criterion ac_admission_beta is not covered by any plan task\.; Acceptance criterion ac_admission_gamma is not covered by any plan task\./
    );
  });

  it("rejects task coverage links whose AC ids are absent from the accepted AC catalog", () => {
    const catalogMissingBetaAndGamma: readonly PlanAcceptanceCriterion[] = [
      {
        id: "ac_admission_alpha",
        statement: "The alpha accepted criterion is present exactly once in the admitted PlanGraph.",
        verification: "test"
      }
    ];
    const candidateTasks: readonly PlanTask[] = [
      {
        id: "task-ac-coverage-catalog-alpha",
        title: "Cover alpha from the accepted catalog",
        kind: "verification",
        dependsOn: [],
        covers: ["ac_admission_alpha"],
        requiredCapabilities: noRequiredCapabilities,
        risk: "low"
      },
      {
        id: "task-ac-coverage-catalog-missing",
        title: "Attempt to cover accepted intent criteria absent from the plan catalog",
        kind: "verification",
        dependsOn: ["task-ac-coverage-catalog-alpha"],
        covers: ["ac_admission_beta", "ac_admission_gamma"],
        requiredCapabilities: noRequiredCapabilities,
        risk: "low"
      }
    ];

    const validation = validatePlanGraph({
      graph: {
        planId: "plan_ac_catalog_missing_coverage_links",
        intentId: admittedIntent.id,
        createdAt: "2026-04-26T00:00:00.000Z",
        strategy: "Attempt to use confirmed-intent criteria that were not admitted into the PlanGraph catalog.",
        acceptanceCriteria: catalogMissingBetaAndGamma,
        tasks: candidateTasks
      },
      intent: admittedIntent
    });

    const expectedViolations: readonly PlanGraphValidationViolation[] = withAffectedPlanLocations([
      {
        validator: "accepted-criteria",
        code: "missing-accepted-criterion",
        path: "acceptanceCriteria",
        acceptanceCriterionId: "ac_admission_beta",
        message:
          "Plan graph acceptanceCriteria must include accepted criterion ac_admission_beta from confirmed intent intent_planning_ac_coverage_admission."
      },
      {
        validator: "accepted-criteria",
        code: "missing-accepted-criterion",
        path: "acceptanceCriteria",
        acceptanceCriterionId: "ac_admission_gamma",
        message:
          "Plan graph acceptanceCriteria must include accepted criterion ac_admission_gamma from confirmed intent intent_planning_ac_coverage_admission."
      },
      {
        validator: "task-contracts",
        code: "unknown-acceptance-criterion",
        path: "tasks.task-ac-coverage-catalog-missing.covers.0",
        taskId: "task-ac-coverage-catalog-missing",
        coverageIndex: 0,
        acceptanceCriterionId: "ac_admission_beta",
        message:
          "Task task-ac-coverage-catalog-missing covers acceptance criterion ac_admission_beta outside accepted AC catalog."
      },
      {
        validator: "task-contracts",
        code: "unknown-acceptance-criterion",
        path: "tasks.task-ac-coverage-catalog-missing.covers.1",
        taskId: "task-ac-coverage-catalog-missing",
        coverageIndex: 1,
        acceptanceCriterionId: "ac_admission_gamma",
        message:
          "Task task-ac-coverage-catalog-missing covers acceptance criterion ac_admission_gamma outside accepted AC catalog."
      },
      {
        validator: "acceptance-coverage",
        code: "uncovered-acceptance-criterion",
        path: "acceptanceCriteria",
        acceptanceCriterionId: "ac_admission_beta",
        message: "Acceptance criterion ac_admission_beta is not covered by any plan task."
      },
      {
        validator: "acceptance-coverage",
        code: "uncovered-acceptance-criterion",
        path: "acceptanceCriteria",
        acceptanceCriterionId: "ac_admission_gamma",
        message: "Acceptance criterion ac_admission_gamma is not covered by any plan task."
      }
    ]);

    assert.equal(validation.ok, false);
    assert.deepEqual(validation.violations, expectedViolations);
    assert.deepEqual(
      validation.errors,
      expectedViolations.map((violation) => violation.message)
    );
  });

  it("rejects task coverage links whose AC ids exist but are not in an accepted PlanGraph state", () => {
    const catalogWithDriftedBeta: readonly PlanAcceptanceCriterion[] = [
      {
        id: "ac_admission_alpha",
        statement: "The alpha accepted criterion is present exactly once in the admitted PlanGraph.",
        verification: "test"
      },
      {
        id: "ac_admission_beta",
        statement: "The beta criterion id exists, but this drifted statement is not accepted.",
        verification: "test"
      },
      {
        id: "ac_admission_gamma",
        statement: "The gamma accepted criterion cannot disappear from the PlanGraph or coverage proof.",
        verification: "evidence"
      }
    ];
    const candidateTasks: readonly PlanTask[] = [
      {
        id: "task-ac-coverage-accepted-state-alpha",
        title: "Cover a valid accepted criterion",
        kind: "verification",
        dependsOn: [],
        covers: ["ac_admission_alpha"],
        requiredCapabilities: noRequiredCapabilities,
        risk: "low"
      },
      {
        id: "task-ac-coverage-unaccepted-state-beta",
        title: "Attempt to cover a drifted accepted-criterion row",
        kind: "verification",
        dependsOn: ["task-ac-coverage-accepted-state-alpha"],
        covers: ["ac_admission_beta"],
        requiredCapabilities: noRequiredCapabilities,
        risk: "low"
      },
      {
        id: "task-ac-coverage-accepted-state-gamma",
        title: "Keep the remaining accepted criterion covered",
        kind: "verification",
        dependsOn: ["task-ac-coverage-accepted-state-alpha"],
        covers: ["ac_admission_gamma"],
        requiredCapabilities: noRequiredCapabilities,
        risk: "low"
      }
    ];

    const validation = validatePlanGraph({
      graph: {
        planId: "plan_ac_catalog_unaccepted_state_coverage_link",
        intentId: admittedIntent.id,
        createdAt: "2026-04-26T00:00:00.000Z",
        strategy: "Attempt to treat an existing but drifted AC catalog row as valid task coverage proof.",
        acceptanceCriteria: catalogWithDriftedBeta,
        tasks: candidateTasks
      },
      intent: admittedIntent
    });

    const expectedViolations: readonly PlanGraphValidationViolation[] = withAffectedPlanLocations([
      {
        validator: "accepted-criteria",
        code: "drifted-accepted-criterion",
        path: "acceptanceCriteria.1.statement",
        acceptanceCriterionId: "ac_admission_beta",
        message: "Plan graph acceptanceCriteria.1.statement must match confirmed intent criterion ac_admission_beta."
      },
      {
        validator: "task-contracts",
        code: "unaccepted-task-coverage-accepted-criterion-id",
        path: "tasks.task-ac-coverage-unaccepted-state-beta.covers.0",
        taskId: "task-ac-coverage-unaccepted-state-beta",
        coverageIndex: 0,
        acceptanceCriterionId: "ac_admission_beta",
        message:
          "Task task-ac-coverage-unaccepted-state-beta covers acceptance criterion ac_admission_beta, but that criterion is not in an accepted PlanGraph state."
      },
      {
        validator: "acceptance-coverage",
        code: "uncovered-acceptance-criterion",
        path: "acceptanceCriteria",
        acceptanceCriterionId: "ac_admission_beta",
        message: "Acceptance criterion ac_admission_beta is not covered by any plan task."
      }
    ]);

    assert.equal(validation.ok, false);
    assert.deepEqual(validation.violations, expectedViolations);
    assert.deepEqual(
      validation.errors,
      expectedViolations.map((violation) => violation.message)
    );
  });
});
