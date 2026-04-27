import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

import {
  formatTaskJournalLine,
  runExecutionDryRun,
  TASK_JOURNAL_EVENT_SCHEMA_VERSION,
  type AdapterEvidence,
  type AdapterResult,
  type ExecutionAdapter,
  type ExecutionRunPlan,
  type RepoReader
} from "@protostar/execution";
import type { CapabilityEnvelope, ConfirmedIntent } from "@protostar/intent";
import type { ApplyResult } from "@protostar/repo";

import { createJournalWriter } from "./journal-writer.js";
import { runRealExecution } from "./run-real-execution.js";

describe("runRealExecution", () => {
  it("emits pending-running-succeeded, journals, snapshots, and evidence files", async () => {
    const ctx = await testContext();
    const writer = await createJournalWriter({ runDir: ctx.runDir });
    const result = await runRealExecution({
      ...ctx.input,
      journalWriter: writer,
      adapter: finalAdapter(changeSetResult("src/a.ts")),
      applyChangeSet: async () => [{ path: "src/a.ts", status: "applied" }]
    });
    await writer.close();

    assert.equal(result.outcome, "complete");
    assert.deepEqual(result.events.map((event) => event.type), ["task-pending", "task-running", "task-succeeded"]);
    assert.equal((await readFile(join(ctx.runDir, "execution", "journal.jsonl"), "utf8")).trim().split("\n").length, 3);
    assert.match(await readFile(join(ctx.runDir, "execution", "snapshot.json"), "utf8"), /"status":"succeeded"/);
    assert.equal(await exists(join(ctx.runDir, "execution", "task-task-1", "evidence.json")), true);
    assert.equal(await exists(join(ctx.runDir, "execution", "task-task-1", "transcript.json")), true);
  });

  it("bails with block on apply failure and does not execute downstream tasks", async () => {
    const ctx = await testContext({ taskCount: 3 });
    const writer = await createJournalWriter({ runDir: ctx.runDir });
    let adapterCalls = 0;
    const result = await runRealExecution({
      ...ctx.input,
      journalWriter: writer,
      adapter: {
        id: "stub",
        async *execute(task) {
          adapterCalls += 1;
          yield { kind: "final", result: changeSetResult(task.targetFiles[0] ?? "src/a.ts") };
        }
      },
      applyChangeSet: async (patches) => patches[0]?.path === "src/file-2.ts"
        ? [{ path: "src/file-2.ts", status: "skipped-hash-mismatch" }]
        : [{ path: patches[0]?.path ?? "unknown", status: "applied" }]
    });
    await writer.close();

    assert.equal(result.outcome, "block");
    assert.equal(result.blockReason, "apply-failure");
    assert.equal(adapterCalls, 2);
    assert.deepEqual(result.events.map((event) => event.type), [
      "task-pending",
      "task-running",
      "task-succeeded",
      "task-pending",
      "task-running",
      "task-failed"
    ]);
  });

  it("emits task-timeout when the task wall clock abort fires", async () => {
    const ctx = await testContext({ envelope: { ...envelope(), budget: { adapterRetriesPerTask: 4, taskWallClockMs: 1, maxRepairLoops: 0 } } });
    const writer = await createJournalWriter({ runDir: ctx.runDir });
    const result = await runRealExecution({
      ...ctx.input,
      journalWriter: writer,
      adapter: {
        id: "slow",
        async *execute(_task, adapterCtx) {
          await new Promise((resolveDone) => adapterCtx.signal.addEventListener("abort", resolveDone, { once: true }));
          yield { kind: "final", result: failedResult("timeout") };
        }
      },
      applyChangeSet: async () => []
    });
    await writer.close();

    assert.equal(result.events.at(-1)?.type, "task-timeout");
  });

  it("emits task-cancelled when a sentinel aborts between tasks", async () => {
    const ctx = await testContext({ taskCount: 2 });
    const writer = await createJournalWriter({ runDir: ctx.runDir });
    let checks = 0;
    const result = await runRealExecution({
      ...ctx.input,
      journalWriter: writer,
      adapter: finalAdapter(changeSetResult("src/a.ts")),
      applyChangeSet: async () => [{ path: "src/a.ts", status: "applied" }],
      checkSentinelBetweenTasks: async () => {
        checks += 1;
        if (checks === 2) ctx.controller.abort("sentinel");
      }
    });
    await writer.close();

    assert.equal(result.outcome, "cancelled");
    assert.equal(result.events.at(-1)?.type, "task-cancelled");
  });

  it("replays orphaned running tasks as failed before retrying remaining work", async () => {
    const ctx = await testContext();
    await mkdir(join(ctx.runDir, "execution"), { recursive: true });
    await writeFile(join(ctx.runDir, "execution", "journal.jsonl"), [
      formatTaskJournalLine({
        schemaVersion: TASK_JOURNAL_EVENT_SCHEMA_VERSION,
        kind: "task-pending",
        runId: "run_real",
        planTaskId: "task-1",
        at: "2026-04-27T00:00:00.000Z",
        attempt: 1,
        seq: 1
      }),
      formatTaskJournalLine({
        schemaVersion: TASK_JOURNAL_EVENT_SCHEMA_VERSION,
        kind: "task-running",
        runId: "run_real",
        planTaskId: "task-1",
        at: "2026-04-27T00:00:01.000Z",
        attempt: 1,
        seq: 2
      })
    ].join(""));
    const writer = await createJournalWriter({ runDir: ctx.runDir });

    const result = await runRealExecution({
      ...ctx.input,
      journalWriter: writer,
      adapter: finalAdapter(changeSetResult("src/a.ts")),
      applyChangeSet: async () => [{ path: "src/a.ts", status: "applied" }]
    });
    await writer.close();

    assert.equal(result.outcome, "complete");
    const journal = await readFile(join(ctx.runDir, "execution", "journal.jsonl"), "utf8");
    assert.match(journal, /orphaned-by-crash/);
  });

  it("writes snapshots at the configured interval", async () => {
    const ctx = await testContext({ taskCount: 2 });
    const writer = await createJournalWriter({ runDir: ctx.runDir });
    const before = Date.now();

    await runRealExecution({
      ...ctx.input,
      journalWriter: writer,
      snapshotEveryNEvents: 2,
      adapter: finalAdapter(changeSetResult("src/a.ts")),
      applyChangeSet: async () => [{ path: "src/a.ts", status: "applied" }]
    });
    await writer.close();

    assert.ok((await stat(join(ctx.runDir, "execution", "snapshot.json"))).mtimeMs >= before);
  });

  it("keeps real executor lifecycle event types within dry-run vocabulary", async () => {
    const ctx = await testContext();
    const writer = await createJournalWriter({ runDir: ctx.runDir });
    const dryTypes = new Set(runExecutionDryRun({ execution: ctx.input.runPlan }).events.map((event) => event.type));
    const real = await runRealExecution({
      ...ctx.input,
      journalWriter: writer,
      adapter: finalAdapter(changeSetResult("src/a.ts")),
      applyChangeSet: async () => [{ path: "src/a.ts", status: "applied" }]
    });
    await writer.close();

    for (const type of new Set(real.events.map((event) => event.type))) {
      assert.equal(dryTypes.has(type), true, `${type} should be in dry-run event vocabulary`);
    }
  });

  it("blocks when applyChangeSet detects pre-image hash drift", async () => {
    const ctx = await testContext();
    const writer = await createJournalWriter({ runDir: ctx.runDir });
    const result = await runRealExecution({
      ...ctx.input,
      journalWriter: writer,
      adapter: finalAdapter(changeSetResult("src/a.ts", "wrong-hash")),
      applyChangeSet: async (patches) => hashResult(patches[0]?.preImageSha256)
    });
    await writer.close();

    assert.equal(result.outcome, "block");
    assert.equal(result.events.at(-1)?.reason, "apply-failed");
  });
});

