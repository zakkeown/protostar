import type {
  AdapterContext,
  AdapterEvent,
  AdapterEvidence,
  AdapterFailureReason,
  ExecutionAdapter,
  ExecutionAdapterTaskInput
} from "@protostar/execution";

export type MockCoderMode = "empty-diff" | "ttt-success" | "transient-failure" | "network-drop" | "llm-timeout";

export interface MockCoderAdapterConfig {
  readonly mode?: MockCoderMode;
}

interface PreImage {
  readonly bytes: Uint8Array;
  readonly sha256: string;
}

interface PlanChangeSet {
  readonly entries: readonly PlanChangeSetEntry[];
}

interface PlanChangeSetEntry {
  readonly path: string;
  readonly op: "modify";
  readonly diff: string;
  readonly preImageSha256: string;
}

const MODE_VALUES = new Set<MockCoderMode>([
  "empty-diff",
  "ttt-success",
  "transient-failure",
  "network-drop",
  "llm-timeout"
]);

export function createMockCoderAdapter(config: MockCoderAdapterConfig = {}): ExecutionAdapter {
  const mode = config.mode ?? "ttt-success";
  return {
    id: `mock-coder:${mode}`,
    async *execute(task, ctx) {
      yield* executeMockTask(task, ctx, mode);
    }
  };
}

export function parseMockCoderMode(value: string | undefined): MockCoderMode {
  if (value === undefined || value.length === 0) return "ttt-success";
  if (MODE_VALUES.has(value as MockCoderMode)) return value as MockCoderMode;
  throw new Error(`Unsupported PROTOSTAR_MOCK_LLM_MODE "${value}".`);
}

async function* executeMockTask(
  task: ExecutionAdapterTaskInput,
  ctx: AdapterContext,
  mode: MockCoderMode
): AsyncIterable<AdapterEvent> {
  const startedAt = Date.now();
  switch (mode) {
    case "empty-diff":
      yield { kind: "progress", message: "mock deterministic empty-diff" };
      yield finalChangeSet({ entries: [] }, mode, startedAt);
      return;
    case "ttt-success":
      yield { kind: "progress", message: "mock deterministic ttt-success" };
      yield finalChangeSet(await deterministicChangeSet(task, ctx), mode, startedAt);
      return;
    case "transient-failure":
      yield { kind: "progress", message: "mock transient-failure" };
      yield finalFailure("retries-exhausted", mode, startedAt, "mock-transient-failure");
      return;
    case "network-drop":
      yield { kind: "progress", message: "adapter-network-refusal: mock network-drop" };
      yield finalFailure("lmstudio-unreachable", mode, startedAt, "adapter-network-refusal");
      return;
    case "llm-timeout":
      yield { kind: "progress", message: "llm-abort-timeout: waiting for adapter AbortSignal" };
      await waitForAbort(ctx.signal);
      yield finalFailure(ctx.signal.reason === "timeout" ? "timeout" : "aborted", mode, startedAt, "llm-abort-timeout");
      return;
  }
}

async function deterministicChangeSet(task: ExecutionAdapterTaskInput, ctx: AdapterContext): Promise<PlanChangeSet> {
  const target = task.targetFiles[0];
  if (target === undefined) {
    return { entries: [] };
  }
  const preImage = await readPreImage(target, ctx);
  return {
    entries: [
      {
        path: target,
        op: "modify",
        diff: deterministicDiff(target),
        preImageSha256: preImage.sha256
      }
    ]
  };
}

async function readPreImage(path: string, ctx: AdapterContext): Promise<PreImage> {
  return ctx.repoReader.readFile(path);
}

function deterministicDiff(path: string): string {
  return `--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-before\n+after\n`;
}

function finalChangeSet(changeSet: PlanChangeSet, mode: MockCoderMode, startedAt: number): AdapterEvent {
  return {
    kind: "final",
    result: {
      outcome: "change-set",
      changeSet: changeSet as never,
      evidence: evidence(mode, startedAt, 1, [])
    }
  };
}

function finalFailure(
  reason: AdapterFailureReason,
  mode: MockCoderMode,
  startedAt: number,
  mechanism: string
): AdapterEvent {
  return {
    kind: "final",
    result: {
      outcome: "adapter-failed",
      reason,
      evidence: evidence(mode, startedAt, 1, [
        {
          attempt: 1,
          retryReason: "transient",
          errorClass: mechanism,
          durationMs: 0
        }
      ])
    }
  };
}

function evidence(
  mode: MockCoderMode,
  startedAt: number,
  attempts: number,
  retries: AdapterEvidence["retries"]
): AdapterEvidence {
  return {
    model: `mock-llm-adapter/${mode}`,
    attempts,
    durationMs: Math.max(0, Date.now() - startedAt),
    auxReads: [],
    retries
  };
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}
