import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { JudgeCritique } from "@protostar/review";

import { composeJudgePanel } from "./compose-judge-panel.js";
import { composeScoreSheet } from "./compose-score-sheet.js";

describe("composeJudgePanel", () => {
  it("returns the score sheet for the public judge panel composer", () => {
    const critiques = [
      {
        judgeId: "j1",
        model: "qwen3",
        verdict: "pass",
        rationale: "Accepted.",
        rubric: { coherence: 4, correctness: 5 },
        taskRefs: ["task-1"]
      }
    ] satisfies readonly JudgeCritique[];

    assert.equal(composeJudgePanel({ critiques }), composeScoreSheet(critiques));
  });

  it("preserves the empty state from composeScoreSheet", () => {
    assert.equal(composeJudgePanel({ critiques: [] }), "## Judge Panel\n\n_No judge critiques._\n");
  });
});
