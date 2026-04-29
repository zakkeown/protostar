import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FEATURE_ADD_GOAL_ARCHETYPE,
  admitFeatureAddCapabilityEnvelope,
  type CapabilityEnvelope,
  type IntentDraft
} from "./index.js";

type CapabilityEnvelopeWithPnpm = CapabilityEnvelope & {
  readonly pnpm?: {
    readonly allowedAdds?: readonly string[];
  };
};

const ALLOWLISTED_FEATURE_ADD_PNPM_ADDS = [
  "@playwright/test@^1.59.1 -D",
  "fast-check@^4.7.0 -D",
  "clsx@^2.1.1",
  "zustand@^5.0.8",
  "react-aria-components@^1.13.0"
] as const;

describe("feature-add pnpm capability admission", () => {
  it("admits bounded multi-file feature-add writes with exact allowlisted pnpm adds", () => {
    const result = admitFeatureAddCapabilityEnvelope({
      draft: featureAddDraftWithPnpmAdds(ALLOWLISTED_FEATURE_ADD_PNPM_ADDS)
    });

    if (!result.ok) {
      assert.fail(`feature-add should admit exact allowlisted pnpm adds: ${result.errors.join("; ")}`);
    }

    assert.equal(result.goalArchetype, FEATURE_ADD_GOAL_ARCHETYPE);
    assert.equal(result.grant.source, "feature-add-policy-admission");
    assert.deepEqual(
      result.grant.capabilityEnvelope.repoScopes.map(({ path, access }) => ({ path, access })),
      [
        { path: "src/App.tsx", access: "write" },
        { path: "src/components/TicTacToeBoard.tsx", access: "write" }
      ]
    );
    assert.deepEqual(
      pnpmAllowedAdds(result.grant.capabilityEnvelope),
      ALLOWLISTED_FEATURE_ADD_PNPM_ADDS
    );
    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.errors, []);
  });

  it("rejects feature-add pnpm adds outside the exact curated allowlist", () => {
    for (const requestedAdd of [
      "left-pad",
      "@playwright/test@latest",
      "fast-check;rm -rf .",
      "react-aria-components@^1.13.1"
    ]) {
      const result = admitFeatureAddCapabilityEnvelope({
        draft: featureAddDraftWithPnpmAdds([requestedAdd])
      });

      assert.equal(result.ok, false, `${requestedAdd} should be refused.`);
      assert.equal(
        result.findings.some(
          (finding) =>
            String(finding.code) === "unallowlisted-pnpm-add" &&
            String(finding.fieldPath) === "capabilityEnvelope.pnpm.allowedAdds.0" &&
            finding.severity === "block"
        ),
        true,
        `${requestedAdd} should emit unallowlisted-pnpm-add.`
      );
      assert.equal(
        result.errors.some((error) => error.includes("unallowlisted-pnpm-add")),
        true,
        `${requestedAdd} should surface stable refusal evidence.`
      );
    }
  });
});

function featureAddDraftWithPnpmAdds(allowedAdds: readonly string[]): IntentDraft {
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
      allowedAdds
    }
  };

  return {
    draftId: "draft_feature_add_pnpm_allowed_adds",
    title: "Add TTT game dependencies",
    problem:
      "The feature-add run may need curated dependencies while remaining bounded to ordinary toy app source files.",
    requester: "ouroboros-ac-1112",
    mode: "brownfield",
    goalArchetype: "feature-add",
    context: "The target repo is the sacrificial TTT app and pnpm execution remains behind repo subprocess admission.",
    acceptanceCriteria: [
      {
        statement: "Feature-add admission accepts exact curated dependency adds only.",
        verification: "test"
      },
      {
        statement: "Feature-add admission still bounds writes to ordinary app source files.",
        verification: "test"
      }
    ],
    constraints: [
      "Do not execute pnpm during intent admission.",
      "Do not edit operator-authored toy verification files."
    ],
    stopConditions: ["Stop if dependency installation is requested outside the curated allowlist."],
    capabilityEnvelope
  };
}

function pnpmAllowedAdds(envelope: CapabilityEnvelope): readonly string[] | undefined {
  return (envelope as CapabilityEnvelopeWithPnpm).pnpm?.allowedAdds;
}
