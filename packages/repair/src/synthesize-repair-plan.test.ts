/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { StageArtifactRef } from "@protostar/artifacts";
import type { AdmittedPlanExecutionArtifact } from "@protostar/planning";

import {
  EmptyRepairSynthesisError,
  type RepairFindingInput,
  type RepairGateInput,
  type RepairJudgeCritiqueInput,
  type RepairModelReviewInput,
  synthesizeRepairPlan
} from "./synthesize-repair-plan.js";

interface ReviewFinding extends RepairFindingInput {
  readonly ruleId: "execution-completed";
  readonly severity: "major";
  readonly summary: string;
  readonly evidence: readonly StageArtifactRef[];
  readonly repairTaskId: string;
}

interface JudgeCritique extends RepairJudgeCritiqueInput {
  readonly judgeId: string;
  readonly model: string;
  readonly rubric: Readonly<Record<string, number>>;
  readonly verdict: "repair";
  readonly rationale: string;
}

describe("synthesizeRepairPlan", () => {
  it("groups mechanical-only findings by repairTaskId", () => {
    const plan = admittedPlan(["task-a", "task-b", "task-c"]);
    const taskAFinding = reviewFinding("task-a", "Task A failed tests.");
    const secondTaskAFinding = reviewFinding("task-a", "Task A missed evidence.");
    const taskBFinding = reviewFinding("task-b", "Task B failed lint.");

    const repairPlan = synthesizeRepairPlan({
      runId: "run-1",
      attempt: 1,
      plan,
      mechanical: reviewGate([taskAFinding, secondTaskAFinding, taskBFinding]),
      dependentTaskIds: ["task-a", "task-b"]
    });

    assert.equal(repairPlan.repairs.length, 2);
    assert.deepEqual(
      planTaskIds(repairPlan.repairs),
      ["task-a", "task-b"]
    );
    assert.deepEqual(repairPlan.repairs[0]?.mechanicalCritiques, [
      taskAFinding,
      secondTaskAFinding
    ]);
    assert.deepEqual(repairPlan.repairs[1]?.mechanicalCritiques, [taskBFinding]);
    assert.equal(repairPlan.repairs[0]?.modelCritiques, undefined);
    assert.equal(repairPlan.repairs[1]?.modelCritiques, undefined);
  });

  it("attaches mechanical and model critiques for the same task", () => {
    const plan = admittedPlan(["task-a", "task-b", "task-c"]);
    const finding = reviewFinding("task-a", "Task A failed tests.");
    const critique = judgeCritique(["task-a"], "Task A should simplify the fix.");

    const repairPlan = synthesizeRepairPlan({
      runId: "run-1",
      attempt: 1,
      plan,
      mechanical: reviewGate([finding]),
      model: modelResult([critique]),
      dependentTaskIds: ["task-a"]
    });

    assert.equal(repairPlan.repairs.length, 1);
    assert.equal(repairPlan.repairs[0]?.mechanicalCritiques.length, 1);
    assert.equal(repairPlan.repairs[0]?.modelCritiques?.length, 1);
  });

  it("emits separate repair tasks for model-only critiques on another task", () => {
    const plan = admittedPlan(["task-a", "task-b"]);
    const finding = reviewFinding("task-a", "Task A failed tests.");
    const critique = judgeCritique(["task-b"], "Task B should update its caller.");

    const repairPlan = synthesizeRepairPlan({
      runId: "run-1",
      attempt: 1,
      plan,
      mechanical: reviewGate([finding]),
      model: modelResult([critique]),
      dependentTaskIds: ["task-a", "task-b"]
    });

    assert.deepEqual(
      planTaskIds(repairPlan.repairs),
      ["task-a", "task-b"]
    );
    assert.deepEqual(repairPlan.repairs[0]?.mechanicalCritiques, [finding]);
    assert.deepEqual(repairPlan.repairs[0]?.modelCritiques, undefined);
    assert.deepEqual(repairPlan.repairs[1]?.mechanicalCritiques, []);
    assert.deepEqual(repairPlan.repairs[1]?.modelCritiques, [critique]);
  });

  it("fans a multi-task judge critique into every referenced repair task", () => {
    const plan = admittedPlan(["task-a", "task-b"]);
    const critique = judgeCritique(["task-a", "task-b"], "Both tasks need the same consistency fix.");

    const repairPlan = synthesizeRepairPlan({
      runId: "run-1",
      attempt: 1,
      plan,
      mechanical: reviewGate([]),
      model: modelResult([critique]),
      dependentTaskIds: ["task-a", "task-b"]
    });

    assert.deepEqual(repairPlan.repairs[0]?.modelCritiques, [critique]);
    assert.deepEqual(repairPlan.repairs[1]?.modelCritiques, [critique]);
  });

  it("passes dependentTaskIds through to the repair plan", () => {
    const dependentTaskIds = ["task-z", "task-y"] as const;

    const repairPlan = synthesizeRepairPlan({
      runId: "run-1",
      attempt: 1,
      plan: admittedPlan(["task-a"]),
      mechanical: reviewGate([reviewFinding("task-a", "Task A failed tests.")]),
      dependentTaskIds
    });

    assert.deepEqual(repairPlan.dependentTaskIds, dependentTaskIds);
  });

  it("produces deterministic output in admitted plan task order", () => {
    const input = {
      runId: "run-1",
      attempt: 1,
      plan: admittedPlan(["task-a", "task-b", "task-c"]),
      mechanical: reviewGate([
        reviewFinding("task-c", "Task C failed tests."),
        reviewFinding("task-a", "Task A failed tests.")
      ]),
      model: modelResult([
        judgeCritique(["task-b"], "Task B should account for A."),
        judgeCritique(["task-a"], "Task A needs a smaller patch.")
      ]),
      dependentTaskIds: ["task-a", "task-b", "task-c"]
    };

    const first = synthesizeRepairPlan(input);
    const second = synthesizeRepairPlan(input);

    assert.deepEqual(
      planTaskIds(first.repairs),
      ["task-a", "task-b", "task-c"]
    );
    assert.equal(JSON.stringify(first), JSON.stringify(second));
  });

  it("throws EmptyRepairSynthesisError when there are no findings or critiques", () => {
    assert.throws(
      () =>
        synthesizeRepairPlan({
          runId: "run-1",
          attempt: 1,
          plan: admittedPlan(["task-a"]),
          mechanical: reviewGate([]),
          model: modelResult([]),
          dependentTaskIds: []
        }),
      EmptyRepairSynthesisError
    );
  });
});

