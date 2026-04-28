import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ExecutionRunResult } from "./execution-run-result.js";

describe("ExecutionRunResult contract", () => {
  it("captures first-pass execution outcome evidence by task", () => {
    const result: ExecutionRunResult = {
      schemaVersion: "1.0.0",
      runId: "run-1",
      attempt: 1,
      status: "completed",
      journalArtifact: {
        stage: "execution",
        kind: "journal",
        uri: "runs/run-1/execution/journal.jsonl"
      },
      diffArtifact: {
        stage: "execution",
        kind: "diff",
        uri: "runs/run-1/execution/final.diff"
      },
      perTask: [
        {
          planTaskId: "task-1",
          status: "ok",
          evidenceArtifact: {
            stage: "execution",
            kind: "task-evidence",
            uri: "runs/run-1/execution/task-1/evidence.json"
          }
        },
        {
          planTaskId: "task-2",
          status: "skipped"
        }
      ]
    };

    assert.equal(result.schemaVersion, "1.0.0");
    assert.equal(result.status, "completed");
    assert.deepEqual(
      result.perTask.map((task) => task.status),
      ["ok", "skipped"]
    );
  });
});
