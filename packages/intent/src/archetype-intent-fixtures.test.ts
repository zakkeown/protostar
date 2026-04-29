import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import type { IntentDraft } from "@protostar/intent";

import {
  GOAL_ARCHETYPE_POLICY_TABLE,
  INTENT_ARCHETYPE_REGISTRY,
  admitBugfixCapabilityEnvelope,
  admitFeatureAddCapabilityEnvelope,
  admitRefactorCapabilityEnvelope,
  autoTagIntentDraftArchetype,
  promoteIntentDraft,
  type GoalArchetype,
  type PromoteIntentDraftResult
} from "./index.js";

const distDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(distDir, "../../..");

const archetypeFixtureCases = [
  {
    path: "examples/intents/cosmetic-tweak.draft.json",
    expectedGoalArchetype: "cosmetic-tweak",
    expectedOutcome: "promoted",
    expectedPolicyStatus: "wired"
  },
  {
    path: "examples/intents/feature-add.draft.json",
    expectedGoalArchetype: "feature-add",
    expectedOutcome: "promoted",
    expectedPolicyStatus: "wired"
  },
  {
    path: "examples/intents/refactor.draft.json",
    expectedGoalArchetype: "refactor",
    expectedOutcome: "promoted",
    expectedPolicyStatus: "wired"
  },
  {
    path: "examples/intents/bugfix.draft.json",
    expectedGoalArchetype: "bugfix",
    expectedOutcome: "promoted",
    expectedPolicyStatus: "wired"
  }
] as const satisfies readonly ArchetypeFixtureCase[];

const wiredArchetypeFixtureCases = [
  {
    path: "examples/intents/feature-add.draft.json",
    expectedGoalArchetype: "feature-add",
    expectedAdmissionSource: "feature-add-policy-admission",
    expectedTimeoutMs: 900_000,
    expectedMaxRepairLoops: 9
  },
  {
    path: "examples/intents/refactor.draft.json",
    expectedGoalArchetype: "refactor",
    expectedAdmissionSource: "refactor-policy-admission",
    expectedTimeoutMs: 600_000,
    expectedMaxRepairLoops: 5
  },
  {
    path: "examples/intents/bugfix.draft.json",
    expectedGoalArchetype: "bugfix",
    expectedAdmissionSource: "bugfix-policy-admission",
    expectedTimeoutMs: 600_000,
    expectedMaxRepairLoops: 5
  }
] as const satisfies readonly WiredArchetypeFixtureCase[];

interface ArchetypeFixtureCase {
  readonly path: string;
  readonly expectedGoalArchetype: GoalArchetype;
  readonly expectedOutcome: "promoted" | "blocked";
  readonly expectedPolicyStatus: "wired" | "stub";
}

type WiredGoalArchetype = "feature-add" | "refactor" | "bugfix";

type WiredAdmissionSource =
  | "feature-add-policy-admission"
  | "refactor-policy-admission"
  | "bugfix-policy-admission";

interface WiredArchetypeFixtureCase {
  readonly path: string;
  readonly expectedGoalArchetype: WiredGoalArchetype;
  readonly expectedAdmissionSource: WiredAdmissionSource;
  readonly expectedTimeoutMs: number;
  readonly expectedMaxRepairLoops: number;
}

interface ArchetypeFixtureMetadata {
  readonly expectedGoalArchetype?: string;
  readonly expectedOutcome?: string;
  readonly admissionExpectation?: {
    readonly expectedAdmissionOutcome?: string;
    readonly expectedAmbiguityStatus?: {
      readonly mode?: string;
      readonly threshold?: number;
      readonly expectedAccepted?: boolean;
      readonly expectedScore?: number;
      readonly structurallyMissingDimensions?: readonly string[];
    };
    readonly expectedCapabilityEnvelopeResult?: {
      readonly status?: string;
      readonly goalArchetype?: string;
      readonly policyStatus?: string;
      readonly blockingFindings?: readonly string[];
      readonly unresolvedFindings?: readonly string[];
    };
  };
}

type DraftWithFixtureMetadata = IntentDraft & {
  readonly metadata?: ArchetypeFixtureMetadata;
};

