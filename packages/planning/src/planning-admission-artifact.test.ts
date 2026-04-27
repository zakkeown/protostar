import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { describe, it } from "node:test";

import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";
import {
  assertAdmittedPlanHandoff,
  createPlanningAdmissionArtifact,
  createPlanningPreAdmissionFailureArtifact,
  PLANNING_ADMISSION_ARTIFACT_NAME,
  PLANNING_ADMISSION_SCHEMA_VERSION,
  validateAdmittedPlanHandoff
} from "@protostar/planning/artifacts";
import {
  createPlanGraph,
  defineCandidatePlan,
  hashPlanGraph,
  PLAN_GRAPH_ADMISSION_VALIDATOR_VERSIONS,
  PLAN_GRAPH_ADMISSION_VALIDATORS,
  validatePlanGraph,
  type PlanGraph,
  type PlanningAdmissionTaskCapabilityAdmissionEvidence,
  type PlanningAdmissionTaskRiskCompatibilityEvidence,
  type PlanTaskRequiredCapabilities
} from "@protostar/planning/schema";
import {
  expectedPlanningAdmissionRejectionReasons,
  withAffectedPlanLocations
} from "./test-support.js";

const admittedIntent = buildConfirmedIntentForTest({
  id: "intent_planning_admission_artifact",
  title: "Record thin planning admission evidence",
  problem:
    "Planning admission must leave durable per-AC coverage evidence without duplicating the PlanGraph proof body.",
  requester: "ouroboros-ac-301",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_planning_admission_alpha",
      statement: "Alpha coverage is proven by one or more admitted plan tasks.",
      verification: "test"
    },
    {
      id: "ac_planning_admission_beta",
      statement: "Beta coverage is proven by a distinct admitted plan task.",
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
        permissionLevel: "execute",
        reason: "Run the planning admission artifact fixture.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: [
    "planning-admission.json must reference PlanGraph coverage proof instead of copying statements or task bodies."
  ]
});

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

const planningAdmissionGrantModel = {
  source: "confirmed-intent-capability-envelope",
  grants: [
    {
      id: "planning-admission-grant:write",
      kind: "write",
      authority: "repository-write",
      source: "confirmed-intent-capability-envelope",
      status: "detected",
      evidenceRefs: [
        {
          fieldPath: "capabilityEnvelope.repoScopes.0.access",
          detectionSource: "repo-scope-access"
        }
      ]
    }
  ]
} as const;

