import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { StageArtifactRef } from "@protostar/artifacts";

import type { TaskJournalEvent } from "./journal-types.js";
import { replayOrphanedTasks } from "./orphan-replay.js";

describe("orphan task replay", () => {
  it("returns synthetic failed events for tasks left running", () => {
    const events = [taskEvent({ kind: "task-running", seq: 4, attempt: 2 })];

    const replayed = replayOrphanedTasks({
      runId: "run_1",
      events,
      nowIso: "2026-04-27T01:00:00.000Z",
      nextSeq: 10
    });

    assert.deepEqual(replayed, [
      {
        schemaVersion: "1.0.0",
        runId: "run_1",
        planTaskId: "t1",
        at: "2026-04-27T01:00:00.000Z",
        attempt: 2,
        seq: 10,
        kind: "task-failed",
        reason: "orphaned-by-crash",
        retryReason: "orphaned-by-crash"
      }
    ]);
  });

  it("does not replay tasks whose latest event is terminal", () => {
    const replayed = replayOrphanedTasks({
      runId: "run_1",
      events: [
        taskEvent({ kind: "task-running", seq: 1 }),
        taskEvent({ kind: "task-succeeded", seq: 2, evidenceArtifact: evidenceArtifact("t1") })
      ],
      nowIso: "2026-04-27T01:00:00.000Z",
      nextSeq: 10
    });

    assert.deepEqual(replayed, []);
  });

  it("assigns monotonically increasing seq values for multiple orphaned tasks", () => {
    const replayed = replayOrphanedTasks({
      runId: "run_1",
      events: [
        taskEvent({ kind: "task-running", planTaskId: "t1", seq: 1 }),
        taskEvent({ kind: "task-running", planTaskId: "t2", seq: 2 })
      ],
      nowIso: "2026-04-27T01:00:00.000Z",
      nextSeq: 20
    });

    assert.deepEqual(
      replayed.map((event: TaskJournalEvent) => [event.planTaskId, event.seq]),
      [
        ["t1", 20],
        ["t2", 21]
      ]
    );
  });

  it("replays only the latest running retry after an earlier failed attempt", () => {
    const replayed = replayOrphanedTasks({
      runId: "run_1",
      events: [
        taskEvent({ kind: "task-running", seq: 1, attempt: 1 }),
        taskEvent({ kind: "task-failed", seq: 2, attempt: 1, reason: "transient" }),
        taskEvent({ kind: "task-running", seq: 3, attempt: 2 })
      ],
      nowIso: "2026-04-27T01:00:00.000Z",
      nextSeq: 30
    });

    assert.equal(replayed.length, 1);
    assert.equal(replayed[0]?.attempt, 2);
    assert.equal(replayed[0]?.seq, 30);
  });

  it("uses the injected clock for synthetic event timestamps", () => {
    const replayed = replayOrphanedTasks({
      runId: "run_1",
      events: [taskEvent({ kind: "task-running", seq: 1 })],
      nowIso: "2026-04-27T12:34:56.000Z",
      nextSeq: 2
    });

    assert.equal(replayed[0]?.at, "2026-04-27T12:34:56.000Z");
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
