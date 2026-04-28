import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RepairContext } from "./repair-context.js";

describe("RepairContext contract", () => {
  it("carries previous attempt and structured critiques for adapter retry context", () => {
    const context: RepairContext = {
      previousAttempt: {
        planTaskId: "task-1",
        attempt: 2
      },
      mechanicalCritiques: [
        {
          ruleId: "execution-completed",
          severity: "major",
          repairTaskId: "task-1",
          message: "Task evidence failed mechanical review.",
          evidence: { stdout: "runs/r-1/review/iter-1/stdout.txt" }
        }
      ],
      modelCritiques: [
        {
          judgeId: "qwen-primary",
          verdict: "repair",
          rationale: "The implementation missed one acceptance criterion.",
          taskRefs: ["task-1"]
        }
      ]
    };

    assert.equal(context.previousAttempt.planTaskId, "task-1");
    assert.equal(context.previousAttempt.attempt, 2);
    assert.equal(context.mechanicalCritiques[0]?.severity, "major");
    assert.equal(context.modelCritiques?.[0]?.verdict, "repair");
  });
});