describe("archetype intent draft fixtures", () => {
  it("cover cosmetic-tweak, feature-add, refactor, and bugfix categories with expected admission outcomes", async () => {
    for (const fixtureCase of archetypeFixtureCases) {
      const draft = await readIntentDraftFixture(fixtureCase.path);
      const expectation = draft.metadata?.admissionExpectation;
      const ambiguityExpectation = expectation?.expectedAmbiguityStatus;
      const capabilityExpectation = expectation?.expectedCapabilityEnvelopeResult;
      const result = promoteIntentDraft({
        draft,
        mode: draft.mode ?? "brownfield",
        confirmedAt: "2026-04-25T00:00:00.000Z"
      });

      assert.equal(draft.goalArchetype, fixtureCase.expectedGoalArchetype, fixtureCase.path);
      assert.equal(draft.metadata?.expectedGoalArchetype, fixtureCase.expectedGoalArchetype, fixtureCase.path);
      assert.equal(draft.metadata?.expectedOutcome, fixtureCase.expectedOutcome, fixtureCase.path);
      assert.equal(expectation?.expectedAdmissionOutcome, fixtureCase.expectedOutcome, fixtureCase.path);
      assert.equal(capabilityExpectation?.goalArchetype, fixtureCase.expectedGoalArchetype, fixtureCase.path);
      assert.equal(capabilityExpectation?.policyStatus, fixtureCase.expectedPolicyStatus, fixtureCase.path);
      assert.equal(
        GOAL_ARCHETYPE_POLICY_TABLE[fixtureCase.expectedGoalArchetype].status,
        fixtureCase.expectedPolicyStatus,
        fixtureCase.path
      );
      assert.equal(result.ambiguityAssessment.mode, ambiguityExpectation?.mode, fixtureCase.path);
      assert.equal(result.ambiguityAssessment.threshold, ambiguityExpectation?.threshold, fixtureCase.path);
      assert.equal(result.ambiguityAssessment.accepted, ambiguityExpectation?.expectedAccepted, fixtureCase.path);
      assert.equal(result.ambiguityAssessment.ambiguity, ambiguityExpectation?.expectedScore, fixtureCase.path);
      assert.deepEqual(
        result.ambiguityAssessment.structurallyMissingDimensions,
        ambiguityExpectation?.structurallyMissingDimensions,
        fixtureCase.path
      );

      if (fixtureCase.expectedOutcome === "promoted") {
        assertPromotionSucceeded(result, fixtureCase.path);
        assert.equal(result.intent.goalArchetype, fixtureCase.expectedGoalArchetype, fixtureCase.path);
        assert.deepEqual(result.policyFindings, [], fixtureCase.path);
        assert.deepEqual(capabilityExpectation?.unresolvedFindings, [], fixtureCase.path);
      } else {
        assertPromotionFailed(result, "checklist-only", fixtureCase.path);
        assert.deepEqual(
          result.policyFindings.map((finding) => finding.code),
          capabilityExpectation?.blockingFindings,
          fixtureCase.path
        );
        assert.equal(result.policyFindings[0]?.fieldPath, "goalArchetype", fixtureCase.path);
        assert.equal(result.policyFindings[0]?.severity, "block", fixtureCase.path);
      }
    }
  });

  it("recognizes supported feature-add cap 9, refactor cap 5, and bugfix cap 5 fixtures as wired admissions", async () => {
    for (const fixtureCase of wiredArchetypeFixtureCases) {
      const draft = await readIntentDraftFixture(fixtureCase.path);
      const expectation = draft.metadata?.admissionExpectation;
      const capabilityExpectation = expectation?.expectedCapabilityEnvelopeResult;
      const registryEntry = INTENT_ARCHETYPE_REGISTRY[fixtureCase.expectedGoalArchetype];
      const policy = GOAL_ARCHETYPE_POLICY_TABLE[fixtureCase.expectedGoalArchetype];
      const suggestion = autoTagIntentDraftArchetype(draft);
      const admission = admitWiredArchetypeFixture(fixtureCase.expectedGoalArchetype, draft);
      const promotion = promoteIntentDraft({
        draft,
        mode: draft.mode ?? "brownfield",
        confirmedAt: "2026-04-25T00:00:00.000Z"
      });

      assert.equal(draft.goalArchetype, fixtureCase.expectedGoalArchetype, fixtureCase.path);
      assert.equal(capabilityExpectation?.status, "allowed", fixtureCase.path);
      assert.equal(capabilityExpectation?.goalArchetype, fixtureCase.expectedGoalArchetype, fixtureCase.path);
      assert.equal(capabilityExpectation?.policyStatus, "wired", fixtureCase.path);

      assert.equal(suggestion.archetype, fixtureCase.expectedGoalArchetype, fixtureCase.path);
      assert.ok(
        suggestion.signals.some(
          (signal) =>
            signal.source === "explicit-goal-archetype" &&
            signal.archetype === fixtureCase.expectedGoalArchetype &&
            signal.fieldPath === "goalArchetype"
        ),
        `${fixtureCase.path} should be recognized from its explicit goalArchetype.`
      );

      assert.equal(registryEntry.supportStatus, "supported", fixtureCase.path);
      assert.equal(registryEntry.supported, true, fixtureCase.path);
      assert.equal(registryEntry.capabilityCapStatus, "wired", fixtureCase.path);
      assert.equal(registryEntry.policy, policy, fixtureCase.path);
      assert.equal(policy.status, "wired", fixtureCase.path);
      assert.equal(policy.budgets.timeoutMs, fixtureCase.expectedTimeoutMs, fixtureCase.path);
      assert.equal(policy.budgetCaps.maxRepairLoops, fixtureCase.expectedMaxRepairLoops, fixtureCase.path);

      assert.equal(admission.ok, true, fixtureCase.path);
      assert.equal(admission.goalArchetype, fixtureCase.expectedGoalArchetype, fixtureCase.path);
      assert.equal(admission.grant.source, fixtureCase.expectedAdmissionSource, fixtureCase.path);
      assert.equal(admission.grant.goalArchetype, fixtureCase.expectedGoalArchetype, fixtureCase.path);
      assert.equal(admission.grant.policy, policy, fixtureCase.path);
      assert.deepEqual(admission.admission.blockingFindings, [], fixtureCase.path);
      assert.deepEqual(admission.admission.unresolvedFindings, [], fixtureCase.path);
      assert.deepEqual(
        admission.findings.map((finding) => finding.code),
        [],
        fixtureCase.path
      );
      assert.deepEqual(admission.errors, [], fixtureCase.path);

      assertPromotionSucceeded(promotion, fixtureCase.path);
      assert.equal(promotion.intent.goalArchetype, fixtureCase.expectedGoalArchetype, fixtureCase.path);
      assert.equal(promotion.intent.capabilityEnvelope.budget.maxRepairLoops, 1, fixtureCase.path);
      assert.equal(promotion.ambiguityAssessment.accepted, true, fixtureCase.path);
      assert.equal(promotion.ambiguityAssessment.ambiguity, 0, fixtureCase.path);
      assert.deepEqual(promotion.policyFindings, [], fixtureCase.path);
    }
  });
});

