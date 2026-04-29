export const expectation = {
  outcome: "pr-ready" as const,
  archetype: "cosmetic-tweak" as const,
  // triggeredBy: real DOG-03 seed delivered as a public toy-repo PR.
  triggeredBy: "real-seed" as const,
  expected: {
    manifestStatus: "ready-to-release",
    reviewVerdict: "pass",
    hasPrUrl: true
  }
} as const;
