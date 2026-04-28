import type { StageArtifactRef } from "@protostar/artifacts";

export interface ExecutionRunResult {
  readonly schemaVersion: "1.0.0";
  readonly runId: string;
  readonly attempt: number;
  readonly status: "completed" | "failed" | "aborted";
  readonly journalArtifact: StageArtifactRef;
  readonly diffArtifact?: StageArtifactRef;
  readonly perTask: readonly {
    readonly planTaskId: string;
    readonly status: "ok" | "failed" | "skipped";
    readonly evidenceArtifact?: StageArtifactRef;
  }[];
}
