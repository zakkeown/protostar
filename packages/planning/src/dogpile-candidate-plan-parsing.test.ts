import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { defineConfirmedIntent } from "@protostar/intent";
import { createPlanningPreAdmissionFailureArtifact } from "@protostar/planning/artifacts";
import {
  admitCandidatePlan,
  assertAdmittedPlanHandoff,
  assertCandidatePlanFromPlanningPileResult,
  assertPlanningPileResult,
  hashPlanGraph,
  PLAN_GRAPH_ADMISSION_VALIDATORS,
  parsePlanningPileResult,
  PLANNING_ADMISSION_ARTIFACT_NAME,
  PLANNING_ADMISSION_SCHEMA_VERSION,
  type PlanningPileResult
} from "@protostar/planning/schema";

const intent = defineConfirmedIntent({
  id: "intent_dogpile_candidate_plan_parsing",
  title: "Parse Dogpile planning output as candidate plan data",
  problem:
    "Dogpile can propose planning data, but packages/planning must own candidate-plan creation before admission.",
  requester: "ouroboros-ac-140102",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_dogpile_candidate_plan_parsing",
      statement: "Dogpile planning output is parsed into candidate-plan data before admission.",
      verification: "test"
    },
    {
      id: "ac_dogpile_candidate_plan_rejection",
      statement: "Malformed or incomplete Dogpile planning output is rejected before admission.",
      verification: "test"
    }
  ],
  capabilityEnvelope: {
    repoScopes: [],
    toolPermissions: [
      {
        tool: "node:test",
        permissionLevel: "execute",
        reason: "Run Dogpile candidate-plan parsing tests in packages/planning.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["Planning admission must receive only candidate plans created by packages/planning."]
});

describe("Dogpile candidate-plan parsing", () => {
  it("admits valid Dogpile planning output into the planning contract boundary", () => {
    const result = assertPlanningPileResult({
      kind: "planning-pile-result",
      source: "dogpile",
      modelProviderId: "dogpile:test-provider",
      traceRef: "trace:dogpile-candidate-plan-admission",
      output: JSON.stringify({
        planId: "plan_dogpile_candidate_plan_admitted",
        strategy: "Create a valid candidate plan from Dogpile structured data and admit it.",
        createdAt: "2026-04-26T00:00:00.000Z",
        tasks: [
          {
            id: "task-dogpile-candidate-plan-parsing",
            title: "Parse Dogpile candidate plan data",
            kind: "verification",
            dependsOn: [],
            covers: ["ac_dogpile_candidate_plan_parsing"],
            requiredCapabilities: {
              repoScopes: [],
              toolPermissions: [],
              budget: {}
            },
            risk: "low"
          },
          {
            id: "task-dogpile-candidate-plan-rejection",
            title: "Reject malformed Dogpile candidate plan data",
            kind: "verification",
            dependsOn: ["task-dogpile-candidate-plan-parsing"],
            covers: ["ac_dogpile_candidate_plan_rejection"],
            requiredCapabilities: {
              repoScopes: [],
              toolPermissions: [],
              budget: {}
            },
            risk: "low"
          }
        ]
      })
    });

    const parsed = parsePlanningPileResult(result, {
      intent,
      defaultPlanId: "plan_default_unused"
    });

    if (!parsed.ok) {
      assert.fail(parsed.errors.join("; "));
    }

    const admission = admitCandidatePlan({
      graph: parsed.candidatePlan,
      intent,
      candidateSourceUri: "dogpile-planning-result.json",
      planGraphUri: "plan.json",
      planningAdmissionUri: PLANNING_ADMISSION_ARTIFACT_NAME,
      admittedAt: "2026-04-26T01:02:03.000Z"
    });

    assert.equal(admission.ok, true);
    if (!admission.ok) {
      assert.fail("Valid Dogpile planning output was rejected by planning admission.");
    }

    // admittedPlan is a new AdmittedPlan object; verify via planId and capability envelope.
    assert.equal(admission.admittedPlan.planId, parsed.candidatePlan.planId);
    assert.deepEqual(admission.admittedPlan.capabilityEnvelope, { allowedCapabilities: [] });
    assert.equal(admission.validation.ok, true);
    assert.deepEqual(admission.rejectionReasons, []);
    assert.deepEqual(admission.errors, []);
    assert.equal(admission.planningAdmission.schemaVersion, PLANNING_ADMISSION_SCHEMA_VERSION);
    assert.equal(admission.planningAdmission.artifact, PLANNING_ADMISSION_ARTIFACT_NAME);
    assert.equal(admission.planningAdmission.decision, "allow");
    assert.equal(admission.planningAdmission.admissionStatus, "plan-admitted");
    assert.equal(admission.planningAdmission.admitted, true);
    assert.equal(admission.planningAdmission.planId, "plan_dogpile_candidate_plan_admitted");
    assert.equal(admission.planningAdmission.intentId, intent.id);
    assert.equal(admission.planningAdmission.plan_hash, hashPlanGraph(parsed.candidatePlan));
    assert.deepEqual(admission.planningAdmission.validators_passed, [...PLAN_GRAPH_ADMISSION_VALIDATORS]);
    assert.equal(admission.planningAdmission.candidateSource.uri, "dogpile-planning-result.json");
    assert.equal(admission.planningAdmission.candidateSource.sourceOfTruth, "PlanGraph");

    const persistedAdmission = JSON.parse(JSON.stringify(admission.planningAdmission)) as Record<string, unknown>;
    assert.equal(persistedAdmission["artifact"], PLANNING_ADMISSION_ARTIFACT_NAME);
    assert.equal(persistedAdmission["decision"], "allow");
    assert.equal(persistedAdmission["admitted"], true);
    assert.equal(Object.hasOwn(persistedAdmission, "details"), false);
    assert.equal(Object.hasOwn(persistedAdmission, "admittedPlan"), false);
    assert.equal(Object.hasOwn(persistedAdmission, "handoff"), false);

    const handoff = assertAdmittedPlanHandoff({
      plan: admission.admittedPlan,
      planningAdmission: admission.planningAdmission,
      planningAdmissionArtifact: {
        artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
        uri: PLANNING_ADMISSION_ARTIFACT_NAME,
        persisted: true
      },
      planGraphUri: "plan.json"
    });

    assert.equal(handoff.plan, admission.admittedPlan);
    assert.deepEqual(
      handoff.executionArtifact.tasks.map((task) => task.planTaskId),
      ["task-dogpile-candidate-plan-parsing", "task-dogpile-candidate-plan-rejection"]
    );
  });

  it("parses Dogpile planning result output into candidate-plan data owned by packages/planning", () => {
    const result = assertPlanningPileResult({
      kind: "planning-pile-result",
      source: "dogpile",
      modelProviderId: "dogpile:test-provider",
      traceRef: "trace:dogpile-candidate-plan-parsing",
      output: JSON.stringify({
        planId: "plan_dogpile_candidate_plan_parsing",
        strategy: "Create a minimal candidate plan from Dogpile structured data.",
        createdAt: "2026-04-26T00:00:00.000Z",
        tasks: [
          {
            id: "task-dogpile-candidate-plan-parsing",
            title: "Parse Dogpile candidate plan data",
            kind: "verification",
            dependsOn: [],
            covers: ["ac_dogpile_candidate_plan_parsing"],
            requiredCapabilities: {
              repoScopes: [],
              toolPermissions: [],
              budget: {}
            },
            risk: "low"
          },
          {
            id: "task-dogpile-candidate-plan-rejection",
            title: "Reject malformed Dogpile candidate plan data",
            kind: "verification",
            dependsOn: ["task-dogpile-candidate-plan-parsing"],
            covers: ["ac_dogpile_candidate_plan_rejection"],
            requiredCapabilities: {
              repoScopes: [],
              toolPermissions: [],
              budget: {}
            },
            risk: "low"
          }
        ]
      })
    });

    const parsed = parsePlanningPileResult(result, {
      intent,
      defaultPlanId: "plan_default_unused"
    });

    if (!parsed.ok) {
      assert.fail(parsed.errors.join("; "));
    }
    assert.equal(parsed.ok, true);
    assert.equal(parsed.candidatePlan.planId, "plan_dogpile_candidate_plan_parsing");
    assert.equal(parsed.candidatePlan.intentId, intent.id);
    assert.deepEqual(
      parsed.candidatePlan.acceptanceCriteria.map((criterion) => criterion.id),
      intent.acceptanceCriteria.map((criterion) => criterion.id)
    );
    assert.deepEqual(
      parsed.candidatePlan.tasks.map((task) => task.id),
      ["task-dogpile-candidate-plan-parsing", "task-dogpile-candidate-plan-rejection"]
    );
  });

  it("rejects structurally valid but inadmissible Dogpile output before execution handoff", () => {
    const result = assertPlanningPileResult({
      kind: "planning-pile-result",
      source: "dogpile",
      modelProviderId: "dogpile:test-provider",
      traceRef: "trace:dogpile-invalid-plan-before-execution",
      output: JSON.stringify({
        planId: "plan_dogpile_invalid_before_execution",
        strategy: "Attempt to produce an execution-facing plan from invalid Dogpile planning output.",
        createdAt: "2026-04-26T00:00:00.000Z",
        tasks: [
          {
            id: "task-dogpile-invalid-before-execution",
            title: "Smuggle invalid Dogpile planning output toward execution",
            kind: "design",
            dependsOn: ["task-dogpile-missing-upstream"],
            covers: ["ac_dogpile_candidate_plan_parsing", "ac_dogpile_unconfirmed"],
            requiredCapabilities: {
              repoScopes: [],
              toolPermissions: [],
              budget: {}
            },
            risk: "low"
          },
          {
            id: "task-dogpile-invalid-before-execution-verification",
            title: "Leave the rejection criterion uncovered",
            kind: "verification",
            dependsOn: ["task-dogpile-invalid-before-execution"],
            covers: [],
            requiredCapabilities: {
              repoScopes: [],
              toolPermissions: [],
              budget: {}
            },
            risk: "low"
          }
        ]
      })
    });

    const parsed = parsePlanningPileResult(result, {
      intent,
      defaultPlanId: "plan_default_unused"
    });

    if (!parsed.ok) {
      assert.fail(parsed.errors.join("; "));
    }

    const admission = admitCandidatePlan({
      graph: parsed.candidatePlan,
      intent,
      candidateSourceUri: "dogpile-invalid-planning-result.json",
      planGraphUri: "plan.json",
      planningAdmissionUri: PLANNING_ADMISSION_ARTIFACT_NAME,
      admittedAt: "2026-04-26T01:02:03.000Z"
    });

    assert.equal(admission.ok, false);
    if (admission.ok) {
      assert.fail("Invalid Dogpile planning output unexpectedly produced an admitted plan.");
    }

    assert.equal(Object.hasOwn(admission, "admittedPlan"), false);
    assert.equal(admission.planningAdmission.artifact, PLANNING_ADMISSION_ARTIFACT_NAME);
    assert.equal(admission.planningAdmission.decision, "block");
    assert.equal(admission.planningAdmission.admissionStatus, "no-plan-admitted");
    assert.equal(admission.planningAdmission.admitted, false);
    assert.equal(admission.planningAdmission.details.failure.admittedPlanCreated, false);
    assert.equal(Object.hasOwn(admission.planningAdmission, "admittedPlan"), false);
    assert.equal(Object.hasOwn(admission.planningAdmission, "handoff"), false);
    assert.equal(Object.hasOwn(admission.planningAdmission, "executionArtifact"), false);

    const rejectionCodes = admission.rejectionReasons.map((reason) => reason.code);
    assert.ok(rejectionCodes.includes("missing-task-dependency"));
    assert.ok(rejectionCodes.includes("unknown-acceptance-criterion"));
    assert.ok(rejectionCodes.includes("empty-task-coverage"));
    assert.ok(rejectionCodes.includes("uncovered-acceptance-criterion"));

    assert.throws(
      () =>
        assertAdmittedPlanHandoff({
          plan: parsed.candidatePlan,
          planningAdmission: admission.planningAdmission,
          planningAdmissionArtifact: {
            artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
            uri: PLANNING_ADMISSION_ARTIFACT_NAME,
            persisted: true
          },
          planGraphUri: "plan.json"
        }),
      /Invalid admitted plan handoff: .*Execution handoff requires an admitted planning admission payload/
    );
  });

  it("collects malformed and incomplete Dogpile output defects before any candidate PlanGraph exists", () => {
    const result = {
      kind: "planning-pile-result",
      source: "dogpile",
      output: JSON.stringify({
        strategy: "",
        admittedPlan: {
          planId: "plan_illegal_pre_admission_smuggling"
        },
        tasks: [
          {
            id: "candidate-without-task-prefix",
            title: "",
            kind: "unsupported",
            dependsOn: ["missing-prefix"],
            covers: ["not-an-ac"],
            risk: "extreme",
            readyForExecution: true
          },
          {
            id: "task-malformed-capabilities",
            title: "Reject malformed nested capability data",
            kind: "implementation",
            dependsOn: [],
            covers: ["ac_dogpile_candidate_plan_rejection"],
            requiredCapabilities: {
              repoScopes: "packages/planning",
              toolPermissions: [
                {
                  tool: "",
                  risk: "extreme"
                }
              ],
              executeGrants: {
                command: "pnpm test"
              },
              budget: {
                maxTokens: -1,
                admitted: true
              }
            },
            risk: "medium"
          }
        ]
      })
    } as const satisfies PlanningPileResult;

    const parsed = parsePlanningPileResult(result, {
      intent,
      defaultPlanId: "plan_rejected_before_candidate_creation"
    });

    assert.equal(parsed.ok, false);
    if (parsed.ok) {
      assert.fail("Malformed Dogpile output unexpectedly produced a candidate plan.");
    }
    assert.deepEqual(parsed.errors, [
      "output.admittedPlan is not part of the candidate-plan planning pile contract.",
      "strategy must be a non-empty string.",
      "tasks[0].readyForExecution is not part of the candidate-plan planning pile contract.",
      "tasks[0].title must be a non-empty string.",
      "tasks[0].requiredCapabilities must be provided in normalized capability-envelope shape.",
      "tasks[0].kind must be research, design, implementation, verification, or release.",
      "tasks[0].risk must be low, medium, or high.",
      "tasks[0].id must start with task-.",
      "tasks[0].dependsOn[0] must start with task-.",
      "tasks[0].covers entries must start with ac_.",
      "tasks[1].requiredCapabilities.repoScopes must be an array.",
      "tasks[1].requiredCapabilities.toolPermissions[0].tool must be a non-empty string.",
      "tasks[1].requiredCapabilities.toolPermissions[0].reason must be a non-empty string.",
      "tasks[1].requiredCapabilities.toolPermissions[0].risk must be low, medium, or high.",
      "tasks[1].requiredCapabilities.executeGrants must be an array when provided.",
      "tasks[1].requiredCapabilities.budget.admitted is not part of the candidate-plan planning pile contract.",
      "tasks[1].requiredCapabilities.budget.maxTokens must be a non-negative finite number when provided."
    ]);

    const planningAdmission = createPlanningPreAdmissionFailureArtifact({
      intent,
      candidatePlanId: "plan_rejected_before_candidate_creation",
      errors: parsed.errors,
      candidateSourceUri: "planning-result.json",
      attemptedAt: "2026-04-26T00:00:00.000Z"
    });

    assert.equal(planningAdmission.artifact, PLANNING_ADMISSION_ARTIFACT_NAME);
    assert.equal(planningAdmission.decision, "block");
    assert.equal(planningAdmission.admitted, false);
    assert.equal(planningAdmission.details.failure.candidatePlanCreated, false);
    assert.equal(planningAdmission.details.validation.violationCount, parsed.errors.length);
    assert.deepEqual(planningAdmission.errors, parsed.errors);
  });

  it("throws with every parser defect when callers require a candidate plan", () => {
    assert.throws(
      () =>
        assertCandidatePlanFromPlanningPileResult(
          {
            kind: "planning-pile-result",
            source: "fixture",
            output: JSON.stringify({
              strategy: "No executable task body.",
              tasks: []
            })
          },
          {
            intent,
            defaultPlanId: "plan_empty_dogpile_output"
          }
        ),
      /Invalid planning pile result: tasks must contain at least one task\./
    );
  });
});
