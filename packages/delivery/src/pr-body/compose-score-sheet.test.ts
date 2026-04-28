import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { composeScoreSheet, type JudgePanelCritique } from "./compose-score-sheet.js";

const passCritique = {
  judgeId: "zeta",
  model: "qwen3",
  verdict: "pass",
  rationale: "Looks good.",
  rubric: { coherence: 4, correctness: 5 },
  taskRefs: ["task-1"]
} satisfies JudgePanelCritique;

describe("composeScoreSheet", () => {
  it("renders the empty judge critique state", () => {
    assert.equal(composeScoreSheet([]), "## Judge Panel\n\n_No judge critiques._\n");
  });

  it("renders one critique with a table row, details sibling, and 2-decimal mean", () => {
    const out = composeScoreSheet([passCritique]);

    assert.equal(out.includes("| zeta | qwen3 | pass | 4.50 |"), true);
    assert.equal(out.includes("<summary>zeta rationale</summary>"), true);
    assert.equal(out.includes("- coherence: 4\n- correctness: 5"), true);
    assert.equal(/\|.*<details>.*\|/.test(out), false);
  });

  it("orders mixed verdicts by severity then judgeId and pins the snapshot", () => {
    const critiques = [
      passCritique,
      {
        judgeId: "alpha",
        model: "deepseek",
        verdict: "repair",
        rationale: "Needs a small repair.",
        rubric: { coherence: 3, correctness: 4 },
        taskRefs: ["task-2"]
      },
      {
        judgeId: "beta",
        model: "llama",
        verdict: "block",
        rationale: "Blocks delivery.",
        rubric: { coherence: 2, correctness: 2 },
        taskRefs: ["task-3"]
      },
      {
        judgeId: "aaron",
        model: "qwen3",
        verdict: "repair",
        rationale: "Alphabetical repair ordering.",
        rubric: { coherence: 5, correctness: 3 },
        taskRefs: ["task-4"]
      }
    ] satisfies readonly JudgePanelCritique[];

    const out = composeScoreSheet(critiques);

    assert.equal(
      out,
      [
        "## Judge Panel",
        "",
        "| Judge | Model | Verdict | Mean Score |",
        "|-------|-------|---------|------------|",
        "| beta | llama | block | 2.00 |",
        "| aaron | qwen3 | repair | 4.00 |",
        "| alpha | deepseek | repair | 3.50 |",
        "| zeta | qwen3 | pass | 4.50 |",
        "",
        "<details>",
        "<summary>beta rationale</summary>",
        "",
        "Blocks delivery.",
        "",
        "Rubric:",
        "- coherence: 2",
        "- correctness: 2",
        "</details>",
        "",
        "<details>",
        "<summary>aaron rationale</summary>",
        "",
        "Alphabetical repair ordering.",
        "",
        "Rubric:",
        "- coherence: 5",
        "- correctness: 3",
        "</details>",
        "",
        "<details>",
        "<summary>alpha rationale</summary>",
        "",
        "Needs a small repair.",
        "",
        "Rubric:",
        "- coherence: 3",
        "- correctness: 4",
        "</details>",
        "",
        "<details>",
        "<summary>zeta rationale</summary>",
        "",
        "Looks good.",
        "",
        "Rubric:",
        "- coherence: 4",
        "- correctness: 5",
        "</details>",
        ""
      ].join("\n")
    );

    assert.equal((out.match(/<details>/g) ?? []).length, 4);
    assert.equal(/\|.*<details>.*\|/.test(out), false);
  });
});
