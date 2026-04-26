import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { defineConfirmedIntent } from "@protostar/intent";

import {
  createPlanningAdmissionArtifact,
  createPlanGraph,
  defineCandidatePlan,
  validatePlanGraph,
  type PlanGraph,
  type PlanningAdmissionPreHandoffVerificationTrigger,
  type PlanTaskRequiredCapabilities
} from "./index.js";

const admittedIntent = defineConfirmedIntent({
  id: "intent_planning_pre_handoff_verification",
  title: "Verify write and PR authority before execution handoff",
  problem:
    "Planning admission must block write or PR-capable execution handoff tasks unless verification is explicit in the PlanGraph.",
  requester: "ouroboros-ac-50102",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_pre_handoff_verification_gate",
      statement: "Write and PR-capable execution handoff tasks are preceded by an explicit verification task.",
      verification: "test"
    },
    {
      id: "ac_pre_handoff_execution_handoff",
      statement: "Execution handoff tasks cannot receive write or PR authority until planning admission validates the gate.",
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
        tool: "gh",
        permissionLevel: "execute",
        reason: "Open pull requests after pre-handoff verification.",
        risk: "low"
      }
    ],
    executeGrants: [
      {
        command: "gh pr create --fill",
        scope: "repository",
        reason: "Open the delivery PR after verification."
      }
    ],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: [
    "Planning admission must hard-reject missing pre-handoff verification with no repair attempt."
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

const writeAndPrRequiredCapabilities = {
  repoScopes: [
    {
      workspace: "protostar",
      path: "packages/planning/src",
      access: "write"
    }
  ],
  toolPermissions: [
    {
      tool: "gh",
      permissionLevel: "execute",
      reason: "Open the delivery pull request.",
      risk: "low"
    }
  ],
  executeGrants: [
    {
      command: "gh pr create --fill",
      scope: "repository",
      reason: "Open the delivery PR after verification."
    }
  ],
  budget: {
    timeoutMs: 30_000,
    maxRepairLoops: 0
  }
} as const satisfies PlanTaskRequiredCapabilities;

const expectedPreHandoffTriggers: readonly PlanningAdmissionPreHandoffVerificationTrigger[] = [
  {
    taskId: "task-execution-handoff-after-verification",
    grantKind: "write",
    authority: "repository-write",
    source: "candidate-plan-required-capabilities",
    verificationPhase: "pre-handoff",
    capabilityRefs: [
      {
        section: "repoScopes",
        index: 0,
        source: "repo-scope-access"
      }
    ]
  },
  {
    taskId: "task-execution-handoff-after-verification",
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
  }
];

const missingPrWriteVerificationFixtureUrl = new URL(
  "../../../examples/planning-results/bad-missing-pr-write-verification.json",
  import.meta.url
);

describe("PlanGraph pre-handoff verification admission boundary", () => {
  it("admits write and PR-capable execution handoff tasks only after an explicit verification dependency", () => {
    const graph = createPlanGraph({
      planId: "plan_pre_handoff_verification_admitted",
      intent: admittedIntent,
      strategy: "Validate an explicit verification task before execution handoff authority is admitted.",
      tasks: [
        {
          id: "task-verify-before-execution-handoff",
          title: "Verify before execution handoff",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_pre_handoff_verification_gate"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-execution-handoff-after-verification",
          title: "Execute after verification",
          kind: "implementation",
          dependsOn: ["task-verify-before-execution-handoff"],
          covers: ["ac_pre_handoff_execution_handoff"],
          requiredCapabilities: writeAndPrRequiredCapabilities,
          risk: "low"
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
    assert.deepEqual(validation.preHandoffVerificationTriggers, expectedPreHandoffTriggers);
    assert.equal(artifact.admitted, true);
    assert.deepEqual(artifact.details.preHandoffVerificationTriggers, expectedPreHandoffTriggers);
  });

  it("collects every write and PR-capable execution handoff task missing a preceding verification task", () => {
    const rejectedCandidatePlan = defineCandidatePlan({
      planId: "plan_pre_handoff_verification_rejection",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Attempt to hand write and PR-capable implementation tasks to execution without verification.",
      acceptanceCriteria: acceptedCriteria,
      tasks: [
        {
          id: "task-design-before-handoff",
          title: "Design before handoff without verifying",
          kind: "design",
          dependsOn: [],
          covers: ["ac_pre_handoff_verification_gate"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-handoff-without-verification",
          title: "Handoff without verification",
          kind: "implementation",
          dependsOn: [],
          covers: ["ac_pre_handoff_execution_handoff"],
          requiredCapabilities: writeAndPrRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-handoff-through-design-only",
          title: "Handoff through a non-verification predecessor",
          kind: "implementation",
          dependsOn: ["task-design-before-handoff"],
          covers: ["ac_pre_handoff_execution_handoff"],
          requiredCapabilities: writeAndPrRequiredCapabilities,
          risk: "low"
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
          code: "verification_required_by_envelope",
          path: "tasks.task-handoff-without-verification.dependsOn",
          taskId: "task-handoff-without-verification",
          message:
            "Task task-handoff-without-verification requires write and pull-request authority for execution handoff and must depend on an explicit verification task before admission."
        },
        {
          code: "verification_required_by_envelope",
          path: "tasks.task-handoff-through-design-only.dependsOn",
          taskId: "task-handoff-through-design-only",
          message:
            "Task task-handoff-through-design-only requires write and pull-request authority for execution handoff and must depend on an explicit verification task before admission."
        }
      ]
    );
    assert.deepEqual(validation.taskCapabilityRequirements, []);
    assert.deepEqual(validation.taskCapabilityAdmissions, []);
    assert.deepEqual(validation.preHandoffVerificationTriggers, []);
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
    assert.equal(Object.hasOwn(artifact, "admittedPlan"), false);
    assert.equal(Object.hasOwn(artifact.details, "preHandoffVerificationTriggers"), false);

    assert.throws(
      () =>
        createPlanGraph({
          planId: "plan_pre_handoff_verification_hard_rejection",
          intent: admittedIntent,
          strategy: "Attempt to admit an implementation handoff without verification.",
          tasks: rejectedCandidatePlan.tasks,
          createdAt: "2026-04-26T00:00:00.000Z"
        }),
      /must depend on an explicit verification task before admission/
    );
  });

  it("hard-rejects the bad missing PR-write verification fixture with verification_required_by_envelope", () => {
    const fixtureTasks = readPlanningResultFixtureTasks(missingPrWriteVerificationFixtureUrl);
    const rejectedFixturePlan = defineCandidatePlan({
      planId: "plan_bad_missing_pr_write_verification_fixture",
      intentId: admittedIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Replay the durable bad fixture through planning admission.",
      acceptanceCriteria: acceptedCriteria,
      tasks: fixtureTasks
    } satisfies PlanGraph);

    const validation = validatePlanGraph({
      graph: rejectedFixturePlan,
      intent: admittedIntent
    });
    const artifact = createPlanningAdmissionArtifact({
      graph: rejectedFixturePlan,
      intent: admittedIntent
    });

    assert.equal(validation.ok, false);
    assert.deepEqual(
      validation.violations.map(({ code, path, taskId, message }) => ({ code, path, taskId, message })),
      [
        {
          code: "verification_required_by_envelope",
          path: "tasks.task-pr-write-handoff-without-verification.dependsOn",
          taskId: "task-pr-write-handoff-without-verification",
          message:
            "Task task-pr-write-handoff-without-verification requires write and pull-request authority for execution handoff and must depend on an explicit verification task before admission."
        }
      ]
    );
    assert.equal(artifact.admitted, false);
    assert.equal(artifact.decision, "block");
    assert.equal(artifact.details.validation.violationCount, 1);
    assert.equal(Object.hasOwn(artifact, "admittedPlan"), false);
    assert.equal(Object.hasOwn(artifact.details, "preHandoffVerificationTriggers"), false);

    assert.throws(
      () =>
        createPlanGraph({
          planId: "plan_bad_missing_pr_write_verification_hard_rejection",
          intent: admittedIntent,
          strategy: "Attempt to admit the bad missing PR-write verification fixture.",
          tasks: fixtureTasks,
          createdAt: "2026-04-26T00:00:00.000Z"
        }),
      /verification task before admission/
    );
  });
});

function readPlanningResultFixtureTasks(fixtureUrl: URL): PlanGraph["tasks"] {
  const fixture = JSON.parse(readFileSync(fixtureUrl, "utf8")) as { readonly output?: unknown };
  const fixtureOutput = fixture.output;
  if (typeof fixtureOutput !== "string") {
    assert.fail("Planning result fixture output must be a JSON string.");
  }

  const output = JSON.parse(fixtureOutput) as { readonly tasks?: unknown };
  assert.equal(Array.isArray(output.tasks), true);

  return output.tasks as PlanGraph["tasks"];
}