async function testContext(opts: {
  readonly taskCount?: number;
  readonly envelope?: CapabilityEnvelope;
} = {}) {
  const runDir = await mkdtemp(join(tmpdir(), "real-execution-"));
  const controller = new AbortController();
  const resolvedEnvelope = opts.envelope ?? envelope();
  const runPlan = plan(opts.taskCount ?? 1);
  return {
    runDir,
    controller,
    input: {
      runPlan,
      repoReader: reader(),
      resolvedEnvelope,
      confirmedIntent: confirmedIntent(resolvedEnvelope),
      runDir,
      workspaceRoot: runDir,
      rootSignal: controller.signal
    }
  };
}

function plan(taskCount: number): ExecutionRunPlan {
  return {
    runId: "run_real",
    planId: "plan_real",
    admittedPlan: {
      planId: "plan_real",
      intentId: "intent_real",
      planGraphUri: "plan.json",
      planningAdmissionArtifact: "planning-admission.json",
      planningAdmissionUri: "planning-admission.json",
      validationSource: "planning-admission.json",
      proofSource: "PlanGraph"
    },
    workspace: { root: "/tmp/workspace", trust: "trusted" },
    tasks: Array.from({ length: taskCount }, (_, index) => ({
      planTaskId: `task-${index + 1}`,
      title: `Task ${index + 1}`,
      status: "pending",
      dependsOn: index === 0 ? [] : [`task-${index}`],
      targetFiles: [`src/file-${index + 1}.ts`]
    }))
  };
}

function finalAdapter(result: AdapterResult): ExecutionAdapter {
  return {
    id: "stub",
    async *execute() {
      yield { kind: "final", result };
    }
  };
}

function changeSetResult(path: string, preImageSha256 = sha("before")): AdapterResult {
  return {
    outcome: "change-set",
    changeSet: {
      entries: [{ path, op: "modify", diff: "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-before\n+after", preImageSha256 }]
    } as never,
    evidence: evidence()
  };
}

function failedResult(reason: "timeout" | "aborted"): AdapterResult {
  return { outcome: "adapter-failed", reason, evidence: evidence() };
}

function hashResult(preImageSha256: string | undefined): readonly ApplyResult[] {
  return [{ path: "src/a.ts", status: preImageSha256 === sha("before") ? "applied" : "skipped-hash-mismatch" }];
}

function evidence(): AdapterEvidence {
  return { model: "stub-model", attempts: 1, durationMs: 1, auxReads: [], retries: [] };
}

function reader(): RepoReader {
  return {
    async readFile() {
      const bytes = new TextEncoder().encode("before");
      return { bytes, sha256: sha("before") };
    },
    async glob() {
      return [];
    }
  };
}

function envelope(): CapabilityEnvelope {
  return {
    repoScopes: [],
    workspace: { allowDirty: false },
    network: { allow: "loopback" },
    budget: { adapterRetriesPerTask: 4, taskWallClockMs: 180_000, maxRepairLoops: 0 },
    toolPermissions: []
  };
}

function confirmedIntent(capabilityEnvelope: CapabilityEnvelope): ConfirmedIntent {
  return {
    schemaVersion: "1.3.0",
    id: "intent_real",
    title: "Real execution",
    problem: "Run real execution",
    requester: { name: "Test", role: "tester" },
    acceptanceCriteria: [{ id: "AC-1", statement: "Run", verification: "test" }],
    capabilityEnvelope,
    constraints: [],
    stopConditions: [],
    confirmedAt: "2026-04-27T00:00:00.000Z"
  } as unknown as ConfirmedIntent;
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
