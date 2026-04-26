import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { defineConfirmedIntent } from "@protostar/intent";

import {
  createPlanningAdmissionArtifact,
  defineCandidatePlan,
  PLAN_GRAPH_ADMISSION_VALIDATORS,
  PLANNING_ADMISSION_ARTIFACT_NAME,
  PLANNING_ADMISSION_SCHEMA_VERSION,
  validatePlanGraph,
  type PlanGraph,
  type PlanGraphValidationViolation,
  type PlanningAdmissionRejectedArtifactPayload,
  type PlanningCapabilityViolationDiagnostic,
  type PlanTaskRequiredCapabilities
} from "./index.js";
import { withAffectedPlanLocations } from "./test-support.js";

const admittedIntent = defineConfirmedIntent({
  id: "intent_planning_admission_evidence",
  title: "Record planning admission evidence",
  problem:
    "The planning package must reject bad candidate plans while preserving durable planning-admission.json evidence.",
  requester: "ouroboros-ac-30104",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_all_task_checking",
      statement: "Planning admission checks every task before returning rejection evidence.",
      verification: "test"
    },
    {
      id: "ac_missing_capability_rejection",
      statement: "Planning admission rejects tasks that omit required capability declarations.",
      verification: "test"
    },
    {
      id: "ac_exceeding_capability_rejection",
      statement: "Planning admission rejects tasks whose required capabilities exceed the confirmed intent envelope.",
      verification: "test"
    },
    {
      id: "ac_planning_admission_json_rejection_evidence",
      statement: "Rejected candidate plans produce planning-admission.json evidence with every validation error.",
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
        reason: "Run focused planning admission evidence tests.",
        risk: "low"
      },
      {
        tool: "shell",
        reason: "Exercise rejected high-risk planning task outcome fixtures.",
        risk: "high"
      }
    ],
    executeGrants: [
      {
        command: "pnpm --filter @protostar/planning test",
        scope: "packages/planning",
        reason: "Run the focused planning package test gate."
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: [
    "Planning admission must collect all validator defects in one pass and hard-reject without repair."
  ]
});

const acceptedCriteria = admittedIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
  id,
  statement,
  verification
}));

const admittedTaskCapabilities = {
  repoScopes: [
    {
      workspace: "protostar",
      path: "packages/planning/src",
      access: "read"
    }
  ],
  toolPermissions: [
    {
      tool: "node:test",
      permissionLevel: "use",
      reason: "Run focused planning admission evidence tests.",
      risk: "low"
    }
  ],
  executeGrants: [
    {
      command: "pnpm --filter @protostar/planning test",
      scope: "packages/planning",
      reason: "Run the focused planning package test gate."
    }
  ],
  budget: {
    timeoutMs: 30_000,
    maxRepairLoops: 0
  }
} as const satisfies PlanTaskRequiredCapabilities;

