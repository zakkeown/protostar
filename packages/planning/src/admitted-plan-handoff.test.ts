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
  type CandidatePlan,
  type PlanTaskRequiredCapabilities
} from "./index.js";

const admittedIntent = buildConfirmedIntentForTest({
  id: "intent_admitted_plan_handoff",
  title: "Admit a plan before execution handoff",
  problem: "Execution must only receive a plan after durable planning-admission evidence exists.",
  requester: "ouroboros-ac-60103",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_admitted_plan_handoff",
      statement: "Execution receives only an admitted plan with matching planning-admission evidence.",
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
        permissionLevel: "execute",
        reason: "Run admitted-plan handoff contract tests.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["Execution handoff must not re-derive PlanGraph proof evidence."]
});

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

function validGraph(): CandidatePlan {
  return createPlanGraph({
    planId: "plan_admitted_plan_handoff",
    intent: admittedIntent,
    strategy: "Create a thin admitted-plan handoff for execution.",
    tasks: [
      {
        id: "task-admit-plan-before-execution",
        title: "Admit the plan before execution",
        kind: "verification",
        dependsOn: [],
        covers: ["ac_admitted_plan_handoff"],
        requiredCapabilities: noRequiredCapabilities,
        risk: "low"
      }
    ],
    createdAt: "2026-04-26T00:00:00.000Z"
  });
}

describe("admitted plan execution handoff contract", () => {
  it("creates a thin execution handoff only after matching planning-admission.json evidence is persisted", () => {
    const graph = validGraph();
    const planningAdmission = createPlanningAdmissionArtifact({
      graph,
      intent: admittedIntent,
      planGraphUri: "plan.json"
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

    // handoff.plan is a new AdmittedPlan object; verify identity via planId and
    // confirm the capability envelope was populated from the admitted intent.
    assert.equal(handoff.plan.planId, graph.planId);
    assert.equal(handoff.plan.intentId, graph.intentId);
    assert.deepEqual(handoff.plan.capabilityEnvelope, {
      allowedCapabilities: ["planning-admission-grant:write"]
    });
    assert.deepEqual(handoff.evidence, {
      planId: graph.planId,
      intentId: graph.intentId,
      planGraphUri: "plan.json",
      planningAdmissionArtifact: PLANNING_ADMISSION_ARTIFACT_NAME,
      planningAdmissionUri: PLANNING_ADMISSION_ARTIFACT_NAME,
      validationSource: PLANNING_ADMISSION_ARTIFACT_NAME,
      proofSource: "PlanGraph"
    });
    assert.deepEqual(handoff.executionArtifact, {
      planId: graph.planId,
      intentId: graph.intentId,
      admittedPlan: {
        planId: graph.planId,
        uri: "plan.json",
        pointer: "#",
        sourceOfTruth: "PlanGraph"
      },
      evidence: handoff.evidence,
      tasks: [
        {
          planTaskId: "task-admit-plan-before-execution",
          title: "Admit the plan before execution",
          dependsOn: []
        }
      ]
    });
  });

  it("collects all execution handoff defects instead of letting a rejected artifact through", () => {
    const graph = validGraph();
    const rejectedCandidate = defineCandidatePlan({
      ...graph,
      planId: "plan_rejected_before_execution",
      tasks: graph.tasks.map((task) => ({
        ...task,
        covers: []
      }))
    });
    const rejectedAdmission = createPlanningAdmissionArtifact({
      graph: rejectedCandidate,
      intent: admittedIntent,
      planGraphUri: "plan.json"
    });

    const validation = validateAdmittedPlanHandoff({
      plan: graph,
      planningAdmission: rejectedAdmission,
      planningAdmissionArtifact: {
        artifact: "plan.json",
        uri: "plan.json",
        persisted: false
      },
      planGraphUri: "plan.json"
    });

    assert.equal(validation.ok, false);
    if (validation.ok) {
      return;
    }
    assert.deepEqual(
      validation.violations.map((violation) => violation.code),
      [
        "planning-admission-artifact-not-persisted",
        "planning-admission-artifact-name-mismatch",
        "planning-admission-uri-mismatch",
        "planning-admission-plan-mismatch",
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
          plan: graph,
          planningAdmission: rejectedAdmission,
          planningAdmissionArtifact: {
            artifact: "plan.json",
            uri: "plan.json",
            persisted: false
          },
          planGraphUri: "plan.json"
        }),
      /Invalid admitted plan handoff/
    );
  });

  it("does not return, persist, or expose an execution-ready admitted plan for a rejected candidate", () => {
    const graph = validGraph();
    const rejectedCandidate = defineCandidatePlan({
      ...graph,
      planId: "plan_rejected_candidate_never_admitted",
      tasks: graph.tasks.map((task) => ({
        ...task,
        covers: []
      }))
    });
    const rejectedAdmission = createPlanningAdmissionArtifact({
      graph: rejectedCandidate,
      intent: admittedIntent,
      planGraphUri: "plan.json"
    });

    if (rejectedAdmission.admitted) {
      assert.fail("Rejected candidate unexpectedly returned an admitted planning artifact.");
    }

    assert.equal(rejectedAdmission.decision, "block");
    assert.equal(rejectedAdmission.admissionStatus, "no-plan-admitted");
    assert.equal(Object.hasOwn(rejectedAdmission, "admittedPlan"), false);
    assert.equal(Object.hasOwn(rejectedAdmission, "handoff"), false);
    assert.equal(rejectedAdmission.details.failure.admittedPlanCreated, false);

    const persistedAdmission = JSON.parse(JSON.stringify(rejectedAdmission)) as Record<string, unknown>;
    assert.equal(Object.hasOwn(persistedAdmission, "admittedPlan"), false);
    assert.equal(Object.hasOwn(persistedAdmission, "handoff"), false);
    assert.equal(Object.hasOwn(persistedAdmission, "plan_hash"), false);
    assert.equal(Object.hasOwn(persistedAdmission, "validators_passed"), false);

    const validation = validateAdmittedPlanHandoff({
      plan: rejectedCandidate,
      planningAdmission: rejectedAdmission,
      planningAdmissionArtifact: {
        artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
        uri: PLANNING_ADMISSION_ARTIFACT_NAME,
        persisted: true
      },
      planGraphUri: "plan.json"
    });

    assert.equal(validation.ok, false);
    if (validation.ok) {
      return;
    }
    assert.deepEqual(
      validation.violations.map((violation) => violation.code),
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
          plan: rejectedCandidate,
          planningAdmission: rejectedAdmission,
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
