/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseExecutionCoordinationPileResult,
  type ExecutionCoordinationPileResult
} from "./execution-coordination-pile-result.js";

function pile(output: string): ExecutionCoordinationPileResult {
  return { output, source: "fixture" };
}

describe("parseExecutionCoordinationPileResult", () => {
  it("exec-coord-parser rejects non-JSON output", () => {
    const result = parseExecutionCoordinationPileResult(pile("not json {"));
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("expected non-JSON output to fail parsing");
    assert.equal(
      result.errors.some((e) => e.includes("not valid JSON")),
      true,
      `errors did not surface JSON parse failure: ${JSON.stringify(result.errors)}`
    );
  });

  it("exec-coord-parser rejects unknown kind", () => {
    const result = parseExecutionCoordinationPileResult(
      pile(JSON.stringify({ kind: "mystery", payload: {} }))
    );
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("expected unknown kind to fail parsing");
    assert.equal(
      result.errors.some((e) => e.includes("unknown kind")),
      true,
      `errors did not surface unknown-kind failure: ${JSON.stringify(result.errors)}`
    );
  });

  it("accepts a work-slicing proposal with two slices", () => {
    const result = parseExecutionCoordinationPileResult(
      pile(
        JSON.stringify({
          kind: "work-slicing",
          slices: [
            { taskId: "task-a-slice-1", parentTaskId: "task-a", targetFiles: ["src/a.ts"] },
            { taskId: "task-a-slice-2", parentTaskId: "task-a", targetFiles: ["src/a-helper.ts"] }
          ]
        })
      )
    );
    if (!result.ok) {
      assert.fail(`expected ok, got: ${JSON.stringify(result.errors)}`);
    }
    assert.equal(result.proposal.kind, "work-slicing");
    if (result.proposal.kind !== "work-slicing") assert.fail("expected work-slicing kind");
    assert.equal(result.proposal.slices.length, 2);
    assert.equal(result.proposal.slices[0]?.taskId, "task-a-slice-1");
  });

  it("rejects work-slicing missing slices array", () => {
    const result = parseExecutionCoordinationPileResult(
      pile(JSON.stringify({ kind: "work-slicing", slices: "not-an-array" }))
    );
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("expected missing slices array to fail");
    assert.equal(
      result.errors.some((e) => e.includes("slices")),
      true
    );
  });

  it("accepts a repair-plan proposal with one correction", () => {
    const result = parseExecutionCoordinationPileResult(
      pile(
        JSON.stringify({
          kind: "repair-plan",
          repairPlan: {
            failingTaskIds: ["task-a"],
            corrections: [
              { targetTaskId: "task-a", summary: "Re-run with stricter assertions." }
            ]
          }
        })
      )
    );
    if (!result.ok) {
      assert.fail(`expected ok, got: ${JSON.stringify(result.errors)}`);
    }
    assert.equal(result.proposal.kind, "repair-plan");
    if (result.proposal.kind !== "repair-plan") assert.fail("expected repair-plan kind");
    assert.equal(result.proposal.repairPlan.corrections.length, 1);
    assert.equal(result.proposal.repairPlan.corrections[0]?.targetTaskId, "task-a");
  });
});
