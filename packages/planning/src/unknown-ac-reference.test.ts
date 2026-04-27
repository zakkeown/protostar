import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";

import {
  assertAdmittedPlanHandoff,
  createPlanningAdmissionArtifact,
  createPlanGraph,
  defineCandidatePlan,
  PLANNING_ADMISSION_ARTIFACT_NAME,
  validateAdmittedPlanHandoff,
  type PlanGraph,
  validatePlanGraph,
  type PlanGraphValidationViolation,
  type PlanTask,
  type PlanTaskRequiredCapabilities
} from "./index.js";
import { withAffectedPlanLocations } from "./test-support.js";

const admittedIntent = buildConfirmedIntentForTest({
  id: "intent_planning_unknown_ac_reference",
  title: "Reject plans that reference acceptance criteria outside admitted intent",
  problem: "Planning must not smuggle new acceptance criteria into execution through task coverage.",
  requester: "ouroboros-ac-2",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_admitted_plan_scope",
      statement: "Only acceptance criteria admitted on the confirmed intent can be covered by plan tasks.",
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
        reason: "Run the unknown acceptance-criterion planning boundary fixture.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["Planning admission must hard-reject unknown acceptance-criterion references."]
});

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

const invalidUnknownAcceptanceCriterionTasks: readonly PlanTask[] = [
  {
    id: "task-reference-first-unknown-ac",
    title: "Reference an acceptance criterion that was not admitted",
    kind: "implementation",
    dependsOn: [],
    covers: ["ac_unknown_from_candidate_plan"],
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  },
  {
    id: "task-reference-second-unknown-ac",
    title: "Reference a second acceptance criterion that was not admitted",
    kind: "verification",
    dependsOn: ["task-reference-first-unknown-ac"],
    covers: ["ac_unknown_release_gate"],
    requiredCapabilities: noRequiredCapabilities,
    risk: "low"
  }
];

