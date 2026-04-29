export const expectation = {
  outcome: "accepted" as const,
  archetype: "cosmetic-tweak" as const,
  // triggeredBy: real seed that reached review pass and stopped before delivery.
  triggeredBy: "real-seed" as const,
  expected: {
    manifestStatus: "ready-to-release",
    reviewVerdict: "pass",
    hasPrUrl: false
  }
} as const;