function admittedPlan(planTaskIds: readonly string[]): AdmittedPlanExecutionArtifact {
  return {
    planId: "plan-1",
    intentId: "intent-1",
    tasks: planTaskIds.map((planTaskId) => ({
      planTaskId,
      title: planTaskId,
      dependsOn: []
    }))
  } as unknown as AdmittedPlanExecutionArtifact;
}

function planTaskIds(repairs: readonly { readonly planTaskId: string }[]): readonly string[] {
  return repairs.map((repair) => repair.planTaskId);
}

function reviewGate(findings: readonly ReviewFinding[]): RepairGateInput {
  return {
    findings
  };
}

function reviewFinding(repairTaskId: string, summary: string): ReviewFinding {
  return {
    ruleId: "execution-completed",
    severity: "major",
    summary,
    evidence: [artifactRef()],
    repairTaskId
  };
}

function modelResult(critiques: readonly JudgeCritique[]): RepairModelReviewInput {
  return {
    critiques
  };
}

function judgeCritique(taskRefs: readonly string[], rationale: string): JudgeCritique {
  return {
    judgeId: "judge-1",
    model: "qwen3-80b",
    rubric: { correctness: 0.5 },
    verdict: "repair",
    rationale,
    taskRefs
  };
}

function artifactRef(): StageArtifactRef {
  return {
    stage: "review",
    kind: "finding",
    uri: "runs/run-1/review/iter-1/finding.json"
  };
}
