import type { Seed } from "../index.js";

export const tttGameAcceptanceCriteria = Object.freeze([
  "3x3 grid with 9 clickable cells",
  "X moves first and players alternate",
  "eight win conditions",
  "winning player banner plus winning line",
  "draw UI",
  "restart resets to X",
  "React state only, no persistence",
  "keyboard accessible cells with Space activation",
  "e2e/ttt.spec.ts already exists and must pass",
  "tests/ttt-state.property.test.ts already exists and must pass"
]);

export const tttGameSeed: Seed = Object.freeze({
  id: "ttt-game",
  archetype: "feature-add",
  intent: "Build a playable Tauri tic-tac-toe game in the toy app",
  notes: "Phase 11 single-shot feature-add seed for the external protostar-toy-ttt repository.",
  acceptanceCriteria: tttGameAcceptanceCriteria,
  capabilityEnvelope: Object.freeze({
    budget: Object.freeze({
      maxRepairLoops: 9
    })
  })
});

export const tttGameExpectations = Object.freeze({
  expectedTargetRepo: "../protostar-toy-ttt",
  immutableVerificationFiles: Object.freeze([
    "e2e/ttt.spec.ts",
    "tests/ttt-state.property.test.ts"
  ]),
  requiredCiChecks: Object.freeze([
    "build-and-test",
    "playwright-e2e"
  ]),
  expectedMaxAmbiguity: 0.2
});
