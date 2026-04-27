import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  promoteIntentDraft,
  type AcceptanceCriterionId,
  type ConfirmedIntent,
  type IntentDraft,
  type IntentDraftId,
  type IntentId
} from "./index.js";

type MutableAcceptanceCriterion = {
  id: AcceptanceCriterionId;
  statement: string;
} & (
  | {
      verification: "test" | "evidence";
      justification?: string;
    }
  | {
      verification: "manual";
      justification: string;
    }
);

type MutableConfirmedIntent = {
  sourceDraftId?: IntentDraftId;
  mode?: "greenfield" | "brownfield";
  goalArchetype?: string;
  title: string;
  context?: string;
  acceptanceCriteria: MutableAcceptanceCriterion[];
  capabilityEnvelope: {
    repoScopes: Array<{
      workspace: string;
      path: string;
      access: "read" | "write" | "execute";
    }>;
    toolPermissions: Array<{
      tool: string;
      reason: string;
      risk: "low" | "medium" | "high";
    }>;
    budget: {
      maxRepairLoops?: number;
      timeoutMs?: number;
    };
  };
  constraints: string[];
  stopConditions: string[];
};

function compileTimeReadonlyMutationChecks(intent: ConfirmedIntent): void {
  // @ts-expect-error ConfirmedIntent top-level fields are readonly after confirmation.
  intent.title = "mutated title";

  // @ts-expect-error ConfirmedIntent preserved admission metadata is readonly after confirmation.
  intent.goalArchetype = "feature-add";

  // @ts-expect-error ConfirmedIntent acceptance criteria are readonly arrays.
  intent.acceptanceCriteria.push({
    id: "ac_extra",
    statement: "Extra criterion should not be appendable after confirmation.",
    verification: "test"
  });

  // @ts-expect-error ConfirmedIntent nested acceptance criterion fields are readonly.
  intent.acceptanceCriteria[0].statement = "mutated acceptance criterion";

  // @ts-expect-error ConfirmedIntent nested repo-scope fields are readonly.
  intent.capabilityEnvelope.repoScopes[0].path = "packages/execution";

  // @ts-expect-error ConfirmedIntent nested budget fields are readonly.
  intent.capabilityEnvelope.budget.maxRepairLoops = 99;

  // @ts-expect-error ConfirmedIntent constraints are readonly arrays.
  intent.constraints.push("new mutable constraint");

  // @ts-expect-error ConfirmedIntent stop conditions are readonly arrays.
  intent.stopConditions.push("new mutable stop condition");

  // @ts-expect-error ConfirmedIntent schemaVersion is the locked Phase 1 value.
  intent.schemaVersion = "2.0.0";

  // @ts-expect-error ConfirmedIntent signature is readonly.
  intent.signature = { algorithm: "x", value: "y" };
}

void compileTimeReadonlyMutationChecks;

function promoteImmutabilityFixture(): ConfirmedIntent {
  const promotion = promoteIntentDraft({
    draft: immutabilityFixtureDraft(),
    mode: "brownfield",
    confirmedAt: "2026-04-25T00:00:00.000Z"
  });

  if (!promotion.ok) {
    throw new Error(
      `Immutability fixture draft must promote cleanly; admission errors: ${promotion.errors.join("; ")}`
    );
  }

  return promotion.intent;
}