describe("planning admission artifact contract", () => {
  it("writes successful candidate-plan admission to planning-admission.json as durable evidence", async () => {
    await withTempDir(async (runDir) => {
      const graph = createPlanGraph({
        planId: "plan_planning_admission_artifact_persisted",
        intent: admittedIntent,
        strategy: "Admit a candidate plan and persist the planning admission boundary evidence.",
        tasks: [
          {
            id: "task-persist-admission-alpha",
            title: "Cover alpha before durable admission handoff",
            kind: "verification",
            dependsOn: [],
            covers: ["ac_planning_admission_alpha"],
            requiredCapabilities: noRequiredCapabilities,
            risk: "low"
          },
          {
            id: "task-persist-admission-beta",
            title: "Cover beta before durable admission handoff",
            kind: "verification",
            dependsOn: ["task-persist-admission-alpha"],
            covers: ["ac_planning_admission_beta"],
            requiredCapabilities: noRequiredCapabilities,
            risk: "low"
          }
        ],
        createdAt: "2026-04-26T00:00:00.000Z"
      });

      const artifact = createPlanningAdmissionArtifact({
        graph,
        intent: admittedIntent,
        planGraphUri: "plan.json",
        planningAdmissionUri: PLANNING_ADMISSION_ARTIFACT_NAME,
        admittedAt: "2026-04-26T01:02:03.000Z"
      });
      const artifactPath = resolve(runDir, PLANNING_ADMISSION_ARTIFACT_NAME);

      assert.equal(artifact.admitted, true);

      await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
      await access(artifactPath);

      const persistedArtifact = JSON.parse(await readFile(artifactPath, "utf8")) as typeof artifact;
      const expectedPersistedArtifact = expectedAcceptedPlanningAdmissionPayload(
        graph,
        "2026-04-26T01:02:03.000Z"
      );
      assert.equal(basename(artifactPath), PLANNING_ADMISSION_ARTIFACT_NAME);
      assert.deepEqual(persistedArtifact, artifact);
      assert.deepEqual(Object.keys(persistedArtifact).sort(), Object.keys(expectedPersistedArtifact).sort());
      assert.deepEqual(persistedArtifact, expectedPersistedArtifact);

      const handoff = assertAdmittedPlanHandoff({
        plan: graph,
        planningAdmission: persistedArtifact,
        planningAdmissionArtifact: {
          artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
          uri: PLANNING_ADMISSION_ARTIFACT_NAME,
          persisted: true
        },
        planGraphUri: "plan.json"
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
      assert.deepEqual(handoff.executionArtifact.admittedPlan, {
        planId: graph.planId,
        uri: "plan.json",
        pointer: "#",
        sourceOfTruth: "PlanGraph"
      });
      assert.deepEqual(
        handoff.executionArtifact.tasks.map((task) => task.planTaskId),
        ["task-persist-admission-alpha", "task-persist-admission-beta"]
      );
    });
  });

  it("persists planning-admission.json for rejected candidate plans before refusing execution handoff", async () => {
    await withTempDir(async (runDir) => {
      const rejectedGraph = defineCandidatePlan({
        planId: "plan_planning_admission_persisted_rejection",
        intentId: admittedIntent.id,
        createdAt: "2026-04-26T00:00:00.000Z",
        strategy: "Persist rejection evidence before any invalid candidate plan can reach execution.",
        acceptanceCriteria: admittedIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
          id,
          statement,
          verification
        })),
        tasks: [
          {
            id: "task-rejected-alpha-only",
            title: "Cover only alpha and leave beta uncovered",
            kind: "verification",
            dependsOn: [],
            covers: ["ac_planning_admission_alpha"],
            requiredCapabilities: noRequiredCapabilities,
            risk: "low"
          }
        ]
      } as const satisfies PlanGraph);
      const artifact = createPlanningAdmissionArtifact({
        graph: rejectedGraph,
        intent: admittedIntent,
        planGraphUri: "plan.json",
        planningAdmissionUri: PLANNING_ADMISSION_ARTIFACT_NAME
      });
      const artifactPath = resolve(runDir, PLANNING_ADMISSION_ARTIFACT_NAME);

      assert.equal(artifact.admitted, false);
      await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
      await access(artifactPath);

      const persistedArtifact = JSON.parse(await readFile(artifactPath, "utf8")) as typeof artifact;
      assert.equal(basename(artifactPath), PLANNING_ADMISSION_ARTIFACT_NAME);
      assert.deepEqual(persistedArtifact, artifact);
      assert.equal(persistedArtifact.decision, "block");
      assert.equal(persistedArtifact.admissionStatus, "no-plan-admitted");
      assert.equal(Object.hasOwn(persistedArtifact, "admittedPlan"), false);
      assert.equal(persistedArtifact.details.failure.state, "validation-failed");
      assert.equal(persistedArtifact.details.failure.admittedPlanCreated, false);

      const handoffValidation = validateAdmittedPlanHandoff({
        plan: rejectedGraph,
        planningAdmission: persistedArtifact,
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
            plan: rejectedGraph,
            planningAdmission: persistedArtifact,
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

  it("persists planning-admission.json for pre-admission failures before any execution handoff can be trusted", async () => {
    await withTempDir(async (runDir) => {
      const candidatePlanId = "plan_planning_admission_persisted_pre_admission_failure";
      const artifact = createPlanningPreAdmissionFailureArtifact({
        intent: admittedIntent,
        candidatePlanId,
        attemptedAt: "2026-04-26T05:06:07.000Z",
        candidateSourceUri: "planning-result.json",
        errors: ["candidate plan output did not contain a valid PlanGraph."]
      });
      const attemptedExecutionPlan = createPlanGraph({
        planId: candidatePlanId,
        intent: admittedIntent,
        strategy: "Attempting execution from this candidate must still require admitted planning evidence.",
        tasks: [
          {
            id: "task-attempted-execution-after-pre-admission-failure",
            title: "Attempt execution after pre-admission failure",
            kind: "verification",
            dependsOn: [],
            covers: ["ac_planning_admission_alpha", "ac_planning_admission_beta"],
            requiredCapabilities: noRequiredCapabilities,
            risk: "low"
          }
        ],
        createdAt: "2026-04-26T05:06:07.000Z"
      });
      const artifactPath = resolve(runDir, PLANNING_ADMISSION_ARTIFACT_NAME);

      await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
      await access(artifactPath);

      const persistedArtifact = JSON.parse(await readFile(artifactPath, "utf8")) as typeof artifact;
      assert.equal(basename(artifactPath), PLANNING_ADMISSION_ARTIFACT_NAME);
      assert.deepEqual(persistedArtifact, artifact);
      assert.equal(persistedArtifact.decision, "block");
      assert.equal(persistedArtifact.admissionStatus, "no-plan-admitted");
      assert.equal(Object.hasOwn(persistedArtifact, "admittedPlan"), false);
      assert.equal(persistedArtifact.details.failure.state, "pre-admission-failed");
      assert.equal(persistedArtifact.details.failure.candidatePlanCreated, false);
      assert.equal(persistedArtifact.details.failure.admittedPlanCreated, false);

      const handoffValidation = validateAdmittedPlanHandoff({
        plan: attemptedExecutionPlan,
        planningAdmission: persistedArtifact,
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
            plan: attemptedExecutionPlan,
            planningAdmission: persistedArtifact,
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

  it("records per-AC coverage evidence as thin references into the admitted PlanGraph", () => {
    const graph = createPlanGraph({
      planId: "plan_planning_admission_artifact",
      intent: admittedIntent,
      strategy: "Admit a plan and write a thin coverage evidence artifact.",
      tasks: [
        {
          id: "task-cover-admission-alpha",
          title: "Cover alpha",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_planning_admission_alpha"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-cover-admission-beta-and-alpha",
          title: "Cover beta and reinforce alpha",
          kind: "verification",
          dependsOn: ["task-cover-admission-alpha"],
          covers: ["ac_planning_admission_beta", "ac_planning_admission_alpha"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ],
      createdAt: "2026-04-26T00:00:00.000Z"
    });

    const expectedAcceptanceCoverage = [
      {
        acceptanceCriterionId: "ac_planning_admission_alpha",
        acceptedCriterionPath: "acceptanceCriteria.0",
        coverageLinks: [
          {
            taskId: "task-cover-admission-alpha",
            coveragePath: "tasks.task-cover-admission-alpha.covers.0"
          },
          {
            taskId: "task-cover-admission-beta-and-alpha",
            coveragePath: "tasks.task-cover-admission-beta-and-alpha.covers.1"
          }
        ]
      },
      {
        acceptanceCriterionId: "ac_planning_admission_beta",
        acceptedCriterionPath: "acceptanceCriteria.1",
        coverageLinks: [
          {
            taskId: "task-cover-admission-beta-and-alpha",
            coveragePath: "tasks.task-cover-admission-beta-and-alpha.covers.0"
          }
        ]
      }
    ];
    const validation = validatePlanGraph({
      graph,
      intent: admittedIntent
    });

    assert.equal(validation.ok, true);
    assert.deepEqual(validation.acceptanceCoverage, expectedAcceptanceCoverage);

    const artifact = createPlanningAdmissionArtifact({
      graph,
      intent: admittedIntent,
      planGraphUri: "plan.json",
      admittedAt: "2026-04-26T01:02:03.000Z",
      planningAdmissionUri: "planning-admission.json",
      candidateSourceUri: "plan.json"
    });

    assert.equal(artifact.schemaVersion, PLANNING_ADMISSION_SCHEMA_VERSION);
    assert.equal(artifact.artifact, PLANNING_ADMISSION_ARTIFACT_NAME);
    assert.equal(artifact.decision, "allow");
    assert.equal(artifact.admissionStatus, "plan-admitted");
    assert.equal(artifact.admitted, true);
    assert.equal(artifact.admittedAt, "2026-04-26T01:02:03.000Z");
    assert.deepEqual(artifact.planningAttempt, {
      id: "planning-attempt:plan_planning_admission_artifact",
      candidatePlanId: graph.planId,
      intentId: admittedIntent.id,
      candidatePlanCreatedAt: graph.createdAt
    });
    assert.deepEqual(artifact.candidateSource, {
      kind: "candidate-plan-graph",
      planId: graph.planId,
      uri: "plan.json",
      pointer: "#",
      createdAt: graph.createdAt,
      sourceOfTruth: "PlanGraph"
    });
    assert.equal(artifact.planId, graph.planId);
    assert.equal(artifact.intentId, admittedIntent.id);
    assert.deepEqual(artifact.admittedPlan, {
      planId: graph.planId,
      uri: "plan.json",
      pointer: "#",
      sourceOfTruth: "PlanGraph"
    });
    assert.deepEqual(artifact.handoff, {
      readyFor: ["execution", "review"],
      admittedPlanUri: "plan.json",
      planningAdmissionUri: "planning-admission.json",
      validationSource: "planning-admission.json",
      proofSource: "PlanGraph"
    });
    assert.deepEqual(artifact.errors, []);
    assert.deepEqual(artifact.details.gate, {
      planGraphValidationPassed: true,
      taskCapabilityRequirementsExtracted: true,
      taskRiskCompatibilityEvidenceAttached: true,
      acceptanceCriterionCoverageEvidenceAttached: true
    });
    assert.deepEqual(artifact.details.validation, {
      validator: "validatePlanGraph",
      ok: true,
      violationCount: 0
    });
    assert.deepEqual(artifact.details.grantModel, planningAdmissionGrantModel);
    assert.deepEqual(artifact.details.taskCapabilityAdmissions, [
      {
        taskId: "task-cover-admission-alpha",
        requestedCapabilities: noRequiredCapabilities,
        admittedCapabilities: noRequiredCapabilities,
        verdict: "allow"
      },
      {
        taskId: "task-cover-admission-beta-and-alpha",
        requestedCapabilities: noRequiredCapabilities,
        admittedCapabilities: noRequiredCapabilities,
        verdict: "allow"
      }
    ] satisfies readonly PlanningAdmissionTaskCapabilityAdmissionEvidence[]);
    assert.deepEqual(artifact.details.releaseGrantConditions, []);
    assert.deepEqual(artifact.details.releaseGrantAdmission, {
      decision: "allow",
      required: false,
      conditionCount: 0,
      rejectedConditionCount: 0,
      rejectionReasons: []
    });
    assert.deepEqual(artifact.details.taskRiskCompatibilityOutcomes, [
      {
        taskId: "task-cover-admission-alpha",
        declaredRisk: "low",
        requiredCapabilityRisk: "low",
        allowedRequiredCapabilityRisks: ["low"],
        outcome: "compatible"
      },
      {
        taskId: "task-cover-admission-beta-and-alpha",
        declaredRisk: "low",
        requiredCapabilityRisk: "low",
        allowedRequiredCapabilityRisks: ["low"],
        outcome: "compatible"
      }
    ] satisfies readonly PlanningAdmissionTaskRiskCompatibilityEvidence[]);
    assert.deepEqual(artifact.details.acceptanceCoverage, expectedAcceptanceCoverage);
  });

  it("requires admitted artifacts to include non-empty coverage evidence for every accepted AC", () => {
    const graph = createPlanGraph({
      planId: "plan_planning_admission_complete_ac_evidence",
      intent: admittedIntent,
      strategy: "Admit only when every accepted criterion has durable coverage evidence.",
      tasks: [
        {
          id: "task-complete-evidence-alpha",
          title: "Cover alpha with a stable task link",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_planning_admission_alpha"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-complete-evidence-beta",
          title: "Cover beta with a stable task link",
          kind: "verification",
          dependsOn: ["task-complete-evidence-alpha"],
          covers: ["ac_planning_admission_beta"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ],
      createdAt: "2026-04-26T00:00:00.000Z"
    });

    const artifact = createPlanningAdmissionArtifact({
      graph,
      intent: admittedIntent,
      planGraphUri: "plan.json"
    });

    assert.equal(artifact.decision, "allow");
    assert.deepEqual(
      artifact.details.acceptanceCoverage.map((criterionEvidence) => criterionEvidence.acceptanceCriterionId),
      graph.acceptanceCriteria.map((criterion) => criterion.id)
    );
    assert.deepEqual(
      artifact.details.acceptanceCoverage.map((criterionEvidence) => criterionEvidence.acceptedCriterionPath),
      ["acceptanceCriteria.0", "acceptanceCriteria.1"]
    );
    assert.equal(
      artifact.details.acceptanceCoverage.every(
        (criterionEvidence) => criterionEvidence.coverageLinks.length > 0
      ),
      true
    );
    assert.deepEqual(artifact.details.acceptanceCoverage, [
      {
        acceptanceCriterionId: "ac_planning_admission_alpha",
        acceptedCriterionPath: "acceptanceCriteria.0",
        coverageLinks: [
          {
            taskId: "task-complete-evidence-alpha",
            coveragePath: "tasks.task-complete-evidence-alpha.covers.0"
          }
        ]
      },
      {
        acceptanceCriterionId: "ac_planning_admission_beta",
        acceptedCriterionPath: "acceptanceCriteria.1",
        coverageLinks: [
          {
            taskId: "task-complete-evidence-beta",
            coveragePath: "tasks.task-complete-evidence-beta.covers.0"
          }
        ]
      }
    ]);
  });

  it("keeps accepted admission evidence thin and leaves proof details in plan.json", () => {
    const graph = createPlanGraph({
      planId: "plan_planning_admission_artifact_thin",
      intent: admittedIntent,
      strategy: "Admit a plan whose proof details must stay in the PlanGraph.",
      tasks: [
        {
          id: "task-cover-admission-alpha",
          title: "Cover alpha without copying this title into admission evidence",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_planning_admission_alpha"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-cover-admission-beta",
          title: "Cover beta without copying this title into admission evidence",
          kind: "verification",
          dependsOn: ["task-cover-admission-alpha"],
          covers: ["ac_planning_admission_beta"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ],
      createdAt: "2026-04-26T00:00:00.000Z"
    });

    const artifact = createPlanningAdmissionArtifact({
      graph,
      intent: admittedIntent,
      admittedAt: "2026-04-26T01:02:03.000Z"
    });
    const serialized = JSON.stringify(artifact);
    const serializedArtifact = JSON.parse(serialized) as Record<string, unknown>;

    assert.equal(Object.hasOwn(artifact.details.validation, "violations"), false);
    assert.deepEqual(
      Object.keys(artifact).sort(),
      Object.keys(expectedAcceptedPlanningAdmissionPayload(graph, "2026-04-26T01:02:03.000Z")).sort()
    );
    assert.deepEqual(
      serializedArtifact,
      expectedAcceptedPlanningAdmissionPayload(graph, "2026-04-26T01:02:03.000Z")
    );
    assert.equal(Object.hasOwn(serializedArtifact, "details"), false);
    assert.equal(Object.hasOwn(serializedArtifact, "admittedPlan"), false);
    assert.equal(Object.hasOwn(serializedArtifact, "handoff"), false);
    assert.equal(serialized.includes("Alpha coverage is proven"), false);
    assert.equal(serialized.includes("Beta coverage is proven"), false);
    assert.equal(serialized.includes("Cover alpha without copying"), false);
    assert.equal(serialized.includes("Cover beta without copying"), false);
    assert.equal(serialized.includes("requiredCapabilities"), false);
    assert.equal(serialized.includes("dependsOn"), false);
    assert.equal(serialized.includes("strategy"), false);
  });

  it("hard-rejects invalid candidate plans with planning admission rejection evidence", () => {
    const acceptedCriteria = admittedIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
      id,
      statement,
      verification
    }));
    const invalidGraph = defineCandidatePlan({
      planId: "plan_planning_admission_artifact_rejection",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Attempt to create admission evidence for an invalid candidate plan.",
      acceptanceCriteria: acceptedCriteria,
      tasks: [
        {
          id: "task-empty-admission-coverage",
          title: "Omit coverage",
          kind: "verification",
          dependsOn: [],
          covers: [],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-missing-admission-dependency",
          title: "Depend on a missing task",
          kind: "verification",
          dependsOn: ["task-missing-admission"],
          covers: ["ac_planning_admission_beta"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ]
    } as unknown as PlanGraph);

    const artifact = createPlanningAdmissionArtifact({
      graph: invalidGraph,
      intent: admittedIntent
    });

    assert.equal(artifact.decision, "block");
    assert.equal(artifact.admissionStatus, "no-plan-admitted");
    assert.equal(artifact.admitted, false);
    assert.deepEqual(artifact.planningAttempt, {
      id: "planning-attempt:plan_planning_admission_artifact_rejection",
      candidatePlanId: "plan_planning_admission_artifact_rejection",
      intentId: admittedIntent.id,
      candidatePlanCreatedAt: "2026-04-26T00:00:00.000Z"
    });
    assert.deepEqual(artifact.candidateSource, {
      kind: "candidate-plan-graph",
      planId: "plan_planning_admission_artifact_rejection",
      uri: "plan.json",
      pointer: "#",
      createdAt: "2026-04-26T00:00:00.000Z",
      sourceOfTruth: "PlanGraph"
    });
    assert.deepEqual(artifact.candidatePlan, {
      planId: "plan_planning_admission_artifact_rejection",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      source: artifact.candidateSource
    });
    assert.deepEqual(artifact.details.gate, {
      planGraphValidationPassed: false,
      taskCapabilityRequirementsExtracted: false,
      taskRiskCompatibilityEvidenceAttached: true,
      acceptanceCriterionCoverageEvidenceAttached: false
    });
    assert.equal(artifact.details.validation.ok, false);
    assert.equal(artifact.details.validation.violationCount, 3);
    assert.deepEqual(artifact.details.releaseGrantAdmission, {
      decision: "allow",
      required: false,
      conditionCount: 0,
      rejectedConditionCount: 0,
      rejectionReasons: []
    });
    assert.deepEqual(artifact.details.failure, {
      state: "validation-failed",
      status: "no-plan-admitted",
      admittedPlanCreated: false,
      candidatePlan: {
        planId: "plan_planning_admission_artifact_rejection",
        intentId: admittedIntent.id,
        createdAt: "2026-04-26T00:00:00.000Z",
        source: {
          kind: "candidate-plan-graph",
          planId: "plan_planning_admission_artifact_rejection",
          uri: "plan.json",
          pointer: "#",
          createdAt: "2026-04-26T00:00:00.000Z",
          sourceOfTruth: "PlanGraph"
        }
      },
      violationCount: 3,
      rejectionReasons: expectedPlanningAdmissionRejectionReasons([
        {
          validator: "task-contracts",
          code: "empty-task-coverage",
          path: "tasks.task-empty-admission-coverage.covers",
          taskId: "task-empty-admission-coverage",
          message: "Task task-empty-admission-coverage must cover at least one acceptance criterion."
        },
        {
          validator: "task-contracts",
          code: "missing-task-dependency",
          path: "tasks.task-missing-admission-dependency.dependsOn.0",
          taskId: "task-missing-admission-dependency",
          dependency: "task-missing-admission",
          dependencyIndex: 0,
          message: "Task task-missing-admission-dependency depends on missing task task-missing-admission."
        },
        {
          validator: "acceptance-coverage",
          code: "uncovered-acceptance-criterion",
          path: "acceptanceCriteria",
          acceptanceCriterionId: "ac_planning_admission_alpha",
          message: "Acceptance criterion ac_planning_admission_alpha is not covered by any plan task."
        }
      ])
    });
    assert.deepEqual(
      artifact.errors,
      [
        "Task task-empty-admission-coverage must cover at least one acceptance criterion.",
        "Task task-missing-admission-dependency depends on missing task task-missing-admission.",
        "Acceptance criterion ac_planning_admission_alpha is not covered by any plan task."
      ]
    );
    assert.deepEqual(
      artifact.details.validation.violations?.map(({ code, path, taskId }) => ({ code, path, taskId })),
      [
        {
          code: "empty-task-coverage",
          path: "tasks.task-empty-admission-coverage.covers",
          taskId: "task-empty-admission-coverage"
        },
        {
          code: "missing-task-dependency",
          path: "tasks.task-missing-admission-dependency.dependsOn.0",
          taskId: "task-missing-admission-dependency"
        },
        {
          code: "uncovered-acceptance-criterion",
          path: "acceptanceCriteria",
          taskId: undefined
        }
      ]
    );
    assert.equal(Object.hasOwn(artifact, "admittedPlan"), false);
    assert.equal(Object.hasOwn(artifact.details, "taskCapabilityAdmissions"), false);
    assert.deepEqual(artifact.details.grantModel, planningAdmissionGrantModel);
    assert.deepEqual(artifact.details.taskRiskCompatibilityOutcomes, [
      {
        taskId: "task-empty-admission-coverage",
        declaredRisk: "low",
        requiredCapabilityRisk: "low",
        allowedRequiredCapabilityRisks: ["low"],
        outcome: "compatible"
      },
      {
        taskId: "task-missing-admission-dependency",
        declaredRisk: "low",
        requiredCapabilityRisk: "low",
        allowedRequiredCapabilityRisks: ["low"],
        outcome: "compatible"
      }
    ] satisfies readonly PlanningAdmissionTaskRiskCompatibilityEvidence[]);
    assert.equal(Object.hasOwn(artifact.details, "acceptanceCoverage"), false);
  });

  it("rejects plans with missing coverage evidence even when stale allow validation is supplied", () => {
    const fullyCoveredGraph = createPlanGraph({
      planId: "plan_planning_admission_stale_validation_source",
      intent: admittedIntent,
      strategy: "Produce a valid validation result that must not admit another candidate plan.",
      tasks: [
        {
          id: "task-stale-validation-alpha",
          title: "Cover alpha in the valid source plan",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_planning_admission_alpha"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-stale-validation-beta",
          title: "Cover beta in the valid source plan",
          kind: "verification",
          dependsOn: ["task-stale-validation-alpha"],
          covers: ["ac_planning_admission_beta"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ],
      createdAt: "2026-04-26T00:00:00.000Z"
    });
    const staleAllowValidation = validatePlanGraph({
      graph: fullyCoveredGraph,
      intent: admittedIntent
    });
    const candidateMissingCoverage = defineCandidatePlan({
      planId: "plan_planning_admission_missing_coverage_evidence",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Attempt to admit a candidate plan that leaves beta without coverage evidence.",
      acceptanceCriteria: admittedIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
        id,
        statement,
        verification
      })),
      tasks: [
        {
          id: "task-missing-evidence-alpha-only",
          title: "Cover only alpha",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_planning_admission_alpha"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ]
    } as const satisfies PlanGraph);

    assert.equal(staleAllowValidation.ok, true);
    assert.equal(staleAllowValidation.acceptanceCoverage.length, admittedIntent.acceptanceCriteria.length);

    const artifact = createPlanningAdmissionArtifact({
      graph: candidateMissingCoverage,
      intent: admittedIntent,
      validation: staleAllowValidation
    });

    assert.equal(artifact.decision, "block");
    assert.equal(artifact.admitted, false);
    assert.equal(Object.hasOwn(artifact.details, "acceptanceCoverage"), false);
    assert.equal(Object.hasOwn(artifact, "admittedPlan"), false);
    assert.deepEqual(artifact.details.grantModel, planningAdmissionGrantModel);
    assert.deepEqual(artifact.details.releaseGrantAdmission, {
      decision: "allow",
      required: false,
      conditionCount: 0,
      rejectedConditionCount: 0,
      rejectionReasons: []
    });
    assert.deepEqual(artifact.errors, [
      "Acceptance criterion ac_planning_admission_beta is not covered by any plan task."
    ]);
    assert.deepEqual(artifact.details.validation.violations, withAffectedPlanLocations([
      {
        validator: "acceptance-coverage",
        code: "uncovered-acceptance-criterion",
        path: "acceptanceCriteria",
        acceptanceCriterionId: "ac_planning_admission_beta",
        message: "Acceptance criterion ac_planning_admission_beta is not covered by any plan task."
      }
    ]));
  });

  it("produces planning-admission.json evidence for pass and fail cases with envelope, verdict, and rejection details", () => {
    const acceptedGraph = createPlanGraph({
      planId: "plan_planning_admission_evidence_pass_case",
      intent: admittedIntent,
      strategy: "Admit a plan and preserve envelope-derived planning admission evidence.",
      tasks: [
        {
          id: "task-pass-evidence-alpha",
          title: "Cover alpha for the pass evidence case",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_planning_admission_alpha"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-pass-evidence-beta",
          title: "Cover beta for the pass evidence case",
          kind: "verification",
          dependsOn: ["task-pass-evidence-alpha"],
          covers: ["ac_planning_admission_beta"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ],
      createdAt: "2026-04-26T00:00:00.000Z"
    });
    const rejectedGraph = defineCandidatePlan({
      planId: "plan_planning_admission_evidence_fail_case",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Reject a plan while preserving planning admission evidence.",
      acceptanceCriteria: admittedIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
        id,
        statement,
        verification
      })),
      tasks: [
        {
          id: "task-fail-evidence-alpha-only",
          title: "Cover alpha while leaving beta uncovered",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_planning_admission_alpha"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ]
    } as const satisfies PlanGraph);

    const acceptedArtifact = createPlanningAdmissionArtifact({
      graph: acceptedGraph,
      intent: admittedIntent,
      admittedAt: "2026-04-26T03:04:05.000Z"
    });
    const rejectedArtifact = createPlanningAdmissionArtifact({
      graph: rejectedGraph,
      intent: admittedIntent
    });
    const preAdmissionFailureArtifact = createPlanningPreAdmissionFailureArtifact({
      intent: admittedIntent,
      candidatePlanId: "plan_planning_admission_evidence_pre_admission_fail_case",
      attemptedAt: "2026-04-26T04:05:06.000Z",
      errors: ["candidate plan output was empty."]
    });
    const expectedRejectionReasons = expectedPlanningAdmissionRejectionReasons([
      {
        validator: "acceptance-coverage",
        code: "uncovered-acceptance-criterion",
        path: "acceptanceCriteria",
        acceptanceCriterionId: "ac_planning_admission_beta",
        message: "Acceptance criterion ac_planning_admission_beta is not covered by any plan task."
      }
    ]);

    assert.deepEqual(
      [acceptedArtifact, rejectedArtifact, preAdmissionFailureArtifact].map((artifact) => ({
        artifact: artifact.artifact,
        grantModel: artifact.details.grantModel,
        decision: artifact.decision,
        admissionStatus: artifact.admissionStatus,
        admitted: artifact.admitted
      })),
      [
        {
          artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
          grantModel: planningAdmissionGrantModel,
          decision: "allow",
          admissionStatus: "plan-admitted",
          admitted: true
        },
        {
          artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
          grantModel: planningAdmissionGrantModel,
          decision: "block",
          admissionStatus: "no-plan-admitted",
          admitted: false
        },
        {
          artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
          grantModel: planningAdmissionGrantModel,
          decision: "block",
          admissionStatus: "no-plan-admitted",
          admitted: false
        }
      ]
    );
    const serializedAcceptedArtifact = JSON.parse(JSON.stringify(acceptedArtifact)) as Record<string, unknown>;
    const serializedRejectedArtifact = JSON.parse(JSON.stringify(rejectedArtifact)) as typeof rejectedArtifact;
    const serializedPreAdmissionFailureArtifact = JSON.parse(
      JSON.stringify(preAdmissionFailureArtifact)
    ) as typeof preAdmissionFailureArtifact;

    assert.deepEqual(
      Object.keys(serializedAcceptedArtifact).sort(),
      Object.keys(expectedAcceptedPlanningAdmissionPayload(acceptedGraph, "2026-04-26T03:04:05.000Z")).sort()
    );
    assert.deepEqual(
      {
        schemaVersion: serializedAcceptedArtifact["schemaVersion"],
        artifact: serializedAcceptedArtifact["artifact"],
        decision: serializedAcceptedArtifact["decision"],
        admissionStatus: serializedAcceptedArtifact["admissionStatus"],
        status: serializedAcceptedArtifact["admitted"] === true ? "admitted" : "not-admitted",
        admitted: serializedAcceptedArtifact["admitted"],
        admittedAt: serializedAcceptedArtifact["admittedAt"],
        planningAttempt: serializedAcceptedArtifact["planningAttempt"],
        candidateSource: serializedAcceptedArtifact["candidateSource"],
        candidatePlan: serializedAcceptedArtifact["candidatePlan"],
        planId: serializedAcceptedArtifact["planId"],
        intentId: serializedAcceptedArtifact["intentId"],
        planHash: serializedAcceptedArtifact["plan_hash"],
        validatorsPassed: serializedAcceptedArtifact["validators_passed"],
        validatorVersions: serializedAcceptedArtifact["validator_versions"],
        errors: serializedAcceptedArtifact["errors"],
        hasFailureDetails: Object.hasOwn(serializedAcceptedArtifact, "details")
      },
      {
        schemaVersion: PLANNING_ADMISSION_SCHEMA_VERSION,
        artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
        decision: "allow",
        admissionStatus: "plan-admitted",
        status: "admitted",
        admitted: true,
        admittedAt: "2026-04-26T03:04:05.000Z",
        planningAttempt: {
          id: "planning-attempt:plan_planning_admission_evidence_pass_case",
          candidatePlanId: "plan_planning_admission_evidence_pass_case",
          intentId: admittedIntent.id,
          candidatePlanCreatedAt: "2026-04-26T00:00:00.000Z"
        },
        candidateSource: {
          kind: "candidate-plan-graph",
          planId: "plan_planning_admission_evidence_pass_case",
          uri: "plan.json",
          pointer: "#",
          createdAt: "2026-04-26T00:00:00.000Z",
          sourceOfTruth: "PlanGraph"
        },
        candidatePlan: {
          planId: "plan_planning_admission_evidence_pass_case",
          intentId: admittedIntent.id,
          createdAt: "2026-04-26T00:00:00.000Z",
          source: {
            kind: "candidate-plan-graph",
            planId: "plan_planning_admission_evidence_pass_case",
            uri: "plan.json",
            pointer: "#",
            createdAt: "2026-04-26T00:00:00.000Z",
            sourceOfTruth: "PlanGraph"
          }
        },
        planId: "plan_planning_admission_evidence_pass_case",
        intentId: admittedIntent.id,
        planHash: hashPlanGraph(acceptedGraph),
        validatorsPassed: [...PLAN_GRAPH_ADMISSION_VALIDATORS],
        validatorVersions: PLAN_GRAPH_ADMISSION_VALIDATOR_VERSIONS,
        errors: [],
        hasFailureDetails: false
      }
    );

    assert.equal(serializedRejectedArtifact.admitted, false);
    if (serializedRejectedArtifact.admitted) {
      throw new Error("Expected serialized validation-failed planning admission evidence.");
    }
    assert.equal(serializedPreAdmissionFailureArtifact.admitted, false);
    assert.deepEqual(
      [
        {
          status: "rejected",
          decision: serializedRejectedArtifact.decision,
          admissionStatus: serializedRejectedArtifact.admissionStatus,
          admitted: serializedRejectedArtifact.admitted,
          validator: serializedRejectedArtifact.details.validation.validator,
          validationOk: serializedRejectedArtifact.details.validation.ok,
          failureState: serializedRejectedArtifact.details.failure.state,
          failureStatus: serializedRejectedArtifact.details.failure.status,
          candidateSourceKind: serializedRejectedArtifact.candidateSource.kind,
          violationCount: serializedRejectedArtifact.details.failure.violationCount,
          rejectionReasonCount: serializedRejectedArtifact.details.failure.rejectionReasons.length,
          errors: serializedRejectedArtifact.errors
        },
        {
          status: "blocked",
          decision: serializedPreAdmissionFailureArtifact.decision,
          admissionStatus: serializedPreAdmissionFailureArtifact.admissionStatus,
          admitted: serializedPreAdmissionFailureArtifact.admitted,
          validator: serializedPreAdmissionFailureArtifact.details.validation.validator,
          validationOk: serializedPreAdmissionFailureArtifact.details.validation.ok,
          failureState: serializedPreAdmissionFailureArtifact.details.failure.state,
          failureStatus: serializedPreAdmissionFailureArtifact.details.failure.status,
          candidateSourceKind: serializedPreAdmissionFailureArtifact.candidateSource.kind,
          candidatePlanCreated: serializedPreAdmissionFailureArtifact.details.failure.candidatePlanCreated,
          violationCount: serializedPreAdmissionFailureArtifact.details.failure.violationCount,
          rejectionReasonCount: serializedPreAdmissionFailureArtifact.details.failure.rejectionReasons.length,
          errors: serializedPreAdmissionFailureArtifact.errors
        }
      ],
      [
        {
          status: "rejected",
          decision: "block",
          admissionStatus: "no-plan-admitted",
          admitted: false,
          validator: "validatePlanGraph",
          validationOk: false,
          failureState: "validation-failed",
          failureStatus: "no-plan-admitted",
          candidateSourceKind: "candidate-plan-graph",
          violationCount: expectedRejectionReasons.length,
          rejectionReasonCount: expectedRejectionReasons.length,
          errors: ["Acceptance criterion ac_planning_admission_beta is not covered by any plan task."]
        },
        {
          status: "blocked",
          decision: "block",
          admissionStatus: "no-plan-admitted",
          admitted: false,
          validator: "createCandidatePlanGraph",
          validationOk: false,
          failureState: "pre-admission-failed",
          failureStatus: "no-plan-admitted",
          candidateSourceKind: "planning-pile-result",
          candidatePlanCreated: false,
          violationCount: 1,
          rejectionReasonCount: 1,
          errors: ["candidate plan output was empty."]
        }
      ]
    );
    assert.equal(acceptedArtifact.details.validation.ok, true);
    assert.equal(Object.hasOwn(acceptedArtifact.details, "failure"), false);
    assert.equal(rejectedArtifact.admitted, false);
    if (rejectedArtifact.admitted) {
      throw new Error("Expected validation-failed planning admission evidence.");
    }
    assert.deepEqual(rejectedArtifact.details.failure.rejectionReasons, expectedRejectionReasons);
    assert.deepEqual(rejectedArtifact.details.validation.violations, withAffectedPlanLocations([
      {
        validator: "acceptance-coverage",
        code: "uncovered-acceptance-criterion",
        path: "acceptanceCriteria",
        acceptanceCriterionId: "ac_planning_admission_beta",
        message: "Acceptance criterion ac_planning_admission_beta is not covered by any plan task."
      }
    ]));
    assert.equal(Object.hasOwn(rejectedArtifact, "admittedPlan"), false);
    assert.deepEqual(preAdmissionFailureArtifact.details.failure.rejectionReasons, [
      {
        code: "candidate-plan-unavailable",
        path: "planningResult.output.0",
        message: "candidate plan output was empty."
      }
    ]);
    assert.equal(Object.hasOwn(preAdmissionFailureArtifact, "admittedPlan"), false);
  });

  it("serializes a blocked planning-admission.json when a candidate PlanGraph cannot be created", () => {
    const artifact = createPlanningPreAdmissionFailureArtifact({
      intent: admittedIntent,
      candidatePlanId: "plan_planning_pre_admission_unavailable",
      attemptedAt: "2026-04-26T02:03:04.000Z",
      candidateSourceUri: "planning-result.json",
      errors: [
        "strategy must be a non-empty string.",
        "tasks[0].requiredCapabilities must be provided in normalized capability-envelope shape."
      ]
    });

    assert.equal(artifact.schemaVersion, PLANNING_ADMISSION_SCHEMA_VERSION);
    assert.equal(artifact.artifact, PLANNING_ADMISSION_ARTIFACT_NAME);
    assert.equal(artifact.decision, "block");
    assert.equal(artifact.admissionStatus, "no-plan-admitted");
    assert.equal(artifact.admitted, false);
    assert.equal(Object.hasOwn(artifact, "admittedPlan"), false);
    assert.equal(Object.hasOwn(artifact, "handoff"), false);
    assert.deepEqual(artifact.planningAttempt, {
      id: "planning-attempt:plan_planning_pre_admission_unavailable",
      candidatePlanId: "plan_planning_pre_admission_unavailable",
      intentId: admittedIntent.id,
      candidatePlanCreatedAt: "2026-04-26T02:03:04.000Z"
    });
    assert.deepEqual(artifact.candidateSource, {
      kind: "planning-pile-result",
      uri: "planning-result.json",
      pointer: "#",
      sourceOfTruth: "PlanningPileResult"
    });
    assert.deepEqual(artifact.candidatePlan, {
      planId: "plan_planning_pre_admission_unavailable",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T02:03:04.000Z",
      candidatePlanCreated: false,
      source: {
        kind: "planning-pile-result",
        uri: "planning-result.json",
        pointer: "#",
        sourceOfTruth: "PlanningPileResult"
      }
    });
    assert.deepEqual(artifact.details.gate, {
      planGraphValidationPassed: false,
      candidatePlanCreated: false,
      taskCapabilityRequirementsExtracted: false,
      taskRiskCompatibilityEvidenceAttached: false,
      acceptanceCriterionCoverageEvidenceAttached: false
    });
    assert.deepEqual(artifact.details.validation, {
      validator: "createCandidatePlanGraph",
      ok: false,
      violationCount: 2,
      violations: [
        {
          code: "candidate-plan-unavailable",
          path: "planningResult.output.0",
          message: "strategy must be a non-empty string."
        },
        {
          code: "candidate-plan-unavailable",
          path: "planningResult.output.1",
          message: "tasks[0].requiredCapabilities must be provided in normalized capability-envelope shape."
        }
      ],
      capabilityViolationDiagnostics: []
    });
    assert.deepEqual(artifact.details.failure, {
      state: "pre-admission-failed",
      status: "no-plan-admitted",
      admittedPlanCreated: false,
      candidatePlanCreated: false,
      candidatePlanId: "plan_planning_pre_admission_unavailable",
      intentId: admittedIntent.id,
      candidateSource: artifact.candidateSource,
      violationCount: 2,
      rejectionReasons: artifact.details.validation.violations
    });
    assert.deepEqual(artifact.errors, [
      "strategy must be a non-empty string.",
      "tasks[0].requiredCapabilities must be provided in normalized capability-envelope shape."
    ]);
  });
});

async function withTempDir(callback: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(resolve(tmpdir(), "protostar-planning-admission-"));

  try {
    await callback(directory);
  } finally {
    await rm(directory, {
      recursive: true,
      force: true
    });
  }
}

function expectedAcceptedPlanningAdmissionPayload(graph: PlanGraph, admittedAt: string): Record<string, unknown> {
  const candidateSource = {
    kind: "candidate-plan-graph",
    planId: graph.planId,
    uri: "plan.json",
    pointer: "#",
    createdAt: graph.createdAt,
    sourceOfTruth: "PlanGraph"
  };

  return {
    schemaVersion: PLANNING_ADMISSION_SCHEMA_VERSION,
    artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
    decision: "allow",
    admissionStatus: "plan-admitted",
    admitted: true,
    admittedAt,
    planningAttempt: {
      id: `planning-attempt:${graph.planId}`,
      candidatePlanId: graph.planId,
      intentId: admittedIntent.id,
      candidatePlanCreatedAt: graph.createdAt
    },
    candidateSource,
    candidatePlan: {
      planId: graph.planId,
      intentId: graph.intentId,
      createdAt: graph.createdAt,
      source: candidateSource
    },
    planId: graph.planId,
    intentId: graph.intentId,
    plan_hash: hashPlanGraph(graph),
    validators_passed: [...PLAN_GRAPH_ADMISSION_VALIDATORS],
    validator_versions: PLAN_GRAPH_ADMISSION_VALIDATOR_VERSIONS,
    errors: []
  };
}
