export const expectation = {
  outcome: "repaired-execution" as const,
  archetype: "cosmetic-tweak" as const,
  // triggeredBy: IntentDraft capabilityEnvelope permits exactly one repair loop.
  triggeredBy: "envelope-tweak" as const,
  expected: {
    manifestStatus: "ready-to-release",
    reviewVerdict: "pass",
    repairIterations: 1
  }
} as const;
