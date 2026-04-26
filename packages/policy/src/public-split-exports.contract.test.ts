import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { IntentDraft } from "@protostar/intent/draft";
import { promoteIntentDraft } from "@protostar/policy/admission";
import { ARCHETYPE_POLICY_TABLE, COSMETIC_TWEAK_GOAL_ARCHETYPE, proposeIntentDraftArchetype } from "@protostar/policy/archetypes";
import { ADMISSION_DECISION_ARTIFACT_NAME, createAdmissionDecisionArtifact } from "@protostar/policy/artifacts";
import { validateIntentDraftCapabilityEnvelopeAdmission } from "@protostar/policy/capability-envelope";

describe("policy split public entrypoints", () => {
  it("exposes admission, archetypes, capability-envelope, and artifact slices", () => {
    const draft = policySplitSurfaceDraft();
    const suggestion = proposeIntentDraftArchetype(draft);
    assert.equal(suggestion.archetype, COSMETIC_TWEAK_GOAL_ARCHETYPE);
    assert.equal(ARCHETYPE_POLICY_TABLE[COSMETIC_TWEAK_GOAL_ARCHETYPE].status, "wired");

    const capabilityAdmission = validateIntentDraftCapabilityEnvelopeAdmission({ draft });
    assert.equal(capabilityAdmission.ok, true);

    const promotion = promoteIntentDraft({ draft, mode: "brownfield" });
    assert.equal(promotion.ok, true);

    const artifact = createAdmissionDecisionArtifact({ draft, promotion });
    assert.equal(artifact.artifact, ADMISSION_DECISION_ARTIFACT_NAME);
    assert.equal(artifact.admitted, true);
  });
});

function policySplitSurfaceDraft(): IntentDraft {
  return {
    draftId: "draft_policy_split_surface",
    title: "Polish admission copy for policy split imports",
    problem:
      "Update the policy admission copy inside packages/policy/src/public-split-exports.contract.test.ts so the contract test proves @protostar/policy/admission, /archetypes, /capability-envelope, and /artifacts imports stay wired while runtime behavior remains unchanged.",
    requester: "contract-test",
    mode: "brownfield",
    goalArchetype: "cosmetic-tweak",
    context:
      "Protostar is an existing TypeScript monorepo whose policy package now exposes public subpath entrypoints for narrower contract imports.",
    acceptanceCriteria: [
      {
        statement: "The policy public split contract test imports every requested @protostar/policy subpath from the built package and executes one exported function from each slice.",
        verification: "test"
      }
    ],
    constraints: [
      "Protostar authority is limited to package export maps, TypeScript path aliases, and public split contract tests."
    ],
    stopConditions: [
      "Stop if any requested @protostar/policy subpath import cannot be resolved, typed, or executed by node:test."
    ],
    capabilityEnvelope: {
      repoScopes: [
        {
          workspace: "protostar",
          path: "packages/policy",
          access: "write"
        }
      ],
      toolPermissions: [
        {
          tool: "node:test",
          permissionLevel: "use",
          reason: "Run public split contract tests.",
          risk: "low"
        }
      ],
      budget: {
        timeoutMs: 300_000,
        maxRepairLoops: 1
      }
    }
  };
}
