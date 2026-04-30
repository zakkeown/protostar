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
  type AdapterFailureReason,
  type AdapterResult,
  type ExecutionAdapter,
  type ExecutionRunPlan,
  type RepoReader
} from "@protostar/execution";
import type { CapabilityEnvelope, ConfirmedIntent } from "@protostar/intent";
import type { ApplyResult } from "@protostar/repo";

import { createJournalWriter } from "./journal-writer.js";
import { createFsRepoReader } from "./repo-reader-adapter.js";
import { runRealExecution } from "./run-real-execution.js";

describe("runRealExecution", () => {
  it("emits pending-running-succeeded, journals, snapshots, and evidence files", async () => {
    const ctx = await testContext();
    const writer = await createJournalWriter({ runDir: ctx.runDir });
    const result = await runRealExecution({
      ...ctx.input,
      journalWriter: writer,
      adapter: tokenAdapter("hello from adapter\n", changeSetResult("src/a.ts")),
      applyChangeSet: async () => [{ path: "src/a.ts", status: "applied" }]
    });
    await writer.close();

    assert.equal(result.outcome, "complete");
    assert.deepEqual(result.events.map((event) => event.type), ["task-pending", "task-running", "task-succeeded"]);
    assert.equal((await readFile(join(ctx.runDir, "execution", "journal.jsonl"), "utf8")).trim().split("\n").length, 3);
    assert.match(await readFile(join(ctx.runDir, "execution", "snapshot.json"), "utf8"), /"status":"succeeded"/);
    assert.equal(await exists(join(ctx.runDir, "execution", "task-task-1", "evidence.json")), true);
    assert.equal(await exists(join(ctx.runDir, "execution", "task-task-1", "transcript.json")), true);
    assert.equal(await readFile(join(ctx.runDir, "execution", "task-task-1", "stdout.log"), "utf8"), "hello from adapter\n");
    assert.equal(await readFile(join(ctx.runDir, "execution", "task-task-1", "stderr.log"), "utf8"), "");
    const evidence = JSON.parse(await readFile(join(ctx.runDir, "execution", "task-task-1", "evidence.json"), "utf8")) as {
      readonly stdoutArtifact?: string;
      readonly stderrArtifact?: string;
      readonly transcriptArtifact?: string;
    };
    assert.equal(evidence.stdoutArtifact, "execution/task-task-1/stdout.log");
    assert.equal(evidence.stderrArtifact, "execution/task-task-1/stderr.log");
    assert.equal(evidence.transcriptArtifact, "execution/task-task-1/transcript.json");
  });

  it("marks the synthetic pre-handoff verification task succeeded without invoking the coder adapter", async () => {
    const ctx = await testContext();
    const writer = await createJournalWriter({ runDir: ctx.runDir });
    let adapterCalls = 0;
    const result = await runRealExecution({
      ...ctx.input,
      runPlan: {
        ...ctx.input.runPlan,
        tasks: [
          {
            planTaskId: "task-live-planning-pre-handoff-verification",
            title: "Verify confirmed authority before execution handoff",
            status: "pending",
            dependsOn: [],
            targetFiles: ["src"]
          }
        ]
      },
      journalWriter: writer,
      adapter: {
        id: "stub",
        async *execute() {
          adapterCalls += 1;
          yield { kind: "final", result: failedResult("parse-reformat-failed") };
        }
      },
      applyChangeSet: async () => {
        throw new Error("synthetic verification task should not apply patches");
      }
    });
    await writer.close();

    assert.equal(result.outcome, "complete");
    assert.equal(adapterCalls, 0);
    assert.deepEqual(result.events.map((event) => event.type), ["task-pending", "task-running", "task-succeeded"]);
    const evidence = JSON.parse(
      await readFile(
        join(ctx.runDir, "execution", "task-task-live-planning-pre-handoff-verification", "evidence.json"),
        "utf8"
      )
    ) as { readonly adapter?: string; readonly attempts?: number };
    assert.equal(evidence.adapter, "pre-handoff-verification");
    assert.equal(evidence.attempts, 0);
  });

  it("authorizes patch writes before applying a change set", async () => {
    const ctx = await testContext({
      envelope: { ...envelope(), repoScopes: [] }
    });
    const writer = await createJournalWriter({ runDir: ctx.runDir });
    let applyCalls = 0;

    await assert.rejects(
      runRealExecution({
        ...ctx.input,
        journalWriter: writer,
        adapter: finalAdapter(changeSetResult("src/a.ts")),
        applyChangeSet: async () => {
          applyCalls += 1;
          return [{ path: "src/a.ts", status: "applied" }];
        }
      }),
      /workspace write not authorized/
    );
    await writer.close();

    assert.equal(applyCalls, 0);
  });

  it("uses the physical workspace root for authorized filesystem writes", async () => {
    const ctx = await testContext({ workspaceName: "protostar-toy-ttt" });
    const writer = await createJournalWriter({ runDir: ctx.runDir });
    let seenRoot: string | undefined;
    let seenPath: string | undefined;
    const result = await runRealExecution({
      ...ctx.input,
      journalWriter: writer,
      adapter: finalAdapter(changeSetResult("src/a.ts")),
      applyChangeSet: async (patches) => {
        seenRoot = patches[0]?.op.workspace.root;
        seenPath = patches[0]?.op.path;
        return [{ path: "src/a.ts", status: "applied" }];
      }
    });
    await writer.close();

    assert.equal(result.outcome, "complete");
    assert.equal(seenRoot, ctx.runDir);
    assert.equal(seenPath, resolve(ctx.runDir, "src/a.ts"));
  });

  it("materializes missing authorized write targets before adapter reads", async () => {
    const ctx = await testContext({
      workspaceName: "protostar-toy-ttt",
      envelope: {
        ...envelope(),
        repoScopes: [
          { workspace: "protostar-toy-ttt", path: "src/components/NewBoard.tsx", access: "write" },
          { workspace: "protostar-toy-ttt", path: "src/lib/state.ts", access: "write" }
        ]
      }
    });
    const writer = await createJournalWriter({ runDir: ctx.runDir });
    const result = await runRealExecution({
      ...ctx.input,
      runPlan: {
        ...ctx.input.runPlan,
        tasks: [{
          planTaskId: "task-1",
          title: "Create missing targets",
          status: "pending",
          dependsOn: [],
          targetFiles: ["src/components/NewBoard.tsx", "src/lib/state.ts"]
        }]
      },
      repoReader: createFsRepoReader({ workspaceRoot: ctx.runDir }),
      journalWriter: writer,
      adapter: {
        id: "reads-missing-targets",
        async *execute(_task, adapterCtx) {
          const board = await adapterCtx.repoReader.readFile("src/components/NewBoard.tsx");
          const state = await adapterCtx.repoReader.readFile("src/lib/state.ts");
          assert.equal(new TextDecoder().decode(board.bytes), "");
          assert.equal(new TextDecoder().decode(state.bytes), "");
          yield { kind: "final", result: changeSetResult("src/components/NewBoard.tsx", sha("")) };
        }
      },
      applyChangeSet: async () => [{ path: "src/components/NewBoard.tsx", status: "applied" }]
    });
    await writer.close();

    assert.equal(result.outcome, "complete");
    assert.equal(await exists(join(ctx.runDir, "src", "components", "NewBoard.tsx")), true);
    assert.equal(await exists(join(ctx.runDir, "src", "lib", "state.ts")), true);
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

  it("blocks on timeout and does not execute downstream tasks", async () => {
    const ctx = await testContext({
      taskCount: 2,
      envelope: { ...envelope(), budget: { adapterRetriesPerTask: 4, taskWallClockMs: 1, maxRepairLoops: 3 } }
    });
    const writer = await createJournalWriter({ runDir: ctx.runDir });
    let adapterCalls = 0;
    const result = await runRealExecution({
      ...ctx.input,
      journalWriter: writer,
      adapter: {
        id: "slow",
        async *execute(_task, adapterCtx) {
          adapterCalls += 1;
          // Race fix: with taskWallClockMs=1, the production-side abort timer can fire
          // *before* this adapter attaches its listener. `addEventListener("abort", ...)`
          // on an already-aborted signal never fires, so the promise would hang and the
          // parent test suite would be cancelled by the runner ("Promise resolution is
          // still pending but the event loop has already resolved"). Pre-check `.aborted`
          // to handle the lost-race case deterministically. See 06-09 SUMMARY for the
          // full diagnosis of the verify-gate flake this closes.
          await new Promise<void>((resolveDone) => {
            if (adapterCtx.signal.aborted) {
              resolveDone();
              return;
            }
            adapterCtx.signal.addEventListener("abort", () => resolveDone(), { once: true });
          });
          yield { kind: "final", result: failedResult("timeout") };
        }
      },
      applyChangeSet: async () => []
    });
    await writer.close();

    assert.equal(result.outcome, "block");
    assert.equal(result.blockReason, "task-timeout");
    assert.equal(adapterCalls, 1);
    assert.equal(result.events.at(-1)?.type, "task-timeout");
  });

  it("blocks on adapter failure and does not execute downstream tasks", async () => {
    const ctx = await testContext({ taskCount: 2 });
    const writer = await createJournalWriter({ runDir: ctx.runDir });
    let adapterCalls = 0;
    const result = await runRealExecution({
      ...ctx.input,
      journalWriter: writer,
      adapter: {
        id: "failing",
        async *execute() {
          adapterCalls += 1;
          yield { kind: "final", result: failedResult("retries-exhausted") };
        }
      },
      applyChangeSet: async () => []
    });
    await writer.close();

    assert.equal(result.outcome, "block");
    assert.equal(result.blockReason, "retries-exhausted");
    assert.equal(adapterCalls, 1);
    assert.equal(result.events.at(-1)?.type, "task-failed");
    assert.equal(await readFile(join(ctx.runDir, "execution", "task-task-1", "stderr.log"), "utf8"), "retries-exhausted\n");
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

  it("reruns repair subgraph tasks with repair context and repair attempt evidence", async () => {
    const ctx = await testContext({ taskCount: 2 });
    const firstWriter = await createJournalWriter({ runDir: ctx.runDir });
    await runRealExecution({
      ...ctx.input,
      journalWriter: firstWriter,
      adapter: finalAdapter(changeSetResult("src/file-1.ts")),
      applyChangeSet: async () => [{ path: "src/file-1.ts", status: "applied" }]
    });
    await firstWriter.close();

    const repairWriter = await createJournalWriter({ runDir: ctx.runDir });
    const repairContexts: unknown[] = [];
    const repairResult = await runRealExecution({
      ...ctx.input,
      journalWriter: repairWriter,
      adapter: {
        id: "repair-stub",
        async *execute(task, adapterCtx) {
          repairContexts.push({ taskId: task.planTaskId, repairContext: adapterCtx.repairContext });
          yield { kind: "final", result: changeSetResult(task.targetFiles[0] ?? "src/file-1.ts") };
        }
      },
      applyChangeSet: async (patches) => [{ path: patches[0]?.path ?? "unknown", status: "applied" }],
      repair: {
        attempt: 2,
        repairPlan: {
          runId: "run_real",
          attempt: 1,
          repairs: [
            {
              planTaskId: "task-1",
              mechanicalCritiques: [
                {
                  ruleId: "execution-completed",
                  severity: "major",
                  summary: "Task 1 needs repair.",
                  evidence: [],
                  repairTaskId: "task-1"
                }
              ],
              modelCritiques: [
                {
                  judgeId: "judge-1",
                  model: "qwen3",
                  rubric: { correctness: 0.5 },
                  verdict: "repair",
                  rationale: "Task 1 missed the target.",
                  taskRefs: ["task-1"]
                }
              ]
            }
          ],
          dependentTaskIds: ["task-1"]
        }
      }
    });
    await repairWriter.close();

    assert.equal(repairResult.outcome, "complete");
    assert.deepEqual(repairResult.events.map((event) => event.type), [
      "task-pending",
      "task-running",
      "task-succeeded"
    ]);
    assert.deepEqual(repairResult.events.map((event) => event.planTaskId), ["task-1", "task-1", "task-1"]);
    assert.deepEqual(repairResult.events.map((event) => event.attempt), [2, 2, 2]);
    assert.equal((repairContexts[0] as any).repairContext.previousAttempt.attempt, 1);
    assert.equal((repairContexts[0] as any).repairContext.mechanicalCritiques[0].message, "Task 1 needs repair.");
    assert.equal((repairContexts[0] as any).repairContext.modelCritiques[0].rationale, "Task 1 missed the target.");
    assert.equal(await exists(join(ctx.runDir, "execution", "task-task-1-attempt-2", "evidence.json")), true);
  });

  it("stops repair execution after applying a non-empty change set so review can rerun", async () => {
    const ctx = await testContext({ taskCount: 2 });
    const writer = await createJournalWriter({ runDir: ctx.runDir });
    const executedTasks: string[] = [];
    const result = await runRealExecution({
      ...ctx.input,
      journalWriter: writer,
      adapter: {
        id: "repair-stub",
        async *execute(task) {
          executedTasks.push(task.planTaskId);
          yield { kind: "final", result: changeSetResult(task.targetFiles[0] ?? "src/file-1.ts") };
        }
      },
      applyChangeSet: async (patches) => [{ path: patches[0]?.path ?? "unknown", status: "applied" }],
      repair: {
        attempt: 2,
        repairPlan: {
          runId: "run_real",
          attempt: 1,
          repairs: [
            { planTaskId: "task-1", mechanicalCritiques: [], modelCritiques: [] },
            { planTaskId: "task-2", mechanicalCritiques: [], modelCritiques: [] }
          ],
          dependentTaskIds: ["task-1", "task-2"]
        }
      }
    });
    await writer.close();

    assert.equal(result.outcome, "complete");
    assert.deepEqual(executedTasks, ["task-1"]);
    assert.deepEqual(result.events.map((event) => event.planTaskId), ["task-1", "task-1", "task-1"]);
    assert.deepEqual(result.events.map((event) => event.type), [
      "task-pending",
      "task-running",
      "task-succeeded"
    ]);
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
  readonly workspaceName?: string;
} = {}) {
  const runDir = await mkdtemp(join(tmpdir(), "real-execution-"));
  const controller = new AbortController();
  const resolvedEnvelope = opts.envelope ?? envelope();
  const runPlan = plan(opts.taskCount ?? 1, opts.workspaceName ?? "main");
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

function plan(taskCount: number, workspaceName: string): ExecutionRunPlan {
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
    workspace: { root: workspaceName, trust: "trusted" },
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

function tokenAdapter(text: string, result: AdapterResult): ExecutionAdapter {
  return {
    id: "stub",
    async *execute(task, ctx) {
      await ctx.journal.appendToken(task.planTaskId, 1, text);
      yield { kind: "token", text };
      yield { kind: "final", result };
    }
  };
}

function changeSetResult(path: string, preImageSha256 = sha("before")): AdapterResult {
  return {
    outcome: "change-set",
    changeSet: {
      entries: [{ path, op: "modify", diff: `--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-before\n+after`, preImageSha256 }]
    } as never,
    evidence: evidence()
  };
}

function failedResult(reason: AdapterFailureReason): AdapterResult {
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
    repoScopes: [
      { workspace: "main", path: "src", access: "write" },
      { workspace: "protostar-toy-ttt", path: "src", access: "write" }
    ],
    workspace: { allowDirty: false },
    network: { allow: "loopback" },
    mechanical: { allowed: ["verify", "lint"] },
    budget: { adapterRetriesPerTask: 4, taskWallClockMs: 180_000, deliveryWallClockMs: 600_000, maxRepairLoops: 3 },
    toolPermissions: []
  };
}

function confirmedIntent(capabilityEnvelope: CapabilityEnvelope): ConfirmedIntent {
  return {
    schemaVersion: "1.6.0",
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
