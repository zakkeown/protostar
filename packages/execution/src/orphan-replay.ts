import {
  TASK_JOURNAL_EVENT_SCHEMA_VERSION,
  type TaskJournalEvent
} from "./journal-types.js";

export interface OrphanReplayInput {
  readonly runId: string;
  readonly events: readonly TaskJournalEvent[];
  readonly nowIso: string;
  readonly nextSeq: number;
}

export function replayOrphanedTasks(input: OrphanReplayInput): readonly TaskJournalEvent[] {
  const latestByTask = new Map<string, TaskJournalEvent>();

  for (const event of input.events) {
    latestByTask.set(event.planTaskId, event);
  }

  const replayed: TaskJournalEvent[] = [];
  let seq = input.nextSeq;

  for (const event of latestByTask.values()) {
    if (event.kind !== "task-running") {
      continue;
    }

    replayed.push({
      schemaVersion: TASK_JOURNAL_EVENT_SCHEMA_VERSION,
      kind: "task-failed",
      runId: input.runId,
      planTaskId: event.planTaskId,
      at: input.nowIso,
      attempt: event.attempt,
      seq,
      reason: "orphaned-by-crash",
      retryReason: "orphaned-by-crash"
    });
    seq += 1;
  }

  return replayed;
}
