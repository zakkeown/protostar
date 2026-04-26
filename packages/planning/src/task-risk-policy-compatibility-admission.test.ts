import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { defineConfirmedIntent } from "@protostar/intent";

import {
  createPlanningAdmissionArtifact,
  createPlanGraph,
  defineCandidatePlan,
  PLAN_TASK_RISK_COMPATIBILITY_RULES,
  PLANNING_ADMISSION_ARTIFACT_NAME,
  PLANNING_ADMISSION_SCHEMA_VERSION,
  validatePlanGraph,
  type PlanGraph,
  type PlanGraphValidationViolation,
  type PlanTask,
  type PlanTaskRequiredCapabilities,
  type PlanTaskRiskDeclaration
} from "./index.js";

const toolByRisk = {
  low: "node:test",
  medium: "typescript",
  high: "shell"
} as const satisfies Record<PlanTaskRiskDeclaration, string>;

const admittedIntent = defineConfirmedIntent({
  id: "intent_planning_task_risk_policy_compatibility",
  title: "Reject task risk declarations that undersell required capability risk",
  problem:
    "Execution must be able to trust a plan task risk declaration without re-deriving authority from task capabilities.",
  requester: "ouroboros-ac-40101",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_task_risk_policy_compatibility",
      statement:
        "Candidate plan task risk declarations are policy-compatible with their required capability-envelope risk.",
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
        tool: toolByRisk.low,
        reason: "Run low-risk planning admission tests.",
        risk: "low"
      },
      {
        tool: toolByRisk.medium,
        reason: "Run medium-risk planning type checks.",
        risk: "medium"
      },
      {
        tool: toolByRisk.high,
        reason: "Exercise high-risk policy compatibility fixtures.",
        risk: "high"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: [
    "Plan task risk compatibility must reuse the capability-envelope risk model from policy."
  ]
});

const acceptedCriteria = admittedIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
  id,
  statement,
  verification
}));