describe("PlanGraph unknown acceptance-criterion admission boundary", () => {
  it("collects every unknown AC reference against the admitted intent in one validation pass", () => {
    const validation = validatePlanGraph({
      graph: {
        planId: "plan_unknown_ac_reference",
        intentId: admittedIntent.id,
        createdAt: "2026-04-26T00:00:00.000Z",
        strategy: "Attempt to expand acceptance criteria through candidate plan task coverage.",
        acceptanceCriteria: admittedIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
          id,
          statement,
          verification
        })),
        tasks: invalidUnknownAcceptanceCriterionTasks
      },
      intent: admittedIntent
    });

    assert.equal(validation.ok, false);
    assert.deepEqual(validation.errors, [
      "Task task-reference-first-unknown-ac covers acceptance criterion ac_unknown_from_candidate_plan outside confirmed intent intent_planning_unknown_ac_reference.",
      "Task task-reference-second-unknown-ac covers acceptance criterion ac_unknown_release_gate outside confirmed intent intent_planning_unknown_ac_reference.",
      "Acceptance criterion ac_admitted_plan_scope is not covered by any plan task."
    ]);
  });

  it("distinguishes unknown AC ids from known-but-non-accepted AC ids with explicit rejection diagnostics", () => {
    const validation = validatePlanGraph({
      graph: {
        planId: "plan_unknown_and_unaccepted_ac_reference",
        intentId: admittedIntent.id,
        createdAt: "2026-04-26T00:00:00.000Z",
        strategy:
          "Attempt to cover both an AC outside the confirmed intent and an admitted AC whose PlanGraph row drifted.",
        acceptanceCriteria: [
          {
            id: "ac_admitted_plan_scope",
            statement: "This drifted statement keeps the AC id known but prevents PlanGraph acceptance.",
            verification: "test"
          }
        ],
        tasks: [
          {
            id: "task-reference-unknown-ac",
            title: "Reference an AC id outside the confirmed intent",
            kind: "verification",
            dependsOn: [],
            covers: ["ac_unknown_from_candidate_plan"],
            requiredCapabilities: noRequiredCapabilities,
            risk: "low"
          },
          {
            id: "task-reference-known-but-unaccepted-ac",
            title: "Reference a known AC id that is not in accepted PlanGraph state",
            kind: "verification",
            dependsOn: [],
            covers: ["ac_admitted_plan_scope"],
            requiredCapabilities: noRequiredCapabilities,
            risk: "low"
          }
        ]
      },
      intent: admittedIntent
    });

    const expectedViolations: readonly PlanGraphValidationViolation[] = withAffectedPlanLocations([
      {
        validator: "accepted-criteria",
        code: "drifted-accepted-criterion",
        path: "acceptanceCriteria.0.statement",
        acceptanceCriterionId: "ac_admitted_plan_scope",
        message:
          "Plan graph acceptanceCriteria.0.statement must match confirmed intent criterion ac_admitted_plan_scope."
      },
      {
        validator: "task-contracts",
        code: "unknown-acceptance-criterion",
        path: "tasks.task-reference-unknown-ac.covers.0",
        taskId: "task-reference-unknown-ac",
        coverageIndex: 0,
        acceptanceCriterionId: "ac_unknown_from_candidate_plan",
        message:
          "Task task-reference-unknown-ac covers acceptance criterion ac_unknown_from_candidate_plan outside confirmed intent intent_planning_unknown_ac_reference."
      },
      {
        validator: "task-contracts",
        code: "unaccepted-task-coverage-accepted-criterion-id",
        path: "tasks.task-reference-known-but-unaccepted-ac.covers.0",
        taskId: "task-reference-known-but-unaccepted-ac",
        coverageIndex: 0,
        acceptanceCriterionId: "ac_admitted_plan_scope",
        message:
          "Task task-reference-known-but-unaccepted-ac covers acceptance criterion ac_admitted_plan_scope, but that criterion is not in an accepted PlanGraph state."
      },
      {
        validator: "acceptance-coverage",
        code: "uncovered-acceptance-criterion",
        path: "acceptanceCriteria",
        acceptanceCriterionId: "ac_admitted_plan_scope",
        message: "Acceptance criterion ac_admitted_plan_scope is not covered by any plan task."
      }
    ]);

    assert.equal(validation.ok, false);
    assert.deepEqual(validation.violations, expectedViolations);
    assert.deepEqual(
      validation.errors,
      expectedViolations.map((violation) => violation.message)
    );
  });

  it("hard-rejects a candidate plan before it can be admitted as a PlanGraph", () => {
    assert.throws(
      () =>
        createPlanGraph({
          planId: "plan_unknown_ac_reference",
          intent: admittedIntent,
          strategy: "Attempt to admit task coverage for acceptance criteria outside the confirmed intent.",
          tasks: invalidUnknownAcceptanceCriterionTasks,
          createdAt: "2026-04-26T00:00:00.000Z"
        }),
      /Invalid plan graph: Task task-reference-first-unknown-ac covers acceptance criterion ac_unknown_from_candidate_plan outside confirmed intent intent_planning_unknown_ac_reference.; Task task-reference-second-unknown-ac covers acceptance criterion ac_unknown_release_gate outside confirmed intent intent_planning_unknown_ac_reference.; Acceptance criterion ac_admitted_plan_scope is not covered by any plan task\./
    );
  });

  it("blocks planning admission evidence and refuses execution handoff for the unknown-AC fixture", () => {
    const rejectedUnknownAcGraph = defineCandidatePlan({
      planId: "plan_unknown_ac_reference",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Attempt to admit task coverage for acceptance criteria outside the confirmed intent.",
      acceptanceCriteria: admittedIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
        id,
        statement,
        verification
      })),
      tasks: invalidUnknownAcceptanceCriterionTasks
    } as const satisfies PlanGraph);

    const planningAdmission = createPlanningAdmissionArtifact({
      graph: rejectedUnknownAcGraph,
      intent: admittedIntent,
      planGraphUri: "plan.json",
      planningAdmissionUri: PLANNING_ADMISSION_ARTIFACT_NAME
    });

    assert.equal(planningAdmission.decision, "block");
    assert.equal(planningAdmission.admissionStatus, "no-plan-admitted");
    assert.equal(planningAdmission.admitted, false);
    assert.equal(Object.hasOwn(planningAdmission, "admittedPlan"), false);
    assert.equal(Object.hasOwn(planningAdmission, "handoff"), false);
    assert.equal(planningAdmission.details.failure.admittedPlanCreated, false);
    assert.deepEqual(
      planningAdmission.details.failure.rejectionReasons.map(
        ({ validator, code, path, taskId, acceptanceCriterionId }) => ({
          validator,
          code,
          path,
          taskId,
          acceptanceCriterionId
        })
      ),
      [
        {
          validator: "task-contracts",
          code: "unknown-acceptance-criterion",
          path: "tasks.task-reference-first-unknown-ac.covers.0",
          taskId: "task-reference-first-unknown-ac",
          acceptanceCriterionId: "ac_unknown_from_candidate_plan"
        },
        {
          validator: "task-contracts",
          code: "unknown-acceptance-criterion",
          path: "tasks.task-reference-second-unknown-ac.covers.0",
          taskId: "task-reference-second-unknown-ac",
          acceptanceCriterionId: "ac_unknown_release_gate"
        },
        {
          validator: "acceptance-coverage",
          code: "uncovered-acceptance-criterion",
          path: "acceptanceCriteria",
          taskId: undefined,
          acceptanceCriterionId: "ac_admitted_plan_scope"
        }
      ]
    );

    const handoffValidation = validateAdmittedPlanHandoff({
      plan: rejectedUnknownAcGraph,
      planningAdmission,
      planningAdmissionArtifact: {
        artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
        uri: PLANNING_ADMISSION_ARTIFACT_NAME,
        persisted: true
      },
      planGraphUri: "plan.json"
    });

    assert.equal(handoffValidation.ok, false);
    if (handoffValidation.ok) {
      return;
    }
    assert.deepEqual(
      handoffValidation.violations.map((violation) => violation.code),
      [
        "planning-admission-not-admitted",
        "planning-admission-errors-present",
        "planning-admission-admitted-plan-mismatch",
        "planning-admission-handoff-not-ready-for-execution",
        "planning-admission-validation-not-passed",
        "planning-admission-validation-not-passed"
      ]
    );
    assert.throws(
      () =>
        assertAdmittedPlanHandoff({
          plan: rejectedUnknownAcGraph,
          planningAdmission,
          planningAdmissionArtifact: {
            artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
            uri: PLANNING_ADMISSION_ARTIFACT_NAME,
            persisted: true
          },
          planGraphUri: "plan.json"
        }),
      /Invalid admitted plan handoff/
    );
  });
});
