import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { defineConfirmedIntent } from "@protostar/intent";
import { createPlanningAdmissionArtifact } from "@protostar/planning/artifacts";
import {
  createPlanGraph,
  defineCandidatePlan,
  validatePlanGraph,
  type PlanGraph,
  type PlanGraphValidation,
  type PlanGraphValidationViolation,
  type PlanGraphValidationViolationCode,
  type PlanGraphViolationAffectedPlanLocation,
  type PlanningAdmissionRegisteredValidatorName,
  type PlanningAdmissionRejectedValidationEvidence,
  type PlanTask,
  type PlanTaskRiskDeclaration,
  type PlanTaskRequiredCapabilities
} from "@protostar/planning/schema";

type Assert<Condition extends true> = Condition;

type ExposesViolationArray<Result> = Result extends {
  readonly violations: readonly PlanGraphValidationViolation[];
}
  ? true
  : false;

type _PlanGraphValidationExposesViolations = Assert<ExposesViolationArray<PlanGraphValidation>>;
type _RejectedAdmissionValidationEvidenceExposesViolations =
  Assert<ExposesViolationArray<PlanningAdmissionRejectedValidationEvidence>>;
type _PlanGraphValidationViolationRequiresMetadata = Assert<
  PlanGraphValidationViolation extends {
    readonly validator: PlanningAdmissionRegisteredValidatorName;
    readonly code: PlanGraphValidationViolationCode;
    readonly affectedPlanLocation: PlanGraphViolationAffectedPlanLocation;
    readonly message: string;
  }
    ? true
    : false
>;

