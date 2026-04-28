import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { JudgeCritique } from "./judge-types.js";

describe("JudgeCritique contract", () => {
  it("allows open rubric keys with numeric scores", () => {
    const critique: JudgeCritique = {
      judgeId: "qwen-primary",
      model: "qwen3-80b",
      rubric: {
        "design-quality": 0.7,
        "test-coverage": 0.9
      },
      verdict: "repair",
      rationale: "Coverage is high, but the design needs a small repair.",
      taskRefs: ["task-1"]
    };

    assert.equal(critique.rubric["design-quality"], 0.7);
    assert.equal(critique.rubric["test-coverage"], 0.9);
  });
});
