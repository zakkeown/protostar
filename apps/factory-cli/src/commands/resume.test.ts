import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  createFactoryRunManifest,
  setFactoryRunStatus,
  type FactoryRunManifest,
  type FactoryRunStatus
} from "@protostar/artifacts";
import {
  formatTaskJournalLine,
  TASK_JOURNAL_EVENT_SCHEMA_VERSION,
  type TaskJournalEvent
} from "@protostar/execution";

import { buildResumeCommand, type ResumeCommandDependencies } from "./resume.js";

const originalCwd = process.cwd();
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);
const tempRoots: string[] = [];
const sourceDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../src");

afterEach(async () => {
  process.chdir(originalCwd);
  process.exitCode = undefined;
  process.stdout.write = originalStdoutWrite as typeof process.stdout.write;
  process.stderr.write = originalStderrWrite as typeof process.stderr.write;
  await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("resume command", () => {
  it("refuses operator-cancelled terminal runs with exit 4 and leaves CANCEL intact", async () => {
    const workspace = await tempWorkspace();
    const runDir = await createRun(workspace, "run_cancelled", "cancelled");
    await writeFile(join(runDir, "CANCEL"), "", "utf8");

    const result = await runResume(workspace, ["run_cancelled"]);

    assert.equal(result.exitCode, 4);
    assert.deepEqual(JSON.parse(result.stdout), {
      error: "operator-cancelled-terminal",
      runId: "run_cancelled"
    });
    assert.equal(result.stderr, "");
    await stat(join(runDir, "CANCEL"));
  });

  it("clears a transient sentinel before dispatching running runs to mid-execution resume", async () => {
    const workspace = await tempWorkspace();
    const runDir = await createRun(workspace, "run_transient", "running");
    await writeFile(join(runDir, "CANCEL"), "", "utf8");
    await writeJournal(runDir, [
      event({ runId: "run_transient", planTaskId: "task-a", kind: "task-running", seq: 1 })
    ]);
    const calls: unknown[] = [];

    const result = await runResume(workspace, ["run_transient"], {
      resumeRealExecution: async (input) => {
        calls.push(input);
        return 0;
      },
      resumeReviewLoop: async () => 0
    });

    assert.equal(result.exitCode, 0);
    assert.match(result.stderr, /clearing transient cancel sentinel before resume/);
    await assert.rejects(stat(join(runDir, "CANCEL")), /ENOENT/);
    assert.equal(calls.length, 1);
    const call = calls[0] as { readonly orphanSet: readonly TaskJournalEvent[] };
    assert.deepEqual(call.orphanSet.map((orphan) => orphan.planTaskId), ["task-a"]);
    assert.equal(call.orphanSet[0]?.kind, "task-failed");
    assert.equal(call.orphanSet[0]?.retryReason, "orphaned-by-crash");
  });

  it("accepts manifest.status=orphaned through the same mid-execution replay path", async () => {
    const workspace = await tempWorkspace();
    const runDir = await createRun(workspace, "run_orphaned", "orphaned");
    await writeJournal(runDir, [
      event({ runId: "run_orphaned", planTaskId: "task-b", kind: "task-running", seq: 1 })
    ]);
    let called = false;

    const result = await runResume(workspace, ["run_orphaned"], {
      resumeRealExecution: async (input) => {
        called = true;
        assert.equal(input.runId, "run_orphaned");
        assert.deepEqual(input.orphanSet.map((orphan) => orphan.planTaskId), ["task-b"]);
        return 0;
      },
      resumeReviewLoop: async () => 0
    });

    assert.equal(result.exitCode, 0);
    assert.equal(called, true);
    assert.equal(runDir.endsWith("run_orphaned"), true);
  });

  it("fails closed with default dependencies instead of reporting false resume success", async () => {
    const workspace = await tempWorkspace();
    const runDir = await createRun(workspace, "run_default", "running");
    await writeJournal(runDir, [
      event({ runId: "run_default", planTaskId: "task-default", kind: "task-running", seq: 1 })
    ]);

    const result = await runResume(workspace, ["run_default"]);

    assert.equal(result.exitCode, 6);
    assert.match(result.stderr, /real mid-execution resume is not wired/);
  });

  it("fails closed for default review resume dependencies", async () => {
    const workspace = await tempWorkspace();
    await createRun(workspace, "run_review_default", "repairing");

    const result = await runResume(workspace, ["run_review_default"]);

    assert.equal(result.exitCode, 6);
    assert.match(result.stderr, /real mid-review resume is not wired/);
  });

  it("dispatches repairing runs to review resume at iter-(N+1)", async () => {
    const workspace = await tempWorkspace();
    await createRun(workspace, "run_repairing", "repairing");
    await mkdir(join(workspace, ".protostar", "runs", "run_repairing", "piles", "review", "iter-0"), { recursive: true });
    await mkdir(join(workspace, ".protostar", "runs", "run_repairing", "piles", "review", "iter-3"), { recursive: true });
    let startIter: number | undefined;

    const result = await runResume(workspace, ["run_repairing"], {
      resumeRealExecution: async () => 0,
      resumeReviewLoop: async (input) => {
        startIter = input.startIter;
        return 0;
      }
    });

    assert.equal(result.exitCode, 0);
    assert.equal(startIter, 4);
  });

  it("returns success without stage dispatch when there are no orphaned tasks", async () => {
    const workspace = await tempWorkspace();
    const runDir = await createRun(workspace, "run_done_journal", "running");
    await writeJournal(runDir, [
      event({ runId: "run_done_journal", planTaskId: "task-c", kind: "task-running", seq: 1 }),
      event({ runId: "run_done_journal", planTaskId: "task-c", kind: "task-succeeded", seq: 2 })
    ]);
    let called = false;

    const result = await runResume(workspace, ["run_done_journal"], {
      resumeRealExecution: async () => {
        called = true;
        return 0;
      },
      resumeReviewLoop: async () => 0
    });

    assert.equal(result.exitCode, 0);
    assert.equal(called, false);
    assert.match(result.stderr, /nothing to replay/);
  });

  it("points ready-to-release runs at deliver and refuses other non-resumable statuses with exit 6", async () => {
    const workspace = await tempWorkspace();
    await createRun(workspace, "run_release", "ready-to-release");
    await createRun(workspace, "run_completed", "completed");
    await createRun(workspace, "run_blocked", "blocked");
    await createRun(workspace, "run_created", "created");
    await createRun(workspace, "run_cancelling", "cancelling");

    const release = await runResume(workspace, ["run_release"]);
    const completed = await runResume(workspace, ["run_completed"]);
    const blocked = await runResume(workspace, ["run_blocked"]);
    const created = await runResume(workspace, ["run_created"]);
    const cancelling = await runResume(workspace, ["run_cancelling"]);

    assert.equal(release.exitCode, 6);
    assert.match(release.stderr, /ready-to-release; use `protostar-factory deliver` instead/);
    assert.equal(completed.exitCode, 6);
    assert.match(completed.stderr, /manifest\.status=completed is terminal/);
    assert.equal(blocked.exitCode, 6);
    assert.match(blocked.stderr, /manifest\.status=blocked is terminal/);
    assert.equal(created.exitCode, 6);
    assert.match(created.stderr, /manifest\.status=created is not resumable/);
    assert.equal(cancelling.exitCode, 6);
    assert.match(cancelling.stderr, /manifest\.status=cancelling is not resumable/);
  });

  it("rejects invalid run ids with exit 2 and missing manifests with exit 3", async () => {
    const workspace = await tempWorkspace();

    const invalid = await runResume(workspace, ["../escape"]);
    const missing = await runResume(workspace, ["missing_run"]);

    assert.equal(invalid.exitCode, 2);
    assert.match(invalid.stderr, /runId must match/);
    assert.equal(missing.exitCode, 3);
    assert.match(missing.stderr, /no manifest/);
  });

  it("uses Phase 4 replay helpers and the existing cancel unlink helper", async () => {
    const source = await readFile(join(sourceDir, "commands", "resume.ts"), "utf8");

    assert.match(source, /replayOrphanedTasks/);
    assert.match(source, /reduceJournalToSnapshot/);
    assert.match(source, /unlinkSentinelOnResume/);
    assert.match(source, /manifest\.status === 'cancelled'/);
  });
});

interface CommandResult {
  readonly exitCode: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutChunks: readonly string[];
}

async function runResume(
  workspace: string,
  args: readonly string[],
  deps?: ResumeCommandDependencies
): Promise<CommandResult> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  process.chdir(workspace);
  process.exitCode = undefined;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdoutChunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderrChunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;

  await buildResumeCommand(deps).parseAsync([...args], { from: "user" });

  return {
    exitCode: typeof process.exitCode === "number" ? process.exitCode : undefined,
    stdout: stdoutChunks.join(""),
    stderr: stderrChunks.join(""),
    stdoutChunks
  };
}

async function tempWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "resume-command-"));
  tempRoots.push(workspace);
  await writeFile(join(workspace, "pnpm-workspace.yaml"), "packages: []\n", "utf8");
  await mkdir(join(workspace, ".protostar", "runs"), { recursive: true });
  return workspace;
}