describe("planning split public entrypoints", () => {
  it("exposes schema contracts including task capability requirements", () => {
    const intent = defineConfirmedIntent({
      id: "intent_planning_schema_surface",
      title: "Expose planning schema contracts",
      problem:
        "Admission code needs a narrow planning schema import surface that includes the task capability requirement contract.",
      requester: "contract-test",
      confirmedAt: "2026-04-26T00:00:00.000Z",
      acceptanceCriteria: [
        {
          id: "ac_planning_schema_capability_contract",
          statement: "The planning schema entrypoint exports the task required-capabilities contract.",
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
            permissionLevel: "use",
            reason: "Run planning public split contract tests.",
            risk: "low"
          }
        ],
        budget: {
          timeoutMs: 30_000,
          maxRepairLoops: 0
        }
      },
      constraints: ["Admission code consumes planning contracts through public package entrypoints."]
    });
    const requiredCapabilities = {
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
          permissionLevel: "use",
          reason: "Run planning public split contract tests.",
          risk: "low"
        }
      ],
      budget: {
        timeoutMs: 30_000,
        maxRepairLoops: 0
      }
    } as const satisfies PlanTaskRequiredCapabilities;
    const taskRisk = "low" as const satisfies PlanTaskRiskDeclaration;
    const tasks = [
      {
        id: "task-planning-schema-capability-contract",
        title: "Prove planning schema capability contract exports",
        kind: "verification",
        dependsOn: [],
        covers: ["ac_planning_schema_capability_contract"],
        requiredCapabilities,
        risk: taskRisk
      }
    ] as const satisfies readonly PlanTask[];

    const graph = createPlanGraph({
      planId: "plan_planning_schema_surface",
      intent,
      strategy: "Use the public planning schema entrypoint for admission-facing contracts.",
      tasks,
      createdAt: "2026-04-26T00:00:00.000Z"
    });

    assert.equal(
      validatePlanGraph({
        graph,
        intent
      }).ok,
      true
    );
  });

  it("exposes validation result violations without collapsing multiple defects", () => {
    const intent = defineConfirmedIntent({
      id: "intent_planning_validation_result_surface",
      title: "Expose collected planning validation violations",
      problem:
        "Admission consumers must receive every candidate-plan defect as structured validation violations.",
      requester: "contract-test",
      confirmedAt: "2026-04-26T00:00:00.000Z",
      acceptanceCriteria: [
        {
          id: "ac_planning_validation_result_violations",
          statement: "Validation result contracts expose every collected planning admission violation.",
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
            permissionLevel: "use",
            reason: "Run planning validation result contract tests.",
            risk: "low"
          }
        ],
        budget: {
          timeoutMs: 30_000,
          maxRepairLoops: 0
        }
      },
      constraints: ["Rejected validation results must preserve structured violations."]
    });
    const noRequiredCapabilities = {
      repoScopes: [],
      toolPermissions: [],
      budget: {}
    } as const satisfies PlanTaskRequiredCapabilities;
    const invalidGraph = defineCandidatePlan({
      planId: "plan_planning_validation_result_surface",
      intentId: "intent_wrong_planning_validation_result_surface",
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Trip independent validation paths to prove the result contract preserves all defects.",
      acceptanceCriteria: intent.acceptanceCriteria.map(({ id, statement, verification }) => ({
        id,
        statement,
        verification
      })),
      tasks: [
        {
          id: "task-validation-result-surface",
          title: "Omit coverage while depending on a missing task",
          kind: "verification",
          dependsOn: ["task-missing-validation-result-surface"],
          covers: [],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ]
    } as const satisfies PlanGraph);

    const validation = validatePlanGraph({
      graph: invalidGraph,
      intent
    });
    const rejectedValidationEvidence = {
      validator: "validatePlanGraph",
      ok: false,
      violationCount: validation.violations.length,
      violations: validation.violations,
      capabilityViolationDiagnostics: validation.capabilityViolationDiagnostics
    } satisfies PlanningAdmissionRejectedValidationEvidence;

    assert.equal(validation.ok, false);
    assert.deepEqual(
      validation.violations.map(({ code, path, taskId }) => ({ code, path, taskId })),
      [
        {
          code: "intent-mismatch",
          path: "intentId",
          taskId: undefined
        },
        {
          code: "empty-task-coverage",
          path: "tasks.task-validation-result-surface.covers",
          taskId: "task-validation-result-surface"
        },
        {
          code: "missing-task-dependency",
          path: "tasks.task-validation-result-surface.dependsOn.0",
          taskId: "task-validation-result-surface"
        },
        {
          code: "uncovered-acceptance-criterion",
          path: "acceptanceCriteria",
          taskId: undefined
        }
      ]
    );
    assert.deepEqual(
      validation.violations.map((violation) => violation.affectedPlanLocation),
      [
        {
          kind: "field",
          path: "intentId"
        },
        {
          kind: "field",
          path: "tasks.task-validation-result-surface.covers",
          taskId: "task-validation-result-surface"
        },
        {
          kind: "edge",
          path: "tasks.task-validation-result-surface.dependsOn.0",
          taskId: "task-validation-result-surface",
          dependencyTaskId: "task-missing-validation-result-surface",
          dependencyIndex: 0
        },
        {
          kind: "field",
          path: "acceptanceCriteria",
          acceptanceCriterionId: "ac_planning_validation_result_violations"
        }
      ]
    );
    assert.deepEqual(
      validation.errors,
      validation.violations.map((violation) => violation.message)
    );
    assert.deepEqual(
      validation.violations.map(({ validator, code, message }) => ({
        validator,
        code,
        hasHumanReadableMessage: message.trim().length > 0
      })),
      [
        {
          validator: "intent-match",
          code: "intent-mismatch",
          hasHumanReadableMessage: true
        },
        {
          validator: "task-contracts",
          code: "empty-task-coverage",
          hasHumanReadableMessage: true
        },
        {
          validator: "task-contracts",
          code: "missing-task-dependency",
          hasHumanReadableMessage: true
        },
        {
          validator: "acceptance-coverage",
          code: "uncovered-acceptance-criterion",
          hasHumanReadableMessage: true
        }
      ]
    );
    assert.equal(rejectedValidationEvidence.violationCount, 4);
    assert.equal(rejectedValidationEvidence.violations, validation.violations);
  });

  it("preserves required metadata on every violation in a multi-defect admission result", () => {
    const intent = defineConfirmedIntent({
      id: "intent_planning_violation_metadata_contract",
      title: "Preserve planning violation metadata",
      problem:
        "Admission consumers need every collected candidate-plan violation with enough metadata to locate and explain the defect.",
      requester: "contract-test",
      confirmedAt: "2026-04-26T00:00:00.000Z",
      acceptanceCriteria: [
        {
          id: "ac_planning_violation_metadata_primary",
          statement: "Primary violation metadata is preserved in rejected validation evidence.",
          verification: "test"
        },
        {
          id: "ac_planning_violation_metadata_secondary",
          statement: "Task-specific risk violation metadata is preserved in rejected validation evidence.",
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
            permissionLevel: "use",
            reason: "Run planning metadata contract tests.",
            risk: "low"
          },
          {
            tool: "shell",
            reason: "Exercise high-risk capability metadata fixtures.",
            risk: "high"
          }
        ],
        budget: {
          timeoutMs: 30_000,
          maxRepairLoops: 0
        }
      },
      constraints: ["Rejected admission evidence must preserve structured metadata for every violation."]
    });
    const noRequiredCapabilities = {
      repoScopes: [],
      toolPermissions: [],
      budget: {}
    } as const satisfies PlanTaskRequiredCapabilities;
    const highRiskCapabilities = {
      repoScopes: [],
      toolPermissions: [
        {
          tool: "shell",
          reason: "Exercise high-risk capability metadata fixtures.",
          risk: "high"
        }
      ],
      budget: {}
    } as const satisfies PlanTaskRequiredCapabilities;
    const invalidGraph = defineCandidatePlan({
      planId: "plan_planning_violation_metadata_contract",
      intentId: "intent_wrong_planning_violation_metadata_contract",
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy:
        "Trip independent metadata-bearing validators to prove the rejected admission result preserves each defect.",
      acceptanceCriteria: intent.acceptanceCriteria.map(({ id, statement, verification }) => ({
        id,
        statement,
        verification
      })),
      tasks: [
        {
          id: "task-metadata-alpha",
          title: "Create coverage and dependency metadata violations",
          kind: "verification",
          dependsOn: ["task-missing-metadata-dependency"],
          covers: [
            "ac_planning_violation_metadata_primary",
            "ac_planning_violation_metadata_primary",
            "ac_unknown_metadata_contract"
          ],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-metadata-risk",
          title: "Create risk compatibility metadata violations",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_planning_violation_metadata_secondary"],
          requiredCapabilities: highRiskCapabilities,
          risk: "low"
        }
      ]
    } as const satisfies PlanGraph);

    const expectedViolations: readonly PlanGraphValidationViolation[] = [
      {
        validator: "intent-match",
        code: "intent-mismatch",
        path: "intentId",
        affectedPlanLocation: {
          kind: "field",
          path: "intentId"
        },
        message:
          "Plan graph intent intent_wrong_planning_violation_metadata_contract must match confirmed intent intent_planning_violation_metadata_contract."
      },
      {
        validator: "task-contracts",
        code: "duplicate-task-coverage-accepted-criterion-id",
        path: "tasks.task-metadata-alpha.covers.1",
        affectedPlanLocation: {
          kind: "field",
          path: "tasks.task-metadata-alpha.covers.1",
          taskId: "task-metadata-alpha",
          acceptanceCriterionId: "ac_planning_violation_metadata_primary"
        },
        message:
          "Task task-metadata-alpha covers acceptance criterion ac_planning_violation_metadata_primary more than once.",
        taskId: "task-metadata-alpha",
        firstIndex: 0,
        duplicateIndex: 1,
        coverageIndex: 1,
        acceptanceCriterionId: "ac_planning_violation_metadata_primary"
      },
      {
        validator: "task-contracts",
        code: "unknown-acceptance-criterion",
        path: "tasks.task-metadata-alpha.covers.2",
        affectedPlanLocation: {
          kind: "field",
          path: "tasks.task-metadata-alpha.covers.2",
          taskId: "task-metadata-alpha",
          acceptanceCriterionId: "ac_unknown_metadata_contract"
        },
        message:
          "Task task-metadata-alpha covers acceptance criterion ac_unknown_metadata_contract outside confirmed intent intent_planning_violation_metadata_contract.",
        taskId: "task-metadata-alpha",
        coverageIndex: 2,
        acceptanceCriterionId: "ac_unknown_metadata_contract"
      },
      {
        validator: "task-contracts",
        code: "missing-task-dependency",
        path: "tasks.task-metadata-alpha.dependsOn.0",
        affectedPlanLocation: {
          kind: "edge",
          path: "tasks.task-metadata-alpha.dependsOn.0",
          taskId: "task-metadata-alpha",
          dependencyTaskId: "task-missing-metadata-dependency",
          dependencyIndex: 0
        },
        message: "Task task-metadata-alpha depends on missing task task-missing-metadata-dependency.",
        taskId: "task-metadata-alpha",
        dependency: "task-missing-metadata-dependency",
        dependencyIndex: 0
      },
      {
        validator: "task-contracts",
        code: "task-risk-below-required-capability-risk",
        path: "tasks.task-metadata-risk.risk",
        affectedPlanLocation: {
          kind: "field",
          path: "tasks.task-metadata-risk.risk",
          taskId: "task-metadata-risk"
        },
        message:
          "Task task-metadata-risk declares low risk but requires high capability risk; low tasks may only require low capability risk.",
        taskId: "task-metadata-risk",
        declaredRisk: "low",
        requiredRisk: "high"
      }
    ];

    const validation = validatePlanGraph({
      graph: invalidGraph,
      intent
    });
    const rejectedValidationEvidence = {
      validator: "validatePlanGraph",
      ok: false,
      violationCount: validation.violations.length,
      violations: validation.violations,
      capabilityViolationDiagnostics: validation.capabilityViolationDiagnostics
    } satisfies PlanningAdmissionRejectedValidationEvidence;
    const artifact = createPlanningAdmissionArtifact({
      graph: invalidGraph,
      intent,
      validation
    });

    assert.equal(validation.ok, false);
    assert.deepEqual(validation.violations, expectedViolations);
    assert.deepEqual(
      validation.errors,
      expectedViolations.map((violation) => violation.message)
    );
    assert.deepEqual(rejectedValidationEvidence.violations, expectedViolations);
    assert.equal(rejectedValidationEvidence.violationCount, expectedViolations.length);

    assert.equal(artifact.admitted, false);
    if (artifact.admitted) {
      assert.fail("Expected metadata contract fixture to be rejected.");
    }
    assert.deepEqual(artifact.details.validation.violations, expectedViolations);
    assert.equal(artifact.details.validation.violationCount, expectedViolations.length);
  });
});
