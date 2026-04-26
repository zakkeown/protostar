import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { defineConfirmedIntent } from "@protostar/intent";

import {
  createPlanningAdmissionArtifact,
  createPlanGraph,
  defineCandidatePlan,
  validatePlanGraph,
  type PlanGraph,
  type PlanTaskRequiredCapabilities
} from "./index.js";
import { expectedPlanningAdmissionReleaseGrantRejectionReasons } from "./test-support.js";

const admittedIntent = defineConfirmedIntent({
  id: "intent_planning_release_grant_admission",
  title: "Admit release authority only through explicit release tasks",
  problem:
    "Candidate plans must not smuggle release authority into non-release tasks before execution handoff.",
  requester: "ouroboros-ac-50202",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_release_grant_requires_release_task",
      statement: "Release authority is admitted only on explicit release tasks.",
      verification: "test"
    },
    {
      id: "ac_release_grant_reaches_execution_only_as_release_task",
      statement: "Execution receives release authority only after planning admission validates a release task.",
      verification: "evidence"
    },
    {
      id: "ac_release_grant_collect_all_rejections",
      statement: "Every non-release task requesting release authority appears in rejection evidence.",
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
  constraints: [
    "Planning admission must hard-reject release authority on non-release tasks with no repair attempt."
  ]
});

const acceptedCriteria = admittedIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
  id,
  statement,
  verification
}));

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

