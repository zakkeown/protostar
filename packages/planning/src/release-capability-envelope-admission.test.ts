import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { defineConfirmedIntent, type ConfirmedIntent } from "@protostar/intent";

import {
  createPlanningAdmissionArtifact,
  createPlanGraph,
  defineCandidatePlan,
  validatePlanGraph,
  type PlanGraph,
  type PlanTaskCapabilityAdmissionResult,
  type PlanTaskRequiredCapabilities,
  type PlanningAdmissionReleaseGrantCondition
} from "./index.js";

const releaseAdmittedIntent = defineConfirmedIntent({
  id: "intent_planning_release_capability_envelope_admitted",
  title: "Admit candidate-plan release authority from the confirmed envelope",
  problem:
    "Planning admission must admit release requirements only when the confirmed capability envelope grants that authority.",
  requester: "ouroboros-ac-50303",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_release_capability_envelope_admitted",
      statement:
        "A candidate release task requiring release authority inside the confirmed envelope is admitted.",
      verification: "test"
    },
    {
      id: "ac_release_capability_envelope_execution_guarded",
      statement:
        "Admitted release authority is classified as a release condition before execution.",
      verification: "test"
    }
  ],
  capabilityEnvelope: {
    repoScopes: [],
    toolPermissions: [
      {
        tool: "gh",
        permissionLevel: "execute",
        reason: "Create GitHub release records after planning admission.",
        risk: "medium"
      }
    ],
    executeGrants: [
      {
        command: "gh release create v0.0.1 --notes-file CHANGELOG.md",
        scope: "repository",
        reason: "Create the release."
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["Candidate plans may not invent release authority outside the confirmed envelope."]
});

const releaseDeniedIntent = defineConfirmedIntent({
  id: "intent_planning_release_capability_envelope_rejected",
  title: "Reject candidate-plan release authority outside the confirmed envelope",
  problem:
    "Planning admission must block release requirements when the confirmed capability envelope grants only non-release GitHub inspection authority.",
  requester: "ouroboros-ac-50303",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_release_capability_envelope_rejected",
      statement:
        "A candidate release task requiring release authority from a non-release envelope is rejected.",
      verification: "test"
    },
    {
      id: "ac_release_tool_grant_rejection_collected",
      statement: "Tool-permission release requirements appear in rejection evidence.",
      verification: "test"
    },
    {
      id: "ac_release_execute_grant_rejection_collected",
      statement: "Execute-grant release requirements appear in rejection evidence.",
      verification: "test"
    }
  ],
  capabilityEnvelope: {
    repoScopes: [],
    toolPermissions: [
      {
        tool: "gh",
        permissionLevel: "execute",
        reason: "Inspect repository metadata after planning admission.",
        risk: "medium"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["GitHub inspection authority must not be promoted into release authority."]
});

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

const admittedReleaseCapabilities = {
  repoScopes: [],
  toolPermissions: [
    {
      tool: "gh",
      permissionLevel: "execute",
      reason: "Create GitHub release records after planning admission.",
      risk: "medium"
    }
  ],
  executeGrants: [
    {
      command: "gh release create v0.0.1 --notes-file CHANGELOG.md",
      scope: "repository",
      reason: "Create the release."
    }
  ],
  budget: {
    timeoutMs: 30_000,
    maxRepairLoops: 0
  }
} as const satisfies PlanTaskRequiredCapabilities;

const releaseToolRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [
    {
      tool: "gh",
      permissionLevel: "execute",
      reason: "Create GitHub release records after planning admission.",
      risk: "medium"
    }
  ],
  budget: {
    timeoutMs: 30_000,
    maxRepairLoops: 0
  }
} as const satisfies PlanTaskRequiredCapabilities;

const releaseExecuteRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  executeGrants: [
    {
      command: "gh release create v0.0.1 --notes-file CHANGELOG.md",
      scope: "repository",
      reason: "Create the release."
    }
  ],
  budget: {
    timeoutMs: 30_000,
    maxRepairLoops: 0
  }
} as const satisfies PlanTaskRequiredCapabilities;

const expectedReleaseCondition: PlanningAdmissionReleaseGrantCondition = {
  taskId: "task-create-admitted-release",
  grantKind: "release",
  authority: "release",
  source: "candidate-plan-required-capabilities",
  admissionPhase: "before-execution",
  capabilityRefs: [
    {
      section: "toolPermissions",
      index: 0,
      source: "tool-permission"
    },
    {
      section: "executeGrants",
      index: 0,
      source: "execute-grant"
    }
  ]
};

