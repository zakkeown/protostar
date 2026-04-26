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
  type PlanningAdmissionPreHandoffVerificationTrigger
} from "./index.js";

const writeAdmittedIntent = defineConfirmedIntent({
  id: "intent_planning_write_capability_envelope_admitted",
  title: "Admit candidate-plan write capabilities from the confirmed envelope",
  problem:
    "Planning admission must admit repository write requirements only when the confirmed capability envelope grants that authority.",
  requester: "ouroboros-ac-50301",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_write_capability_envelope_admitted",
      statement:
        "A candidate task requiring repository write authority inside the confirmed envelope is admitted.",
      verification: "test"
    },
    {
      id: "ac_write_capability_envelope_handoff_guarded",
      statement:
        "Admitted write authority is still classified as a pre-handoff verification trigger before execution.",
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
    toolPermissions: [],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["Candidate plans may not invent write authority outside the confirmed envelope."]
});

const readOnlyIntent = defineConfirmedIntent({
  id: "intent_planning_write_capability_envelope_rejected",
  title: "Reject candidate-plan write capabilities outside the confirmed envelope",
  problem:
    "Planning admission must block repository write requirements when the confirmed capability envelope grants only read authority.",
  requester: "ouroboros-ac-50301",
  confirmedAt: "2026-04-26T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_write_capability_envelope_rejected",
      statement:
        "A candidate task requiring repository write authority from a read-only envelope is rejected.",
      verification: "test"
    },
    {
      id: "ac_rejected_write_capability_no_execution_handoff",
      statement:
        "Rejected write-capability candidates do not expose admitted task capability evidence for execution.",
      verification: "test"
    }
  ],
  capabilityEnvelope: {
    repoScopes: [
      {
        workspace: "protostar",
        path: "packages/planning",
        access: "read"
      }
    ],
    toolPermissions: [],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: ["Read authority must not be promoted into write authority during planning admission."]
});

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

const admittedWriteCapabilities = {
  repoScopes: [
    {
      workspace: "protostar",
      path: "packages/planning/src",
      access: "write"
    }
  ],
  toolPermissions: [],
  budget: {
    timeoutMs: 30_000,
    maxRepairLoops: 0
  }
} as const satisfies PlanTaskRequiredCapabilities;

const expectedWritePreHandoffTrigger: PlanningAdmissionPreHandoffVerificationTrigger = {
  taskId: "task-apply-admitted-write-capability",
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
};

