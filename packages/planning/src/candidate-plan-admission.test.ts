import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";

import {
  admitCandidatePlan,
  admitCandidatePlans,
  admitTaskAdapterRef,
  assertAdmittedPlanHandoff,
  assertTargetFiles,
  createPlanGraph,
  defineCandidatePlan,
  hashPlanGraph,
  PLAN_GRAPH_ADMISSION_VALIDATOR_VERSIONS,
  PLAN_GRAPH_ADMISSION_VALIDATORS,
  PLANNING_ADMISSION_ARTIFACT_NAME,
  PLANNING_ADMISSION_SCHEMA_VERSION,
  validateAdmittedPlanHandoff,
  type AdmittedPlanRecord,
  type PlanGraph,
  type PlanTaskRequiredCapabilities
} from "./index.js";

const admittedIntent = buildConfirmedIntentForTest({
  id: "intent_candidate_plan_admission",
  title: "Admit candidate plans through a strict planning boundary",
  problem: "Execution must only receive candidate plans after planning admission validates and admits them.",
  requester: "ouroboros-ac-150002",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_candidate_plan_admission",
      statement: "A valid candidate plan becomes an admitted plan through planning admission.",
      verification: "test"
    }
  ],
  capabilityEnvelope: {
    repoScopes: [],
    toolPermissions: [
      {
        tool: "node:test",
        permissionLevel: "execute",
        reason: "Run candidate-plan admission contract tests.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["Invalid candidate plans must return structured rejection reasons without an admitted plan."]
});

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

describe("candidate-plan admission validator", () => {
  it("rejects tasks missing targetFiles", () => {
    const graph = defineCandidatePlan({
      planId: "plan_candidate_plan_missing_target_files",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Reject tasks without target file anchors.",
      acceptanceCriteria: admittedIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
        id,
        statement,
        verification
      })),
      tasks: [
        {
          id: "task-missing-target-files",
          title: "Omit target files",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_candidate_plan_admission"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ]
    } as const satisfies PlanGraph);

    const result = admitCandidatePlan({ graph, intent: admittedIntent });

    assert.equal(result.ok, false);
    if (result.ok) assert.fail("Expected missing targetFiles to reject the candidate plan.");
    assert.equal(result.rejectionReasons.some((reason) => reason.code === "target-files-missing"), true);
  });

  it("rejects tasks with empty targetFiles", () => {
    const graph = defineCandidatePlan({
      planId: "plan_candidate_plan_empty_target_files",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Reject tasks with empty target file anchors.",
      acceptanceCriteria: admittedIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
        id,
        statement,
        verification
      })),
      tasks: [
        {
          id: "task-empty-target-files",
          title: "Provide empty target files",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_candidate_plan_admission"],
          targetFiles: [],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ]
    } as const satisfies PlanGraph);

    const result = admitCandidatePlan({ graph, intent: admittedIntent });

    assert.equal(result.ok, false);
    if (result.ok) assert.fail("Expected empty targetFiles to reject the candidate plan.");
    assert.equal(result.rejectionReasons.some((reason) => reason.code === "target-files-empty"), true);
  });

  it("admits tasks with non-empty targetFiles", () => {
    const graph = createPlanGraph({
      planId: "plan_candidate_plan_target_files_admitted",
      intent: admittedIntent,
      strategy: "Admit a plan task with target file anchors.",
      tasks: [
        {
          id: "task-target-files-admitted",
          title: "Carry target files",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_candidate_plan_admission"],
          targetFiles: ["src/Button.tsx"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ],
      createdAt: "2026-04-26T00:00:00.000Z"
    });

    const result = admitCandidatePlan({ graph, intent: admittedIntent });

    assert.equal(result.ok, true);
  });

  it("admits allowed task adapterRef overrides", () => {
    const graph = createPlanGraph({
      planId: "plan_candidate_plan_allowed_adapter_ref",
      intent: admittedIntent,
      strategy: "Admit a task selecting an allowed adapter.",
      tasks: [
        {
          id: "task-allowed-adapter-ref",
          title: "Use the allowed LM Studio coder adapter",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_candidate_plan_admission"],
          targetFiles: ["src/Button.tsx"],
          adapterRef: "lmstudio-coder",
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ],
      createdAt: "2026-04-26T00:00:00.000Z"
    });

    const result = admitCandidatePlan({
      graph,
      intent: admittedIntent,
      allowedAdapters: ["lmstudio-coder"]
    });

    assert.equal(result.ok, true);
  });

  it("rejects task adapterRef values outside allowedAdapters", () => {
    const graph = createPlanGraph({
      planId: "plan_candidate_plan_disallowed_adapter_ref",
      intent: admittedIntent,
      strategy: "Reject a task selecting a disallowed adapter.",
      tasks: [
        {
          id: "task-disallowed-adapter-ref",
          title: "Use a disallowed adapter",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_candidate_plan_admission"],
          targetFiles: ["src/Button.tsx"],
          adapterRef: "evil-adapter",
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ],
      createdAt: "2026-04-26T00:00:00.000Z"
    });

    const result = admitCandidatePlan({
      graph,
      intent: admittedIntent,
      allowedAdapters: ["lmstudio-coder"]
    });

    assert.equal(result.ok, false);
    if (result.ok) assert.fail("Expected disallowed adapterRef to reject the candidate plan.");
    assert.deepEqual(
      result.rejectionReasons.map(({ code, taskId }) => ({ code, taskId })),
      [{ code: "adapter-ref-not-allowed", taskId: "task-disallowed-adapter-ref" }]
    );
    assert.match(result.errors.join("\n"), /evil-adapter/);
    assert.match(result.errors.join("\n"), /lmstudio-coder/);
  });

  it("admits tasks without adapterRef by using the run default", () => {
    const graph = createPlanGraph({
      planId: "plan_candidate_plan_default_adapter_ref",
      intent: admittedIntent,
      strategy: "Admit a task that relies on the run default adapter.",
      tasks: [
        {
          id: "task-default-adapter-ref",
          title: "Use the default run adapter",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_candidate_plan_admission"],
          targetFiles: ["src/Button.tsx"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ],
      createdAt: "2026-04-26T00:00:00.000Z"
    });

    const result = admitCandidatePlan({
      graph,
      intent: admittedIntent,
      allowedAdapters: []
    });

    assert.equal(result.ok, true);
  });

  it("rejects malformed task adapterRef values", () => {
    const graph = createPlanGraph({
      planId: "plan_candidate_plan_malformed_adapter_ref",
      intent: admittedIntent,
      strategy: "Reject an adapter ref that does not match the lowercase adapter id grammar.",
      tasks: [
        {
          id: "task-malformed-adapter-ref",
          title: "Use a malformed adapter ref",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_candidate_plan_admission"],
          targetFiles: ["src/Button.tsx"],
          adapterRef: "Has-Caps",
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ],
      createdAt: "2026-04-26T00:00:00.000Z"
    });

    const result = admitCandidatePlan({ graph, intent: admittedIntent });

    assert.equal(result.ok, false);
    if (result.ok) assert.fail("Expected malformed adapterRef to reject the candidate plan.");
    assert.equal(result.rejectionReasons.some((reason) => reason.code === "malformed-task-adapter-ref"), true);
  });

  it("exports targetFiles and adapterRef contract helpers", () => {
    assert.doesNotThrow(() => assertTargetFiles(["src/Button.tsx"]));
    assert.deepEqual(
      admitTaskAdapterRef({
        taskId: "task-allowed-adapter-ref",
        adapterRef: "lmstudio-coder",
        allowedAdapters: ["lmstudio-coder"]
      }),
      { ok: true }
    );
  });

  it("converts a valid CandidatePlan into an AdmittedPlan with thin planning-admission evidence", () => {
    const graph = createPlanGraph({
      planId: "plan_candidate_plan_admission_accepted",
      intent: admittedIntent,
      strategy: "Validate the candidate plan before admitting it for downstream execution.",
      tasks: [
        {
          id: "task-admit-candidate-plan",
          title: "Admit the candidate plan",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_candidate_plan_admission"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ],
      createdAt: "2026-04-26T00:00:00.000Z"
    });

    const result = admitCandidatePlan({
      graph,
      intent: admittedIntent,
      planGraphUri: "plan.json",
      planningAdmissionUri: "planning-admission.json",
      admittedAt: "2026-04-26T01:02:03.000Z"
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      assert.fail("Expected valid candidate plan to be admitted.");
    }

    const admittedPlan: AdmittedPlanRecord = result.admittedPlan;
    // admittedPlan is a new object (not the candidate graph), so compare identity fields.
    assert.equal(admittedPlan.planId, graph.planId);
    assert.equal(admittedPlan.intentId, graph.intentId);
    assert.deepEqual(admittedPlan.capabilityEnvelope, { allowedCapabilities: [] });
    assert.equal(result.validation.ok, true);
    assert.deepEqual(result.rejectionReasons, []);
    assert.deepEqual(result.errors, []);
    assert.equal(result.planningAdmission.admitted, true);
    assert.deepEqual(JSON.parse(JSON.stringify(result.planningAdmission)), {
      schemaVersion: PLANNING_ADMISSION_SCHEMA_VERSION,
      artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
      decision: "allow",
      admissionStatus: "plan-admitted",
      admitted: true,
      admittedAt: "2026-04-26T01:02:03.000Z",
      planningAttempt: {
        id: "planning-attempt:plan_candidate_plan_admission_accepted",
        candidatePlanId: graph.planId,
        intentId: admittedIntent.id,
        candidatePlanCreatedAt: graph.createdAt
      },
      candidateSource: {
        kind: "candidate-plan-graph",
        planId: graph.planId,
        uri: "plan.json",
        pointer: "#",
        createdAt: graph.createdAt,
        sourceOfTruth: "PlanGraph"
      },
      candidatePlan: {
        planId: graph.planId,
        intentId: admittedIntent.id,
        createdAt: graph.createdAt,
        source: {
          kind: "candidate-plan-graph",
          planId: graph.planId,
          uri: "plan.json",
          pointer: "#",
          createdAt: graph.createdAt,
          sourceOfTruth: "PlanGraph"
        }
      },
      planId: graph.planId,
      intentId: admittedIntent.id,
      plan_hash: hashPlanGraph(graph),
      validators_passed: [...PLAN_GRAPH_ADMISSION_VALIDATORS],
      validator_versions: PLAN_GRAPH_ADMISSION_VALIDATOR_VERSIONS,
      errors: []
    });
  });

  it("validates every candidate plan before selecting an admitted plan and retains per-candidate results", () => {
    const rejectedMissingCoverage = defineCandidatePlan({
      planId: "plan_candidate_plan_batch_rejected_missing_coverage",
      intentId: "intent_candidate_plan_batch_wrong",
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Fail intent matching and task coverage while another candidate is admissible.",
      acceptanceCriteria: admittedIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
        id,
        statement,
        verification
      })),
      tasks: [
        {
          id: "task-batch-missing-coverage",
          title: "Omit coverage in a rejected candidate",
          kind: "verification",
          dependsOn: [],
          covers: [],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ]
    } as const satisfies PlanGraph);
    const admittedGraph = createPlanGraph({
      planId: "plan_candidate_plan_batch_admitted",
      intent: admittedIntent,
      strategy: "Admit this candidate only after every candidate has been validated.",
      tasks: [
        {
          id: "task-batch-admitted",
          title: "Cover the batch admission criterion",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_candidate_plan_admission"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ],
      createdAt: "2026-04-26T00:00:00.000Z"
    });
    const rejectedCycle = defineCandidatePlan({
      planId: "plan_candidate_plan_batch_rejected_cycle",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Fail dependency-cycle admission after an admissible candidate has already appeared.",
      acceptanceCriteria: admittedIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
        id,
        statement,
        verification
      })),
      tasks: [
        {
          id: "task-batch-cycle-alpha",
          title: "Depend on beta in a rejected candidate",
          kind: "verification",
          dependsOn: ["task-batch-cycle-beta"],
          covers: ["ac_candidate_plan_admission"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-batch-cycle-beta",
          title: "Depend on alpha in a rejected candidate",
          kind: "verification",
          dependsOn: ["task-batch-cycle-alpha"],
          covers: ["ac_candidate_plan_admission"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ]
    } as const satisfies PlanGraph);

    const result = admitCandidatePlans({
      candidatePlans: [rejectedMissingCoverage, admittedGraph, rejectedCycle],
      intent: admittedIntent,
      planGraphUri: "plan.json",
      admittedAt: "2026-04-26T01:02:03.000Z"
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      assert.fail("Expected one valid candidate plan to be admitted.");
    }

    assert.equal(result.candidatePlan, admittedGraph);
    // admittedPlan is a new AdmittedPlan object; verify via planId and capability envelope.
    assert.equal(result.admittedPlan.planId, admittedGraph.planId);
    assert.deepEqual(result.admittedPlan.capabilityEnvelope, { allowedCapabilities: [] });
    assert.equal(result.admittedCandidateIndex, 1);
    assert.deepEqual(result.planningAdmission.candidateAdmissionSummary, {
      allCandidatesValidated: true,
      candidateCount: 3,
      admittedCandidateIndex: 1,
      rejectedCandidateCount: 2
    });
    assert.deepEqual(
      result.candidateAdmissionResults.map(({ candidateIndex, planId, decision, admitted }) => ({
        candidateIndex,
        planId,
        decision,
        admitted
      })),
      [
        {
          candidateIndex: 0,
          planId: "plan_candidate_plan_batch_rejected_missing_coverage",
          decision: "block",
          admitted: false
        },
        {
          candidateIndex: 1,
          planId: "plan_candidate_plan_batch_admitted",
          decision: "allow",
          admitted: true
        },
        {
          candidateIndex: 2,
          planId: "plan_candidate_plan_batch_rejected_cycle",
          decision: "block",
          admitted: false
        }
      ]
    );
    assert.deepEqual(
      result.candidateAdmissionResults.map((candidateResult) => candidateResult.validation.violationCount),
      [3, 0, 3]
    );
    assert.deepEqual(
      result.candidateAdmissionResults[0]?.rejectionReasons.map((reason) => reason.code),
      ["intent-mismatch", "empty-task-coverage", "uncovered-acceptance-criterion"]
    );
    assert.deepEqual(
      result.candidateAdmissionResults[2]?.rejectionReasons.map((reason) => reason.code),
      ["dependency-cycle", "dependency-cycle", "dependency-cycle"]
    );

    const persistedAdmission = JSON.parse(JSON.stringify(result.planningAdmission)) as Record<string, unknown>;
    assert.equal(persistedAdmission["decision"], "allow");
    assert.equal(persistedAdmission["admitted"], true);
    assert.equal(persistedAdmission["planId"], admittedGraph.planId);
    assert.equal(Object.hasOwn(persistedAdmission, "details"), false);
    assert.equal(Object.hasOwn(persistedAdmission, "admittedPlan"), false);
    assert.equal(Object.hasOwn(persistedAdmission, "handoff"), false);
    assert.deepEqual(readObjectProperty(persistedAdmission, "candidateAdmissionSummary"), {
      allCandidatesValidated: true,
      candidateCount: 3,
      admittedCandidateIndex: 1,
      rejectedCandidateCount: 2
    });
    const persistedCandidateResults = readObjectArrayProperty(persistedAdmission, "candidateAdmissionResults");
    assert.deepEqual(
      persistedCandidateResults.map((candidateResult) => ({
        candidateIndex: candidateResult["candidateIndex"],
        planId: candidateResult["planId"],
        decision: candidateResult["decision"],
        admitted: candidateResult["admitted"],
        violationCount: readObjectProperty(candidateResult, "validation")["violationCount"]
      })),
      [
        {
          candidateIndex: 0,
          planId: "plan_candidate_plan_batch_rejected_missing_coverage",
          decision: "block",
          admitted: false,
          violationCount: 3
        },
        {
          candidateIndex: 1,
          planId: "plan_candidate_plan_batch_admitted",
          decision: "allow",
          admitted: true,
          violationCount: 0
        },
        {
          candidateIndex: 2,
          planId: "plan_candidate_plan_batch_rejected_cycle",
          decision: "block",
          admitted: false,
          violationCount: 3
        }
      ]
    );
  });

  it("serializes planning-admission.json with pass/fail verdicts and validation failures for every candidate plan", () => {
    const rejectedIntentAndCoverage = defineCandidatePlan({
      planId: "plan_candidate_plan_evidence_rejected_intent_coverage",
      intentId: "intent_candidate_plan_evidence_wrong",
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Fail intent matching and coverage while preserving candidate-level admission evidence.",
      acceptanceCriteria: admittedIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
        id,
        statement,
        verification
      })),
      tasks: [
        {
          id: "task-evidence-missing-coverage",
          title: "Omit accepted criterion coverage",
          kind: "verification",
          dependsOn: [],
          covers: [],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ]
    } as const satisfies PlanGraph);
    const admittedGraph = createPlanGraph({
      planId: "plan_candidate_plan_evidence_admitted",
      intent: admittedIntent,
      strategy: "Pass admission between rejected candidates.",
      tasks: [
        {
          id: "task-evidence-admitted",
          title: "Cover the accepted criterion",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_candidate_plan_admission"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ],
      createdAt: "2026-04-26T00:00:00.000Z"
    });
    const rejectedMissingDependency = defineCandidatePlan({
      planId: "plan_candidate_plan_evidence_rejected_missing_dependency",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Fail dependency validation after a pass candidate has already appeared.",
      acceptanceCriteria: admittedIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
        id,
        statement,
        verification
      })),
      tasks: [
        {
          id: "task-evidence-missing-dependency",
          title: "Depend on a task that is not in the candidate graph",
          kind: "verification",
          dependsOn: ["task-evidence-missing"],
          covers: ["ac_candidate_plan_admission"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ]
    } as const satisfies PlanGraph);

    const result = admitCandidatePlans({
      candidatePlans: [rejectedIntentAndCoverage, admittedGraph, rejectedMissingDependency],
      intent: admittedIntent,
      planGraphUri: "plan.json",
      admittedAt: "2026-04-26T01:02:03.000Z"
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      assert.fail("Expected batch admission to select the valid candidate plan.");
    }

    const persistedAdmission = JSON.parse(JSON.stringify(result.planningAdmission)) as Record<string, unknown>;
    const persistedCandidateResults = readObjectArrayProperty(persistedAdmission, "candidateAdmissionResults");

    assert.deepEqual(readObjectProperty(persistedAdmission, "candidateAdmissionSummary"), {
      allCandidatesValidated: true,
      candidateCount: 3,
      admittedCandidateIndex: 1,
      rejectedCandidateCount: 2
    });
    assert.deepEqual(
      persistedCandidateResults.map(summarizePersistedCandidateAdmission),
      [
        {
          candidateIndex: 0,
          planId: "plan_candidate_plan_evidence_rejected_intent_coverage",
          decision: "block",
          admissionStatus: "no-plan-admitted",
          admitted: false,
          validationOk: false,
          violationCount: 3,
          violationCodes: ["intent-mismatch", "empty-task-coverage", "uncovered-acceptance-criterion"],
          rejectionCodes: ["intent-mismatch", "empty-task-coverage", "uncovered-acceptance-criterion"],
          errors: [
            "Plan graph intent intent_candidate_plan_evidence_wrong must match confirmed intent intent_candidate_plan_admission.",
            "Task task-evidence-missing-coverage must cover at least one acceptance criterion.",
            "Acceptance criterion ac_candidate_plan_admission is not covered by any plan task."
          ]
        },
        {
          candidateIndex: 1,
          planId: "plan_candidate_plan_evidence_admitted",
          decision: "allow",
          admissionStatus: "plan-admitted",
          admitted: true,
          validationOk: true,
          violationCount: 0,
          violationCodes: [],
          rejectionCodes: [],
          errors: []
        },
        {
          candidateIndex: 2,
          planId: "plan_candidate_plan_evidence_rejected_missing_dependency",
          decision: "block",
          admissionStatus: "no-plan-admitted",
          admitted: false,
          validationOk: false,
          violationCount: 1,
          violationCodes: ["missing-task-dependency"],
          rejectionCodes: ["missing-task-dependency"],
          errors: [
            "Task task-evidence-missing-dependency depends on missing task task-evidence-missing."
          ]
        }
      ]
    );
    assertCandidateAdmissionFailuresMirrorValidation(persistedCandidateResults);
  });

  it("rejects an invalid CandidatePlan with structured rejection reasons and no AdmittedPlan", () => {
    const rejectedGraph = defineCandidatePlan({
      planId: "plan_candidate_plan_admission_rejected",
      intentId: "intent_candidate_plan_admission_wrong",
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Attempt to bypass planning admission with several defects.",
      acceptanceCriteria: admittedIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
        id,
        statement,
        verification
      })),
      tasks: [
        {
          id: "task-duplicate-admission",
          title: "Depend on a missing task",
          kind: "verification",
          dependsOn: ["task-missing-admission"],
          covers: [],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-duplicate-admission",
          title: "Duplicate a task id",
          kind: "verification",
          dependsOn: [],
          covers: [],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ]
    } as const satisfies PlanGraph);

    const result = admitCandidatePlan({
      graph: rejectedGraph,
      intent: admittedIntent,
      planGraphUri: "plan.json"
    });

    assert.equal(result.ok, false);
    if (result.ok) {
      assert.fail("Expected invalid candidate plan to be rejected.");
    }

    assert.equal(Object.hasOwn(result, "admittedPlan"), false);
    assert.equal(result.validation.ok, false);
    assert.equal(result.planningAdmission.admitted, false);
    assert.equal(result.planningAdmission.decision, "block");
    assert.equal(result.planningAdmission.admissionStatus, "no-plan-admitted");
    assert.equal(Object.hasOwn(result.planningAdmission, "admittedPlan"), false);
    assert.deepEqual(result.rejectionReasons, result.planningAdmission.details.failure.rejectionReasons);
    assert.deepEqual(result.errors, result.planningAdmission.errors);

    const rejectionCodes = result.rejectionReasons.map((reason) => reason.code);
    assert.ok(rejectionCodes.includes("intent-mismatch"));
    assert.ok(rejectionCodes.includes("duplicate-task-id"));
    assert.ok(rejectionCodes.includes("missing-task-dependency"));
    assert.ok(rejectionCodes.includes("empty-task-coverage"));
    assert.ok(rejectionCodes.includes("uncovered-acceptance-criterion"));
    assert.equal(result.rejectionReasons.every((reason) => reason.affectedPlanLocation.path === reason.path), true);
    assert.deepEqual(
      [...new Set(result.rejectionReasons.map((reason) => reason.validator))],
      ["intent-match", "task-identity", "task-contracts", "acceptance-coverage"]
    );
  });

  it("rejects semantically invalid candidate plans without producing an admitted-plan contract", () => {
    const semanticallyInvalidGraph = defineCandidatePlan({
      planId: "plan_candidate_plan_admission_semantically_invalid",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Attempt to route a structurally valid but semantically invalid candidate plan to execution.",
      acceptanceCriteria: admittedIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
        id,
        statement,
        verification
      })),
      tasks: [
        {
          id: "task-semantic-invalid-coverage",
          title: "Cover the admitted criterion while smuggling an unknown criterion and missing dependency",
          kind: "verification",
          dependsOn: ["task-semantic-missing-upstream"],
          covers: ["ac_candidate_plan_admission", "ac_candidate_plan_unconfirmed"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-semantic-empty-coverage",
          title: "Leave one semantically invalid task uncovered",
          kind: "verification",
          dependsOn: [],
          covers: [],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ]
    } as const satisfies PlanGraph);

    const result = admitCandidatePlan({
      graph: semanticallyInvalidGraph,
      intent: admittedIntent,
      planGraphUri: "plan.json",
      planningAdmissionUri: PLANNING_ADMISSION_ARTIFACT_NAME,
      admittedAt: "2026-04-26T01:02:03.000Z"
    });

    assert.equal(result.ok, false);
    if (result.ok) {
      assert.fail("Semantically invalid candidate plan unexpectedly produced an admitted plan.");
    }

    assert.equal(Object.hasOwn(result, "admittedPlan"), false);
    assert.equal(result.validation.ok, false);
    assert.deepEqual(
      result.validation.registeredValidatorRuns.map((run) => run.validator),
      [...PLAN_GRAPH_ADMISSION_VALIDATORS]
    );
    assert.deepEqual(
      result.rejectionReasons.map(({ validator, code, path }) => ({ validator, code, path })),
      [
        {
          validator: "task-contracts",
          code: "unknown-acceptance-criterion",
          path: "tasks.task-semantic-invalid-coverage.covers.1"
        },
        {
          validator: "task-contracts",
          code: "missing-task-dependency",
          path: "tasks.task-semantic-invalid-coverage.dependsOn.0"
        },
        {
          validator: "task-contracts",
          code: "empty-task-coverage",
          path: "tasks.task-semantic-empty-coverage.covers"
        }
      ]
    );

    assert.equal(result.planningAdmission.artifact, PLANNING_ADMISSION_ARTIFACT_NAME);
    assert.equal(result.planningAdmission.decision, "block");
    assert.equal(result.planningAdmission.admissionStatus, "no-plan-admitted");
    assert.equal(result.planningAdmission.admitted, false);
    assert.equal(result.planningAdmission.details.failure.admittedPlanCreated, false);
    assert.deepEqual(result.rejectionReasons, result.planningAdmission.details.failure.rejectionReasons);
    assert.deepEqual(result.errors, result.planningAdmission.errors);

    const persistedAdmission = JSON.parse(JSON.stringify(result.planningAdmission)) as Record<string, unknown>;
    assert.equal(persistedAdmission["artifact"], PLANNING_ADMISSION_ARTIFACT_NAME);
    assert.equal(persistedAdmission["decision"], "block");
    assert.equal(persistedAdmission["admitted"], false);
    assert.equal(Object.hasOwn(persistedAdmission, "admittedPlan"), false);
    assert.equal(Object.hasOwn(persistedAdmission, "handoff"), false);
    assert.equal(Object.hasOwn(persistedAdmission, "executionArtifact"), false);
    assert.equal(Object.hasOwn(persistedAdmission, "plan_hash"), false);
    assert.equal(Object.hasOwn(persistedAdmission, "validators_passed"), false);

    const handoffValidation = validateAdmittedPlanHandoff({
      plan: semanticallyInvalidGraph,
      planningAdmission: result.planningAdmission,
      planningAdmissionArtifact: {
        artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
        uri: PLANNING_ADMISSION_ARTIFACT_NAME,
        persisted: true
      },
      planGraphUri: "plan.json"
    });

    assert.equal(handoffValidation.ok, false);
    if (handoffValidation.ok) {
      assert.fail("Rejected semantic candidate unexpectedly validated as an admitted-plan handoff.");
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
          plan: semanticallyInvalidGraph,
          planningAdmission: result.planningAdmission,
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

  it("rejects malformed candidate-plan structure before creating an admitted plan", () => {
    const malformedStructureGraph = defineCandidatePlan({
      planId: "plan_candidate_plan_admission_malformed_structure",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Attempt to admit a candidate plan that has lost its accepted AC catalog.",
      acceptanceCriteria: undefined,
      tasks: [
        {
          id: "task-malformed-structure",
          title: "Try to cover an AC without an accepted PlanGraph AC catalog",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_candidate_plan_admission"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ]
    } as unknown as PlanGraph);

    const result = admitCandidatePlan({
      graph: malformedStructureGraph,
      intent: admittedIntent,
      planGraphUri: "plan.json"
    });

    assert.equal(result.ok, false);
    if (result.ok) {
      assert.fail("Expected malformed candidate-plan structure to be rejected.");
    }

    assert.equal(Object.hasOwn(result, "admittedPlan"), false);
    assert.equal(result.planningAdmission.admitted, false);
    assert.equal(result.planningAdmission.decision, "block");
    assert.equal(result.planningAdmission.admissionStatus, "no-plan-admitted");
    assert.equal(result.planningAdmission.details.failure.admittedPlanCreated, false);
    assert.equal(Object.hasOwn(result.planningAdmission, "admittedPlan"), false);
    assert.deepEqual(
      result.rejectionReasons.map(({ validator, code, path }) => ({ validator, code, path })),
      [
        {
          validator: "accepted-criteria",
          code: "accepted-criteria-not-array",
          path: "acceptanceCriteria"
        },
        {
          validator: "task-contracts",
          code: "unknown-acceptance-criterion",
          path: "tasks.task-malformed-structure.covers.0"
        },
        {
          validator: "acceptance-coverage",
          code: "uncovered-acceptance-criterion",
          path: "acceptanceCriteria"
        }
      ]
    );
    assert.deepEqual(result.rejectionReasons, result.planningAdmission.details.failure.rejectionReasons);
    assert.deepEqual(result.errors, result.planningAdmission.errors);
  });

  it("rejects a missing candidate-plan tasks array with an explicit planning-admission failure result", () => {
    const malformedTasksGraph = defineCandidatePlan({
      planId: "plan_candidate_plan_admission_missing_tasks_array",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Attempt to admit a candidate plan whose task collection is not a task array.",
      acceptanceCriteria: admittedIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
        id,
        statement,
        verification
      })),
      tasks: undefined
    } as unknown as PlanGraph);

    const result = admitCandidatePlan({
      graph: malformedTasksGraph,
      intent: admittedIntent,
      planGraphUri: "plan.json"
    });

    assert.equal(result.ok, false);
    if (result.ok) {
      assert.fail("Expected missing candidate-plan tasks array to be rejected.");
    }

    assert.equal(Object.hasOwn(result, "admittedPlan"), false);
    assert.equal(result.planningAdmission.admitted, false);
    assert.equal(result.planningAdmission.decision, "block");
    assert.equal(result.planningAdmission.admissionStatus, "no-plan-admitted");
    assert.equal(result.planningAdmission.details.failure.admittedPlanCreated, false);
    assert.deepEqual(
      result.validation.registeredValidatorRuns.map((run) => run.validator),
      [...PLAN_GRAPH_ADMISSION_VALIDATORS]
    );
    assert.deepEqual(
      result.rejectionReasons.map(({ validator, code, path, message }) => ({
        validator,
        code,
        path,
        message
      })),
      [
        {
          validator: "task-contracts",
          code: "tasks-not-array",
          path: "tasks",
          message: "Plan graph tasks must be an array of candidate plan tasks."
        },
        {
          validator: "acceptance-coverage",
          code: "uncovered-acceptance-criterion",
          path: "acceptanceCriteria",
          message: "Acceptance criterion ac_candidate_plan_admission is not covered by any plan task."
        }
      ]
    );
    assert.deepEqual(result.rejectionReasons, result.planningAdmission.details.failure.rejectionReasons);
    assert.deepEqual(result.errors, result.planningAdmission.errors);
  });

  it("rejects malformed candidate-plan task entries with explicit planning-admission failure results", () => {
    const malformedTaskEntriesGraph = defineCandidatePlan({
      planId: "plan_candidate_plan_admission_malformed_task_entries",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Attempt to admit candidate task entries whose shape cannot be trusted by execution.",
      acceptanceCriteria: admittedIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
        id,
        statement,
        verification
      })),
      tasks: [
        "not-a-task-object",
        {
          id: "task-malformed-shape",
          title: "",
          kind: "unsupported",
          dependsOn: "task-missing-shape",
          covers: "ac_candidate_plan_admission",
          requiredCapabilities: {},
          risk: "extreme"
        }
      ]
    } as unknown as PlanGraph);

    const result = admitCandidatePlan({
      graph: malformedTaskEntriesGraph,
      intent: admittedIntent,
      planGraphUri: "plan.json"
    });

    assert.equal(result.ok, false);
    if (result.ok) {
      assert.fail("Expected malformed candidate-plan task entries to be rejected.");
    }

    assert.equal(Object.hasOwn(result, "admittedPlan"), false);
    assert.equal(result.planningAdmission.admitted, false);
    assert.equal(result.planningAdmission.decision, "block");
    assert.equal(result.planningAdmission.admissionStatus, "no-plan-admitted");
    assert.equal(result.planningAdmission.details.failure.admittedPlanCreated, false);
    assert.deepEqual(
      result.rejectionReasons.map(({ validator, code, path, message, taskId }) => ({
        validator,
        code,
        path,
        message,
        ...(taskId !== undefined ? { taskId } : {})
      })),
      [
        {
          validator: "task-contracts",
          code: "malformed-task",
          path: "tasks.0",
          message: "Plan graph tasks.0 must be an object."
        },
        {
          validator: "task-contracts",
          code: "malformed-task-dependencies",
          path: "tasks.task-malformed-shape.dependsOn",
          message: "Task task-malformed-shape dependsOn must be an array of task ids.",
          taskId: "task-malformed-shape"
        },
        {
          validator: "task-contracts",
          code: "malformed-task-coverage",
          path: "tasks.task-malformed-shape.covers",
          message: "Task task-malformed-shape covers must be an array of accepted criterion ids.",
          taskId: "task-malformed-shape"
        },
        {
          validator: "task-contracts",
          code: "malformed-task-title",
          path: "tasks.task-malformed-shape.title",
          message: "Task task-malformed-shape title must be a non-empty string.",
          taskId: "task-malformed-shape"
        },
        {
          validator: "task-contracts",
          code: "malformed-task-kind",
          path: "tasks.task-malformed-shape.kind",
          message: "Task task-malformed-shape kind must be research, design, implementation, verification, or release.",
          taskId: "task-malformed-shape"
        },
        {
          validator: "task-contracts",
          code: "malformed-task-risk",
          path: "tasks.task-malformed-shape.risk",
          message: "Task task-malformed-shape risk must be low, medium, or high.",
          taskId: "task-malformed-shape"
        },
        {
          validator: "task-contracts",
          code: "malformed-task-required-capabilities",
          path: "tasks.task-malformed-shape.requiredCapabilities.repoScopes",
          message: "Task task-malformed-shape requiredCapabilities.repoScopes must be an array.",
          taskId: "task-malformed-shape"
        },
        {
          validator: "task-contracts",
          code: "malformed-task-required-capabilities",
          path: "tasks.task-malformed-shape.requiredCapabilities.toolPermissions",
          message: "Task task-malformed-shape requiredCapabilities.toolPermissions must be an array.",
          taskId: "task-malformed-shape"
        },
        {
          validator: "task-contracts",
          code: "malformed-task-required-capabilities",
          path: "tasks.task-malformed-shape.requiredCapabilities.budget",
          message: "Task task-malformed-shape requiredCapabilities.budget must be an object.",
          taskId: "task-malformed-shape"
        },
        {
          validator: "task-contracts",
          code: "empty-task-coverage",
          path: "tasks.task-malformed-shape.covers",
          message: "Task task-malformed-shape must cover at least one acceptance criterion.",
          taskId: "task-malformed-shape"
        },
        {
          validator: "acceptance-coverage",
          code: "uncovered-acceptance-criterion",
          path: "acceptanceCriteria",
          message: "Acceptance criterion ac_candidate_plan_admission is not covered by any plan task."
        }
      ]
    );
    assert.deepEqual(result.rejectionReasons, result.planningAdmission.details.failure.rejectionReasons);
    assert.deepEqual(result.errors, result.planningAdmission.errors);
  });

  it("rejects cyclic candidate dependency graphs before creating an admitted plan", () => {
    const cyclicDependencyGraph = defineCandidatePlan({
      planId: "plan_candidate_plan_admission_cyclic_dependencies",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Attempt to admit a candidate plan whose task prerequisites loop.",
      acceptanceCriteria: admittedIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
        id,
        statement,
        verification
      })),
      tasks: [
        {
          id: "task-cycle-alpha",
          title: "Depend on beta",
          kind: "verification",
          dependsOn: ["task-cycle-beta"],
          covers: ["ac_candidate_plan_admission"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-cycle-beta",
          title: "Depend on alpha",
          kind: "verification",
          dependsOn: ["task-cycle-alpha"],
          covers: ["ac_candidate_plan_admission"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ]
    } as const satisfies PlanGraph);

    const result = admitCandidatePlan({
      graph: cyclicDependencyGraph,
      intent: admittedIntent,
      planGraphUri: "plan.json"
    });

    assert.equal(result.ok, false);
    if (result.ok) {
      assert.fail("Expected cyclic candidate dependency graph to be rejected.");
    }

    assert.equal(Object.hasOwn(result, "admittedPlan"), false);
    assert.equal(result.planningAdmission.admitted, false);
    assert.equal(result.planningAdmission.decision, "block");
    assert.equal(result.planningAdmission.admissionStatus, "no-plan-admitted");
    assert.equal(result.planningAdmission.details.failure.admittedPlanCreated, false);
    assert.equal(Object.hasOwn(result.planningAdmission, "admittedPlan"), false);
    assert.deepEqual(
      result.rejectionReasons.map(({ validator, code, path, taskId }) => ({
        validator,
        code,
        path,
        ...(taskId !== undefined ? { taskId } : {})
      })),
      [
        {
          validator: "immediate-dependency-cycles",
          code: "dependency-cycle",
          path: "tasks.task-cycle-alpha.dependsOn.0",
          taskId: "task-cycle-alpha"
        },
        {
          validator: "immediate-dependency-cycles",
          code: "dependency-cycle",
          path: "tasks.task-cycle-beta.dependsOn.0",
          taskId: "task-cycle-beta"
        },
        {
          validator: "dependency-cycle-summary",
          code: "dependency-cycle",
          path: "tasks.dependsOn"
        }
      ]
    );
    assert.deepEqual(result.rejectionReasons, result.planningAdmission.details.failure.rejectionReasons);
    assert.deepEqual(result.errors, result.planningAdmission.errors);
  });
});

function readObjectProperty(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  assert.equal(typeof value, "object");
  assert.equal(value === null, false);
  assert.equal(Array.isArray(value), false);
  return value as Record<string, unknown>;
}

function readObjectArrayProperty(
  record: Record<string, unknown>,
  key: string
): readonly Record<string, unknown>[] {
  const value = record[key];
  assert.equal(Array.isArray(value), true);
  for (const entry of value as readonly unknown[]) {
    assert.equal(typeof entry, "object");
    assert.equal(entry === null, false);
    assert.equal(Array.isArray(entry), false);
  }
  return value as readonly Record<string, unknown>[];
}

function readStringArrayProperty(record: Record<string, unknown>, key: string): readonly string[] {
  const value = record[key];
  assert.equal(Array.isArray(value), true);
  for (const entry of value as readonly unknown[]) {
    assert.equal(typeof entry, "string");
  }
  return value as readonly string[];
}

function summarizePersistedCandidateAdmission(candidateResult: Record<string, unknown>): Record<string, unknown> {
  const validation = readObjectProperty(candidateResult, "validation");
  const violations = Object.hasOwn(validation, "violations")
    ? readObjectArrayProperty(validation, "violations")
    : [];
  const rejectionReasons = readObjectArrayProperty(candidateResult, "rejectionReasons");

  return {
    candidateIndex: candidateResult["candidateIndex"],
    planId: candidateResult["planId"],
    decision: candidateResult["decision"],
    admissionStatus: candidateResult["admissionStatus"],
    admitted: candidateResult["admitted"],
    validationOk: validation["ok"],
    violationCount: validation["violationCount"],
    violationCodes: violations.map((violation) => violation["code"]),
    rejectionCodes: rejectionReasons.map((reason) => reason["code"]),
    errors: readStringArrayProperty(candidateResult, "errors")
  };
}

function assertCandidateAdmissionFailuresMirrorValidation(
  candidateResults: readonly Record<string, unknown>[]
): void {
  for (const candidateResult of candidateResults) {
    const validation = readObjectProperty(candidateResult, "validation");
    const rejectionReasons = readObjectArrayProperty(candidateResult, "rejectionReasons");
    const errors = readStringArrayProperty(candidateResult, "errors");

    if (candidateResult["admitted"] === true) {
      assert.equal(validation["ok"], true);
      assert.equal(validation["violationCount"], 0);
      assert.equal(Object.hasOwn(validation, "violations"), false);
      assert.deepEqual(rejectionReasons, []);
      assert.deepEqual(errors, []);
      continue;
    }

    const violations = readObjectArrayProperty(validation, "violations");
    assert.equal(validation["ok"], false);
    assert.equal(validation["violationCount"], violations.length);
    assert.equal(violations.length > 0, true);
    assert.deepEqual(
      rejectionReasons.map(projectPersistedValidationFailure),
      violations.map(projectPersistedValidationFailure)
    );
    assert.deepEqual(errors, violations.map((violation) => violation["message"]));
  }
}

function projectPersistedValidationFailure(failure: Record<string, unknown>): Record<string, unknown> {
  return {
    validator: failure["validator"],
    code: failure["code"],
    path: failure["path"],
    message: failure["message"]
  };
}
