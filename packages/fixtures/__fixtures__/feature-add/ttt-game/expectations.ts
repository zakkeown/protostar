export const expectation = {
  seedId: "ttt-game" as const,
  archetype: "feature-add" as const,
  expectedTargetRepo: "../protostar-toy-ttt" as const,
  immutableVerificationFiles: [
    "e2e/ttt.spec.ts",
    "tests/ttt-state.property.test.ts"
  ] as const,
  requiredCiChecks: [
    "build-and-test",
    "playwright-e2e"
  ] as const,
  expectedMaxAmbiguity: 0.2
} as const;
