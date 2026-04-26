import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CAPABILITY_ENVELOPE_REPAIR_LOOP_COUNT_ADMISSION_FAILURE_CODES,
  CAPABILITY_ENVELOPE_REPAIR_LOOP_COUNT_POLICY_FIELD,
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
});
