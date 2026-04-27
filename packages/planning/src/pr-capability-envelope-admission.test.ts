import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type ConfirmedIntent } from "@protostar/intent";
import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";

import {
  createPlanningAdmissionArtifact,
  createPlanGraph,
  defineCandidatePlan,
  validatePlanGraph,
  type PlanGraph,
  type PlanTaskCapabilityAdmissionResult,
  type PlanTaskRequiredCapabilities,
  type PlanningAdmissionPreHandoffVerificationTrigger
} from "./index.js";

const prAdmittedIntent = buildConfirmedIntentForTest({
  id: "intent_planning_pr_capability_envelope_admitted",
  title: "Admit candidate-plan pull request authority from the confirmed envelope",
  problem:
    "Planning admission must admit pull request requirements only when the confirmed capability envelope grants that authority.",
  requester: "ouroboros-ac-50302",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_pr_capability_envelope_admitted",
      statement:
        "A candidate task requiring pull request authority inside the confirmed envelope is admitted.",
      verification: "test"
    },
    {
      id: "ac_pr_capability_envelope_handoff_guarded",
      statement:
        "Admitted pull request authority is still classified as a pre-handoff verification trigger before execution.",
      verification: "test"
    }
  ],
  capabilityEnvelope: {
    repoScopes: [],
    toolPermissions: [
      {
        tool: "gh",
        permissionLevel: "execute",
        reason: "Open pull requests after planning admission.",
        risk: "low"
      }
    ],
    executeGrants: [
      {
        command: "gh pr create --fill",
        scope: "repository",
        reason: "Open the delivery pull request."
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["Candidate plans may not invent pull request authority outside the confirmed envelope."]
});

const prDeniedIntent = buildConfirmedIntentForTest({
  id: "intent_planning_pr_capability_envelope_rejected",
  title: "Reject candidate-plan pull request authority outside the confirmed envelope",
  problem:
    "Planning admission must block pull request requirements when the confirmed capability envelope grants only non-PR GitHub inspection authority.",
  requester: "ouroboros-ac-50302",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_pr_capability_envelope_rejected",
      statement:
        "A candidate task requiring pull request authority from a non-PR envelope is rejected.",
      verification: "test"
    },
    {
      id: "ac_pr_tool_grant_rejection_collected",
      statement: "Tool-permission PR requirements appear in rejection evidence.",
      verification: "test"
    },
    {
      id: "ac_pr_execute_grant_rejection_collected",
      statement: "Execute-grant PR requirements appear in rejection evidence.",
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
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["GitHub inspection authority must not be promoted into pull request authority."]
});

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

const admittedPullRequestCapabilities = {
  repoScopes: [],
  toolPermissions: [
    {
      tool: "gh",
      permissionLevel: "execute",
      reason: "Open the delivery pull request after admission.",
      risk: "low"
    }
  ],
  executeGrants: [
    {
      command: "gh pr create --fill",
      scope: "repository",
      reason: "Open the delivery pull request."
    }
  ],
  budget: {
    timeoutMs: 30_000,
    maxRepairLoops: 0
  }
} as const satisfies PlanTaskRequiredCapabilities;

const prToolRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [
    {
      tool: "gh",
      permissionLevel: "execute",
      reason: "Open the delivery pull request after admission.",
      risk: "low"
    }
  ],
  budget: {
    timeoutMs: 30_000,
    maxRepairLoops: 0
  }
} as const satisfies PlanTaskRequiredCapabilities;

const prExecuteRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  executeGrants: [
    {
      command: "gh pr create --fill",
      scope: "repository",
      reason: "Open the delivery pull request."
    }
  ],
  budget: {
    timeoutMs: 30_000,
    maxRepairLoops: 0
  }
} as const satisfies PlanTaskRequiredCapabilities;

