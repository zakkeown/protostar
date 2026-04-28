/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AdmittedPlanExecutionArtifact } from "@protostar/planning";

import { computeRepairSubgraph, UnknownRepairTaskError } from "./compute-repair-subgraph.js";

describe("computeRepairSubgraph", () => {
  it("returns only C for the Q-03 A to B to C example when C needs repair", () => {
    const plan = admittedPlan([
      task("task-a"),
      task("task-b", ["task-a"]),
      task("task-c", ["task-b"])
    ]);

    assert.deepEqual(
      computeRepairSubgraph({ plan, repairTaskIds: ["task-c"] }),
      ["task-c"]
    );
  });

  it("returns A, B, C for the Q-03 A to B to C example when A needs repair", () => {
    const plan = admittedPlan([
      task("task-a"),
      task("task-b", ["task-a"]),
      task("task-c", ["task-b"])
    ]);

    assert.deepEqual(
      computeRepairSubgraph({ plan, repairTaskIds: ["task-a"] }),
      ["task-a", "task-b", "task-c"]
    );
  });

  it("returns only the selected branch and its descendants in a diamond graph", () => {
    const plan = admittedPlan([
      task("task-a"),
      task("task-b", ["task-a"]),
      task("task-c", ["task-a"]),
      task("task-d", ["task-b", "task-c"])
    ]);

    assert.deepEqual(
      computeRepairSubgraph({ plan, repairTaskIds: ["task-b"] }),
      ["task-b", "task-d"]
    );
  });

  it("returns an empty subgraph when there are no repair task ids", () => {
    const plan = admittedPlan([task("task-a"), task("task-b", ["task-a"])]);

    assert.deepEqual(computeRepairSubgraph({ plan, repairTaskIds: [] }), []);
  });

  it("throws UnknownRepairTaskError when a repair task id is not in the plan", () => {
    const plan = admittedPlan([task("task-a")]);

    assert.throws(
      () => computeRepairSubgraph({ plan, repairTaskIds: ["task-z"] }),
      (error: any) =>
        error instanceof UnknownRepairTaskError &&
        error.message.includes("task-z")
    );
  });

  it("preserves topological order from the admitted plan task order", () => {
    const plan = admittedPlan([
      task("task-a"),
      task("task-b", ["task-a"]),
      task("task-c", ["task-a"]),
      task("task-d", ["task-b", "task-c"]),
      task("task-e", ["task-d"])
    ]);

    assert.deepEqual(
      computeRepairSubgraph({ plan, repairTaskIds: ["task-c", "task-a"] }),
      ["task-a", "task-b", "task-c", "task-d", "task-e"]
    );
  });
});

function task(planTaskId: string, dependsOn: readonly string[] = []) {
  return {
    planTaskId,
    title: planTaskId,
    dependsOn
  };
}

function admittedPlan(tasks: readonly ReturnType<typeof task>[]): AdmittedPlanExecutionArtifact {
  return {
    planId: "plan-1",
    intentId: "intent-1",
    tasks
  } as unknown as AdmittedPlanExecutionArtifact;
}