async function readIntentDraftFixture(path: string): Promise<DraftWithFixtureMetadata> {
  const raw = await readFile(resolve(repoRoot, path), "utf8");

  return JSON.parse(raw) as DraftWithFixtureMetadata;
}

function admitWiredArchetypeFixture(archetype: WiredGoalArchetype, draft: IntentDraft) {
  if (archetype === "feature-add") {
    return admitFeatureAddCapabilityEnvelope({ draft });
  }
  if (archetype === "refactor") {
    return admitRefactorCapabilityEnvelope({ draft });
  }

  return admitBugfixCapabilityEnvelope({ draft });
}

function assertPromotionSucceeded(
  result: PromoteIntentDraftResult,
  message: string
): asserts result is Extract<PromoteIntentDraftResult, { readonly ok: true }> {
  assert.equal(result.ok, true, `${message}: ${result.errors.join("; ")}`);
}

function assertPromotionFailed(
  result: PromoteIntentDraftResult,
  expectedState: Extract<PromoteIntentDraftResult, { readonly ok: false }>["failureState"],
  message: string
): asserts result is Extract<PromoteIntentDraftResult, { readonly ok: false }> {
  assert.equal(result.ok, false, message);
  assert.equal(result.failureState, expectedState, message);
  assert.equal("intent" in result, false, message);
}
