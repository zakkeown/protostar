import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseConfirmedIntent, type IntentAmbiguityMode } from "@protostar/intent";

import {
  EXAMPLE_INTENT_FIXTURE_CONFIRMED_AT,
  loadAndAdmitExampleIntentFixtures,
  type AmbiguityAssessmentExampleIntentFixture,
  type ConfirmedExampleIntentAdmissionFixture,
  type DraftExampleIntentAdmissionFixture,
  type ExampleIntentAdmissionFixture,
  type ExampleIntentFixtureAmbiguityStatusExpectation
} from "./example-intent-fixtures.test-support.js";

const REQUIRED_EXAMPLE_INTENT_FIXTURES = [
  "bad-missing-capability.ambiguity.brownfield.json",
  "bad-missing-capability.json",
  "brownfield/clear-promoted.draft.json",
  "brownfield/weak-blocked.draft.json",
  "bugfix.draft.json",
  "cosmetic-tweak.draft.json",
  "feature-add.draft.json",
  "greenfield/clear-promoted.draft.json",
  "greenfield/weak-blocked.draft.json",
  "refactor.draft.json",
  "scaffold.ambiguity.brownfield.json",
  "scaffold.ambiguity.greenfield.json",
  "scaffold.draft.json",
  "scaffold.json"
] as const;

const WEAK_OR_AMBIGUOUS_BLOCKED_DRAFT_FIXTURES = [
  "brownfield/weak-blocked.draft.json",
  "greenfield/weak-blocked.draft.json"
] as const;

