import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { tttGameExpectations, tttGameSeed } from "@protostar/fixtures";
import { promoteIntentDraft, type IntentDraft } from "@protostar/intent";

describe("TTT seed ambiguity", () => {
  it("materializes the feature-add TTT seed into an admitted brownfield intent", () => {
    const draft = materializeTttSeedDraft();
    const result = promoteIntentDraft({
      draft,
      mode: "brownfield",
      confirmedAt: "2026-04-29T00:00:00.000Z"
    });

    assert.equal(result.ok, true, result.errors.join("; "));
    assert.equal(result.ambiguityAssessment.accepted, true);
    assert.equal(result.ambiguityAssessment.ambiguity <= tttGameExpectations.expectedMaxAmbiguity, true);
    assert.equal(result.ambiguityAssessment.threshold, 0.2);
    assert.deepEqual(result.requiredClarifications, []);
    assert.equal(result.intent.capabilityEnvelope.budget.maxRepairLoops, 9);
    assert.equal(result.intent.acceptanceCriteria.length, tttGameSeed.acceptanceCriteria.length);
  });
});

function materializeTttSeedDraft(): IntentDraft {
  const maxRepairLoops = tttGameSeed.capabilityEnvelope?.budget?.maxRepairLoops ?? 9;

  return {
    draftId: "draft_ttt_game_feature_add",
    title: "Build playable Tauri tic-tac-toe",
    problem: `${tttGameSeed.intent} in ${tttGameExpectations.expectedTargetRepo} so the Phase 11 feature-add path can prove a complete game delivery against operator-authored verification files.`,
    requester: "phase-11-seed-library",
    mode: "brownfield",
    goalArchetype: "feature-add",
    context: `The brownfield target is ${tttGameExpectations.expectedTargetRepo}, a Tauri React toy application that already contains immutable operator verification files ${tttGameExpectations.immutableVerificationFiles.join(" and ")}.`,
    acceptanceCriteria: tttGameSeed.acceptanceCriteria.map((statement) => ({
      statement: expandedAcceptanceCriterionStatement(statement),
      verification: statement.includes(".ts") ? "test" : "evidence"
    })),
    constraints: [
      "Factory authority is scoped only to toy app implementation files under src/.",
      `Do not edit ${tttGameExpectations.immutableVerificationFiles[0]}.`,
      `Do not edit ${tttGameExpectations.immutableVerificationFiles[1]}.`,
      "Preserve the existing Tauri, React, and Vite project structure while adding the game behavior."
    ],
    stopConditions: [
      "Stop if the feature-add repair loop reaches 9 attempts.",
      "Stop if the immutable Playwright or property verification files are missing or targeted for edits.",
      "Stop if build-and-test or playwright-e2e verification fails after the final repair attempt."
    ],
    capabilityEnvelope: {
      repoScopes: [
        {
          workspace: tttGameExpectations.expectedTargetRepo,
          path: "src/App.tsx",
          access: "write"
        },
        {
          workspace: tttGameExpectations.expectedTargetRepo,
          path: "src/components/TicTacToe.tsx",
          access: "write"
        }
      ],
      toolPermissions: [
        {
          tool: "shell",
          permissionLevel: "use",
          reason: "Run toy app build, unit, property, and Playwright verification commands.",
          risk: "medium"
        }
      ],
      budget: {
        timeoutMs: 900000,
        maxRepairLoops
      }
    }
  };
}

function expandedAcceptanceCriterionStatement(statement: string): string {
  switch (statement) {
    case "3x3 grid with 9 clickable cells":
      return `${statement}: the rendered board exposes exactly nine independently clickable cells.`;
    case "X moves first and players alternate":
      return `${statement}: the visible board shows X for the first legal move and each later legal move shows the other player mark.`;
    case "eight win conditions":
      return `${statement}: the visible result displays a winner for all three rows, all three columns, and both diagonal win lines.`;
    case "winning player banner plus winning line":
      return `${statement}: a win displays the winning player and visually marks the winning line.`;
    case "draw UI":
      return `${statement}: filling all nine cells without a winner displays a draw state instead of a winner.`;
    case "restart resets to X":
      return `${statement}: pressing restart displays an empty board and shows X as the next player.`;
    case "React state only, no persistence":
      return `${statement}: tests verify board state uses React state and writes no state to disk, storage, or a backend.`;
    case "keyboard accessible cells with Space activation":
      return `${statement}: every cell allows keyboard focus and Space activates the focused empty cell.`;
    case "e2e/ttt.spec.ts already exists and must pass":
      return `${statement}: the immutable Playwright file e2e/ttt.spec.ts remains untouched and passes in CI.`;
    case "tests/ttt-state.property.test.ts already exists and must pass":
      return `${statement}: the immutable property test tests/ttt-state.property.test.ts remains untouched and passes in CI.`;
    default:
      return statement;
  }
}