describe("PlanGraph task risk policy compatibility admission boundary", () => {
  it("defines explicit compatibility rules for every supported policy task risk level", () => {
    assert.deepEqual(Object.keys(PLAN_TASK_RISK_COMPATIBILITY_RULES).sort(), ["high", "low", "medium"]);
    assert.deepEqual(PLAN_TASK_RISK_COMPATIBILITY_RULES.low.allowedRequiredCapabilityRisks, ["low"]);
    assert.deepEqual(PLAN_TASK_RISK_COMPATIBILITY_RULES.medium.allowedRequiredCapabilityRisks, ["low", "medium"]);
    assert.deepEqual(PLAN_TASK_RISK_COMPATIBILITY_RULES.high.allowedRequiredCapabilityRisks, [
      "low",
      "medium",
      "high"
    ]);
  });

  it("admits each supported compatible-risk candidate plan through the planning boundary", () => {
    const graph = createPlanGraph({
      planId: "plan_task_risk_policy_compatibility",
      intent: admittedIntent,
      strategy: "Admit tasks whose declared risk covers their highest required capability risk.",
      tasks: [
        compatibleTask("task-low-compatible-risk", "low", "low"),
        compatibleTask("task-medium-compatible-risk", "medium", "medium"),
        compatibleTask("task-high-compatible-risk", "high", "high")
      ],
      createdAt: "2026-04-26T00:00:00.000Z"
    });

    const validation = validatePlanGraph({
      graph,
      intent: admittedIntent
    });
    const artifact = createPlanningAdmissionArtifact({
      graph,
      intent: admittedIntent,
      planGraphUri: "plan-compatible-risk.json"
    });

    assert.equal(validation.ok, true);
    assert.deepEqual(validation.violations, []);
    assert.deepEqual(validation.errors, []);
    assert.equal(artifact.artifact, PLANNING_ADMISSION_ARTIFACT_NAME);
    assert.equal(artifact.decision, "allow");
    assert.equal(artifact.admitted, true);
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
    assert.deepEqual(artifact.admittedPlan, {
      planId: graph.planId,
      uri: "plan-compatible-risk.json",
      pointer: "#",
      sourceOfTruth: "PlanGraph"
    });
    assert.deepEqual(artifact.errors, []);
    assert.deepEqual(artifact.details.taskRiskCompatibilityOutcomes, [
      {
        taskId: "task-low-compatible-risk",
        declaredRisk: "low",
        requiredCapabilityRisk: "low",
        allowedRequiredCapabilityRisks: ["low"],
        outcome: "compatible"
      },
      {
        taskId: "task-medium-compatible-risk",
        declaredRisk: "medium",
        requiredCapabilityRisk: "medium",
        allowedRequiredCapabilityRisks: ["low", "medium"],
        outcome: "compatible"
      },
      {
        taskId: "task-high-compatible-risk",
        declaredRisk: "high",
        requiredCapabilityRisk: "high",
        allowedRequiredCapabilityRisks: ["low", "medium", "high"],
        outcome: "compatible"
      }
    ]);
  });

  it("collects every task risk compatibility violation in one validation pass", () => {
    const graph = defineCandidatePlan({
      planId: "plan_task_risk_policy_compatibility_rejection",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Attempt to admit tasks whose declared risk is lower than required capability risk.",
      acceptanceCriteria: acceptedCriteria,
      tasks: [
        compatibleTask("task-low-declares-below-medium", "low", "medium"),
        compatibleTask("task-medium-declares-below-high", "medium", "high"),
        compatibleTask("task-low-declares-below-high", "low", "high")
      ]
    } as unknown as PlanGraph);

    const validation = validatePlanGraph({
      graph,
      intent: admittedIntent
    });

    const expectedViolations: readonly Pick<
      PlanGraphValidationViolation,
      "code" | "path" | "taskId" | "declaredRisk" | "requiredRisk" | "message"
    >[] = [
      {
        code: "task-risk-below-required-capability-risk",
        path: "tasks.task-low-declares-below-medium.risk",
        taskId: "task-low-declares-below-medium",
        declaredRisk: "low",
        requiredRisk: "medium",
        message:
          "Task task-low-declares-below-medium declares low risk but requires medium capability risk; low tasks may only require low capability risk."
      },
      {
        code: "task-risk-below-required-capability-risk",
        path: "tasks.task-medium-declares-below-high.risk",
        taskId: "task-medium-declares-below-high",
        declaredRisk: "medium",
        requiredRisk: "high",
        message:
          "Task task-medium-declares-below-high declares medium risk but requires high capability risk; medium tasks may only require low, medium capability risk."
      },
      {
        code: "task-risk-below-required-capability-risk",
        path: "tasks.task-low-declares-below-high.risk",
        taskId: "task-low-declares-below-high",
        declaredRisk: "low",
        requiredRisk: "high",
        message:
          "Task task-low-declares-below-high declares low risk but requires high capability risk; low tasks may only require low capability risk."
      }
    ];

    assert.equal(validation.ok, false);
    assert.deepEqual(
      validation.violations.map(({ code, path, taskId, declaredRisk, requiredRisk, message }) => ({
        code,
        path,
        taskId,
        declaredRisk,
        requiredRisk,
        message
      })),
      expectedViolations
    );
    assert.deepEqual(
      validation.errors,
      expectedViolations.map((violation) => violation.message)
    );
  });

  it("evaluates risk compatibility even when unrelated capability sections are malformed", () => {
    const graph = defineCandidatePlan({
      planId: "plan_task_risk_policy_compatibility_collect_all_rejection",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Attempt to hide undersold task risk behind malformed unrelated capability sections.",
      acceptanceCriteria: acceptedCriteria,
      tasks: [
        {
          id: "task-low-risk-with-malformed-sections",
          title: "Declare low task risk while requiring high tool authority",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_task_risk_policy_compatibility"],
          requiredCapabilities: {
            repoScopes: "packages/planning",
            toolPermissions: [
              {
                tool: toolByRisk.high,
                reason: "Exercise high capability risk compatibility.",
                risk: "high"
              }
            ],
            budget: "30s"
          },
          risk: "low"
        }
      ]
    } as unknown as PlanGraph);

    const validation = validatePlanGraph({
      graph,
      intent: admittedIntent
    });

    const expectedViolations: readonly Pick<PlanGraphValidationViolation, "code" | "path" | "taskId" | "message">[] = [
      {
        code: "malformed-task-required-capabilities",
        path: "tasks.task-low-risk-with-malformed-sections.requiredCapabilities.repoScopes",
        taskId: "task-low-risk-with-malformed-sections",
        message: "Task task-low-risk-with-malformed-sections requiredCapabilities.repoScopes must be an array."
      },
      {
        code: "malformed-task-required-capabilities",
        path: "tasks.task-low-risk-with-malformed-sections.requiredCapabilities.budget",
        taskId: "task-low-risk-with-malformed-sections",
        message: "Task task-low-risk-with-malformed-sections requiredCapabilities.budget must be an object."
      },
      {
        code: "task-risk-below-required-capability-risk",
        path: "tasks.task-low-risk-with-malformed-sections.risk",
        taskId: "task-low-risk-with-malformed-sections",
        message:
          "Task task-low-risk-with-malformed-sections declares low risk but requires high capability risk; low tasks may only require low capability risk."
      }
    ];

    assert.equal(validation.ok, false);
    assert.deepEqual(
      validation.violations.map(({ code, path, taskId, message }) => ({
        code,
        path,
        taskId,
        message
      })),
      expectedViolations
    );
    assert.deepEqual(
      validation.violations
        .filter((violation) => violation.code === "task-risk-below-required-capability-risk")
        .map(({ declaredRisk, requiredRisk }) => ({ declaredRisk, requiredRisk })),
      [{ declaredRisk: "low", requiredRisk: "high" }]
    );
    assert.deepEqual(validation.capabilityViolationDiagnostics, [
      {
        taskId: "task-low-risk-with-malformed-sections",
        violatedRule: "malformed-task-required-capabilities",
        capabilityPath: "tasks.task-low-risk-with-malformed-sections.requiredCapabilities.repoScopes",
        severity: "block",
        message: "Task task-low-risk-with-malformed-sections requiredCapabilities.repoScopes must be an array."
      },
      {
        taskId: "task-low-risk-with-malformed-sections",
        violatedRule: "malformed-task-required-capabilities",
        capabilityPath: "tasks.task-low-risk-with-malformed-sections.requiredCapabilities.budget",
        severity: "block",
        message: "Task task-low-risk-with-malformed-sections requiredCapabilities.budget must be an object."
      },
      {
        taskId: "task-low-risk-with-malformed-sections",
        violatedRule: "task-risk-below-required-capability-risk",
        capabilityPath: "tasks.task-low-risk-with-malformed-sections.requiredCapabilities.toolPermissions",
        severity: "block",
        message:
          "Task task-low-risk-with-malformed-sections declares low risk but requires high capability risk; low tasks may only require low capability risk."
      }
    ]);
    assert.deepEqual(
      validation.errors,
      expectedViolations.map((violation) => violation.message)
    );
  });

  it("records a risk compatibility outcome for every candidate-plan task during admission", () => {
    const graph = defineCandidatePlan({
      planId: "plan_task_risk_policy_compatibility_total_evidence",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Record one risk compatibility outcome for each candidate plan task before rejection.",
      acceptanceCriteria: acceptedCriteria,
      tasks: [
        compatibleTask("task-compatible-risk-evidence", "low", "low"),
        {
          id: "task-missing-required-capabilities-risk-evidence",
          title: "Declare task risk without required capabilities",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_task_risk_policy_compatibility"],
          risk: "low"
        },
        {
          id: "task-missing-risk-compatibility-evidence",
          title: "Require low-risk capabilities without declaring task risk",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_task_risk_policy_compatibility"],
          requiredCapabilities: requiredCapabilities("low")
        },
        {
          id: "task-malformed-risk-compatibility-evidence",
          title: "Require high-risk capabilities with malformed task risk",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_task_risk_policy_compatibility"],
          requiredCapabilities: requiredCapabilities("high"),
          risk: "critical"
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
    const expectedOutcomes = [
      {
        taskId: "task-compatible-risk-evidence",
        declaredRisk: "low",
        requiredCapabilityRisk: "low",
        allowedRequiredCapabilityRisks: ["low"],
        outcome: "compatible"
      },
      {
        taskId: "task-missing-required-capabilities-risk-evidence",
        declaredRisk: "low",
        allowedRequiredCapabilityRisks: ["low"],
        outcome: "not-evaluable",
        blockingViolationCodes: ["missing-task-required-capabilities"],
        reason:
          "Task task-missing-required-capabilities-risk-evidence risk compatibility could not be evaluated because required capabilities are not admissible."
      },
      {
        taskId: "task-missing-risk-compatibility-evidence",
        requiredCapabilityRisk: "low",
        outcome: "not-evaluable",
        blockingViolationCodes: ["missing-task-risk"],
        reason:
          "Task task-missing-risk-compatibility-evidence risk compatibility could not be evaluated because task risk is not admissible."
      },
      {
        taskId: "task-malformed-risk-compatibility-evidence",
        requiredCapabilityRisk: "high",
        outcome: "not-evaluable",
        blockingViolationCodes: ["malformed-task-risk"],
        reason:
          "Task task-malformed-risk-compatibility-evidence risk compatibility could not be evaluated because task risk is not admissible."
      }
    ];

    assert.equal(validation.ok, false);
    assert.equal(validation.taskRiskCompatibilityOutcomes.length, graph.tasks.length);
    assert.deepEqual(validation.taskRiskCompatibilityOutcomes, expectedOutcomes);
    assert.equal(artifact.decision, "block");
    assert.deepEqual(artifact.details.taskRiskCompatibilityOutcomes, expectedOutcomes);
  });

  it("serializes planning-admission.json block evidence with task-specific risk compatibility failures", () => {
    const graph = defineCandidatePlan({
      planId: "plan_task_risk_policy_compatibility_artifact_rejection",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Attempt to emit planning admission evidence for undersold task risks.",
      acceptanceCriteria: acceptedCriteria,
      tasks: [
        compatibleTask("task-artifact-low-declares-below-high", "low", "high"),
        compatibleTask("task-artifact-medium-declares-below-high", "medium", "high")
      ]
    } as unknown as PlanGraph);

    const artifact = createPlanningAdmissionArtifact({
      graph,
      intent: admittedIntent
    });
    const durableAdmissionEvidence = JSON.parse(JSON.stringify(artifact)) as typeof artifact;
    const expectedViolations: readonly Pick<
      PlanGraphValidationViolation,
      "code" | "path" | "taskId" | "declaredRisk" | "requiredRisk" | "message"
    >[] = [
      {
        code: "task-risk-below-required-capability-risk",
        path: "tasks.task-artifact-low-declares-below-high.risk",
        taskId: "task-artifact-low-declares-below-high",
        declaredRisk: "low",
        requiredRisk: "high",
        message:
          "Task task-artifact-low-declares-below-high declares low risk but requires high capability risk; low tasks may only require low capability risk."
      },
      {
        code: "task-risk-below-required-capability-risk",
        path: "tasks.task-artifact-medium-declares-below-high.risk",
        taskId: "task-artifact-medium-declares-below-high",
        declaredRisk: "medium",
        requiredRisk: "high",
        message:
          "Task task-artifact-medium-declares-below-high declares medium risk but requires high capability risk; medium tasks may only require low, medium capability risk."
      }
    ];

    assert.equal(durableAdmissionEvidence.schemaVersion, PLANNING_ADMISSION_SCHEMA_VERSION);
    assert.equal(durableAdmissionEvidence.artifact, PLANNING_ADMISSION_ARTIFACT_NAME);
    assert.equal(durableAdmissionEvidence.planId, graph.planId);
    assert.equal(durableAdmissionEvidence.intentId, admittedIntent.id);
    assert.equal(durableAdmissionEvidence.decision, "block");
    assert.equal(durableAdmissionEvidence.admitted, false);
    assert.deepEqual(durableAdmissionEvidence.details.gate, {
      planGraphValidationPassed: false,
      taskCapabilityRequirementsExtracted: false,
      taskRiskCompatibilityEvidenceAttached: true,
      acceptanceCriterionCoverageEvidenceAttached: false
    });
    assert.equal(durableAdmissionEvidence.details.validation.ok, false);
    assert.equal(durableAdmissionEvidence.details.validation.violationCount, expectedViolations.length);
    assert.deepEqual(
      durableAdmissionEvidence.details.validation.violations.map(
        ({ code, path, taskId, declaredRisk, requiredRisk, message }) => ({
          code,
          path,
          taskId,
          declaredRisk,
          requiredRisk,
          message
        })
      ),
      expectedViolations
    );
    assert.deepEqual(
      durableAdmissionEvidence.details.validation.capabilityViolationDiagnostics,
      expectedViolations.map(({ code, path, taskId, message }) => ({
        taskId,
        violatedRule: code,
        capabilityPath: "tasks." + taskId + ".requiredCapabilities.toolPermissions",
        severity: "block",
        message
      }))
    );
    assert.deepEqual(
      durableAdmissionEvidence.errors,
      expectedViolations.map((violation) => violation.message)
    );
    assert.deepEqual(durableAdmissionEvidence.details.taskRiskCompatibilityOutcomes, [
      {
        taskId: "task-artifact-low-declares-below-high",
        declaredRisk: "low",
        requiredCapabilityRisk: "high",
        allowedRequiredCapabilityRisks: ["low"],
        outcome: "incompatible"
      },
      {
        taskId: "task-artifact-medium-declares-below-high",
        declaredRisk: "medium",
        requiredCapabilityRisk: "high",
        allowedRequiredCapabilityRisks: ["low", "medium"],
        outcome: "incompatible"
      }
    ]);
    assert.deepEqual(durableAdmissionEvidence.details.grantModel, {
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
    });
    assert.equal(Object.hasOwn(durableAdmissionEvidence, "admittedPlan"), false);
    assert.equal(Object.hasOwn(durableAdmissionEvidence.details, "taskCapabilityAdmissions"), false);
  });

  it("hard-rejects candidate plans when task risk undersells required capability risk", () => {
    assert.throws(
      () =>
        createPlanGraph({
          planId: "plan_task_risk_policy_compatibility_hard_reject",
          intent: admittedIntent,
          strategy: "Attempt to admit a low-risk task that requires high-risk tool authority.",
          tasks: [compatibleTask("task-low-declares-below-high", "low", "high")],
          createdAt: "2026-04-26T00:00:00.000Z"
        }),
      /Invalid plan graph: Task task-low-declares-below-high declares low risk but requires high capability risk/
    );
  });
});

function compatibleTask(
  id: PlanTask["id"],
  declaredRisk: PlanTaskRiskDeclaration,
  requiredRisk: PlanTaskRiskDeclaration
): PlanTask {
  return {
    id,
    title: `Declare ${declaredRisk} risk for ${requiredRisk} capability authority`,
    kind: "verification",
    dependsOn: [],
    covers: ["ac_task_risk_policy_compatibility"],
    requiredCapabilities: requiredCapabilities(requiredRisk),
    risk: declaredRisk
  };
}

function requiredCapabilities(risk: PlanTaskRiskDeclaration): PlanTaskRequiredCapabilities {
  return {
    repoScopes: [],
    toolPermissions: [
      {
        tool: toolByRisk[risk],
        reason: `Exercise ${risk} capability risk compatibility.`,
        risk
      }
    ],
    budget: {}
  };
}