describe("examples/intents shared admission fixture setup", () => {
  it("loads every example intent fixture and routes it through the intent admission path", async () => {
    const results = await loadAndAdmitExampleIntentFixtures();
    const relativePaths = results.map((result) => result.fixture.relativePath);

    assert.equal(new Set(relativePaths).size, relativePaths.length);
    for (const requiredPath of REQUIRED_EXAMPLE_INTENT_FIXTURES) {
      assert.ok(relativePaths.includes(requiredPath), `Expected ${requiredPath} to be loaded.`);
    }

    assert.ok(results.some((result) => result.kind === "draft"), "Expected at least one draft fixture.");
    assert.ok(
      results.some((result) => result.kind === "confirmed-intent"),
      "Expected at least one confirmed-intent fixture."
    );
    assert.ok(
      results.some((result) => result.kind === "ambiguity-assessment"),
      "Expected at least one ambiguity assessment fixture."
    );

    for (const result of results) {
      assertFixtureAdmissionExpectation(result);
    }
  });

  it("blocks weak or ambiguous draft fixtures before ConfirmedIntent creation", async () => {
    const results = await loadAndAdmitExampleIntentFixtures();

    for (const fixturePath of WEAK_OR_AMBIGUOUS_BLOCKED_DRAFT_FIXTURES) {
      const result = results.find((candidate) => candidate.fixture.relativePath === fixturePath);
      assert.ok(result, `Expected ${fixturePath} to be loaded.`);
      assert.equal(result.kind, "draft", `${fixturePath} must be exercised as a mutable draft.`);
      if (result.kind !== "draft") {
        return;
      }

      const expectedAmbiguity = result.fixture.expectation?.expectedAmbiguityStatus;

      assert.equal(result.fixture.expectation?.expectedAdmissionOutcome, "blocked");
      assert.equal(expectedAmbiguity?.expectedAccepted, false);
      assert.equal(result.promotion.ok, false, `${fixturePath} should be blocked by admission.`);
      assert.equal(result.promotion.ambiguityAssessment.accepted, false);
      assert.equal(
        result.promotion.ambiguityAssessment.ambiguity > result.promotion.ambiguityAssessment.threshold,
        true,
        `${fixturePath} should exceed the admission ambiguity threshold.`
      );
      assert.equal(result.promotion.failureDetails.confirmedIntentCreated, false);
      assert.equal("intent" in result.promotion, false, `${fixturePath} must not expose a ConfirmedIntent.`);
      assert.ok(
        result.promotion.requiredClarifications.some(
          (clarification) => clarification.fieldPath === "acceptanceCriteria.0.justification"
        ),
        `${fixturePath} should ask for the weak manual AC justification.`
      );
    }
  });

  it("admits the cosmetic-tweak fixture successfully as a ConfirmedIntent", async () => {
    const results = await loadAndAdmitExampleIntentFixtures();
    const result = results.find((candidate) => candidate.fixture.relativePath === "cosmetic-tweak.draft.json");

    assert.ok(result, "Expected cosmetic-tweak.draft.json to be loaded.");
    assert.equal(result.kind, "draft", "cosmetic-tweak.draft.json must be exercised as a mutable draft.");
    if (result.kind !== "draft") {
      return;
    }

    assert.equal(result.fixture.expectation?.expectedAdmissionOutcome, "promoted");
    assert.equal(result.promotion.ok, true, "cosmetic-tweak.draft.json should promote.");
    if (!result.promotion.ok) {
      return;
    }

    assert.equal(result.promotion.intent.id, "intent_cosmetic_settings_copy");
    assert.equal(result.promotion.intent.sourceDraftId, "draft_cosmetic_settings_copy");
    assert.equal(result.promotion.intent.goalArchetype, "cosmetic-tweak");
    assert.equal(result.promotion.intent.mode, "brownfield");
    assert.equal(result.promotion.ambiguityAssessment.accepted, true);
    assert.equal(result.promotion.ambiguityAssessment.ambiguity, 0);
    assert.deepEqual(result.promotion.requiredClarifications, []);
    assert.deepEqual(result.promotion.policyFindings, []);
    assert.deepEqual(
      result.promotion.intent.acceptanceCriteria.map((criterion) => ({
        id: criterion.id,
        statement: criterion.statement,
        verification: criterion.verification
      })),
      [
        {
          id: "ac_359329cba7b9a27b",
          statement: "The settings page copy uses the approved operator-facing wording without changing behavior.",
          verification: "evidence"
        },
        {
          id: "ac_b96898ca038f7649",
          statement: "The focused intent admission tests pass with deterministic ordering and stable normalized AC ids.",
          verification: "test"
        }
      ]
    );
  });

  it("admits the clear brownfield fixture successfully as a ConfirmedIntent", async () => {
    const results = await loadAndAdmitExampleIntentFixtures();
    const result = results.find(
      (candidate) => candidate.fixture.relativePath === "brownfield/clear-promoted.draft.json"
    );

    assert.ok(result, "Expected brownfield/clear-promoted.draft.json to be loaded.");
    assert.equal(
      result.kind,
      "draft",
      "brownfield/clear-promoted.draft.json must be exercised as a mutable draft."
    );
    if (result.kind !== "draft") {
      return;
    }

    assert.equal(result.mode, "brownfield");
    assert.equal(result.fixture.expectation?.expectedAdmissionOutcome, "promoted");
    assert.equal(result.fixture.expectation?.expectedAmbiguityStatus?.mode, "brownfield");
    assert.equal(result.fixture.expectation?.expectedCapabilityEnvelopeResult?.status, "allowed");
    assert.equal(result.promotion.ok, true, "brownfield/clear-promoted.draft.json should promote.");
    if (!result.promotion.ok) {
      return;
    }

    const parsed = parseConfirmedIntent(result.promotion.intent);
    assert.equal(parsed.ok, true, parsed.ok ? undefined : parsed.errors.join("; "));
    if (!parsed.ok) {
      return;
    }

    const intent = parsed.intent;
    assert.ok(intent, "ConfirmedIntent parse result should include intent.");
    assert.equal(Object.isFrozen(result.promotion.intent), true);
    assert.equal(intent.id, "intent_brownfield_clear_promoted");
    assert.equal(intent.sourceDraftId, "draft_brownfield_clear_promoted");
    assert.equal(intent.mode, "brownfield");
    assert.equal(intent.goalArchetype, "cosmetic-tweak");
    assert.equal(intent.confirmedAt, EXAMPLE_INTENT_FIXTURE_CONFIRMED_AT);
    assert.equal(intent.requester, "ouroboros-ac-1102");
    assert.equal(result.promotion.ambiguityAssessment.accepted, true);
    assert.equal(result.promotion.ambiguityAssessment.ambiguity, 0);
    assert.equal(result.promotion.requiredDimensionChecklist.every((check) => check.passed), true);
    assert.equal(result.promotion.requiredFieldChecklist.every((check) => check.passed), true);
    assert.deepEqual(result.promotion.requiredClarifications, []);
    assert.deepEqual(result.promotion.missingFieldDetections, []);
    assert.deepEqual(result.promotion.hardZeroReasons, []);
    assert.deepEqual(result.promotion.policyFindings, []);
    assert.deepEqual(
      intent.acceptanceCriteria.map((criterion) => ({
        id: criterion.id,
        statement: criterion.statement,
        verification: criterion.verification
      })),
      [
        {
          id: "ac_8c4652b62a0e334a",
          statement:
            "The examples/intents/brownfield directory contains one blocked weak draft and one promoted clear draft with brownfield mode.",
          verification: "evidence"
        },
        {
          id: "ac_6acf7ccfc8c8dc74",
          statement: "The clear brownfield fixture promotes through deterministic intent admission with ambiguity at or below 0.20.",
          verification: "test"
        }
      ]
    );
    assert.deepEqual(intent.capabilityEnvelope.repoScopes, [
      {
        workspace: "protostar",
        path: "examples/intents/brownfield",
        access: "write"
      }
    ]);
  });

  it("admits the clear greenfield fixture successfully as a ConfirmedIntent", async () => {
    const results = await loadAndAdmitExampleIntentFixtures();
    const result = results.find(
      (candidate) => candidate.fixture.relativePath === "greenfield/clear-promoted.draft.json"
    );

    assert.ok(result, "Expected greenfield/clear-promoted.draft.json to be loaded.");
    assert.equal(
      result.kind,
      "draft",
      "greenfield/clear-promoted.draft.json must be exercised as a mutable draft."
    );
    if (result.kind !== "draft") {
      return;
    }

    assert.equal(result.mode, "greenfield");
    assert.equal(result.fixture.expectation?.expectedAdmissionOutcome, "promoted");
    assert.equal(result.fixture.expectation?.expectedAmbiguityStatus?.mode, "greenfield");
    assert.equal(result.fixture.expectation?.expectedCapabilityEnvelopeResult?.status, "allowed");
    assert.equal(result.promotion.ok, true, "greenfield/clear-promoted.draft.json should promote.");
    if (!result.promotion.ok) {
      return;
    }

    const parsed = parseConfirmedIntent(result.promotion.intent);
    assert.equal(parsed.ok, true, parsed.ok ? undefined : parsed.errors.join("; "));
    if (!parsed.ok) {
      return;
    }

    const intent = parsed.intent;
    assert.ok(intent, "ConfirmedIntent parse result should include intent.");
    assert.equal(Object.isFrozen(result.promotion.intent), true);
    assert.equal(intent.id, "intent_greenfield_clear_promoted");
    assert.equal(intent.sourceDraftId, "draft_greenfield_clear_promoted");
    assert.equal(intent.mode, "greenfield");
    assert.equal(intent.goalArchetype, "cosmetic-tweak");
    assert.equal(intent.confirmedAt, EXAMPLE_INTENT_FIXTURE_CONFIRMED_AT);
    assert.equal(intent.requester, "ouroboros-ac-100002");
    assert.equal(result.promotion.ambiguityAssessment.accepted, true);
    assert.equal(result.promotion.ambiguityAssessment.ambiguity, 0);
    assert.equal(result.promotion.requiredDimensionChecklist.every((check) => check.passed), true);
    assert.equal(result.promotion.requiredFieldChecklist.every((check) => check.passed), true);
    assert.deepEqual(result.promotion.requiredClarifications, []);
    assert.deepEqual(result.promotion.missingFieldDetections, []);
    assert.deepEqual(result.promotion.hardZeroReasons, []);
    assert.deepEqual(result.promotion.policyFindings, []);
    assert.deepEqual(
      intent.acceptanceCriteria.map((criterion) => ({
        id: criterion.id,
        statement: criterion.statement,
        verification: criterion.verification
      })),
      [
        {
          id: "ac_f4e76543d89c41b6",
          statement:
            "The greenfield fixture contains complete intent fields, measurable acceptance criteria, and a bounded capability envelope without changing admission behavior.",
          verification: "evidence"
        },
        {
          id: "ac_81ec5f47154a6b00",
          statement: "The draft promotes through deterministic intent admission with ambiguity at or below 0.20.",
          verification: "test"
        }
      ]
    );
    assert.deepEqual(intent.capabilityEnvelope.repoScopes, [
      {
        workspace: "protostar",
        path: "examples/intents/greenfield",
        access: "write"
      }
    ]);
  });
});

