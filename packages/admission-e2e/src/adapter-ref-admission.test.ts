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
  id: "intent_adapter_ref_admission_e2e",
  title: "Reject plans that select unauthorized execution adapters",
  problem: "Execution must not run a task through an adapter outside the run-level allowed set.",
  requester: "ouroboros-ac-0408",
  confirmedAt: "2026-04-27T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_adapter_ref_admission_e2e",
      statement: "Planning admission rejects adapter refs outside allowedAdapters.",
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
  constraints: ["Disallowed adapter refs must produce durable planning-admission rejection evidence."]
});

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

describe("adapterRef admission e2e", () => {
  it("rejects a fixture plan and records an adapter-ref-not-allowed violation in the refusal artifact", () => {
    const candidatePlan = defineCandidatePlan({
      planId: "plan_adapter_ref_admission_e2e",
      intentId: intent.id,
      createdAt: "2026-04-27T00:00:00.000Z",
      strategy: "Attempt to select an adapter outside the run-level allowlist.",
      acceptanceCriteria: intent.acceptanceCriteria.map(({ id, statement, verification }) => ({
        id,
        statement,
        verification
      })),
      tasks: [
        {
          id: "task-disallowed-adapter-ref-e2e",
          title: "Select a disallowed execution adapter",
          kind: "implementation",
          dependsOn: [],
          covers: ["ac_adapter_ref_admission_e2e"],
          targetFiles: ["src/Button.tsx"],
          adapterRef: "evil-adapter",
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }
      ]
    } as const satisfies PlanGraph);

    const admission = admitCandidatePlans({
      candidatePlans: [candidatePlan],
      intent,
      allowedAdapters: ["lmstudio-coder"],
      planGraphUri: "plan.json"
    });

    assert.equal(admission.ok, false);
    if (admission.ok) assert.fail("Expected disallowed adapterRef to reject the candidate plan.");
    assert.equal(admission.planningAdmission.decision, "block");
    assert.equal(admission.planningAdmission.admitted, false);
    assert.equal(admission.planningAdmission.details.validation.ok, false);
    assert.equal(
      admission.planningAdmission.details.validation.violations.some(
        (violation) =>
          violation.code === "adapter-ref-not-allowed" &&
          violation.taskId === "task-disallowed-adapter-ref-e2e"
      ),
      true
    );
  });
});
