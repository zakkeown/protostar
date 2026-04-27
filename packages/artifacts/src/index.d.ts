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
export declare function createFactoryRunManifest(input: {
    readonly runId: string;
    readonly intentId: IntentId;
    readonly createdAt?: string;
}): FactoryRunManifest;
export declare function recordStageArtifacts(manifest: FactoryRunManifest, input: RecordStageArtifactsInput): FactoryRunManifest;
export declare function setFactoryRunStatus(manifest: FactoryRunManifest, status: FactoryRunStatus): FactoryRunManifest;
//# sourceMappingURL=index.d.ts.map