const releaseRequiredCapabilities = {
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

describe("PlanGraph release grant admission boundary", () => {
  it("admits release grants only when the grant-bearing task is an explicit release task", () => {
    const graph = createPlanGraph({
      planId: "plan_release_grant_explicit_release_task",
      intent: admittedIntent,
      strategy: "Model release authority as a dedicated release task before execution sees it.",
      tasks: [
        {
          id: "task-verify-release-boundary",
          title: "Verify release boundary",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_release_grant_requires_release_task"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-release-artifacts",
          title: "Release admitted artifacts",
          kind: "release",
          dependsOn: ["task-verify-release-boundary"],
          covers: [
            "ac_release_grant_reaches_execution_only_as_release_task",
            "ac_release_grant_collect_all_rejections"
          ],
          requiredCapabilities: releaseRequiredCapabilities,
          risk: "medium"
        }
      ],
      createdAt: "2026-04-26T00:00:00.000Z"
    });

    const validation = validatePlanGraph({
      graph,
      intent: admittedIntent
    });
    const artifact = createPlanningAdmissionArtifact({
      graph,
      intent: admittedIntent
    });

    assert.equal(validation.ok, true);
    assert.deepEqual(validation.releaseGrantConditions, [
      {
        taskId: "task-release-artifacts",
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
      }
    ]);
    assert.deepEqual(validation.releaseGrantAdmission, {
      decision: "allow",
      required: true,
      conditionCount: 1,
      rejectedConditionCount: 0,
      rejectionReasons: []
    });
    assert.equal(artifact.admitted, true);
    assert.deepEqual(artifact.details.releaseGrantConditions, validation.releaseGrantConditions);
    assert.deepEqual(artifact.details.releaseGrantAdmission, validation.releaseGrantAdmission);
  });

  it("rejects every release grant on a candidate plan with no explicit release task", () => {
    const rejectedCandidatePlan = defineCandidatePlan({
      planId: "plan_release_grant_without_release_task",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Attempt to publish release artifacts from non-release tasks.",
      acceptanceCriteria: acceptedCriteria,
      tasks: [
        {
          id: "task-verify-release-boundary",
          title: "Verify release boundary",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_release_grant_requires_release_task"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-publish-from-implementation",
          title: "Publish from implementation",
          kind: "implementation",
          dependsOn: ["task-verify-release-boundary"],
          covers: ["ac_release_grant_reaches_execution_only_as_release_task"],
          requiredCapabilities: releaseRequiredCapabilities,
          risk: "medium"
        },
        {
          id: "task-publish-from-design",
          title: "Publish from design",
          kind: "design",
          dependsOn: ["task-verify-release-boundary"],
          covers: ["ac_release_grant_collect_all_rejections"],
          requiredCapabilities: releaseRequiredCapabilities,
          risk: "medium"
        }
      ]
    } as const satisfies PlanGraph);

    const validation = validatePlanGraph({
      graph: rejectedCandidatePlan,
      intent: admittedIntent
    });
    const artifact = createPlanningAdmissionArtifact({
      graph: rejectedCandidatePlan,
      intent: admittedIntent
    });

    assert.equal(validation.ok, false);
    assert.deepEqual(
      validation.violations.map(({ code, path, taskId, message }) => ({ code, path, taskId, message })),
      [
        {
          code: "release-grant-without-explicit-release-task",
          path: "tasks.task-publish-from-implementation.kind",
          taskId: "task-publish-from-implementation",
          message:
            "Task task-publish-from-implementation requires release authority and must be an explicit release task before planning admission."
        },
        {
          code: "release-grant-without-explicit-release-task",
          path: "tasks.task-publish-from-design.kind",
          taskId: "task-publish-from-design",
          message:
            "Task task-publish-from-design requires release authority and must be an explicit release task before planning admission."
        }
      ]
    );
    assert.deepEqual(validation.taskCapabilityRequirements, []);
    assert.deepEqual(validation.taskCapabilityAdmissions, []);
    assert.deepEqual(validation.releaseGrantConditions, []);
    assert.deepEqual(validation.releaseGrantAdmission, {
      decision: "block",
      required: true,
      conditionCount: 2,
      rejectedConditionCount: 2,
      rejectionReasons: expectedPlanningAdmissionReleaseGrantRejectionReasons([
        {
          validator: "release-grant-task",
          code: "release-grant-without-explicit-release-task",
          path: "tasks.task-publish-from-implementation.kind",
          taskId: "task-publish-from-implementation",
          message:
            "Task task-publish-from-implementation requires release authority and must be an explicit release task before planning admission."
        },
        {
          validator: "release-grant-task",
          code: "release-grant-without-explicit-release-task",
          path: "tasks.task-publish-from-design.kind",
          taskId: "task-publish-from-design",
          message:
            "Task task-publish-from-design requires release authority and must be an explicit release task before planning admission."
        }
      ])
    });
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
    assert.deepEqual(artifact.details.releaseGrantAdmission, validation.releaseGrantAdmission);
    assert.equal(Object.hasOwn(artifact, "admittedPlan"), false);
    assert.equal(Object.hasOwn(artifact.details, "releaseGrantConditions"), false);

    assert.throws(
      () =>
        createPlanGraph({
          planId: "plan_release_grant_hard_rejection",
          intent: admittedIntent,
          strategy: "Attempt to publish release artifacts from non-release tasks.",
          tasks: rejectedCandidatePlan.tasks,
          createdAt: "2026-04-26T00:00:00.000Z"
        }),
      /must be an explicit release task before planning admission/
    );
  });

  it("rejects release grant tasks that are not guarded by verification evidence", () => {
    const rejectedCandidatePlan = defineCandidatePlan({
      planId: "plan_release_grant_without_verification_evidence",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Attempt to publish release artifacts before verification evidence exists.",
      acceptanceCriteria: acceptedCriteria,
      tasks: [
        {
          id: "task-design-release-boundary",
          title: "Design release boundary",
          kind: "design",
          dependsOn: [],
          covers: ["ac_release_grant_requires_release_task"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-release-without-guard",
          title: "Release without guard",
          kind: "release",
          dependsOn: [],
          covers: ["ac_release_grant_reaches_execution_only_as_release_task"],
          requiredCapabilities: releaseRequiredCapabilities,
          risk: "medium"
        },
        {
          id: "task-release-through-design-only",
          title: "Release through design only",
          kind: "release",
          dependsOn: ["task-design-release-boundary"],
          covers: ["ac_release_grant_collect_all_rejections"],
          requiredCapabilities: releaseRequiredCapabilities,
          risk: "medium"
        }
      ]
    } as const satisfies PlanGraph);

    const validation = validatePlanGraph({
      graph: rejectedCandidatePlan,
      intent: admittedIntent
    });
    const artifact = createPlanningAdmissionArtifact({
      graph: rejectedCandidatePlan,
      intent: admittedIntent
    });

    assert.equal(validation.ok, false);
    assert.deepEqual(
      validation.violations.map(({ code, path, taskId, message }) => ({ code, path, taskId, message })),
      [
        {
          code: "release-grant-missing-verification-evidence",
          path: "tasks.task-release-without-guard.dependsOn",
          taskId: "task-release-without-guard",
          message:
            "Task task-release-without-guard requires release authority and must depend on explicit verification evidence before planning admission."
        },
        {
          code: "release-grant-missing-verification-evidence",
          path: "tasks.task-release-through-design-only.dependsOn",
          taskId: "task-release-through-design-only",
          message:
            "Task task-release-through-design-only requires release authority and must depend on explicit verification evidence before planning admission."
        }
      ]
    );
    assert.deepEqual(validation.taskCapabilityRequirements, []);
    assert.deepEqual(validation.taskCapabilityAdmissions, []);
    assert.deepEqual(validation.releaseGrantConditions, []);
    assert.deepEqual(validation.releaseGrantAdmission, {
      decision: "block",
      required: true,
      conditionCount: 2,
      rejectedConditionCount: 2,
      rejectionReasons: expectedPlanningAdmissionReleaseGrantRejectionReasons([
        {
          validator: "release-grant-task",
          code: "release-grant-missing-verification-evidence",
          path: "tasks.task-release-without-guard.dependsOn",
          taskId: "task-release-without-guard",
          message:
            "Task task-release-without-guard requires release authority and must depend on explicit verification evidence before planning admission."
        },
        {
          validator: "release-grant-task",
          code: "release-grant-missing-verification-evidence",
          path: "tasks.task-release-through-design-only.dependsOn",
          taskId: "task-release-through-design-only",
          message:
            "Task task-release-through-design-only requires release authority and must depend on explicit verification evidence before planning admission."
        }
      ])
    });
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
    assert.deepEqual(artifact.details.releaseGrantAdmission, validation.releaseGrantAdmission);
    assert.equal(Object.hasOwn(artifact, "admittedPlan"), false);
    assert.equal(Object.hasOwn(artifact.details, "releaseGrantConditions"), false);

    assert.throws(
      () =>
        createPlanGraph({
          planId: "plan_release_grant_missing_verification_hard_rejection",
          intent: admittedIntent,
          strategy: "Attempt to publish release artifacts before verification evidence exists.",
          tasks: rejectedCandidatePlan.tasks,
          createdAt: "2026-04-26T00:00:00.000Z"
        }),
      /must depend on explicit verification evidence before planning admission/
    );
  });
});