const highRiskTaskCapabilities = {
  repoScopes: [],
  toolPermissions: [
    {
      tool: "shell",
      reason: "Exercise rejected high-risk planning task outcome fixtures.",
      risk: "high"
    }
  ],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

const multiValidatorRejectedCandidatePlan = defineCandidatePlan({
  planId: "plan_planning_admission_collect_all_validators",
  intentId: "intent_wrong_planning_admission_collect_all",
  createdAt: "2026-04-26T00:00:00.000Z",
  strategy:
    "Combine independent intent, task-contract, coverage, and dependency-cycle defects in one admission attempt.",
  acceptanceCriteria: acceptedCriteria,
  tasks: [
    {
      id: "task-empty-contract-coverage",
      title: "Trip the task contract validator without blocking later validators",
      kind: "verification",
      dependsOn: [],
      covers: [],
      requiredCapabilities: noRequiredCapabilities,
      risk: "low"
    },
    {
      id: "task-cycle-alpha",
      title: "Cover one AC while participating in a cycle",
      kind: "verification",
      dependsOn: ["task-cycle-beta"],
      covers: ["ac_missing_capability_rejection"],
      requiredCapabilities: noRequiredCapabilities,
      risk: "low"
    },
    {
      id: "task-cycle-beta",
      title: "Cover another AC while completing the cycle",
      kind: "verification",
      dependsOn: ["task-cycle-alpha"],
      covers: ["ac_exceeding_capability_rejection"],
      requiredCapabilities: noRequiredCapabilities,
      risk: "low"
    },
    {
      id: "task-cycle-gamma",
      title: "Start a transitive dependency cycle",
      kind: "verification",
      dependsOn: ["task-cycle-delta"],
      covers: ["ac_missing_capability_rejection"],
      requiredCapabilities: noRequiredCapabilities,
      risk: "low"
    },
    {
      id: "task-cycle-delta",
      title: "Continue a transitive dependency cycle",
      kind: "verification",
      dependsOn: ["task-cycle-epsilon"],
      covers: ["ac_exceeding_capability_rejection"],
      requiredCapabilities: noRequiredCapabilities,
      risk: "low"
    },
    {
      id: "task-cycle-epsilon",
      title: "Complete a transitive dependency cycle",
      kind: "verification",
      dependsOn: ["task-cycle-gamma"],
      covers: ["ac_missing_capability_rejection"],
      requiredCapabilities: noRequiredCapabilities,
      risk: "low"
    }
  ]
} as unknown as PlanGraph);

const rejectedCandidatePlan = defineCandidatePlan({
  planId: "plan_planning_admission_evidence_rejection",
  intentId: admittedIntent.id,
  createdAt: "2026-04-26T00:00:00.000Z",
  strategy:
    "Attempt to admit a candidate plan with one valid task, one missing capability declaration, and one authority overage.",
  acceptanceCriteria: acceptedCriteria,
  tasks: [
    {
      id: "task-admitted-capabilities",
      title: "Keep one task valid while later tasks fail admission",
      kind: "verification",
      dependsOn: [],
      covers: ["ac_all_task_checking"],
      requiredCapabilities: admittedTaskCapabilities,
      risk: "low"
    },
    {
      id: "task-missing-required-capabilities",
      title: "Omit task required capabilities",
      kind: "implementation",
      dependsOn: ["task-admitted-capabilities"],
      covers: ["ac_missing_capability_rejection"],
      risk: "low"
    },
    {
      id: "task-exceed-intent-envelope",
      title: "Require authority outside the confirmed intent envelope",
      kind: "implementation",
      dependsOn: ["task-admitted-capabilities"],
      covers: ["ac_exceeding_capability_rejection", "ac_planning_admission_json_rejection_evidence"],
      requiredCapabilities: {
        repoScopes: [
          {
            workspace: "protostar",
            path: "packages/execution",
            access: "write"
          }
        ],
        toolPermissions: [
          {
            tool: "node:test",
            permissionLevel: "admin",
            reason: "Escalate beyond the admitted test runner permission.",
            risk: "low"
          }
        ],
        budget: {
          timeoutMs: 60_000,
          maxRepairLoops: 0
        }
      },
      risk: "low"
    }
  ]
} as unknown as PlanGraph);

const expectedAdmissionViolations: readonly PlanGraphValidationViolation[] = withAffectedPlanLocations([
  {
    validator: "task-contracts",
    code: "missing-task-required-capabilities",
    path: "tasks.task-missing-required-capabilities.requiredCapabilities",
    taskId: "task-missing-required-capabilities",
    message:
      "Task task-missing-required-capabilities requiredCapabilities must be provided in normalized capability-envelope shape."
  },
  {
    validator: "task-contracts",
    code: "task-required-repo-scope-outside-intent-envelope",
    path: "tasks.task-exceed-intent-envelope.requiredCapabilities.repoScopes.0",
    taskId: "task-exceed-intent-envelope",
    message:
      "Task task-exceed-intent-envelope requires repo scope protostar:packages/execution:write outside confirmed intent capability envelope."
  },
  {
    validator: "task-contracts",
    code: "task-required-tool-permission-outside-intent-envelope",
    path: "tasks.task-exceed-intent-envelope.requiredCapabilities.toolPermissions.0",
    taskId: "task-exceed-intent-envelope",
    message:
      "Task task-exceed-intent-envelope requires tool permission node:test (admin, low) outside confirmed intent capability envelope."
  },
  {
    validator: "task-contracts",
    code: "task-required-budget-outside-intent-envelope",
    path: "tasks.task-exceed-intent-envelope.requiredCapabilities.budget.timeoutMs",
    taskId: "task-exceed-intent-envelope",
    message:
      "Task task-exceed-intent-envelope requires budget timeoutMs=60000 outside confirmed intent capability envelope."
  }
]);

const expectedCapabilityViolationDiagnostics: readonly PlanningCapabilityViolationDiagnostic[] = [
  {
    taskId: "task-missing-required-capabilities",
    violatedRule: "missing-task-required-capabilities",
    capabilityPath: "tasks.task-missing-required-capabilities.requiredCapabilities",
    severity: "block",
    message:
      "Task task-missing-required-capabilities requiredCapabilities must be provided in normalized capability-envelope shape."
  },
  {
    taskId: "task-exceed-intent-envelope",
    violatedRule: "task-required-repo-scope-outside-intent-envelope",
    capabilityPath: "tasks.task-exceed-intent-envelope.requiredCapabilities.repoScopes.0",
    severity: "block",
    message:
      "Task task-exceed-intent-envelope requires repo scope protostar:packages/execution:write outside confirmed intent capability envelope."
  },
  {
    taskId: "task-exceed-intent-envelope",
    violatedRule: "task-required-tool-permission-outside-intent-envelope",
    capabilityPath: "tasks.task-exceed-intent-envelope.requiredCapabilities.toolPermissions.0",
    severity: "block",
    message:
      "Task task-exceed-intent-envelope requires tool permission node:test (admin, low) outside confirmed intent capability envelope."
  },
  {
    taskId: "task-exceed-intent-envelope",
    violatedRule: "task-required-budget-outside-intent-envelope",
    capabilityPath: "tasks.task-exceed-intent-envelope.requiredCapabilities.budget.timeoutMs",
    severity: "block",
    message:
      "Task task-exceed-intent-envelope requires budget timeoutMs=60000 outside confirmed intent capability envelope."
  }
];

describe("planning-admission.json rejection evidence", () => {
  it("checks all tasks before rejecting missing and exceeding capability requirements", () => {
    const validation = validatePlanGraph({
      graph: rejectedCandidatePlan,
      intent: admittedIntent
    });

    assert.equal(validation.ok, false);
    assert.deepEqual(validation.violations, expectedAdmissionViolations);
    assert.deepEqual(
      validation.errors,
      expectedAdmissionViolations.map((violation) => violation.message)
    );
    assert.deepEqual(validation.capabilityViolationDiagnostics, expectedCapabilityViolationDiagnostics);
    assert.deepEqual(validation.taskRiskCompatibilityOutcomes, [
      {
        taskId: "task-admitted-capabilities",
        declaredRisk: "low",
        requiredCapabilityRisk: "low",
        allowedRequiredCapabilityRisks: ["low"],
        outcome: "compatible"
      },
      {
        taskId: "task-missing-required-capabilities",
        declaredRisk: "low",
        allowedRequiredCapabilityRisks: ["low"],
        outcome: "not-evaluable",
        blockingViolationCodes: ["missing-task-required-capabilities"],
        reason:
          "Task task-missing-required-capabilities risk compatibility could not be evaluated because required capabilities are not admissible."
      },
      {
        taskId: "task-exceed-intent-envelope",
        declaredRisk: "low",
        requiredCapabilityRisk: "low",
        allowedRequiredCapabilityRisks: ["low"],
        outcome: "compatible"
      }
    ]);
    assert.deepEqual(
      validation.violations.map((violation) => violation.taskId),
      [
        "task-missing-required-capabilities",
        "task-exceed-intent-envelope",
        "task-exceed-intent-envelope",
        "task-exceed-intent-envelope"
      ]
    );
    assert.deepEqual(
      validation.taskCapabilityRequirements,
      [],
      "Rejected plans must not export task capability requirements for execution."
    );
  });

  it("runs every registered admission validator before aggregating candidate-plan violations", () => {
    const validation = validatePlanGraph({
      graph: multiValidatorRejectedCandidatePlan,
      intent: admittedIntent
    });
    const countFor = (validator: (typeof PLAN_GRAPH_ADMISSION_VALIDATORS)[number]): number =>
      validation.registeredValidatorRuns.find((run) => run.validator === validator)?.violationCount ?? -1;

    assert.equal(validation.ok, false);
    assert.deepEqual(
      validation.registeredValidatorRuns.map((run) => run.validator),
      [...PLAN_GRAPH_ADMISSION_VALIDATORS]
    );
    assert.equal(countFor("intent-match"), 1);
    assert.equal(countFor("accepted-criteria"), 0);
    assert.equal(countFor("task-identity"), 0);
    assert.equal(countFor("task-contracts"), 1);
    assert.equal(countFor("pre-handoff-verification"), 0);
    assert.equal(countFor("release-grant-task"), 0);
    assert.equal(countFor("acceptance-coverage"), 2);
    assert.equal(countFor("immediate-dependency-cycles") > 0, true);
    assert.equal(countFor("transitive-dependency-cycles") > 0, true);
    assert.equal(countFor("dependency-cycle-summary"), 1);
    assert.deepEqual(
      validation.violations.map((violation) => violation.code),
      [
        "intent-mismatch",
        "empty-task-coverage",
        "uncovered-acceptance-criterion",
        "uncovered-acceptance-criterion",
        "dependency-cycle",
        "dependency-cycle",
        "dependency-cycle",
        "dependency-cycle"
      ]
    );
  });

  it("serializes every violation from a candidate plan that fails multiple validators", () => {
    const validation = validatePlanGraph({
      graph: multiValidatorRejectedCandidatePlan,
      intent: admittedIntent
    });
    const artifact = createPlanningAdmissionArtifact({
      graph: multiValidatorRejectedCandidatePlan,
      intent: admittedIntent
    });
    const persistedArtifact = JSON.parse(JSON.stringify(artifact)) as PlanningAdmissionRejectedArtifactPayload;
    const failedValidators = new Set(
      validation.registeredValidatorRuns
        .filter((run) => run.violationCount > 0)
        .map((run) => run.validator)
    );

    assert.equal(validation.ok, false);
    assert.deepEqual([...failedValidators], [
      "intent-match",
      "task-contracts",
      "acceptance-coverage",
      "immediate-dependency-cycles",
      "transitive-dependency-cycles",
      "dependency-cycle-summary"
    ]);
    assert.equal(artifact.admitted, false);
    if (artifact.admitted) {
      assert.fail("Expected multi-validator candidate plan to be rejected.");
    }
    assert.equal(artifact.artifact, PLANNING_ADMISSION_ARTIFACT_NAME);
    assert.equal(artifact.decision, "block");
    assert.equal(artifact.details.validation.violationCount, validation.violations.length);
    assert.deepEqual(artifact.details.validation.violations, validation.violations);
    assert.deepEqual(
      artifact.details.failure.rejectionReasons,
      validation.violations.map(({
        validator,
        code,
        path,
        affectedPlanLocation,
        message,
        taskId,
        acceptanceCriterionId
      }) => ({
        validator,
        code,
        path,
        affectedPlanLocation,
        message,
        ...(taskId !== undefined ? { taskId } : {}),
        ...(acceptanceCriterionId !== undefined ? { acceptanceCriterionId } : {})
      }))
    );
    assert.deepEqual(
      persistedArtifact.details.validation.violations,
      validation.violations,
      "Serialized planning-admission.json must preserve every collected validator violation."
    );
    assert.deepEqual(persistedArtifact.errors, validation.violations.map((violation) => violation.message));
    assert.equal(hasOwn(persistedArtifact, "admittedPlan"), false);
  });

  it("serializes planning-admission.json rejection evidence with every collected violation", () => {
    const validation = validatePlanGraph({
      graph: rejectedCandidatePlan,
      intent: admittedIntent
    });

    const artifact = createPlanningAdmissionArtifact({
      graph: rejectedCandidatePlan,
      intent: admittedIntent,
      validation
    });
    const persistedArtifact = JSON.parse(JSON.stringify(artifact)) as PlanningAdmissionRejectedArtifactPayload;

    assert.deepEqual(artifact, {
      schemaVersion: PLANNING_ADMISSION_SCHEMA_VERSION,
      artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
      decision: "block",
      admissionStatus: "no-plan-admitted",
      admitted: false,
      planningAttempt: {
        id: "planning-attempt:plan_planning_admission_evidence_rejection",
        candidatePlanId: "plan_planning_admission_evidence_rejection",
        intentId: admittedIntent.id,
        candidatePlanCreatedAt: "2026-04-26T00:00:00.000Z"
      },
      candidateSource: {
        kind: "candidate-plan-graph",
        planId: "plan_planning_admission_evidence_rejection",
        uri: "plan.json",
        pointer: "#",
        createdAt: "2026-04-26T00:00:00.000Z",
        sourceOfTruth: "PlanGraph"
      },
      candidatePlan: {
        planId: "plan_planning_admission_evidence_rejection",
        intentId: admittedIntent.id,
        createdAt: "2026-04-26T00:00:00.000Z",
        source: {
          kind: "candidate-plan-graph",
          planId: "plan_planning_admission_evidence_rejection",
          uri: "plan.json",
          pointer: "#",
          createdAt: "2026-04-26T00:00:00.000Z",
          sourceOfTruth: "PlanGraph"
        }
      },
      planId: "plan_planning_admission_evidence_rejection",
      intentId: admittedIntent.id,
      details: {
        gate: {
          planGraphValidationPassed: false,
          taskCapabilityRequirementsExtracted: false,
          taskRiskCompatibilityEvidenceAttached: true,
          acceptanceCriterionCoverageEvidenceAttached: false
        },
        validation: {
          validator: "validatePlanGraph",
          ok: false,
          violationCount: expectedAdmissionViolations.length,
          violations: expectedAdmissionViolations,
          capabilityViolationDiagnostics: expectedCapabilityViolationDiagnostics
        },
        grantModel: {
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
        },
        taskRiskCompatibilityOutcomes: [
          {
            taskId: "task-admitted-capabilities",
            declaredRisk: "low",
            requiredCapabilityRisk: "low",
            allowedRequiredCapabilityRisks: ["low"],
            outcome: "compatible"
          },
          {
            taskId: "task-missing-required-capabilities",
            declaredRisk: "low",
            allowedRequiredCapabilityRisks: ["low"],
            outcome: "not-evaluable",
            blockingViolationCodes: ["missing-task-required-capabilities"],
            reason:
              "Task task-missing-required-capabilities risk compatibility could not be evaluated because required capabilities are not admissible."
          },
          {
            taskId: "task-exceed-intent-envelope",
            declaredRisk: "low",
            requiredCapabilityRisk: "low",
            allowedRequiredCapabilityRisks: ["low"],
            outcome: "compatible"
          }
        ],
        releaseGrantAdmission: {
          decision: "allow",
          required: false,
          conditionCount: 0,
          rejectedConditionCount: 0,
          rejectionReasons: []
        },
        failure: {
          state: "validation-failed",
          status: "no-plan-admitted",
          admittedPlanCreated: false,
          candidatePlan: {
            planId: "plan_planning_admission_evidence_rejection",
            intentId: admittedIntent.id,
            createdAt: "2026-04-26T00:00:00.000Z",
            source: {
              kind: "candidate-plan-graph",
              planId: "plan_planning_admission_evidence_rejection",
              uri: "plan.json",
              pointer: "#",
              createdAt: "2026-04-26T00:00:00.000Z",
              sourceOfTruth: "PlanGraph"
            }
          },
          violationCount: expectedAdmissionViolations.length,
          rejectionReasons: expectedAdmissionViolations.map(({
            validator,
            code,
            path,
            affectedPlanLocation,
            message,
            taskId
          }) => ({
            validator,
            code,
            path,
            affectedPlanLocation,
            message,
            ...(taskId !== undefined ? { taskId } : {})
          }))
        }
      },
      errors: expectedAdmissionViolations.map((violation) => violation.message)
    });
    assert.equal(hasOwn(artifact.details.validation, "taskCapabilityRequirements"), false);
    assert.equal(hasOwn(artifact.details, "taskCapabilityAdmissions"), false);
    assert.equal(hasOwn(artifact.details.validation, "tasks"), false);
    assert.equal(hasOwn(artifact.details.validation, "acceptanceCriteria"), false);
    if (persistedArtifact.admitted) {
      throw new Error("Expected serialized planning-admission.json rejection evidence.");
    }
    assert.deepEqual(persistedArtifact.details.validation.violations, expectedAdmissionViolations);
    assert.deepEqual(
      persistedArtifact.details.failure.rejectionReasons,
      expectedAdmissionViolations.map(({
        validator,
        code,
        path,
        affectedPlanLocation,
        message,
        taskId
      }) => ({
        validator,
        code,
        path,
        affectedPlanLocation,
        message,
        ...(taskId !== undefined ? { taskId } : {})
      }))
    );
    assert.deepEqual(
      persistedArtifact.errors,
      expectedAdmissionViolations.map((violation) => violation.message)
    );
  });

  it("blocks capability overreach before execution handoff evidence can be emitted", () => {
    const graph = defineCandidatePlan({
      planId: "plan_planning_capability_overreach_pre_handoff_rejection",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Attempt to turn an overbroad repo write requirement into execution handoff authority.",
      acceptanceCriteria: acceptedCriteria,
      tasks: [
        {
          id: "task-overreach-before-execution-handoff",
          title: "Overreach beyond the admitted repository envelope",
          kind: "implementation",
          dependsOn: [],
          covers: [
            "ac_all_task_checking",
            "ac_missing_capability_rejection",
            "ac_exceeding_capability_rejection",
            "ac_planning_admission_json_rejection_evidence"
          ],
          requiredCapabilities: {
            repoScopes: [
              {
                workspace: "protostar",
                path: "packages/execution",
                access: "write"
              }
            ],
            toolPermissions: [
              {
                tool: "node:test",
                permissionLevel: "execute",
                reason: "Run the focused planning admission evidence tests.",
                risk: "low"
              }
            ],
            executeGrants: [
              {
                command: "pnpm --filter @protostar/planning test",
                scope: "packages/planning",
                reason: "Run the focused planning package test gate."
              }
            ],
            budget: {
              timeoutMs: 30_000,
              maxRepairLoops: 0
            }
          },
          risk: "low"
        }
      ]
    } as unknown as PlanGraph);

    const validation = validatePlanGraph({
      graph,
      intent: admittedIntent
    });
    const artifact = createPlanningAdmissionArtifact({
      graph,
      intent: admittedIntent
    });

    assert.equal(validation.ok, false);
    assert.deepEqual(
      validation.violations.map(({ code, path, taskId, message }) => ({ code, path, taskId, message })),
      [
        {
          code: "task-required-repo-scope-outside-intent-envelope",
          path: "tasks.task-overreach-before-execution-handoff.requiredCapabilities.repoScopes.0",
          taskId: "task-overreach-before-execution-handoff",
          message:
            "Task task-overreach-before-execution-handoff requires repo scope protostar:packages/execution:write outside confirmed intent capability envelope."
        },
        {
          code: "verification_required_by_envelope",
          path: "tasks.task-overreach-before-execution-handoff.dependsOn",
          taskId: "task-overreach-before-execution-handoff",
          message:
            "Task task-overreach-before-execution-handoff requires write authority for execution handoff and must depend on an explicit verification task before admission."
        }
      ]
    );
    assert.deepEqual(validation.taskCapabilityRequirements, []);
    assert.deepEqual(validation.taskCapabilityAdmissions, []);
    assert.deepEqual(validation.preHandoffVerificationTriggers, []);

    assert.equal(artifact.artifact, PLANNING_ADMISSION_ARTIFACT_NAME);
    assert.equal(artifact.decision, "block");
    assert.equal(artifact.admitted, false);
    assert.equal(artifact.details.validation.violationCount, 2);
    assert.deepEqual(
      artifact.details.validation.violations.map(({ code, path, taskId, message }) => ({
        code,
        path,
        taskId,
        message
      })),
      validation.violations.map(({ code, path, taskId, message }) => ({
        code,
        path,
        taskId,
        message
      }))
    );
    assert.deepEqual(artifact.errors, validation.errors);
    assert.equal(hasOwn(artifact, "admittedPlan"), false);
    assert.equal(hasOwn(artifact.details, "taskCapabilityAdmissions"), false);
    assert.equal(hasOwn(artifact.details, "preHandoffVerificationTriggers"), false);
    assert.equal(hasOwn(artifact.details, "acceptanceCoverage"), false);
  });

  it("serializes planning-admission.json with compatible and rejected task outcomes", () => {
    const graph = defineCandidatePlan({
      planId: "plan_planning_admission_task_outcome_evidence",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Emit task-level planning admission outcomes before blocking rejected candidate tasks.",
      acceptanceCriteria: acceptedCriteria,
      tasks: [
        {
          id: "task-compatible-admission-outcome",
          title: "Keep one candidate task compatible",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_all_task_checking"],
          requiredCapabilities: admittedTaskCapabilities,
          risk: "low"
        },
        {
          id: "task-rejected-admission-outcome",
          title: "Reject a candidate task that undersells required capability risk",
          kind: "implementation",
          dependsOn: ["task-compatible-admission-outcome"],
          covers: [
            "ac_missing_capability_rejection",
            "ac_exceeding_capability_rejection",
            "ac_planning_admission_json_rejection_evidence"
          ],
          requiredCapabilities: highRiskTaskCapabilities,
          risk: "low"
        }
      ]
    } as unknown as PlanGraph);

    const artifact = createPlanningAdmissionArtifact({
      graph,
      intent: admittedIntent
    });

    assert.equal(artifact.artifact, PLANNING_ADMISSION_ARTIFACT_NAME);
    assert.equal(artifact.decision, "block");
    assert.equal(artifact.admitted, false);
    assert.deepEqual(
      artifact.details.validation.violations.map(({ code, path, taskId, declaredRisk, requiredRisk }) => ({
        code,
        path,
        taskId,
        declaredRisk,
        requiredRisk
      })),
      [
        {
          code: "task-risk-below-required-capability-risk",
          path: "tasks.task-rejected-admission-outcome.risk",
          taskId: "task-rejected-admission-outcome",
          declaredRisk: "low",
          requiredRisk: "high"
        }
      ]
    );
    assert.deepEqual(artifact.details.taskRiskCompatibilityOutcomes, [
      {
        taskId: "task-compatible-admission-outcome",
        declaredRisk: "low",
        requiredCapabilityRisk: "low",
        allowedRequiredCapabilityRisks: ["low"],
        outcome: "compatible"
      },
      {
        taskId: "task-rejected-admission-outcome",
        declaredRisk: "low",
        requiredCapabilityRisk: "high",
        allowedRequiredCapabilityRisks: ["low"],
        outcome: "incompatible"
      }
    ]);
    assert.deepEqual(
      artifact.details.taskRiskCompatibilityOutcomes.map(({ taskId, outcome }) => ({ taskId, outcome })),
      [
        {
          taskId: "task-compatible-admission-outcome",
          outcome: "compatible"
        },
        {
          taskId: "task-rejected-admission-outcome",
          outcome: "incompatible"
        }
      ]
    );
    assert.equal(hasOwn(artifact, "admittedPlan"), false);
    assert.equal(hasOwn(artifact.details, "taskCapabilityAdmissions"), false);
  });
});

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
