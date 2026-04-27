export function createFactoryRunManifest(input) {
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
export function recordStageArtifacts(manifest, input) {
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
export function setFactoryRunStatus(manifest, status) {
    return {
        ...manifest,
        status
    };
}
function pendingStage(stage) {
    return {
        stage,
        status: "pending",
        artifacts: []
    };
}
//# sourceMappingURL=index.js.map