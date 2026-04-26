import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runExecutionDryRun, type ExecutionRunPlan } from "@protostar/execution";
import {
  admitCandidatePlan,
  assertAdmittedPlanHandoff,
  createPlanGraph,
  createPlanningAdmissionArtifact,
  defineCandidatePlan,
  PLANNING_ADMISSION_ARTIFACT_NAME,
  type AdmittedPlanExecutionArtifact,
  type CandidatePlan,
  type PlanGraph,
  type PlanTaskRequiredCapabilities
} from "@protostar/planning";

import {
  createMechanicalReviewGate,
  createReviewGate,
  runMechanicalReviewExecutionLoop,
  validateReviewAdmittedPlanArtifact
} from "./index.js";

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

const planId = "plan_review_runtime_admission";
const intentId = "intent_review_admitted_plan_runtime_boundary";

type PlanningIntent = Parameters<typeof createPlanGraph>[0]["intent"];

const admittedIntent = {
  id: intentId,
  title: "Admit plans before review",
  problem: "Review must only receive a plan after planning-admission.json admits it.",
  requester: "ouroboros-ac-160102",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_review_runtime_admitted_plan_boundary",
      statement: "Review accepts only admitted-plan artifact references.",
      verification: "test"
    }
  ],
  capabilityEnvelope: {
    repoScopes: [],
    toolPermissions: [
      {
        tool: "node:test",
        permissionLevel: "execute",
        reason: "Run review admitted-plan boundary tests.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["Candidate and raw PlanGraph inputs must not reach review."],
  stopConditions: []
} as const satisfies PlanningIntent;

describe("review admitted-plan runtime admission", () => {
  it("accepts the admitted-plan execution artifact reference produced by planning-admission handoff", () => {
    const artifact = createAdmittedPlanExecutionArtifactFixture();
    const execution = createExecutionRunPlanFixture(artifact);
    const executionResult = runExecutionDryRun({
      execution,
      now: () => "2026-04-26T00:00:00.000Z"
    });
    const validation = validateReviewAdmittedPlanArtifact(artifact);

    assert.equal(validation.ok, true);
    assert.equal(artifact.evidence.planningAdmissionArtifact, PLANNING_ADMISSION_ARTIFACT_NAME);
    assert.equal(artifact.evidence.proofSource, "PlanGraph");

    const reviewGate = createMechanicalReviewGate({
      admittedPlan: artifact,
      execution,
      executionResult
    });

    assert.equal(reviewGate.planId, planId);
    assert.equal(reviewGate.verdict, "pass");
  });

  it("rejects raw PlanGraph inputs with explicit review admission-boundary errors", () => {
    const artifact = createAdmittedPlanExecutionArtifactFixture();
    const execution = createExecutionRunPlanFixture(artifact);
    const rawPlanGraph = createRawPlanGraphFixture();
    const validation = validateReviewAdmittedPlanArtifact(rawPlanGraph);

    assert.equal(validation.ok, false);
    if (validation.ok) {
      return;
    }

    assert.ok(
      validation.violations.some(
        (violation) => violation.code === "review-admission-boundary-raw-plan"
      )
    );
    assert.ok(
      validation.violations.some(
        (violation) =>
          violation.code === "review-admission-boundary-invalid-artifact" &&
          violation.executionViolationCode === "admitted-plan-artifact-raw-task-body"
      )
    );
    assert.match(validation.errors.join("\n"), /Review admission rejects candidate or raw PlanGraph inputs/);

    assert.throws(
      () =>
        createReviewGate({
          admittedPlan: rawPlanGraph as unknown as AdmittedPlanExecutionArtifact,
          execution
        }),
      /Invalid admitted plan review artifact: .*Review admission rejects candidate or raw PlanGraph inputs/
    );
  });

  it("rejects explicitly marked CandidatePlan inputs before mechanical review work runs", () => {
    const artifact = createAdmittedPlanExecutionArtifactFixture();
    const execution = createExecutionRunPlanFixture(artifact);
    const candidatePlan = createCandidatePlanFixture();
    const validation = validateReviewAdmittedPlanArtifact(candidatePlan);

    assert.equal(validation.ok, false);
    if (validation.ok) {
      return;
    }

    assert.ok(
      validation.violations.some(
        (violation) => violation.code === "review-admission-boundary-candidate-plan"
      )
    );
    assert.match(validation.errors.join("\n"), /Review admission rejects candidate PlanGraph objects/);

    assert.throws(
      () =>
        runMechanicalReviewExecutionLoop({
          admittedPlan: candidatePlan as unknown as AdmittedPlanExecutionArtifact,
          execution
        }),
      /Invalid admitted plan review artifact: .*Review admission rejects candidate PlanGraph objects/
    );
  });

  it("rejects a raw CandidatePlan before any review gate or verdict path is created", () => {
    const artifact = createAdmittedPlanExecutionArtifactFixture();
    const execution = createExecutionRunPlanFixture(artifact);
    const executionResult = runExecutionDryRun({
      execution,
      now: () => "2026-04-26T00:00:00.000Z"
    });
    const rawCandidatePlan = createCandidatePlanFixture();

    const validation = validateReviewAdmittedPlanArtifact(rawCandidatePlan);
    assert.equal(validation.ok, false);
    if (validation.ok) {
      return;
    }

    assert.ok(
      validation.violations.some(
        (violation) =>
          violation.code === "review-admission-boundary-candidate-plan" &&
          violation.executionViolationCode === "admitted-plan-artifact-candidate-plan-object"
      )
    );

    let directGate: ReturnType<typeof createReviewGate> | undefined;
    let directThrown: unknown;
    try {
      directGate = createReviewGate({
        admittedPlan: rawCandidatePlan as unknown as AdmittedPlanExecutionArtifact,
        execution
      });
    } catch (error) {
      directThrown = error;
    }

    let mechanicalGate: ReturnType<typeof createMechanicalReviewGate> | undefined;
    let mechanicalThrown: unknown;
    try {
      mechanicalGate = createMechanicalReviewGate({
        admittedPlan: rawCandidatePlan as unknown as AdmittedPlanExecutionArtifact,
        execution,
        executionResult
      });
    } catch (error) {
      mechanicalThrown = error;
    }

    let reviewLoop: ReturnType<typeof runMechanicalReviewExecutionLoop> | undefined;
    let reviewLoopThrown: unknown;
    try {
      reviewLoop = runMechanicalReviewExecutionLoop({
        admittedPlan: rawCandidatePlan as unknown as AdmittedPlanExecutionArtifact,
        execution
      });
    } catch (error) {
      reviewLoopThrown = error;
    }

    const createdVerdicts = [
      ...(directGate === undefined ? [] : [directGate.verdict]),
      ...(mechanicalGate === undefined ? [] : [mechanicalGate.verdict]),
      ...(reviewLoop === undefined ? [] : [reviewLoop.finalReviewGate.verdict])
    ];

    assert.equal(directGate, undefined);
    assert.equal(mechanicalGate, undefined);
    assert.equal(reviewLoop, undefined);
    assert.deepEqual(createdVerdicts, []);
    assert.match(String(directThrown), /Review admission rejects candidate PlanGraph objects/);
    assert.match(String(mechanicalThrown), /Review admission rejects candidate PlanGraph objects/);
    assert.match(String(reviewLoopThrown), /Review admission rejects candidate PlanGraph objects/);
  });

  it("rejects failed planning and admission result wrappers with explicit review refusal reasons", () => {
    const failedPlanningResult = {
      ok: false,
      errors: [
        "Planning result was not valid candidate-plan JSON.",
        "tasks must contain at least one task."
      ]
    };
    const failedPlanningValidation = validateReviewAdmittedPlanArtifact(failedPlanningResult);

    assert.equal(failedPlanningValidation.ok, false);
    if (failedPlanningValidation.ok) {
      return;
    }
    assert.ok(
      failedPlanningValidation.violations.some(
        (violation) =>
          violation.code === "review-admission-boundary-failed-planning-result" &&
          violation.executionViolationCode === "admitted-plan-artifact-failed-planning-result"
      )
    );
    assert.match(failedPlanningValidation.errors.join("\n"), /Review admission rejects failed planning results/);
    assert.match(failedPlanningValidation.errors.join("\n"), /Refusal reason: Planning result was not valid/);

    const rejectedCandidate = defineCandidatePlan({
      ...createRawPlanGraphFixture(),
      planId: "plan_review_failed_admission_result",
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

    const failedAdmissionValidation = validateReviewAdmittedPlanArtifact(failedAdmissionResult);

    assert.equal(failedAdmissionValidation.ok, false);
    if (failedAdmissionValidation.ok) {
      return;
    }
    assert.ok(
      failedAdmissionValidation.violations.some(
        (violation) =>
          violation.code === "review-admission-boundary-failed-admission-result" &&
          violation.executionViolationCode === "admitted-plan-artifact-failed-admission-result"
      )
    );
    assert.match(
      failedAdmissionValidation.errors.join("\n"),
      /Review admission rejects failed planning admission results/
    );
    assert.match(failedAdmissionValidation.errors.join("\n"), /Refusal reason: validation-failed:/);
  });

  it("cites planning-admission.json as the reviewed planning input when execution diverges", () => {
    const artifact = createAdmittedPlanExecutionArtifactFixture();
    const execution = {
      ...createExecutionRunPlanFixture(artifact),
      tasks: [
        ...createExecutionRunPlanFixture(artifact).tasks,
        {
          planTaskId: "task-review-rogue-candidate-plan",
          title: "A task that was not admitted",
          status: "pending",
          dependsOn: []
        }
      ]
    } satisfies ExecutionRunPlan;
    const executionResult = runExecutionDryRun({
      execution,
      now: () => "2026-04-26T00:00:00.000Z"
    });

    const reviewGate = createMechanicalReviewGate({
      admittedPlan: artifact,
      execution,
      executionResult
    });
    const rogueTaskFinding = reviewGate.findings.find((finding) =>
      finding.summary.includes("task-review-rogue-candidate-plan")
    );

    assert.notEqual(rogueTaskFinding, undefined);
    assert.deepEqual(rogueTaskFinding?.evidence[0], {
      stage: "planning",
      kind: "planning-admission",
      uri: PLANNING_ADMISSION_ARTIFACT_NAME,
      description: "Planning admission evidence that admitted the reviewed plan."
    });
  });
});

function createCandidatePlanFixture(): CandidatePlan {
  return {
    ...createRawPlanGraphFixture(),
    __protostarPlanAdmissionState: "candidate-plan"
  };
}

function createRawPlanGraphFixture(): PlanGraph {
  return {
    planId,
    intentId,
    createdAt: "2026-04-26T00:00:00.000Z",
    strategy: "Create a candidate plan, admit it, and pass only its execution artifact forward.",
    acceptanceCriteria: [
      {
        id: "ac_review_runtime_admitted_plan_boundary",
        statement: "Review accepts only admitted-plan artifact references.",
        verification: "test"
      }
    ],
    tasks: [
      {
        id: "task-review-admission-alpha",
        title: "Prove review admission accepts admitted artifacts",
        kind: "verification",
        dependsOn: [],
        covers: ["ac_review_runtime_admitted_plan_boundary"],
        requiredCapabilities: noRequiredCapabilities,
        risk: "low"
      },
      {
        id: "task-review-admission-beta",
        title: "Prove review admission rejects raw plans",
        kind: "verification",
        dependsOn: ["task-review-admission-alpha"],
        covers: ["ac_review_runtime_admitted_plan_boundary"],
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
    tasks: createRawPlanGraphFixture().tasks,
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

function createExecutionRunPlanFixture(artifact: AdmittedPlanExecutionArtifact): ExecutionRunPlan {
  return {
    runId: "run_review_runtime_admission",
    planId: artifact.planId,
    admittedPlan: artifact.evidence,
    workspace: {
      root: "/tmp/protostar-review-admission",
      trust: "trusted",
      defaultBranch: "main"
    },
    tasks: artifact.tasks.map((task) => ({
      planTaskId: task.planTaskId,
      title: task.title,
      status: "pending",
      dependsOn: task.dependsOn
    }))
  };
}
