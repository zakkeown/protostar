import type { StageArtifactRef } from "@protostar/artifacts";

export const TASK_JOURNAL_EVENT_SCHEMA_VERSION = "1.0.0" as const;
export const EXECUTION_SNAPSHOT_SCHEMA_VERSION = "1.0.0" as const;

export type TaskJournalEventKind =
  | "task-pending"
  | "task-running"
  | "task-succeeded"
  | "task-failed"
  | "task-timeout"
  | "task-cancelled";

export interface TaskJournalEventBase {
  readonly schemaVersion: typeof TASK_JOURNAL_EVENT_SCHEMA_VERSION;
  readonly runId: string;
  readonly planTaskId: string;
  readonly at: string;
  readonly attempt: number;
  readonly seq: number;
}

export type TaskJournalEvent = TaskJournalEventBase &
  (
    | { readonly kind: "task-pending" }
    | { readonly kind: "task-running" }
    | { readonly kind: "task-succeeded"; readonly evidenceArtifact: StageArtifactRef }
    | {
        readonly kind: "task-failed";
        readonly reason: string;
        readonly retryReason?: "transient" | "parse-reformat" | "orphaned-by-crash" | "repair";
        readonly errorClass?: string;
        readonly evidenceArtifact?: StageArtifactRef;
      }
    | { readonly kind: "task-timeout"; readonly evidenceArtifact?: StageArtifactRef }
    | {
        readonly kind: "task-cancelled";
        readonly cause: "sigint" | "sentinel" | "abort";
        readonly evidenceArtifact?: StageArtifactRef;
      }
  );

export interface ExecutionSnapshot {
  readonly schemaVersion: typeof EXECUTION_SNAPSHOT_SCHEMA_VERSION;
  readonly runId: string;
  readonly generatedAt: string;
  readonly lastEventSeq: number;
  readonly tasks: Readonly<Record<string, ExecutionSnapshotTask>>;
}

export interface ExecutionSnapshotTask {
  readonly status: "pending" | "running" | "succeeded" | "failed" | "timeout" | "cancelled";
  readonly attempt: number;
  readonly evidenceArtifact?: StageArtifactRef;
  readonly lastTransitionAt: string;
}
