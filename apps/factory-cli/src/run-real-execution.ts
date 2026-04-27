import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { authorizeWorkspaceOp } from "@protostar/authority";
import type { StageArtifactRef } from "@protostar/artifacts";
import {
  JOURNAL_FILE_NAME,
  parseJournalLines,
  reduceJournalToSnapshot,
  replayOrphanedTasks,
  runExecutionDryRun,
  TASK_JOURNAL_EVENT_SCHEMA_VERSION,
  type AdapterContext,
  type AdapterEvidence,
  type AdapterResult,
  type ExecutionAdapter,
  type ExecutionLifecycleEvent,
  type ExecutionRunPlan,
  type RepoReader,
  type TaskJournalEvent
} from "@protostar/execution";
import type { CapabilityEnvelope, ConfirmedIntent } from "@protostar/intent";
import type { applyChangeSet as defaultApplyChangeSet, ApplyResult, PatchRequest } from "@protostar/repo";

import type { JournalWriter } from "./journal-writer.js";
import { writeSnapshotAtomic } from "./snapshot-writer.js";

export interface RunRealExecutionInput {
  readonly runPlan: ExecutionRunPlan;
  readonly adapter: ExecutionAdapter;
  readonly repoReader: RepoReader;
  readonly resolvedEnvelope: CapabilityEnvelope;
  readonly confirmedIntent: ConfirmedIntent;
  readonly journalWriter: JournalWriter;
  readonly snapshotEveryNEvents?: number;
  readonly runDir: string;
  readonly workspaceRoot: string;
  readonly rootSignal: AbortSignal;
  readonly applyChangeSet: typeof defaultApplyChangeSet;
  readonly nowIso?: () => string;
  readonly checkSentinelBetweenTasks?: () => Promise<void>;
}

export interface RunRealExecutionResult {
  readonly outcome: "complete" | "block" | "cancelled";
  readonly events: readonly ExecutionLifecycleEvent[];
  readonly perTaskEvidence: ReadonlyArray<{ readonly taskId: string; readonly evidence: AdapterEvidence }>;
  readonly blockReason?: string;
}

