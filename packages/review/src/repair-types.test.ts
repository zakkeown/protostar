import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { StageArtifactRef } from "@protostar/artifacts";
import type { RepairContext } from "@protostar/planning";

import type { JudgeCritique } from "./judge-types.js";
import type { ReviewFinding } from "./index.js";
import type {
  MechanicalCheckResult,
  ModelReviewInput,
  ModelReviewer,
  RepairPlan
} from "./repair-types.js";

describe("repair type contracts", () => {
  it("constructs repair plans with mechanical-only and model-backed repair tasks", () => {
    const mechanicalFinding = reviewFinding("execution-completed", "Task failed mechanical review.");
    const modelCritique: JudgeCritique = {
      judgeId: "qwen-primary",
      model: "qwen3-80b",
      rubric: { "design-quality": 0.7 },
      verdict: "repair",
      rationale: "The task should simplify its retry path.",
      taskRefs: ["task-2"]
    };

    const plan: RepairPlan = {
      runId: "run-1",
      attempt: 1,
      repairs: [
        {
          planTaskId: "task-1",
          mechanicalCritiques: [mechanicalFinding]
        },
        {
          planTaskId: "task-2",
          mechanicalCritiques: [mechanicalFinding],
          modelCritiques: [modelCritique]
        }
      ],
      dependentTaskIds: ["task-3"]
    };

    assert.equal(plan.repairs.length, 2);
    assert.equal(plan.repairs[0]?.mechanicalCritiques[0]?.severity, "major");
    assert.equal(plan.repairs[1]?.modelCritiques?.[0]?.judgeId, "qwen-primary");
  });

  it("assigns RepairContext to model review input repairContext", () => {
    const repairContext: RepairContext = {
      previousAttempt: {
        planTaskId: "task-1",
        attempt: 2
      },
      mechanicalCritiques: []
    };

    const input: Pick<ModelReviewInput, "repairContext"> = {
      repairContext
    };

    assert.equal(input.repairContext?.previousAttempt.planTaskId, "task-1");
  });

  it("keeps MechanicalCheckResult findings assignable to readonly ReviewFinding[]", () => {
    const result: MechanicalCheckResult = {
      schemaVersion: "1.0.0",
      runId: "run-1",
      attempt: 1,
      commands: [
        {
          id: "verify",
          argv: ["pnpm", "run", "verify"],
          exitCode: 1,
          durationMs: 123,
          stdoutPath: "runs/run-1/review/iter-1/verify.stdout.txt",
          stderrPath: "runs/run-1/review/iter-1/verify.stderr.txt"
        }
      ],
      diffNameOnly: ["packages/review/src/index.ts"],
      findings: [reviewFinding("execution-result-consistency", "Execution result was inconsistent.")]
    };

    const findings: readonly ReviewFinding[] = result.findings;

    assert.equal(findings[0]?.ruleId, "execution-result-consistency");
  });

  it("keeps ModelReviewer callable with pass verdict and critiques", async () => {
    const stub: ModelReviewer = async () => ({ verdict: "pass", critiques: [] });

    const result = await stub({} as ModelReviewInput);

    assert.equal(result.verdict, "pass");
    assert.deepEqual(result.critiques, []);
  });
});

function reviewFinding(ruleId: ReviewFinding["ruleId"], summary: string): ReviewFinding {
  return {
    ruleId,
    severity: "major",
    summary,
    evidence: [artifactRef()],
    repairTaskId: "task-1"
  };
}

function artifactRef(): StageArtifactRef {
  return {
    stage: "review",
    kind: "finding",
    uri: "runs/run-1/review/iter-1/finding.json"
  };
}
