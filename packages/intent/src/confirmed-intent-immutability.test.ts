import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  defineConfirmedIntent,
  type AcceptanceCriterionId,
  type ConfirmedIntent,
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

type MutableConfirmedIntentInput = MutableConfirmedIntent & {
  id: IntentId;
  problem: string;
  requester: string;
  confirmedAt: string;
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
}

void compileTimeReadonlyMutationChecks;

describe("ConfirmedIntent immutability", () => {
  it("rejects runtime mutation attempts after confirmation", () => {
    const intent = defineConfirmedIntent(confirmedIntentInput());
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
        id: "ac_extra",
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

  it("defensively copies mutable confirmation input", () => {
    const input = confirmedIntentInput();
    const intent = defineConfirmedIntent(input);

    input.acceptanceCriteria[0] = {
      id: "ac_changed",
      statement: "Source mutation should not rewrite the confirmed intent.",
      verification: "manual",
      justification: "The source mutation is intentionally ignored after confirmation."
    };
    input.capabilityEnvelope.repoScopes[0] = {
      workspace: "protostar",
      path: "packages/execution",
      access: "execute"
    };
    input.capabilityEnvelope.toolPermissions[0] = {
      tool: "shell",
      reason: "Source mutation should not rewrite the confirmed intent.",
      risk: "high"
    };
    input.capabilityEnvelope.budget.maxRepairLoops = 8;
    input.constraints.push("source-only constraint");
    input.stopConditions.push("source-only stop condition");

    assert.equal(intent.acceptanceCriteria[0]?.id, "ac_runtime_freeze");
    assert.equal(intent.capabilityEnvelope.repoScopes[0]?.path, "packages/intent");
    assert.equal(intent.capabilityEnvelope.toolPermissions[0]?.risk, "low");
    assert.equal(intent.capabilityEnvelope.budget.maxRepairLoops, 1);
    assert.deepEqual(intent.constraints, ["Scope limited to packages/intent immutability contracts."]);
    assert.deepEqual(intent.stopConditions, ["Stop if immutable confirmed-intent contract tests fail."]);
  });
});

function confirmedIntentInput(): MutableConfirmedIntentInput {
  return {
    id: "intent_confirmed_immutability" as IntentId,
    sourceDraftId: "draft_confirmed_immutability",
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
        id: "ac_runtime_freeze",
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
  };
}