export async function runRealExecution(input: RunRealExecutionInput): Promise<RunRealExecutionResult> {
  const nowIso = input.nowIso ?? (() => new Date().toISOString());
  const allJournalEvents: TaskJournalEvent[] = await readExistingJournalEvents(input.runDir);
  const replayed = replayOrphanedTasks({
    runId: input.runPlan.runId,
    events: allJournalEvents,
    nowIso: nowIso(),
    nextSeq: nextSeq(allJournalEvents)
  });
  for (const event of replayed) {
    await input.journalWriter.appendEvent(event);
    allJournalEvents.push(event);
  }

  const events: ExecutionLifecycleEvent[] = [];
  const perTaskEvidence: { taskId: string; evidence: AdapterEvidence }[] = [];
  const snapshotEvery = input.snapshotEveryNEvents ?? 20;
  let eventsSinceSnapshot = 0;
  let seq = nextSeq(allJournalEvents);
  let outcome: RunRealExecutionResult["outcome"] = "complete";
  let blockReason: string | undefined;

  const emit = async (event: Record<string, unknown> & {
    readonly kind: TaskJournalEvent["kind"];
    readonly planTaskId: string;
    readonly at: string;
    readonly attempt: number;
  }) => {
    const journalEvent = {
      schemaVersion: TASK_JOURNAL_EVENT_SCHEMA_VERSION,
      runId: input.runPlan.runId,
      seq,
      ...event
    } as TaskJournalEvent;
    seq += 1;
    await input.journalWriter.appendEvent(journalEvent);
    allJournalEvents.push(journalEvent);
    events.push(lifecycleFromJournal(journalEvent));
    eventsSinceSnapshot += 1;
    if (eventsSinceSnapshot >= snapshotEvery || isTerminal(journalEvent)) {
      await writeSnapshotAtomic({
        runDir: input.runDir,
        snapshot: reduceJournalToSnapshot({
          runId: input.runPlan.runId,
          generatedAt: nowIso(),
          events: allJournalEvents
        })
      });
      eventsSinceSnapshot = 0;
    }
  };

  const completedAtStart = reduceJournalToSnapshot({
    runId: input.runPlan.runId,
    generatedAt: nowIso(),
    events: allJournalEvents
  });
  const remainingTasks = input.runPlan.tasks.filter((task) => {
    const status = completedAtStart.tasks[task.planTaskId]?.status;
    return status !== "succeeded" && status !== "failed" && status !== "timeout" && status !== "cancelled";
  });

  for (const task of remainingTasks) {
    await input.checkSentinelBetweenTasks?.();
    if (input.rootSignal.aborted) {
      await emit({
        kind: "task-cancelled",
        planTaskId: task.planTaskId,
        at: nowIso(),
        attempt: 1,
        cause: cancelCause(input.rootSignal.reason)
      });
      outcome = "cancelled";
      break;
    }

    await emit({ kind: "task-pending", planTaskId: task.planTaskId, at: nowIso(), attempt: 1 });
    await emit({ kind: "task-running", planTaskId: task.planTaskId, at: nowIso(), attempt: 1 });

    const taskController = new AbortController();
    const onRootAbort = () => taskController.abort(input.rootSignal.reason);
    input.rootSignal.addEventListener("abort", onRootAbort, { once: true });
    const timer = setTimeout(() => taskController.abort("timeout"), taskWallClockMs(input.resolvedEnvelope));

    try {
      const final = await executeToFinal(input, task, taskController.signal);
      perTaskEvidence.push({ taskId: task.planTaskId, evidence: final.evidence });
      const evidenceArtifact = await writeEvidenceFiles({
        runDir: input.runDir,
        taskId: task.planTaskId,
        status: final.outcome,
        adapterId: input.adapter.id,
        evidence: final.evidence,
        ...(final.outcome === "adapter-failed" ? { reason: final.reason } : {})
      });

      if (taskController.signal.aborted && taskController.signal.reason === "timeout") {
        await emit({
          kind: "task-timeout",
          planTaskId: task.planTaskId,
          at: nowIso(),
          attempt: 1,
          evidenceArtifact
        });
        outcome = "block";
        blockReason = "task-timeout";
        break;
      }

      if (taskController.signal.aborted || input.rootSignal.aborted) {
        await emit({
          kind: "task-cancelled",
          planTaskId: task.planTaskId,
          at: nowIso(),
          attempt: 1,
          cause: cancelCause(input.rootSignal.reason),
          evidenceArtifact
        });
        outcome = "cancelled";
        break;
      }

      if (final.outcome === "adapter-failed") {
        const terminal = final.reason === "timeout"
          ? "task-timeout"
          : final.reason === "aborted"
            ? "task-cancelled"
            : "task-failed";
        if (terminal === "task-timeout") {
          await emit({ kind: "task-timeout", planTaskId: task.planTaskId, at: nowIso(), attempt: 1, evidenceArtifact });
          outcome = "block";
          blockReason = "task-timeout";
          break;
        } else if (terminal === "task-cancelled") {
          await emit({
            kind: "task-cancelled",
            planTaskId: task.planTaskId,
            at: nowIso(),
            attempt: 1,
            cause: cancelCause(input.rootSignal.reason),
            evidenceArtifact
          });
          outcome = "cancelled";
          break;
        } else {
          await emit({
            kind: "task-failed",
            planTaskId: task.planTaskId,
            at: nowIso(),
            attempt: 1,
            reason: final.reason,
            evidenceArtifact
          });
          outcome = "block";
          blockReason = final.reason;
          break;
        }
      }

      const applyResults = await input.applyChangeSet(patchesFromChangeSet(final.changeSet, input));
      if (applyResults.some((result) => result.status !== "applied")) {
        await emit({
          kind: "task-failed",
          planTaskId: task.planTaskId,
          at: nowIso(),
          attempt: 1,
          reason: "apply-failed",
          evidenceArtifact
        });
        outcome = "block";
        blockReason = "apply-failure";
        break;
      }

      await emit({ kind: "task-succeeded", planTaskId: task.planTaskId, at: nowIso(), attempt: 1, evidenceArtifact });
    } finally {
      clearTimeout(timer);
      input.rootSignal.removeEventListener("abort", onRootAbort);
    }
  }

  return {
    outcome,
    events,
    perTaskEvidence,
    ...(blockReason !== undefined ? { blockReason } : {})
  };
}

async function executeToFinal(
  input: RunRealExecutionInput,
  task: ExecutionRunPlan["tasks"][number],
  signal: AbortSignal
): Promise<AdapterResult> {
  const ctx: AdapterContext = {
    signal,
    confirmedIntent: input.confirmedIntent,
    resolvedEnvelope: input.resolvedEnvelope,
    repoReader: input.repoReader,
    journal: { appendToken: async () => undefined },
    budget: {
      taskWallClockMs: taskWallClockMs(input.resolvedEnvelope),
      adapterRetriesPerTask: input.resolvedEnvelope.budget.adapterRetriesPerTask ?? 4
    },
    network: {
      allow: input.resolvedEnvelope.network?.allow ?? "loopback",
      ...(input.resolvedEnvelope.network?.allowedHosts !== undefined
        ? { allowedHosts: input.resolvedEnvelope.network.allowedHosts }
        : {})
    }
  };

  for await (const event of input.adapter.execute({
    planTaskId: task.planTaskId,
    title: task.title,
    targetFiles: task.targetFiles ?? [],
    ...(task.adapterRef !== undefined ? { adapterRef: task.adapterRef } : {})
  }, ctx)) {
    if (event.kind === "final") {
      return event.result;
    }
  }

  return {
    outcome: "adapter-failed",
    reason: signal.aborted && signal.reason === "timeout" ? "timeout" : "aborted",
    evidence: emptyEvidence()
  };
}

