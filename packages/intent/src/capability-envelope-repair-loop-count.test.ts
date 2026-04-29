import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CAPABILITY_ENVELOPE_REPAIR_LOOP_COUNT_ADMISSION_FAILURE_CODES,
  CAPABILITY_ENVELOPE_REPAIR_LOOP_COUNT_POLICY_FIELD,
  GOAL_ARCHETYPE_POLICY_TABLE,
  validateCapabilityEnvelopeRepairLoopCount,
  validateIntentDraftCapabilityEnvelopeRepairLoopCount,
  type IntentDraftCapabilityEnvelope
} from "./index.js";

describe("capability-envelope repair_loop_count validation", () => {
  it("exports deterministic repair_loop_count admission failure codes", () => {
    assert.deepEqual([...CAPABILITY_ENVELOPE_REPAIR_LOOP_COUNT_ADMISSION_FAILURE_CODES], [
      "repair_loop_count_unknown_archetype",
      "repair_loop_count_exceeds_cap"
    ]);
    assert.equal(CAPABILITY_ENVELOPE_REPAIR_LOOP_COUNT_POLICY_FIELD, "repair_loop_count");
    assert.equal(
      validateIntentDraftCapabilityEnvelopeRepairLoopCount,
      validateCapabilityEnvelopeRepairLoopCount
    );
  });

  it("blocks when no selected goal-archetype policy can provide repair_loop_count", () => {
    const result = validateCapabilityEnvelopeRepairLoopCount({
      goalArchetype: "missing-archetype",
      capabilityEnvelope: {
        budget: {
          maxRepairLoops: 1
        }
      }
    });

    assert.equal(result.ok, false);
    assert.deepEqual(result.failures, [
      {
        code: "repair_loop_count_unknown_archetype",
        goalArchetype: "missing-archetype",
        fieldPath: "goalArchetype",
        severity: "block",
        message:
          "Repair-loop admission cannot select a repair_loop_count policy cap for goalArchetype 'missing-archetype'.",
        policyField: "repair_loop_count"
      }
    ]);
  });

  it("compares draft maxRepairLoops to the selected policy repair_loop_count cap", () => {
    const capabilityEnvelope = {
      budget: {
        timeoutMs: 120_000,
        maxRepairLoops: 2
      }
    } satisfies IntentDraftCapabilityEnvelope;
    const input = {
      goalArchetype: "cosmetic-tweak",
      capabilityEnvelope,
      selectedGoalArchetypePolicy: {
        budgets: {
          repair_loop_count: 1
        }
      }
    };

    const first = validateCapabilityEnvelopeRepairLoopCount(input);
    const second = validateCapabilityEnvelopeRepairLoopCount(input);

    assert.deepEqual(second, first);
    assert.equal(first.ok, false);
    assert.deepEqual(first.failures, [
      {
        code: "repair_loop_count_exceeds_cap",
        goalArchetype: "cosmetic-tweak",
        fieldPath: "capabilityEnvelope.budget.maxRepairLoops",
        severity: "ambiguity",
        message:
          "capabilityEnvelope.budget.maxRepairLoops requests 2 repair loops above the cosmetic-tweak policy repair_loop_count cap of 1.",
        requestedRepairLoopCount: 2,
        allowedRepairLoopCount: 1,
        policyField: "repair_loop_count"
      }
    ]);
  });

  it("accepts maxRepairLoops at or below the selected policy cap", () => {
    assert.deepEqual(
      validateCapabilityEnvelopeRepairLoopCount({
        goalArchetype: "cosmetic-tweak",
        capabilityEnvelope: {
          budget: {
            maxRepairLoops: 1
          }
        },
        selectedGoalArchetypePolicy: {
          repair_loop_count: 1
        }
      }),
      {
        ok: true,
        goalArchetype: "cosmetic-tweak",
        failures: []
      }
    );
  });

  it("accepts exact Phase 11 repair-loop caps: cosmetic-tweak 1, feature-add 9, bugfix 5, and refactor 5", () => {
    const cases = [
      ["cosmetic-tweak", 1],
      ["feature-add", 9],
      ["bugfix", 5],
      ["refactor", 5]
    ] as const;

    for (const [goalArchetype, cap] of cases) {
      assert.deepEqual(
        validateCapabilityEnvelopeRepairLoopCount({
          goalArchetype,
          capabilityEnvelope: {
            budget: {
              maxRepairLoops: cap
            }
          },
          selectedGoalArchetypePolicy: GOAL_ARCHETYPE_POLICY_TABLE[goalArchetype]
        }),
        {
          ok: true,
          goalArchetype,
          failures: []
        },
        `${goalArchetype} should accept maxRepairLoops ${cap}.`
      );
    }
  });

  it("refuses one over Phase 11 repair-loop caps: cosmetic-tweak 2, feature-add 10, bugfix 6, and refactor 6", () => {
    const cases = [
      ["cosmetic-tweak", 2, 1],
      ["feature-add", 10, 9],
      ["bugfix", 6, 5],
      ["refactor", 6, 5]
    ] as const;

    for (const [goalArchetype, requestedRepairLoopCount, allowedRepairLoopCount] of cases) {
      assert.deepEqual(
        validateCapabilityEnvelopeRepairLoopCount({
          goalArchetype,
          capabilityEnvelope: {
            budget: {
              maxRepairLoops: requestedRepairLoopCount
            }
          },
          selectedGoalArchetypePolicy: GOAL_ARCHETYPE_POLICY_TABLE[goalArchetype]
        }),
        {
          ok: false,
          goalArchetype,
          failures: [
            {
              code: "repair_loop_count_exceeds_cap",
              goalArchetype,
              fieldPath: "capabilityEnvelope.budget.maxRepairLoops",
              severity: "ambiguity",
              message:
                `capabilityEnvelope.budget.maxRepairLoops requests ${requestedRepairLoopCount} repair loops above the ${goalArchetype} policy repair_loop_count cap of ${allowedRepairLoopCount}.`,
              requestedRepairLoopCount,
              allowedRepairLoopCount,
              policyField: CAPABILITY_ENVELOPE_REPAIR_LOOP_COUNT_POLICY_FIELD
            }
          ]
        },
        `${goalArchetype} should refuse maxRepairLoops ${requestedRepairLoopCount}.`
      );
    }
  });
});
