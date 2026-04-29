export const expectation = {
  outcome: "bad-plan" as const,
  archetype: "cosmetic-tweak" as const,
  // triggeredBy: synthetic intent/planning fixture for a non-existent target file.
  triggeredBy: "synthetic-intent" as const,
  expected: {
    manifestStatus: "blocked",
    refusalKind: "planning-refusal"
  }
} as const;
