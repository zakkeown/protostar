import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { StageArtifactRef } from "@protostar/artifacts";

import type { TaskJournalEvent } from "./journal-types.js";
import { reduceJournalToSnapshot, serializeSnapshot } from "./snapshot.js";

describe("execution snapshot reducer", () => {
  it("reduces a task to its latest succeeded state", () => {
    const snapshot = reduceJournalToSnapshot({
      runId: "run_1",
      generatedAt: "2026-04-27T00:00:03.000Z",
      events: [
        taskEvent({ kind: "task-pending", seq: 1 }),
        taskEvent({ kind: "task-running", seq: 2 }),
        taskEvent({ kind: "task-succeeded", seq: 3, evidenceArtifact: evidenceArtifact("t1") })
      ]
    });

    assert.equal(snapshot.tasks["t1"]?.status, "succeeded");
    assert.equal(snapshot.tasks["t1"]?.attempt, 1);
    assert.equal(snapshot.lastEventSeq, 3);
  });

  it("reduces two tasks independently", () => {
    const snapshot = reduceJournalToSnapshot({
      runId: "run_1",
      generatedAt: "2026-04-27T00:00:04.000Z",
      events: [
        taskEvent({ kind: "task-running", planTaskId: "t1", seq: 1 }),
        taskEvent({ kind: "task-pending", planTaskId: "t2", seq: 2 }),
        taskEvent({ kind: "task-failed", planTaskId: "t1", seq: 3, reason: "adapter-failed" }),
        taskEvent({ kind: "task-running", planTaskId: "t2", seq: 4 })
      ]
    });

    assert.equal(snapshot.tasks["t1"]?.status, "failed");
    assert.equal(snapshot.tasks["t2"]?.status, "running");
    assert.equal(snapshot.lastEventSeq, 4);
  });

  it("serializes snapshots with deterministic key order", () => {
    const snapshot = reduceJournalToSnapshot({
      runId: "run_1",
      generatedAt: "2026-04-27T00:00:02.000Z",
      events: [
        taskEvent({ kind: "task-running", planTaskId: "b-task", seq: 1 }),
        taskEvent({ kind: "task-pending", planTaskId: "a-task", seq: 2 })
      ]
    });

    assert.equal(serializeSnapshot(snapshot), serializeSnapshot(snapshot));
    assert.equal(
      serializeSnapshot(snapshot),
      '{"generatedAt":"2026-04-27T00:00:02.000Z","lastEventSeq":2,"runId":"run_1","schemaVersion":"1.0.0","tasks":{"a-task":{"attempt":1,"lastTransitionAt":"2026-04-27T00:00:00.000Z","status":"pending"},"b-task":{"attempt":1,"lastTransitionAt":"2026-04-27T00:00:00.000Z","status":"running"}}}'
    );
  });

  it("allows a retry running event to supersede a failed event", () => {
    const snapshot = reduceJournalToSnapshot({
      runId: "run_1",
      generatedAt: "2026-04-27T00:00:03.000Z",
      events: [
        taskEvent({ kind: "task-failed", seq: 1, attempt: 1, reason: "transient" }),
        taskEvent({ kind: "task-running", seq: 2, attempt: 2 })
      ]
    });

    assert.equal(snapshot.tasks["t1"]?.status, "running");
    assert.equal(snapshot.tasks["t1"]?.attempt, 2);
  });
});

function taskEvent(variant: Partial<TaskJournalEvent> & Pick<TaskJournalEvent, "kind" | "seq">): TaskJournalEvent {
  return {
    schemaVersion: "1.0.0",
    runId: "run_1",
    planTaskId: "t1",
    at: "2026-04-27T00:00:00.000Z",
    attempt: 1,
    ...variant
  } as TaskJournalEvent;
}

function evidenceArtifact(taskId: string): StageArtifactRef {
  return {
    stage: "execution",
    kind: "task-evidence",
    uri: `runs/run_1/execution/${taskId}/evidence.json`,
    sha256: `sha-${taskId}`
  };
}
