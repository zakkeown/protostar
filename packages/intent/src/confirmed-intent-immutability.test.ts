import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type AcceptanceCriterionId,
  type ConfirmedIntent,
  type IntentDraftId,
  type IntentId
} from "./index.js";

import { buildConfirmedIntentForTest } from "@protostar/intent/internal/test-builders";

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

  // @ts-expect-error ConfirmedIntent schemaVersion is the locked Phase 2 value.
  intent.schemaVersion = "2.0.0";

  // @ts-expect-error ConfirmedIntent signature is readonly.
  intent.signature = { algorithm: "x", value: "y" };
}

void compileTimeReadonlyMutationChecks;

function buildImmutabilityFixture(): ConfirmedIntent {
  return buildConfirmedIntentForTest({
    // Migrated to 1.1.0 per Phase 2 Plan 03 hard bump (Q-18 user lock, revision iteration 2).
    schemaVersion: "1.1.0",
    signature: null,
    id: "intent_confirmed_immutability" as IntentId,
    sourceDraftId: "draft_confirmed_immutability" as IntentDraftId,
    mode: "brownfield",
    goalArchetype: "cosmetic-tweak",
    title: "Harden confirmed intent immutability",
    problem:
      "Confirmed intents are the admission-control boundary and must reject mutation after confirmation.",
    requester: "ouroboros-ac-103",
    confirmedAt: "2026-04-25T00:00:00.000Z",
    context: "The change is limited to confirmed intent contract tests in packages/intent.",
    acceptanceCriteria: [
      {
        id: "ac_runtime_freeze" as AcceptanceCriterionId,
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
  });
}

describe("ConfirmedIntent immutability", () => {
  it("rejects runtime mutation attempts after confirmation", () => {
    const intent = buildImmutabilityFixture();
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

    // Migrated to 1.1.0 per Phase 2 Plan 03 hard bump (Q-18 user lock, revision iteration 2).
    assert.equal(intent.schemaVersion, "1.1.0");
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

  it("defensively copies confirmation input", () => {
    const sourceAc = [
      {
        id: "ac_runtime_freeze" as AcceptanceCriterionId,
        statement: "Confirmed intents reject runtime mutation attempts against nested acceptance criteria.",
        verification: "test" as const
      }
    ];
    const sourceConstraints = ["Scope limited to packages/intent immutability contracts."];
    const sourceStopConditions = ["Stop if immutable confirmed-intent contract tests fail."];

    const intent = buildConfirmedIntentForTest({
      // Migrated to 1.1.0 per Phase 2 Plan 03 hard bump (Q-18 user lock, revision iteration 2).
      schemaVersion: "1.1.0",
      signature: null,
      id: "intent_confirmed_immutability_copy" as IntentId,
      sourceDraftId: "draft_confirmed_immutability" as IntentDraftId,
      mode: "brownfield",
      goalArchetype: "cosmetic-tweak",
      title: "Harden confirmed intent immutability",
      problem:
        "Confirmed intents are the admission-control boundary and must reject mutation after confirmation.",
      requester: "ouroboros-ac-103",
      confirmedAt: "2026-04-25T00:00:00.000Z",
      context: "The change is limited to confirmed intent contract tests in packages/intent.",
      acceptanceCriteria: sourceAc,
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
      constraints: sourceConstraints,
      stopConditions: sourceStopConditions
    });

    // Mutating source arrays after the mint must not affect the frozen intent
    // (mintConfirmedIntent folds defensive copies of nested arrays).
    sourceAc.push({
      id: "ac_extra" as AcceptanceCriterionId,
      statement: "Source mutation should not rewrite the confirmed intent.",
      verification: "test"
    });
    sourceConstraints.push("source-only constraint");
    sourceStopConditions.push("source-only stop condition");

    assert.equal(intent.acceptanceCriteria.length, 1);
    assert.equal(intent.capabilityEnvelope.repoScopes.length, 1);
    assert.equal(intent.capabilityEnvelope.repoScopes[0]?.path, "packages/intent");
    assert.deepEqual(intent.constraints, ["Scope limited to packages/intent immutability contracts."]);
    assert.deepEqual(intent.stopConditions, ["Stop if immutable confirmed-intent contract tests fail."]);
  });
});