function assertFixtureAdmissionExpectation(result: ExampleIntentAdmissionFixture): void {
  const expectation = result.fixture.expectation;
  assert.ok(expectation, `${result.fixture.relativePath} must declare metadata.admissionExpectation.`);
  assert.ok(
    expectation.expectedAmbiguityStatus,
    `${result.fixture.relativePath} must declare expected ambiguity status.`
  );

  if (result.kind === "draft") {
    assertDraftFixtureAdmission(result, expectation.expectedAmbiguityStatus);
    return;
  }

  if (result.kind === "confirmed-intent") {
    assertConfirmedIntentFixtureAdmission(result, expectation.expectedAmbiguityStatus);
    return;
  }

  assertAmbiguityAssessmentFixture(result, expectation.expectedAmbiguityStatus);
}

function assertDraftFixtureAdmission(
  result: DraftExampleIntentAdmissionFixture,
  ambiguityExpectation: ExampleIntentFixtureAmbiguityStatusExpectation
): void {
  assertAmbiguityMatchesExpectation(result.fixture.relativePath, result.ambiguityAssessment, ambiguityExpectation);

  const expectedOutcome = result.fixture.expectation?.expectedAdmissionOutcome;
  if (expectedOutcome === "promoted") {
    assert.equal(result.promotion.ok, true, `${result.fixture.relativePath} should promote.`);
    if (result.promotion.ok) {
      assert.equal(result.promotion.intent.sourceDraftId, result.draft.draftId);
      assert.equal(result.promotion.intent.mode, result.mode);
      assert.equal(result.promotion.ambiguityAssessment.accepted, true);
    }
  } else if (expectedOutcome === "blocked") {
    assert.equal(result.promotion.ok, false, `${result.fixture.relativePath} should be blocked.`);
    if (!result.promotion.ok) {
      assert.equal(result.promotion.failureDetails.confirmedIntentCreated, false);
      assert.ok(result.promotion.errors.length > 0);
      assert.ok(
        result.promotion.requiredClarifications.length > 0 || result.promotion.policyFindings.length > 0,
        `${result.fixture.relativePath} should expose clarifications or policy findings.`
      );
    }
  } else {
    assert.fail(`${result.fixture.relativePath} has unsupported draft outcome ${String(expectedOutcome)}.`);
  }

  const capabilityExpectation = result.fixture.expectation?.expectedCapabilityEnvelopeResult;
  if (capabilityExpectation?.goalArchetype !== undefined && result.promotion.ok) {
    assert.equal(result.promotion.intent.goalArchetype, capabilityExpectation.goalArchetype);
  }
  if (capabilityExpectation?.unresolvedFindings !== undefined) {
    const unresolvedPolicyFindings = result.promotion.policyFindings.filter(
      (finding) => finding.severity === "block" && !finding.overridden
    );
    assert.deepEqual(unresolvedPolicyFindings, capabilityExpectation.unresolvedFindings);
  }
  if (capabilityExpectation?.blockingFindings !== undefined) {
    const blockingPolicyFindingCodes = result.promotion.policyFindings
      .filter((finding) => finding.severity === "block")
      .map((finding) => finding.code);

    assert.deepEqual(blockingPolicyFindingCodes, capabilityExpectation.blockingFindings);
  }
}