function patchesFromChangeSet(changeSet: unknown, input: RunRealExecutionInput): readonly PatchRequest[] {
  const entries = readChangeEntries(changeSet);
  return entries.map((entry) => {
    const authorization = authorizeWorkspaceOp({
      workspace: input.runPlan.workspace,
      path: entry.path,
      access: "write",
      resolvedEnvelope: input.resolvedEnvelope
    });
    if (!authorization.ok) {
      throw new Error(`workspace write not authorized for ${entry.path}: ${authorization.errors.join("; ")}`);
    }

    return {
      path: entry.path,
      op: {
        ...authorization.authorized,
        path: isAbsolute(entry.path) ? entry.path : resolve(input.workspaceRoot, entry.path)
      },
      diff: entry.diff,
      preImageSha256: entry.preImageSha256
    };
  });
}

function readChangeEntries(changeSet: unknown): readonly { path: string; diff: string; preImageSha256: string }[] {
  const record = changeSet as { readonly entries?: unknown; readonly patches?: unknown };
  const entries = Array.isArray(record.entries) ? record.entries : record.patches;
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry): readonly { path: string; diff: string; preImageSha256: string }[] => {
    const value = entry as { readonly path?: unknown; readonly diff?: unknown; readonly preImageSha256?: unknown };
    return typeof value.path === "string" && typeof value.diff === "string" && typeof value.preImageSha256 === "string"
      ? [{ path: value.path, diff: value.diff, preImageSha256: value.preImageSha256 }]
      : [];
  });
}

async function writeEvidenceFiles(input: {
  readonly runDir: string;
  readonly taskId: string;
  readonly status: AdapterResult["outcome"];
  readonly adapterId: string;
  readonly evidence: AdapterEvidence;
  readonly reason?: string;
}): Promise<StageArtifactRef> {
  const dir = join(input.runDir, "execution", `task-${input.taskId}`);
  await mkdir(dir, { recursive: true });
  const transcriptArtifact = `execution/task-${input.taskId}/transcript.json`;
  await writeFile(join(dir, "evidence.json"), `${JSON.stringify({
    schemaVersion: "1.0.0",
    adapter: input.adapterId,
    model: input.evidence.model,
    taskId: input.taskId,
    status: input.status,
    attempts: input.evidence.attempts,
    durationMs: input.evidence.durationMs,
    transcriptArtifact,
    auxReads: input.evidence.auxReads,
    retries: input.evidence.retries,
    ...(input.reason !== undefined ? { reason: input.reason } : {})
  }, null, 2)}\n`, "utf8");
  await writeFile(join(dir, "transcript.json"), `${JSON.stringify({
    schemaVersion: "1.0.0",
    taskId: input.taskId,
    attempts: []
  }, null, 2)}\n`, "utf8");
  return {
    stage: "execution",
    kind: "adapter-evidence",
    uri: `execution/task-${input.taskId}/evidence.json`,
    description: `Adapter evidence for task ${input.taskId}.`
  };
}

async function readExistingJournalEvents(runDir: string): Promise<TaskJournalEvent[]> {
  try {
    const raw = await readFile(join(runDir, "execution", JOURNAL_FILE_NAME), "utf8");
    return [...parseJournalLines(raw).events];
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function lifecycleFromJournal(event: TaskJournalEvent): ExecutionLifecycleEvent {
  return {
    type: event.kind,
    runId: event.runId,
    planTaskId: event.planTaskId,
    at: event.at,
    status: statusFromKind(event.kind),
    ...("reason" in event && event.reason !== undefined ? { reason: event.reason } : {}),
    ...("evidenceArtifact" in event && event.evidenceArtifact !== undefined ? { evidence: [event.evidenceArtifact] } : {})
  };
}

function statusFromKind(kind: TaskJournalEvent["kind"]): ExecutionLifecycleEvent["status"] {
  switch (kind) {
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
  }
}

function isTerminal(event: TaskJournalEvent): boolean {
  return event.kind === "task-succeeded" ||
    event.kind === "task-failed" ||
    event.kind === "task-timeout" ||
    event.kind === "task-cancelled";
}

function nextSeq(events: readonly TaskJournalEvent[]): number {
  return events.reduce((max, event) => Math.max(max, event.seq), 0) + 1;
}

function taskWallClockMs(envelope: CapabilityEnvelope): number {
  return envelope.budget.taskWallClockMs ?? 180_000;
}

function cancelCause(reason: unknown): "sigint" | "sentinel" | "abort" {
  return reason === "sigint" || reason === "sentinel" ? reason : "abort";
}

function emptyEvidence(): AdapterEvidence {
  return { model: "unknown", attempts: 0, durationMs: 0, auxReads: [], retries: [] };
}

export function dryRunLifecycleEventTypesForRealExecutorContract(runPlan: ExecutionRunPlan): ReadonlySet<string> {
  return new Set(runExecutionDryRun({ execution: runPlan }).events.map((event) => event.type));
}
