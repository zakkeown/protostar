import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { StageArtifactRef } from "@protostar/artifacts";

import type {
  ExecutionSnapshot,
  TaskJournalEvent,
  TaskJournalEventBase,
  TaskJournalEventKind
} from "./journal-types.js";

type TaskJournalEventVariant = TaskJournalEvent extends infer Event
  ? Event extends TaskJournalEvent
    ? Omit<Event, keyof TaskJournalEventBase>
    : never
  : never;

describe("TaskJournalEvent contract", () => {
  it("constructs every task journal event kind and matches exhaustively", () => {
    const events: readonly TaskJournalEvent[] = [
      baseEvent({ kind: "task-pending" }),
      baseEvent({ kind: "task-running" }),
      baseEvent({ kind: "task-succeeded", evidenceArtifact: evidenceArtifact() }),
      baseEvent({
        kind: "task-failed",
        reason: "parse-no-block",
        retryReason: "parse-reformat",
        errorClass: "TypeError",
        evidenceArtifact: evidenceArtifact()
      }),
      baseEvent({ kind: "task-timeout", evidenceArtifact: evidenceArtifact() }),
      baseEvent({ kind: "task-cancelled", cause: "sigint", evidenceArtifact: evidenceArtifact() })
    ];

    assert.deepEqual(
      events.map((event) => classifyJournalEventKind(event)),
      [
        "task-pending",
        "task-running",
        "task-succeeded",
        "task-failed",
        "task-timeout",
        "task-cancelled"
      ]
    );

    const roundTripped = JSON.parse(JSON.stringify(events)) as readonly TaskJournalEvent[];
    assert.deepEqual(
      roundTripped.map((event) => event.kind),
      events.map((event) => event.kind)
    );
    assert.ok(roundTripped.every((event) => event.schemaVersion === "1.0.0"));
  });

  it("constructs orphaned-by-crash task-failed events", () => {
    const event: TaskJournalEvent = baseEvent({
      kind: "task-failed",
      reason: "orphaned-by-crash",
      retryReason: "orphaned-by-crash"
    });

    assert.equal(event.kind, "task-failed");
    assert.equal(event.retryReason, "orphaned-by-crash");
  });

  it("rejects free-form task-cancelled causes at type-check time", () => {
    const event: TaskJournalEvent = baseEvent({ kind: "task-cancelled", cause: "sentinel" });
    assert.equal(event.kind, "task-cancelled");
    assert.equal(event.cause, "sentinel");
  });

  it("captures planTaskId-keyed execution snapshots", () => {
    const snapshot: ExecutionSnapshot = {
      schemaVersion: "1.0.0",
      runId: "run_123",
      generatedAt: "2026-04-27T00:00:07.000Z",
      lastEventSeq: 7,
      tasks: {
        "task-1": {
          status: "succeeded",
          attempt: 1,
          evidenceArtifact: evidenceArtifact(),
          lastTransitionAt: "2026-04-27T00:00:05.000Z"
        },
        "task-2": {
          status: "running",
          attempt: 2,
          lastTransitionAt: "2026-04-27T00:00:06.000Z"
        }
      }
    };

    assert.deepEqual(Object.keys(snapshot.tasks), ["task-1", "task-2"]);
    assert.equal(snapshot.tasks["task-1"]?.status, "succeeded");
    assert.equal(snapshot.tasks["task-2"]?.attempt, 2);
  });
});

// @ts-expect-error task-cancelled cause is intentionally a closed literal union.
const _badCancelledCause: TaskJournalEvent = baseEvent({ kind: "task-cancelled", cause: "operator" });

function baseEvent(
  variant: TaskJournalEventVariant
): TaskJournalEvent {
  return {
    schemaVersion: "1.0.0",
    runId: "run_123",
    planTaskId: "task-1",
    at: "2026-04-27T00:00:00.000Z",
    attempt: 1,
    seq: 1,
    ...variant
  } as TaskJournalEvent;
}

function classifyJournalEventKind(event: TaskJournalEvent): TaskJournalEventKind {
  switch (event.kind) {
    case "task-pending":
    case "task-running":
    case "task-succeeded":
    case "task-failed":
    case "task-timeout":
    case "task-cancelled":
      return event.kind;
    default:
      return assertExhaustive(event);
  }
}

function evidenceArtifact(): StageArtifactRef {
  return {
    stage: "execution",
    kind: "task-evidence",
    uri: "runs/run_123/execution/task-1/evidence.json",
    sha256: "abc123"
  };
}

function assertExhaustive(value: never): never {
  throw new Error(String(value));
}
