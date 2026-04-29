export const expectation = {
  outcome: "blocked-review" as const,
  archetype: "cosmetic-tweak" as const,
  // triggeredBy: synthetic intent/fixture that produces a known-bad review diff.
  triggeredBy: "synthetic-intent" as const,
  expected: {
    manifestStatus: "blocked",
    reviewVerdict: "block"
  }
} as const;