function assertConfirmedIntentFixtureAdmission(
  result: ConfirmedExampleIntentAdmissionFixture,
  ambiguityExpectation: ExampleIntentFixtureAmbiguityStatusExpectation
): void {
  assert.equal(
    result.parseResult.ok,
    true,
    result.parseResult.ok ? undefined : `${result.fixture.relativePath}: ${result.parseResult.errors.join("; ")}`
  );
  if (!result.parseResult.ok) {
    return;
  }

  assert.ok(result.ambiguityAssessment, `${result.fixture.relativePath} should have an ambiguity assessment.`);
  assertAmbiguityMatchesExpectation(result.fixture.relativePath, result.ambiguityAssessment, ambiguityExpectation);

  const expectedOutcome = result.fixture.expectation?.expectedAdmissionOutcome;
  if (expectedOutcome === "accepted-confirmed-intent") {
    assert.equal(result.ambiguityAssessment.accepted, true);
  } else if (expectedOutcome === "blocked") {
    assert.equal(result.ambiguityAssessment.accepted, false);
  } else {
    assert.fail(`${result.fixture.relativePath} has unsupported confirmed-intent outcome ${String(expectedOutcome)}.`);
  }
}

function assertAmbiguityAssessmentFixture(
  result: AmbiguityAssessmentExampleIntentFixture,
  ambiguityExpectation: ExampleIntentFixtureAmbiguityStatusExpectation
): void {
  assertAmbiguityMatchesExpectation(result.fixture.relativePath, result.assessment, ambiguityExpectation);
}

function assertAmbiguityMatchesExpectation(
  relativePath: string,
  actual: {
    readonly mode: IntentAmbiguityMode;
    readonly threshold: number;
    readonly ambiguity: number;
    readonly accepted: boolean;
    readonly structurallyMissingDimensions: readonly string[];
  },
  expectation: ExampleIntentFixtureAmbiguityStatusExpectation
): void {
  if (expectation.mode !== undefined) {
    assert.equal(actual.mode, expectation.mode, `${relativePath} mode mismatch.`);
  }
  if (expectation.threshold !== undefined) {
    assert.equal(actual.threshold, expectation.threshold, `${relativePath} threshold mismatch.`);
  }
  if (expectation.expectedAccepted !== undefined) {
    assert.equal(actual.accepted, expectation.expectedAccepted, `${relativePath} accepted mismatch.`);
  }
  if (expectation.expectedScore !== undefined) {
    assert.equal(actual.ambiguity, expectation.expectedScore, `${relativePath} ambiguity mismatch.`);
  }
  if (expectation.structurallyMissingDimensions !== undefined) {
    assert.deepEqual(
      actual.structurallyMissingDimensions,
      expectation.structurallyMissingDimensions,
      `${relativePath} structurally missing dimension mismatch.`
    );
  }
}
