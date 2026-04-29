import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";
import { admitFeatureAddCapabilityEnvelope, type CapabilityEnvelope, type IntentDraft } from "@protostar/intent";
import {
  admitCandidatePlans,
  defineCandidatePlan,
  type PlanGraph,
  type PlanTaskRequiredCapabilities
} from "@protostar/planning";

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

describe("admission-e2e: feature-add pnpm admission", () => {
  it("admits multi-file feature-add target files plus allowlisted pnpm adds", () => {
    const capability = admitFeatureAddCapabilityEnvelope({
      draft: featureAddDraftWithAllowedPnpmAdds()
    });

    if (!capability.ok) {
      assert.fail(`feature-add pnpm admission should pass: ${capability.errors.join("; ")}`);
    }
    assert.deepEqual(pnpmAllowedAdds(capability.grant.capabilityEnvelope), [
      "@playwright/test@^1.59.1 -D",
      "fast-check@^4.7.0 -D"
    ]);

    const candidatePlan = defineCandidatePlan({
      planId: "plan_feature_add_pnpm_admission",
      intentId: featureAddIntent.id,
      createdAt: "2026-04-29T00:00:00.000Z",
      strategy: "Implement a TTT game with ordinary app files and curated package-add authority.",
      acceptanceCriteria: featureAddIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
        id,
        statement,
        verification
      })),
      tasks: [
        {
          id: "task-add-ttt-game",
          title: "Add TTT game",
          kind: "implementation",
          dependsOn: [],
          covers: ["ac_feature_add_pnpm"],
          targetFiles: ["src/App.tsx", "src/components/TicTacToeBoard.tsx"],
          acceptanceTestRefs: [
            {
              acId: "ac_feature_add_pnpm",
              testFile: "packages/admission-e2e/src/feature-add-pnpm-admission.contract.test.ts",
              testName: "admits multi-file feature-add target files plus allowlisted pnpm adds"
            }
          ],
          requiredCapabilities: noRequiredCapabilities,
          risk: "medium"
        }
      ]
    } as const satisfies PlanGraph);

    const admission = admitCandidatePlans({
      candidatePlans: [candidatePlan],
      intent: featureAddIntent,
      planGraphUri: "plan.json"
    });

    assert.equal(admission.ok, true, admission.ok ? "" : admission.errors.join("; "));
  });

  it("still refuses immutable TTT verification target files through planning admission", () => {
    const candidatePlan = defineCandidatePlan({
      planId: "plan_feature_add_pnpm_immutable_refusal",
      intentId: featureAddIntent.id,
      createdAt: "2026-04-29T00:00:00.000Z",
      strategy: "Attempt to weaken operator-authored toy verification while requesting feature-add authority.",
      acceptanceCriteria: featureAddIntent.acceptanceCriteria.map(({ id, statement, verification }) => ({
        id,
        statement,
        verification
      })),
      tasks: [
        {
          id: "task-mutates-immutable-ttt-verification",
          title: "Try to edit immutable TTT verification",
          kind: "implementation",
          dependsOn: [],
          covers: ["ac_feature_add_pnpm"],
          targetFiles: ["e2e/ttt.spec.ts", "tests/ttt-state.property.test.ts"],
          acceptanceTestRefs: [
            {
              acId: "ac_feature_add_pnpm",
              testFile: "packages/admission-e2e/src/feature-add-pnpm-admission.contract.test.ts",
              testName: "still refuses immutable TTT verification target files through planning admission"
            }
          ],
          requiredCapabilities: noRequiredCapabilities,
          risk: "medium"
        }
      ]
    } as const satisfies PlanGraph);

    const admission = admitCandidatePlans({
      candidatePlans: [candidatePlan],
      intent: featureAddIntent,
      planGraphUri: "plan.json"
    });

    assert.equal(admission.ok, false);
    if (admission.ok) assert.fail("Expected immutable TTT verification target files to reject.");
    assert.equal(
      admission.planningAdmission.details.failure.rejectionReasons.some(
        (reason) =>
          reason.code === "immutable-target-file" &&
          reason.taskId === "task-mutates-immutable-ttt-verification"
      ),
      true
    );
  });
});

const featureAddIntent = buildConfirmedIntentForTest({
  id: "intent_feature_add_pnpm_admission",
  title: "Feature-add pnpm admission",
  problem: "Feature-add work may add curated dependencies without weakening immutable TTT verification files.",
  requester: "ouroboros-ac-1112",
  confirmedAt: "2026-04-29T00:00:00.000Z",
  acceptanceCriteria: [
    {
      id: "ac_feature_add_pnpm",
      statement: "Feature-add admits ordinary multi-file app work plus exact allowlisted pnpm adds.",
      verification: "test"
    }
  ],
  capabilityEnvelope: {
    repoScopes: [],
    toolPermissions: [],
    budget: {
      timeoutMs: 300_000,
      maxRepairLoops: 9
    }
  },
  constraints: [
    "Do not edit e2e/ttt.spec.ts.",
    "Do not edit tests/ttt-state.property.test.ts."
  ]
});

function featureAddDraftWithAllowedPnpmAdds(): IntentDraft {
  const capabilityEnvelope = {
    repoScopes: [
      {
        workspace: "protostar-toy-ttt",
        path: "src/App.tsx",
        access: "write" as const
      },
      {
        workspace: "protostar-toy-ttt",
        path: "src/components/TicTacToeBoard.tsx",
        access: "write" as const
      }
    ],
    toolPermissions: [
      {
        tool: "node:test",
        permissionLevel: "use" as const,
        reason: "Run TTT feature-add admission tests without executing pnpm.",
        risk: "medium" as const
      }
    ],
    budget: {
      timeoutMs: 300_000,
      maxRepairLoops: 9
    },
    pnpm: {
      allowedAdds: [
        "@playwright/test@^1.59.1 -D",
        "fast-check@^4.7.0 -D"
      ]
    }
  };

  return {
    draftId: "draft_feature_add_pnpm_admission",
    title: "Add TTT game dependencies",
    problem: "Add a TTT game with only exact curated dependency additions.",
    requester: "ouroboros-ac-1112",
    mode: "brownfield",
    goalArchetype: "feature-add",
    context: "The target repo is the sacrificial TTT app and pnpm execution remains behind repo subprocess admission.",
    acceptanceCriteria: [
      {
        statement: "Feature-add admission accepts exact curated dependency adds only.",
        verification: "test"
      }
    ],
    constraints: [
      "Do not execute pnpm during intent admission.",
      "Do not edit e2e/ttt.spec.ts.",
      "Do not edit tests/ttt-state.property.test.ts."
    ],
    stopConditions: ["Stop if dependency installation is requested outside the curated allowlist."],
    capabilityEnvelope
  };
}

function pnpmAllowedAdds(envelope: CapabilityEnvelope): readonly string[] | undefined {
  return (envelope as CapabilityEnvelope & {
    readonly pnpm?: {
      readonly allowedAdds?: readonly string[];
    };
  }).pnpm?.allowedAdds;
}
