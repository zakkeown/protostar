import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAcceptanceCriterionId, normalizeAcceptanceCriteria } from "@protostar/intent/acceptance-criteria";
import { INTENT_AMBIGUITY_THRESHOLD, assessIntentAmbiguity } from "@protostar/intent/ambiguity";
import { CLARIFICATION_REPORT_ARTIFACT_NAME, createClarificationReport } from "@protostar/intent/clarification-report";
import { defineConfirmedIntent, parseConfirmedIntent } from "@protostar/intent/confirmed-intent";
import { evaluateIntentDraftCompleteness, type IntentDraft } from "@protostar/intent/draft";

describe("intent split public entrypoints", () => {
  it("exposes draft, ambiguity, acceptance-criteria, clarification-report, and confirmed-intent slices", () => {
    const draft = splitSurfaceDraft();
    const criteria = normalizeAcceptanceCriteria(draft.acceptanceCriteria);
    assert.equal(criteria.ok, true);
    assert.equal(createAcceptanceCriterionId(criteria.acceptanceCriteria[0]?.statement ?? "", 0), criteria.acceptanceCriteria[0]?.id);

    const completeness = evaluateIntentDraftCompleteness({ draft, mode: "brownfield" });
    assert.equal(completeness.complete, true);

    const ambiguity = assessIntentAmbiguity(draft, { mode: "brownfield" });
    assert.equal(ambiguity.ambiguity <= INTENT_AMBIGUITY_THRESHOLD, true);

    const clarification = createClarificationReport({ draft, mode: "brownfield" });
    assert.equal(clarification.artifact, CLARIFICATION_REPORT_ARTIFACT_NAME);

    const intent = defineConfirmedIntent({
      id: "intent_split_surface",
      ...(draft.draftId !== undefined ? { sourceDraftId: draft.draftId } : {}),
      mode: "brownfield",
      goalArchetype: "cosmetic-tweak",
      title: draft.title ?? "",
      problem: draft.problem ?? "",
      requester: draft.requester ?? "",
      context: draft.context ?? "",
      acceptanceCriteria: criteria.acceptanceCriteria,
      capabilityEnvelope: {
        repoScopes: [
          {
            workspace: "protostar",
            path: "packages/intent",
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
      },
      constraints: draft.constraints ?? [],
      stopConditions: draft.stopConditions ?? [],
      confirmedAt: "2026-04-26T00:00:00.000Z"
    });

    assert.equal(parseConfirmedIntent(intent).ok, true);
  });
});

function splitSurfaceDraft(): IntentDraft {
  return {
    draftId: "draft_split_surface",
    title: "Polish intent split contract imports",
    problem:
      "Update packages/intent/src/public-split-exports.contract.test.ts so the contract test proves @protostar/intent/draft, /ambiguity, /acceptance-criteria, /clarification-report, and /confirmed-intent imports stay wired while runtime behavior remains unchanged.",
    requester: "contract-test",
    mode: "brownfield",
    goalArchetype: "cosmetic-tweak",
    context:
      "Protostar is an existing TypeScript monorepo whose intent package now exposes public subpath entrypoints for narrower contract imports.",
    acceptanceCriteria: [
      {
        statement: "The intent public split contract test imports every requested @protostar/intent subpath from the built package and executes one exported function from each slice.",
        verification: "test"
      }
    ],
    constraints: [
      "Protostar authority is limited to package export maps, TypeScript path aliases, and public split contract tests."
    ],
    stopConditions: [
      "Stop if any requested @protostar/intent subpath import cannot be resolved, typed, or executed by node:test."
    ],
    capabilityEnvelope: {
      repoScopes: [
        {
          workspace: "protostar",
          path: "packages/intent",
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