async function createRun(workspace: string, runId: string, status: FactoryRunStatus): Promise<string> {
  const runDir = join(workspace, ".protostar", "runs", runId);
  await mkdir(join(runDir, "execution"), { recursive: true });
  await writeFile(
    join(runDir, "manifest.json"),
    `${JSON.stringify(setFactoryRunStatus(baseManifest(runId), status), null, 2)}\n`,
    "utf8"
  );
  return runDir;
}

function baseManifest(runId: string): FactoryRunManifest {
  return createFactoryRunManifest({
    runId,
    intentId: "intent_1" as never,
    createdAt: "2026-04-28T00:00:00.000Z"
  });
}

async function writeJournal(runDir: string, events: readonly TaskJournalEvent[]): Promise<void> {
  await mkdir(join(runDir, "execution"), { recursive: true });
  await writeFile(join(runDir, "execution", "journal.jsonl"), events.map(formatTaskJournalLine).join(""), "utf8");
}

function event(input: {
  readonly runId: string;
  readonly planTaskId: string;
  readonly kind: "task-running" | "task-succeeded";
  readonly seq: number;
}): TaskJournalEvent {
  if (input.kind === "task-succeeded") {
    return {
      schemaVersion: TASK_JOURNAL_EVENT_SCHEMA_VERSION,
      runId: input.runId,
      planTaskId: input.planTaskId,
      kind: input.kind,
      at: "2026-04-28T00:00:00.000Z",
      attempt: 1,
      seq: input.seq,
      evidenceArtifact: {
        stage: "execution",
        kind: "adapter-evidence",
        uri: `execution/task-${input.planTaskId}/evidence.json`,
        description: "test evidence"
      }
    };
  }

  return {
    schemaVersion: TASK_JOURNAL_EVENT_SCHEMA_VERSION,
    runId: input.runId,
    planTaskId: input.planTaskId,
    kind: input.kind,
    at: "2026-04-28T00:00:00.000Z",
    attempt: 1,
    seq: input.seq
  };
}