describe("ConfirmedIntent immutability", () => {
  it("rejects runtime mutation attempts after confirmation", () => {
    const intent = promoteImmutabilityFixture();
    const mutableIntent = intent as unknown as MutableConfirmedIntent;

    assert.equal(Object.isFrozen(intent), true);
    assert.equal(Object.isFrozen(intent.acceptanceCriteria), true);
    assert.equal(Object.isFrozen(intent.acceptanceCriteria[0]), true);
    assert.equal(Object.isFrozen(intent.capabilityEnvelope), true);
    assert.equal(Object.isFrozen(intent.capabilityEnvelope.repoScopes), true);
    assert.equal(Object.isFrozen(intent.capabilityEnvelope.repoScopes[0]), true);
    assert.equal(Object.isFrozen(intent.capabilityEnvelope.toolPermissions), true);
    assert.equal(Object.isFrozen(intent.capabilityEnvelope.toolPermissions[0]), true);
    assert.equal(Object.isFrozen(intent.capabilityEnvelope.budget), true);
    assert.equal(Object.isFrozen(intent.constraints), true);
    assert.equal(Object.isFrozen(intent.stopConditions), true);

    assert.equal(intent.schemaVersion, "1.0.0");
    assert.equal(intent.signature, null);

    assert.throws(() => {
      mutableIntent.title = "mutated title";
    }, TypeError);
    assert.equal(intent.title, "Harden confirmed intent immutability");

    assert.throws(() => {
      mutableIntent.goalArchetype = "feature-add";
    }, TypeError);
    assert.equal(intent.goalArchetype, "cosmetic-tweak");

    assert.throws(() => {
      mutableIntent.acceptanceCriteria.push({
        id: "ac_extra" as AcceptanceCriterionId,
        statement: "Extra criterion should not be appendable after confirmation.",
        verification: "test"
      });
    }, TypeError);
    assert.equal(intent.acceptanceCriteria.length, 1);

    assert.throws(() => {
      mutableIntent.acceptanceCriteria[0]!.statement = "mutated acceptance criterion";
    }, TypeError);
    assert.equal(
      intent.acceptanceCriteria[0]?.statement,
      "Confirmed intents reject runtime mutation attempts against nested acceptance criteria."
    );

    assert.throws(() => {
      mutableIntent.capabilityEnvelope.repoScopes[0]!.path = "packages/execution";
    }, TypeError);
    assert.equal(intent.capabilityEnvelope.repoScopes[0]?.path, "packages/intent");

    assert.throws(() => {
      mutableIntent.capabilityEnvelope.budget.maxRepairLoops = 99;
    }, TypeError);
    assert.equal(intent.capabilityEnvelope.budget.maxRepairLoops, 1);

    assert.throws(() => {
      mutableIntent.constraints.push("new mutable constraint");
    }, TypeError);
    assert.deepEqual(intent.constraints, ["Scope limited to packages/intent immutability contracts."]);

    assert.throws(() => {
      mutableIntent.stopConditions.push("new mutable stop condition");
    }, TypeError);
    assert.deepEqual(intent.stopConditions, ["Stop if immutable confirmed-intent contract tests fail."]);
  });

  it("defensively copies normalized confirmation input", () => {
    const draft = immutabilityFixtureDraft();
    const intent = promoteImmutabilityFixture();

    // Mutating the source draft after promotion must not affect the frozen intent.
    (draft as { acceptanceCriteria: unknown[] }).acceptanceCriteria.push({
      statement: "Source mutation should not rewrite the confirmed intent.",
      verification: "manual",
      justification: "The source mutation is intentionally ignored after confirmation."
    });
    (draft.capabilityEnvelope!.repoScopes as unknown[]).push({
      workspace: "protostar",
      path: "packages/execution",
      access: "execute"
    });
    (draft.constraints as string[]).push("source-only constraint");
    (draft.stopConditions as string[]).push("source-only stop condition");

    assert.equal(intent.acceptanceCriteria.length, 1);
    assert.equal(intent.capabilityEnvelope.repoScopes.length, 1);
    assert.equal(intent.capabilityEnvelope.repoScopes[0]?.path, "packages/intent");
    assert.deepEqual(intent.constraints, ["Scope limited to packages/intent immutability contracts."]);
    assert.deepEqual(intent.stopConditions, ["Stop if immutable confirmed-intent contract tests fail."]);
  });
});

function immutabilityFixtureDraft(): IntentDraft {
  return {
    draftId: "draft_confirmed_immutability" as IntentDraftId,
    mode: "brownfield",
    goalArchetype: "cosmetic-tweak",
    title: "Harden confirmed intent immutability",
    problem:
      "Confirmed intents are the admission-control boundary and must reject mutation after confirmation.",
    requester: "ouroboros-ac-103",
    context: "The change is limited to confirmed intent contract tests in packages/intent.",
    acceptanceCriteria: [
      {
        statement: "Confirmed intents reject runtime mutation attempts against nested acceptance criteria.",
        verification: "test"
      }
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
          reason: "Exercise immutable ConfirmedIntent runtime contracts.",
          risk: "low"
        }
      ],
      budget: {
        maxRepairLoops: 1,
        timeoutMs: 30_000
      }
    },
    constraints: ["Scope limited to packages/intent immutability contracts."],
    stopConditions: ["Stop if immutable confirmed-intent contract tests fail."]
  } as IntentDraft;
}

// Suppress unused warning for IntentId imported only for the runtime narrowing helpers above.
void undefined as unknown as IntentId;