describe("PlanGraph write capability-envelope admission boundary", () => {
  it("admits candidate-plan write capabilities covered by the confirmed capability envelope", () => {
    const graph = createPlanGraph({
      planId: "plan_write_capability_envelope_admitted",
      intent: writeAdmittedIntent,
      strategy: "Admit repository write authority only inside the confirmed planning package envelope.",
      tasks: [
        {
          id: "task-verify-write-capability-envelope",
          title: "Verify write capability envelope",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_write_capability_envelope_handoff_guarded"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-apply-admitted-write-capability",
          title: "Apply admitted write capability",
          kind: "implementation",
          dependsOn: ["task-verify-write-capability-envelope"],
          covers: ["ac_write_capability_envelope_admitted"],
          requiredCapabilities: admittedWriteCapabilities,
          risk: "low"
        }
      ],
      createdAt: "2026-04-26T00:00:00.000Z"
    });
    const expectedCapabilityAdmissions: readonly PlanTaskCapabilityAdmissionResult[] = [
      {
        taskId: "task-verify-write-capability-envelope",
        requestedCapabilities: noRequiredCapabilities,
        admittedCapabilities: noRequiredCapabilities,
        verdict: "allow"
      },
      {
        taskId: "task-apply-admitted-write-capability",
        requestedCapabilities: admittedWriteCapabilities,
        admittedCapabilities: admittedWriteCapabilities,
        verdict: "allow"
      }
    ];

    const validation = validatePlanGraph({
      graph,
      intent: writeAdmittedIntent
    });
    const artifact = createPlanningAdmissionArtifact({
      graph,
      intent: writeAdmittedIntent
    });

    assert.equal(validation.ok, true);
    assert.deepEqual(validation.violations, []);
    assert.deepEqual(validation.taskCapabilityAdmissions, expectedCapabilityAdmissions);
    assert.deepEqual(validation.preHandoffVerificationTriggers, [expectedWritePreHandoffTrigger]);
    assert.equal(artifact.admitted, true);
    if (!artifact.admitted) {
      assert.fail("Expected write-capability candidate plan to be admitted.");
    }
    assert.deepEqual(artifact.details.taskCapabilityAdmissions, expectedCapabilityAdmissions);
    assert.deepEqual(artifact.details.preHandoffVerificationTriggers, [expectedWritePreHandoffTrigger]);
  });

  it("rejects candidate-plan write capabilities when the confirmed envelope is read-only", () => {
    const rejectedCandidatePlan = defineCandidatePlan({
      planId: "plan_write_capability_envelope_read_only_rejection",
      intentId: readOnlyIntent.id,
      createdAt: "2026-04-26T00:00:00.000Z",
      strategy: "Attempt to promote a read-only confirmed intent envelope into repository write authority.",
      acceptanceCriteria: acceptedCriteriaFor(readOnlyIntent),
      tasks: [
        {
          id: "task-verify-read-only-envelope",
          title: "Verify read-only envelope",
          kind: "verification",
          dependsOn: [],
          covers: ["ac_rejected_write_capability_no_execution_handoff"],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        },
        {
          id: "task-require-read-only-write-capability",
          title: "Require write from read-only envelope",
          kind: "implementation",
          dependsOn: ["task-verify-read-only-envelope"],
          covers: ["ac_write_capability_envelope_rejected"],
          requiredCapabilities: admittedWriteCapabilities,
          risk: "low"
        }
      ]
    } as const satisfies PlanGraph);

    const validation = validatePlanGraph({
      graph: rejectedCandidatePlan,
      intent: readOnlyIntent
    });
    const artifact = createPlanningAdmissionArtifact({
      graph: rejectedCandidatePlan,
      intent: readOnlyIntent
    });

    const expectedViolations = [
      {
        validator: "task-contracts",
        code: "task-required-write-grant-denied",
        path: "tasks.task-require-read-only-write-capability.requiredCapabilities.repoScopes.0",
        taskId: "task-require-read-only-write-capability",
        message:
          "Task task-require-read-only-write-capability requires repo scope protostar:packages/planning/src:write, but the normalized planning admission grant model does not contain a valid write grant."
      },
      {
        validator: "task-contracts",
        code: "task-required-repo-scope-outside-intent-envelope",
        path: "tasks.task-require-read-only-write-capability.requiredCapabilities.repoScopes.0",
        taskId: "task-require-read-only-write-capability",
        message:
          "Task task-require-read-only-write-capability requires repo scope protostar:packages/planning/src:write outside confirmed intent capability envelope."
      }
    ] as const;

    assert.equal(validation.ok, false);
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
      [
        {
          taskId: "task-require-read-only-write-capability",
          violatedRule: "task-required-write-grant-denied",
          capabilityPath: "tasks.task-require-read-only-write-capability.requiredCapabilities.repoScopes.0",
          severity: "block"
        },
        {
          taskId: "task-require-read-only-write-capability",
          violatedRule: "task-required-repo-scope-outside-intent-envelope",
          capabilityPath: "tasks.task-require-read-only-write-capability.requiredCapabilities.repoScopes.0",
          severity: "block"
        }
      ]
    );
    assert.deepEqual(validation.taskCapabilityAdmissions, []);
    assert.deepEqual(validation.preHandoffVerificationTriggers, []);
    assert.equal(artifact.admitted, false);
    if (artifact.admitted) {
      assert.fail("Rejected write-capability candidate plan must not be admitted.");
    }
    assert.equal(artifact.decision, "block");
    assert.equal(Object.hasOwn(artifact, "admittedPlan"), false);
    assert.equal(Object.hasOwn(artifact.details, "taskCapabilityAdmissions"), false);
    assert.deepEqual(artifact.errors, expectedViolations.map((violation) => violation.message));
    assert.deepEqual(
      artifact.details.validation.capabilityViolationDiagnostics.map(
        ({ taskId, violatedRule, capabilityPath, severity }) => ({
          taskId,
          violatedRule,
          capabilityPath,
          severity
        })
      ),
      validation.capabilityViolationDiagnostics.map(({ taskId, violatedRule, capabilityPath, severity }) => ({
        taskId,
        violatedRule,
        capabilityPath,
        severity
      }))
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
