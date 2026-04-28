import { sortJsonValue } from "@protostar/artifacts/canonical-json";

import {
  EXECUTION_SNAPSHOT_SCHEMA_VERSION,
  type ExecutionSnapshot,
  type ExecutionSnapshotTask,
  type TaskJournalEvent
} from "./journal-types.js";

export const SNAPSHOT_FILE_NAME = "snapshot.json" as const;

export function serializeSnapshot(snapshot: ExecutionSnapshot): string {
  return JSON.stringify(sortJsonValue(snapshot));
}

export function reduceJournalToSnapshot(input: {
  readonly runId: string;
  readonly generatedAt: string;
  readonly events: readonly TaskJournalEvent[];
}): ExecutionSnapshot {
  const tasks: Record<string, ExecutionSnapshotTask> = {};
  let lastEventSeq = 0;

  for (const event of input.events) {
    lastEventSeq = Math.max(lastEventSeq, event.seq);
    tasks[event.planTaskId] = taskFromEvent(event);
  }

  return {
    schemaVersion: EXECUTION_SNAPSHOT_SCHEMA_VERSION,
    runId: input.runId,
    generatedAt: input.generatedAt,
    lastEventSeq,
    tasks
  };
}

function taskFromEvent(event: TaskJournalEvent): ExecutionSnapshotTask {
  const base = {
    status: statusFromEvent(event),
    attempt: event.attempt,
    lastTransitionAt: event.at
  };

  if ("evidenceArtifact" in event && event.evidenceArtifact !== undefined) {
    return { ...base, evidenceArtifact: event.evidenceArtifact };
  }

  return base;
}

function statusFromEvent(event: TaskJournalEvent): ExecutionSnapshotTask["status"] {
  switch (event.kind) {
    case "task-pending":
      return "pending";
    case "task-running":
      return "running";
    case "task-succeeded":
      return "succeeded";
    case "task-failed":
      return "failed";
    case "task-timeout":
      return "timeout";
    case "task-cancelled":
      return "cancelled";
    default:
      return assertExhaustive(event);
  }
}

function assertExhaustive(value: never): never {
  throw new Error(`Unhandled task journal event: ${String(value)}`);
}