const expectedPullRequestPreHandoffTrigger: PlanningAdmissionPreHandoffVerificationTrigger = {
  taskId: "task-open-admitted-pull-request",
  grantKind: "pr",
  authority: "pull-request",
  source: "candidate-plan-required-capabilities",
  verificationPhase: "pre-handoff",
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

describe("PlanGraph PR capability-envelope admission boundary", () => {
  it("admits candidate-plan PR capabilities covered by the confirmed capability envelope", () => {
    const graph = createPlanGraph({
      planId: "plan_pr_capability_envelope_admitted",
      intent: prAdmittedIntent,
      strategy: "Admit pull request authority only inside the confirmed planning package envelope.",
      tasks: [
        {
          id: "task-verify-pr-capability-envelope",
          title: "Verify PR capability envelope",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_pr_capability_envelope_handoff_guarded"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-open-admitted-pull-request",
          title: "Open admitted pull request",
          kind: "implementation",
          dependsOn: ["task-verify-pr-capability-envelope"],
          covers: ["ac_pr_capability_envelope_admitted"],
          requiredCapabilities: admittedPullRequestCapabilities,
          risk: "low"
        }
      ],
      createdAt: "2026-04-26T00:00:00.000Z"
    });
    const expectedCapabilityAdmissions: readonly PlanTaskCapabilityAdmissionResult[] = [
      {
        taskId: "task-verify-pr-capability-envelope",
        requestedCapabilities: noRequiredCapabilities,
        admittedCapabilities: noRequiredCapabilities,
        verdict: "allow"
      },
      {
        taskId: "task-open-admitted-pull-request",
        requestedCapabilities: admittedPullRequestCapabilities,
        admittedCapabilities: admittedPullRequestCapabilities,
        verdict: "allow"
      }
    ];

    const validation = validatePlanGraph({
      graph,
      intent: prAdmittedIntent
    });
    const artifact = createPlanningAdmissionArtifact({
      graph,
      intent: prAdmittedIntent
    });

    assert.equal(validation.ok, true);
    assert.deepEqual(validation.violations, []);
    assert.deepEqual(validation.taskCapabilityAdmissions, expectedCapabilityAdmissions);
    assert.deepEqual(validation.preHandoffVerificationTriggers, [expectedPullRequestPreHandoffTrigger]);
    assert.equal(artifact.admitted, true);
    if (!artifact.admitted) {
      assert.fail("Expected PR-capability candidate plan to be admitted.");
    }
    assert.deepEqual(artifact.details.taskCapabilityAdmissions, expectedCapabilityAdmissions);
    assert.deepEqual(artifact.details.preHandoffVerificationTriggers, [
      expectedPullRequestPreHandoffTrigger
    ]);
  });

  it("rejects candidate-plan PR capabilities when the confirmed envelope lacks a PR grant", () => {
    const rejectedCandidatePlan = defineCandidatePlan({
      planId: "plan_pr_capability_envelope_rejection",
      intentId: prDeniedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Attempt to promote non-PR GitHub inspection authority into pull request authority.",
      acceptanceCriteria: acceptedCriteriaFor(prDeniedIntent),
      tasks: [
        {
          id: "task-verify-non-pr-envelope",
          title: "Verify non-PR envelope",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_pr_capability_envelope_rejected"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-require-pr-tool-without-grant",
          title: "Require PR tool authority without grant",
          kind: "implementation",
          dependsOn: ["task-verify-non-pr-envelope"],
          covers: ["ac_pr_tool_grant_rejection_collected"],
          requiredCapabilities: prToolRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-require-pr-execute-without-grant",
          title: "Require PR execute authority without grant",
          kind: "implementation",
          dependsOn: ["task-verify-non-pr-envelope"],
          covers: ["ac_pr_execute_grant_rejection_collected"],
          requiredCapabilities: prExecuteRequiredCapabilities,
          risk: "low"
        }
      ]
    } as const satisfies PlanGraph);

    const validation = validatePlanGraph({
      graph: rejectedCandidatePlan,
      intent: prDeniedIntent
    });
    const artifact = createPlanningAdmissionArtifact({
      graph: rejectedCandidatePlan,
      intent: prDeniedIntent
    });

    const expectedViolations = [
      {
        validator: "task-contracts",
        code: "task-required-pull-request-grant-denied",
        path: "tasks.task-require-pr-tool-without-grant.requiredCapabilities.toolPermissions.0",
        taskId: "task-require-pr-tool-without-grant",
        message:
          "Task task-require-pr-tool-without-grant requires tool permission gh (execute, low), but the normalized planning admission grant model does not contain a valid pr grant."
      },
      {
        validator: "task-contracts",
        code: "task-required-pull-request-grant-denied",
        path: "tasks.task-require-pr-execute-without-grant.requiredCapabilities.executeGrants.0",
        taskId: "task-require-pr-execute-without-grant",
        message:
          "Task task-require-pr-execute-without-grant requires execute grant 'gh pr create --fill' in scope 'repository', but the normalized planning admission grant model does not contain a valid pr grant."
      },
      {
        validator: "task-contracts",
        code: "task-required-execute-grant-outside-intent-envelope",
        path: "tasks.task-require-pr-execute-without-grant.requiredCapabilities.executeGrants.0",
        taskId: "task-require-pr-execute-without-grant",
        message:
          "Task task-require-pr-execute-without-grant requires execute grant 'gh pr create --fill' in scope 'repository' outside confirmed intent capability envelope."
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
    assert.equal(artifact.admitted, false);
    if (artifact.admitted) {
      assert.fail("Rejected PR-capability candidate plan must not be admitted.");
    }
    assert.equal(artifact.decision, "block");
    assert.equal(Object.hasOwn(artifact, "admittedPlan"), false);
    assert.equal(Object.hasOwn(artifact.details, "taskCapabilityAdmissions"), false);
    assert.equal(Object.hasOwn(artifact.details, "preHandoffVerificationTriggers"), false);
    assert.deepEqual(artifact.errors, expectedViolations.map((violation) => violation.message));

    assert.throws(
      () =>
        createPlanGraph({
          planId: "plan_pr_capability_envelope_hard_rejection",
          intent: prDeniedIntent,
          strategy: "Attempt to promote non-PR GitHub inspection authority into pull request authority.",
          tasks: rejectedCandidatePlan.tasks,
          createdAt: "2026-04-26T00:00:00.000Z"
        }),
      /does not contain a valid pr grant/
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
