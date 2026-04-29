export const expectation = {
  outcome: "failed-execution" as const,
  archetype: "cosmetic-tweak" as const,
  // triggeredBy: IntentDraft capabilityEnvelope budget below the patch/execution need.
  triggeredBy: "envelope-tweak" as const,
  expected: {
    manifestStatus: "blocked",
    reviewVerdict: "block"
  }
} as const;
