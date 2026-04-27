import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  admitCandidatePlan,
  assertAdmittedPlanHandoff,
  createPlanGraph,
  createPlanningAdmissionArtifact,
  createPlanningPreAdmissionFailureArtifact,
  defineCandidatePlan,
  PLANNING_ADMISSION_ARTIFACT_NAME,
  type AdmittedPlanExecutionArtifact,
  type CandidatePlan,
  type PlanGraph,
  type PlanTaskRequiredCapabilities
} from "@protostar/planning";
import { defineWorkspace } from "@protostar/repo";
import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";

import {
  assertAdmittedPlanExecutionArtifact,
  prepareExecutionRun,
  validateAdmittedPlanExecutionArtifact
} from "./index.js";

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

const planId = "plan_execution_runtime_admission";
const intentId = "intent_execution_admitted_plan_runtime_boundary";

type PlanningIntent = Parameters<typeof createPlanGraph>[0]["intent"];

const admittedIntent: PlanningIntent = buildConfirmedIntentForTest({
  id: intentId,
  title: "Admit plans before execution",
  problem: "Execution must only receive a plan after planning-admission.json admits it.",
  requester: "ouroboros-ac-160004",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_execution_runtime_admitted_plan_boundary",
      statement: "Execution accepts only admitted-plan artifact references.",
      verification: "test"
    }
  ],
  capabilityEnvelope: {
    repoScopes: [],
    toolPermissions: [
      {
        tool: "node:test",
        permissionLevel: "execute",
        reason: "Run execution admitted-plan boundary tests.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["Candidate and raw PlanGraph inputs must not reach execution."],
  stopConditions: []
});

const workspace = defineWorkspace({
  root: "/tmp/protostar-execution-admission",
  trust: "trusted",
  defaultBranch: "main"
});

describe("execution admitted-plan runtime admission", () => {
  it("accepts the admitted-plan execution artifact reference produced by planning-admission handoff", () => {
    const artifact = createAdmittedPlanExecutionArtifactFixture();
    const validation = validateAdmittedPlanExecutionArtifact(artifact);

    assert.equal(validation.ok, true);
    assertAdmittedPlanExecutionArtifact(artifact);
    assert.deepEqual(artifact.admittedPlan, {
      planId,
      uri: "plan.json",
      pointer: "#",
      sourceOfTruth: "PlanGraph"
    });
    assert.equal(artifact.evidence.planningAdmissionArtifact, PLANNING_ADMISSION_ARTIFACT_NAME);
    assert.equal(artifact.evidence.proofSource, "PlanGraph");

    const execution = prepareExecutionRun({
      runId: "run_execution_runtime_admission_accepts_admitted_artifact",
      admittedPlan: artifact,
      workspace
    });

    assert.equal(execution.planId, artifact.planId);
    assert.deepEqual(execution.admittedPlan, artifact.evidence);
    assert.deepEqual(
      execution.tasks.map((task) => task.planTaskId),
      ["task-execution-admission-alpha", "task-execution-admission-beta"]
    );
  });

  it("rejects raw PlanGraph inputs with explicit runtime errors", () => {
    const rawPlanGraph = createRawPlanGraphFixture();
    const validation = validateAdmittedPlanExecutionArtifact(rawPlanGraph);

    assert.equal(validation.ok, false);
    if (validation.ok) {
      return;
    }

    assert.ok(
      validation.violations.some(
        (violation) => violation.code === "admitted-plan-artifact-raw-plan-object"
      )
    );
    assert.ok(
      validation.violations.some(
        (violation) =>
          violation.code === "admitted-plan-artifact-missing-field" &&
          violation.path === "admittedPlan.admittedPlan"
      )
    );
    assert.ok(
      validation.violations.some(
        (violation) =>
          violation.code === "admitted-plan-artifact-raw-task-body" &&
          violation.path === "admittedPlan.tasks.0"
      )
    );
    assert.match(validation.errors.join("\n"), /candidate or raw PlanGraph objects/);

    assert.throws(
      () =>
        prepareExecutionRun({
          runId: "run_execution_runtime_admission_rejects_raw_plan",
          admittedPlan: rawPlanGraph as unknown as AdmittedPlanExecutionArtifact,
          workspace
        }),
      /Invalid admitted plan execution artifact: .*candidate or raw PlanGraph objects/
    );
  });

  it("rejects explicitly marked CandidatePlan inputs before execution", () => {
    const forgedCandidate = {
      ...createCandidatePlanFixture(),
      __protostarPlanAdmissionState: "candidate-plan"
    };
    const validation = validateAdmittedPlanExecutionArtifact(forgedCandidate);

    assert.equal(validation.ok, false);
    if (validation.ok) {
      return;
    }

    assert.ok(
      validation.violations.some(
        (violation) => violation.code === "admitted-plan-artifact-candidate-plan-object"
      )
    );
    assert.match(validation.errors.join("\n"), /rejects candidate PlanGraph objects/);

    assert.throws(
      () =>
        prepareExecutionRun({
          runId: "run_execution_runtime_admission_rejects_candidate",
          admittedPlan: forgedCandidate as unknown as AdmittedPlanExecutionArtifact,
          workspace
        }),
      /Invalid admitted plan execution artifact: .*rejects candidate PlanGraph objects/
    );
  });

  it("rejects a raw CandidatePlan before any execution run plan or task status is created", () => {
    const rawCandidatePlan = createCandidatePlanFixture();
    let execution: ReturnType<typeof prepareExecutionRun> | undefined;
    let thrown: unknown;

    try {
      execution = prepareExecutionRun({
        runId: "run_execution_runtime_admission_never_creates_statuses",
        admittedPlan: rawCandidatePlan as unknown as AdmittedPlanExecutionArtifact,
        workspace
      });
    } catch (error) {
      thrown = error;
    }

    assert.equal(execution, undefined);
    assert.match(String(thrown), /candidate or raw PlanGraph objects/);
    assert.deepEqual(executionTaskStatuses(execution), []);
  });

  it("rejects blocked planning-admission evidence when candidate parsing fails before execution", () => {
    const blockedPlanningAdmission = createPlanningPreAdmissionFailureArtifact({
      intent: admittedIntent,
      candidatePlanId: "plan_execution_parse_failed_before_admission",
      candidateSourceUri: "planning-result.json",
      attemptedAt: "2026-04-26T00:00:00.000Z",
      errors: [
        "output.admittedPlan is not part of the candidate-plan planning pile contract.",
        "tasks must contain at least one task."
      ]
    });
    const validation = validateAdmittedPlanExecutionArtifact(blockedPlanningAdmission);

    assert.equal(validation.ok, false);
    if (validation.ok) {
      return;
    }

    assert.ok(
      validation.violations.some(
        (violation) =>
          violation.code === "admitted-plan-artifact-blocked-planning-admission" &&
          violation.path === "admittedPlan"
      )
    );
    assert.ok(
      validation.violations.some(
        (violation) =>
          violation.code === "admitted-plan-artifact-missing-field" &&
          violation.path === "admittedPlan.admittedPlan"
      )
    );
    assert.ok(
      validation.violations.some(
        (violation) =>
          violation.code === "admitted-plan-artifact-missing-field" &&
          violation.path === "admittedPlan.tasks"
      )
    );
    assert.match(validation.errors.join("\n"), /blocked planning-admission\.json evidence/);
    assert.match(validation.errors.join("\n"), /pre-admission-failed/);

    assert.throws(
      () =>
        prepareExecutionRun({
          runId: "run_execution_runtime_admission_rejects_parse_failure",
          admittedPlan: blockedPlanningAdmission as unknown as AdmittedPlanExecutionArtifact,
          workspace
        }),
      /Invalid admitted plan execution artifact: .*blocked planning-admission\.json evidence/
    );
  });

  it("rejects failed planning results with an explicit refusal reason before execution", () => {
    const failedPlanningResult = {
      ok: false,
      errors: [
        "Planning result was not valid candidate-plan JSON.",
        "tasks must contain at least one task."
      ]
    };
    const validation = validateAdmittedPlanExecutionArtifact(failedPlanningResult);

    assert.equal(validation.ok, false);
    if (validation.ok) {
      return;
    }

    assert.ok(
      validation.violations.some(
        (violation) =>
          violation.code === "admitted-plan-artifact-failed-planning-result" &&
          violation.path === "admittedPlan"
      )
    );
    assert.match(validation.errors.join("\n"), /rejects failed planning results/);
    assert.match(validation.errors.join("\n"), /Refusal reason: Planning result was not valid candidate-plan JSON/);

    assert.throws(
      () =>
        prepareExecutionRun({
          runId: "run_execution_runtime_admission_rejects_failed_planning_result",
          admittedPlan: failedPlanningResult as unknown as AdmittedPlanExecutionArtifact,
          workspace
        }),
      /Invalid admitted plan execution artifact: .*rejects failed planning results/
    );
  });

  it("rejects failed planning admission results with an explicit refusal reason before execution", () => {
    const rejectedCandidate = defineCandidatePlan({
      ...createRawPlanGraphFixture(),
      planId: "plan_execution_failed_admission_result",
      tasks: createRawPlanGraphFixture().tasks.map((task) => ({
        ...task,
        covers: []
      }))
    });
    const failedAdmissionResult = admitCandidatePlan({
      graph: rejectedCandidate,
      intent: admittedIntent,
      planGraphUri: "plan.json"
    });

    assert.equal(failedAdmissionResult.ok, false);
    if (failedAdmissionResult.ok) {
      assert.fail("Expected invalid candidate plan admission to fail.");
    }

    const validation = validateAdmittedPlanExecutionArtifact(failedAdmissionResult);

    assert.equal(validation.ok, false);
    if (validation.ok) {
      return;
    }

    assert.ok(
      validation.violations.some(
        (violation) =>
          violation.code === "admitted-plan-artifact-failed-admission-result" &&
          violation.path === "admittedPlan"
      )
    );
    assert.match(validation.errors.join("\n"), /rejects failed planning admission results/);
    assert.match(validation.errors.join("\n"), /Refusal reason: validation-failed:/);
    assert.match(validation.errors.join("\n"), /Acceptance criterion ac_execution_runtime_admitted_plan_boundary/);

    assert.throws(
      () =>
        prepareExecutionRun({
          runId: "run_execution_runtime_admission_rejects_failed_admission_result",
          admittedPlan: failedAdmissionResult as unknown as AdmittedPlanExecutionArtifact,
          workspace
        }),
      /Invalid admitted plan execution artifact: .*rejects failed planning admission results/
    );
  });

  it("collects all forged artifact defects instead of partially admitting execution", () => {
    const artifact = createAdmittedPlanExecutionArtifactFixture();
    const forgedArtifact = {
      ...artifact,
      planId: "plan_forged_execution_admission",
      admittedPlan: {
        ...artifact.admittedPlan,
        planId: "plan_other_reference",
        pointer: "/not-root",
        sourceOfTruth: "InlinePlan"
      },
      evidence: {
        ...artifact.evidence,
        planId: "plan_other_evidence",
        intentId: "intent_other_evidence",
        planningAdmissionArtifact: "plan.json",
        validationSource: "plan.json",
        proofSource: "InlinePlan"
      },
      tasks: [
        {
          id: "task-raw-plan-body",
          title: "Raw task body should not execute",
          kind: "verification",
          dependsOn: ["task-missing-dependency"],
          covers: ["ac_execution_runtime_admitted_plan_boundary"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ]
    };

    const validation = validateAdmittedPlanExecutionArtifact(forgedArtifact);

    assert.equal(validation.ok, false);
    if (validation.ok) {
      return;
    }

    assert.ok(validation.violations.length >= 9);
    assert.ok(
      validation.violations.some(
        (violation) =>
          violation.code === "admitted-plan-artifact-reference-mismatch" &&
          violation.path === "admittedPlan.admittedPlan.planId"
      )
    );
    assert.ok(
      validation.violations.some(
        (violation) =>
          violation.code === "admitted-plan-artifact-reference-mismatch" &&
          violation.path === "admittedPlan.evidence.planningAdmissionArtifact"
      )
    );
    assert.ok(
      validation.violations.some(
        (violation) => violation.code === "admitted-plan-artifact-raw-task-body"
      )
    );
  });
});

function createCandidatePlanFixture(): CandidatePlan {
  return defineCandidatePlan(createRawPlanGraphFixture());
}

function createRawPlanGraphFixture(): PlanGraph {
  return {
    planId,
    intentId,
    createdAt: "2026-04-26T00:00:00.000Z",
    strategy: "Create a candidate plan, admit it, and pass only its execution artifact forward.",
    acceptanceCriteria: [
      {
        id: "ac_execution_runtime_admitted_plan_boundary",
        statement: "Execution accepts only admitted-plan artifact references.",
        verification: "test"
      }
    ],
    tasks: [
      {
        id: "task-execution-admission-alpha",
        title: "Prove execution admission accepts admitted artifacts",
        kind: "verification",
        dependsOn: [],
        covers: ["ac_execution_runtime_admitted_plan_boundary"],
        requiredCapabilities: noRequiredCapabilities,
        risk: "low"
      },
      {
        id: "task-execution-admission-beta",
        title: "Prove execution admission rejects raw plans",
        kind: "verification",
        dependsOn: ["task-execution-admission-alpha"],
        covers: ["ac_execution_runtime_admitted_plan_boundary"],
        requiredCapabilities: noRequiredCapabilities,
        risk: "low"
      }
    ]
  };
}

function createAdmittedPlanExecutionArtifactFixture(): AdmittedPlanExecutionArtifact {
  const graph = createPlanGraph({
    planId,
    intent: admittedIntent,
    strategy: "Create a candidate plan, admit it, and pass only its execution artifact forward.",
    tasks: [
      {
        id: "task-execution-admission-alpha",
        title: "Prove execution admission accepts admitted artifacts",
        kind: "verification",
        dependsOn: [],
        covers: ["ac_execution_runtime_admitted_plan_boundary"],
        requiredCapabilities: noRequiredCapabilities,
        risk: "low"
      },
      {
        id: "task-execution-admission-beta",
        title: "Prove execution admission rejects raw plans",
        kind: "verification",
        dependsOn: ["task-execution-admission-alpha"],
        covers: ["ac_execution_runtime_admitted_plan_boundary"],
        requiredCapabilities: noRequiredCapabilities,
        risk: "low"
      }
    ],
    createdAt: "2026-04-26T00:00:00.000Z"
  });
  const planningAdmission = createPlanningAdmissionArtifact({
    graph,
    intent: admittedIntent,
    planGraphUri: "plan.json",
    admittedAt: "2026-04-26T00:00:00.000Z"
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

function executionTaskStatuses(
  execution: ReturnType<typeof prepareExecutionRun> | undefined
): readonly string[] {
  return execution?.tasks.map((task) => task.status) ?? [];
}