describe("PlanGraph release capability-envelope admission boundary", () => {
  it("admits candidate-plan release capabilities covered by the confirmed capability envelope", () => {
    const graph = createPlanGraph({
      planId: "plan_release_capability_envelope_admitted",
      intent: releaseAdmittedIntent,
      strategy: "Admit release authority only inside the confirmed planning package envelope.",
      tasks: [
        {
          id: "task-verify-release-capability-envelope",
          title: "Verify release capability envelope",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_release_capability_envelope_execution_guarded"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-create-admitted-release",
          title: "Create admitted release",
          kind: "release",
          dependsOn: ["task-verify-release-capability-envelope"],
          covers: ["ac_release_capability_envelope_admitted"],
          requiredCapabilities: admittedReleaseCapabilities,
          risk: "medium"
        }
      ],
      createdAt: "2026-04-26T00:00:00.000Z"
    });
    const expectedCapabilityAdmissions: readonly PlanTaskCapabilityAdmissionResult[] = [
      {
        taskId: "task-verify-release-capability-envelope",
        requestedCapabilities: noRequiredCapabilities,
        admittedCapabilities: noRequiredCapabilities,
        verdict: "allow"
      },
      {
        taskId: "task-create-admitted-release",
        requestedCapabilities: admittedReleaseCapabilities,
        admittedCapabilities: admittedReleaseCapabilities,
        verdict: "allow"
      }
    ];

    const validation = validatePlanGraph({
      graph,
      intent: releaseAdmittedIntent
    });
    const artifact = createPlanningAdmissionArtifact({
      graph,
      intent: releaseAdmittedIntent
    });

    assert.equal(validation.ok, true);
    assert.deepEqual(validation.violations, []);
    assert.deepEqual(validation.taskCapabilityAdmissions, expectedCapabilityAdmissions);
    assert.deepEqual(validation.preHandoffVerificationTriggers, []);
    assert.deepEqual(validation.releaseGrantConditions, [expectedReleaseCondition]);
    assert.deepEqual(validation.releaseGrantAdmission, {
      decision: "allow",
      required: true,
      conditionCount: 1,
      rejectedConditionCount: 0,
      rejectionReasons: []
    });
    assert.equal(artifact.admitted, true);
    if (!artifact.admitted) {
      assert.fail("Expected release-capability candidate plan to be admitted.");
    }
    assert.deepEqual(artifact.details.taskCapabilityAdmissions, expectedCapabilityAdmissions);
    assert.deepEqual(artifact.details.preHandoffVerificationTriggers, []);
    assert.deepEqual(artifact.details.releaseGrantConditions, [expectedReleaseCondition]);
    assert.deepEqual(artifact.details.releaseGrantAdmission, validation.releaseGrantAdmission);
    assert.equal(
      JSON.stringify(artifact.details.releaseGrantConditions).includes("gh release create"),
      false,
      "Release condition evidence stays thin and does not copy command text out of the PlanGraph."
    );
  });

  it("rejects candidate-plan release capabilities when the confirmed envelope lacks a release grant", () => {
    const rejectedCandidatePlan = defineCandidatePlan({
      planId: "plan_release_capability_envelope_rejection",
      intentId: releaseDeniedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Attempt to promote non-release GitHub inspection authority into release authority.",
      acceptanceCriteria: acceptedCriteriaFor(releaseDeniedIntent),
      tasks: [
        {
          id: "task-verify-non-release-envelope",
          title: "Verify non-release envelope",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_release_capability_envelope_rejected"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-require-release-tool-without-grant",
          title: "Require release tool authority without grant",
          kind: "release",
          dependsOn: ["task-verify-non-release-envelope"],
          covers: ["ac_release_tool_grant_rejection_collected"],
          requiredCapabilities: releaseToolRequiredCapabilities,
          risk: "medium"
        },
        {
          id: "task-require-release-execute-without-grant",
          title: "Require release execute authority without grant",
          kind: "release",
          dependsOn: ["task-verify-non-release-envelope"],
          covers: ["ac_release_execute_grant_rejection_collected"],
          requiredCapabilities: releaseExecuteRequiredCapabilities,
          risk: "low"
        }
      ]
    } as const satisfies PlanGraph);

    const validation = validatePlanGraph({
      graph: rejectedCandidatePlan,
      intent: releaseDeniedIntent
    });
    const artifact = createPlanningAdmissionArtifact({
      graph: rejectedCandidatePlan,
      intent: releaseDeniedIntent
    });

    const expectedViolations = [
      {
        validator: "task-contracts",
        code: "task-required-release-grant-denied",
        path: "tasks.task-require-release-tool-without-grant.requiredCapabilities.toolPermissions.0",
        taskId: "task-require-release-tool-without-grant",
        message:
          "Task task-require-release-tool-without-grant requires tool permission gh (execute, medium), but the normalized planning admission grant model does not contain a valid release grant."
      },
      {
        validator: "task-contracts",
        code: "task-required-release-grant-denied",
        path: "tasks.task-require-release-execute-without-grant.requiredCapabilities.executeGrants.0",
        taskId: "task-require-release-execute-without-grant",
        message:
          "Task task-require-release-execute-without-grant requires execute grant 'gh release create v0.0.1 --notes-file CHANGELOG.md' in scope 'repository', but the normalized planning admission grant model does not contain a valid release grant."
      },
      {
        validator: "task-contracts",
        code: "task-required-execute-grant-outside-intent-envelope",
        path: "tasks.task-require-release-execute-without-grant.requiredCapabilities.executeGrants.0",
        taskId: "task-require-release-execute-without-grant",
        message:
          "Task task-require-release-execute-without-grant requires execute grant 'gh release create v0.0.1 --notes-file CHANGELOG.md' in scope 'repository' outside confirmed intent capability envelope."
      }
    ] as const;

    assert.equal(validation.ok, false);
    assert.deepEqual(validation.planningAdmissionGrantModel, {
      source: "confirmed-intent-capability-envelope",
      grants: []
    });
    assert.deepEqual(
      validation.violations.map(({ validator, code, path, taskId, message }) => ({
        validator,
        code,
        path,
        taskId,
        message
      })),
      expectedViolations
    );
    assert.deepEqual(
      validation.capabilityViolationDiagnostics.map(({ taskId, violatedRule, capabilityPath, severity }) => ({
        taskId,
        violatedRule,
        capabilityPath,
        severity
      })),
      expectedViolations.map(({ taskId, code, path }) => ({
        taskId,
        violatedRule: code,
        capabilityPath: path,
        severity: "block"
      }))
    );
    assert.deepEqual(validation.taskCapabilityAdmissions, []);
    assert.deepEqual(validation.preHandoffVerificationTriggers, []);
    assert.deepEqual(validation.releaseGrantConditions, []);
    assert.deepEqual(validation.releaseGrantAdmission, {
      decision: "block",
      required: true,
      conditionCount: 2,
      rejectedConditionCount: 2,
      rejectionReasons: expectedViolations
        .filter(({ code }) => code === "task-required-release-grant-denied")
        .map(({ code, path, taskId, message }) => ({
          code,
          path,
          affectedPlanLocation: {
            kind: "field" as const,
            path,
            taskId
          },
          taskId,
          message
        }))
    });
    assert.equal(artifact.admitted, false);
    if (artifact.admitted) {
      assert.fail("Rejected release-capability candidate plan must not be admitted.");
    }
    assert.equal(artifact.decision, "block");
    assert.equal(Object.hasOwn(artifact, "admittedPlan"), false);
    assert.equal(Object.hasOwn(artifact.details, "taskCapabilityAdmissions"), false);
    assert.equal(Object.hasOwn(artifact.details, "preHandoffVerificationTriggers"), false);
    assert.equal(Object.hasOwn(artifact.details, "releaseGrantConditions"), false);
    assert.deepEqual(artifact.errors, expectedViolations.map((violation) => violation.message));
    assert.deepEqual(artifact.details.releaseGrantAdmission, validation.releaseGrantAdmission);

    assert.throws(
      () =>
        createPlanGraph({
          planId: "plan_release_capability_envelope_hard_rejection",
          intent: releaseDeniedIntent,
          strategy: "Attempt to promote non-release GitHub inspection authority into release authority.",
          tasks: rejectedCandidatePlan.tasks,
          createdAt: "2026-04-26T00:00:00.000Z"
        }),
      /does not contain a valid release grant/
    );
  });
});

function acceptedCriteriaFor(intent: ConfirmedIntent): PlanGraph["acceptanceCriteria"] {
  return intent.acceptanceCriteria.map(({ id, statement, verification }) => ({
    id,
    statement,
    verification
  }));
}
