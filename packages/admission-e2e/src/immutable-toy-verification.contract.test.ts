import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";
import {
  admitCandidatePlans,
  defineCandidatePlan,
  type PlanGraph,
  type PlanTaskRequiredCapabilities
} from "@protostar/planning";

const intent = buildConfirmedIntentForTest({
  id: "intent_immutable_toy_verification_e2e",
  title: "Refuse factory edits to operator-authored toy verification",
  problem: "Generated plans must not weaken TTT verification by modifying toy repo E2E or property tests.",
  requester: "ouroboros-ac-1104",
  confirmedAt: "2026-04-29T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_immutable_toy_verification_e2e",
      statement: "Planning admission rejects immutable toy verification targetFiles.",
      verification: "test"
    }
  ],
  capabilityEnvelope: {
    repoScopes: [],
    toolPermissions: [],
    budget: {
      timeoutMs: 30_000,
      maxRepairLoops: 0
    }
  },
  constraints: [
    "Operator-authored toy verification files are immutable from factory-generated plans."
  ]
});

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

describe("admission-e2e: immutable toy verification files", () => {
  it("records immutable-target-file in the planning admission artifact", () => {
    const candidatePlan = defineCandidatePlan({
      planId: "plan_immutable_toy_verification_e2e",
      intentId: intent.id,
      createdAt: "2026-04-29T00:00:00.000Z",
      strategy: "Attempt to modify toy repo verification files.",
      acceptanceCriteria: intent.acceptanceCriteria.map(({ id, statement, verification }) => ({
        id,
        statement,
        verification
      })),
      tasks: [
        {
          id: "task-mutates-toy-verification",
          title: "Try to edit immutable toy verification",
          kind: "implementation",
          dependsOn: [],
          covers: ["ac_immutable_toy_verification_e2e"],
          targetFiles: ["e2e/ttt.spec.ts", "tests/ttt-state.property.test.ts"],
          acceptanceTestRefs: [
            {
              acId: "ac_immutable_toy_verification_e2e",
              testFile: "packages/admission-e2e/src/immutable-toy-verification.contract.test.ts",
              testName: "records immutable-target-file in the planning admission artifact"
            }
          ],
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ]
    } as const satisfies PlanGraph);

    const admission = admitCandidatePlans({
      candidatePlans: [candidatePlan],
      intent,
      planGraphUri: "plan.json"
    });

    assert.equal(admission.ok, false);
    if (admission.ok) assert.fail("Expected immutable toy verification targetFiles to reject.");
    assert.equal(admission.planningAdmission.decision, "block");
    assert.equal(admission.planningAdmission.admitted, false);
    assert.equal(
      admission.planningAdmission.details.validation.violations.some(
        (violation) =>
          violation.code === "immutable-target-file" &&
          violation.path === "tasks.task-mutates-toy-verification.targetFiles.0"
      ),
      true
    );
    assert.equal(
      admission.planningAdmission.details.failure.rejectionReasons.some(
        (reason) =>
          reason.code === "immutable-target-file" &&
          reason.taskId === "task-mutates-toy-verification"
      ),
      true
    );
  });
});
