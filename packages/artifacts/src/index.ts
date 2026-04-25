import type { IntentId } from "@protostar/intent";

export type FactoryStage = "intent" | "planning" | "execution" | "review" | "release";
export type FactoryRunStatus = "created" | "running" | "blocked" | "repairing" | "ready-to-release" | "completed";

export interface StageArtifactRef {
  readonly stage: FactoryStage;
  readonly kind: string;
  readonly uri: string;
  readonly sha256?: string;
  readonly description?: string;
}

export interface StageRecord {
  readonly stage: FactoryStage;
  readonly status: "pending" | "running" | "passed" | "failed" | "skipped";
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly artifacts: readonly StageArtifactRef[];
}

export interface FactoryRunManifest {
  readonly runId: string;
  readonly intentId: IntentId;
  readonly status: FactoryRunStatus;
  readonly createdAt: string;
  readonly stages: readonly StageRecord[];
}

export interface RecordStageArtifactsInput {
  readonly stage: FactoryStage;
  readonly status?: StageRecord["status"];
  readonly artifacts: readonly StageArtifactRef[];
  readonly startedAt?: string;
  readonly completedAt?: string;
}

export function createFactoryRunManifest(input: {
  readonly runId: string;
  readonly intentId: IntentId;
  readonly createdAt?: string;
}): FactoryRunManifest {
  return {
    runId: input.runId,
    intentId: input.intentId,
    status: "created",
    createdAt: input.createdAt ?? new Date().toISOString(),
    stages: [
      pendingStage("intent"),
      pendingStage("planning"),
      pendingStage("execution"),
      pendingStage("review"),
      pendingStage("release")
    ]
  };
}

export function recordStageArtifacts(
  manifest: FactoryRunManifest,
  input: RecordStageArtifactsInput
): FactoryRunManifest {
  return {
    ...manifest,
    stages: manifest.stages.map((stageRecord) => {
      if (stageRecord.stage !== input.stage) {
        return stageRecord;
      }

      return {
        ...stageRecord,
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
        ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
        artifacts: [...stageRecord.artifacts, ...input.artifacts]
      };
    })
  };
}

export function setFactoryRunStatus(
  manifest: FactoryRunManifest,
  status: FactoryRunStatus
): FactoryRunManifest {
  return {
    ...manifest,
    status
  };
}

function pendingStage(stage: FactoryStage): StageRecord {
  return {
    stage,
    status: "pending",
    artifacts: []
  };
}
