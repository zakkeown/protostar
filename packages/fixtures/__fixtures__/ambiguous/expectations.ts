export const expectation = {
  outcome: "ambiguous" as const,
  archetype: "cosmetic-tweak" as const,
  // triggeredBy: synthetic intent text "do something nice" trips the ambiguity gate.
  triggeredBy: "synthetic-intent" as const,
  expected: {
    manifestStatus: "blocked",
    refusalKind: "intent-ambiguous"
  }
} as const;
