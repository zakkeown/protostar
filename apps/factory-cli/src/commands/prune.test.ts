import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import type { FactoryRunManifest, FactoryRunStatus } from "@protostar/artifacts";

import { buildPruneCommand } from "./prune.js";

const originalCwd = process.cwd();
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);
const tempRoots: string[] = [];

afterEach(async () => {
  process.chdir(originalCwd);
  process.exitCode = undefined;
  process.stdout.write = originalStdoutWrite as typeof process.stdout.write;
  process.stderr.write = originalStderrWrite as typeof process.stderr.write;
  await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("prune command", () => {
  it("defaults to dry-run and reports old terminal candidates plus active protected rows", async () => {
    const workspace = await tempWorkspace();
    await createRun(workspace, { runId: "old_done", status: "completed", archetype: "cosmetic-tweak", ageMs: days(9) });
    await createRun(workspace, { runId: "old_running", status: "running", archetype: "cosmetic-tweak", ageMs: days(9) });
    await createRun(workspace, { runId: "recent_done", status: "completed", archetype: "cosmetic-tweak", ageMs: days(1) });

    const result = await runPrune(workspace, ["--older-than", "7d"]);

    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.equal(result.stdoutChunks.length, 1);
    const output = parseOutput(result.stdout);
    assert.equal(output.scanned, 2);
    assert.equal(output.dryRun, true);
    assert.deepEqual(output.candidates.map((candidate) => candidate.runId), ["old_done"]);
    assert.deepEqual(output.deleted, []);
    assert.deepEqual(output.protected, [{ reason: "active-running", runId: "old_running" }]);
    await stat(join(workspace, ".protostar", "runs", "old_done"));
  });

  it("requires --confirm to delete candidate run directories", async () => {
    const workspace = await tempWorkspace();
    await createRun(workspace, { runId: "old_done", status: "completed", archetype: "cosmetic-tweak", ageMs: days(8) });
    await createRun(workspace, { runId: "old_blocked", status: "blocked", archetype: "cosmetic-tweak", ageMs: days(8) });
    await createRun(workspace, { runId: "old_cancelling", status: "cancelling", archetype: "cosmetic-tweak", ageMs: days(8) });

    const result = await runPrune(workspace, ["--older-than", "7d", "--confirm"]);

    assert.equal(result.exitCode, 0);
    const output = parseOutput(result.stdout);
    assert.equal(output.dryRun, false);
    assert.deepEqual(output.deleted.map((row) => row.runId).sort(), ["old_blocked", "old_done"]);
    assert.deepEqual(output.protected, [{ reason: "active-cancelling", runId: "old_cancelling" }]);
    await assertMissing(join(workspace, ".protostar", "runs", "old_done"));
    await assertMissing(join(workspace, ".protostar", "runs", "old_blocked"));
    await stat(join(workspace, ".protostar", "runs", "old_cancelling"));
  });

  it("preserves workspace-level append-only JSONL files byte-identical after confirmed prune", async () => {
    const workspace = await tempWorkspace();
    await createRun(workspace, { runId: "old_done", status: "completed", archetype: "cosmetic-tweak", ageMs: days(8) });
    const refusalsPath = join(workspace, ".protostar", "refusals.jsonl");
    const lineagePath = join(workspace, ".protostar", "evolution", "lineage-X.jsonl");
    await mkdir(join(workspace, ".protostar", "evolution"), { recursive: true });
    await writeFile(refusalsPath, "{\"runId\":\"old_done\",\"sourceOfTruth\":\"PlanningPileResult\"}\n", "utf8");
    await writeFile(
      lineagePath,
      "{\"runId\":\"old_done\",\"snapshotPath\":\".protostar/runs/old_done/evolution/snapshot.json\"}\n",
      "utf8"
    );
    const before = {
      refusals: await sha256(refusalsPath),
      lineage: await sha256(lineagePath)
    };

    const result = await runPrune(workspace, ["--older-than", "7d", "--confirm"]);

    assert.equal(result.exitCode, 0);
    await assertMissing(join(workspace, ".protostar", "runs", "old_done"));
    assert.deepEqual(
      {
        refusals: await sha256(refusalsPath),
        lineage: await sha256(lineagePath)
      },
      before
    );
  });

  it("filters old runs by manifest archetype case-sensitively", async () => {
    const workspace = await tempWorkspace();
    await createRun(workspace, { runId: "old_cosmetic", status: "completed", archetype: "cosmetic-tweak", ageMs: days(8) });
    await createRun(workspace, { runId: "old_bugfix", status: "completed", archetype: "bugfix", ageMs: days(8) });

    const result = await runPrune(workspace, ["--older-than", "7d", "--archetype", "cosmetic-tweak"]);

    const output = parseOutput(result.stdout);
    assert.deepEqual(output.candidates.map((candidate) => candidate.runId), ["old_cosmetic"]);
    assert.deepEqual(output.protected, []);
  });

  it("rejects malformed durations and missing --older-than with exit 2", async () => {
    const workspace = await tempWorkspace();

    const badDuration = await runPrune(workspace, ["--older-than", "bogus"]);
    assert.equal(badDuration.exitCode, 2);
    assert.match(badDuration.stderr, /duration must match/);
    assert.equal(badDuration.stdout, "");

    const missing = await runPrune(workspace, []);
    assert.equal(missing.exitCode, 2);
    assert.match(missing.stderr, /--older-than/);
    assert.equal(missing.stdout, "");
  });

  it("emits an empty report for an empty runs directory", async () => {
    const workspace = await tempWorkspace();

    const result = await runPrune(workspace, ["--older-than", "24h"]);

    assert.equal(result.exitCode, 0);
    assert.deepEqual(parseOutput(result.stdout), {
      candidates: [],
      deleted: [],
      dryRun: true,
      protected: [],
      scanned: 0
    });
  });

  it("deletes a run referenced by lineage JSONL while preserving the lineage chain bytes", async () => {
    const workspace = await tempWorkspace();
    await createRun(workspace, { runId: "lineage_run", status: "completed", archetype: "cosmetic-tweak", ageMs: days(8) });
    const lineagePath = join(workspace, ".protostar", "evolution", "lineage-X.jsonl");
    await mkdir(join(workspace, ".protostar", "evolution"), { recursive: true });
    await writeFile(
      lineagePath,
      "{\"lineageId\":\"lineage-X\",\"runId\":\"lineage_run\",\"snapshotPath\":\".protostar/runs/lineage_run/evolution/snapshot.json\"}\n",
      "utf8"
    );
    const before = await readFile(lineagePath, "utf8");

    const result = await runPrune(workspace, ["--older-than", "7d", "--confirm"]);

    assert.equal(result.exitCode, 0);
    await assertMissing(join(workspace, ".protostar", "runs", "lineage_run"));
    assert.equal(await readFile(lineagePath, "utf8"), before);
  });

  it("reports old dogfood sessions as dry-run prune candidates", async () => {
    const workspace = await tempWorkspace();
    await createDogfoodSession(workspace, {
      sessionId: "dogfood_old",
      ageMs: days(8),
      completed: 1,
      totalRuns: 1
    });

    const result = await runPrune(workspace, ["--older-than", "7d"]);

    assert.equal(result.exitCode, 0);
    const output = parseOutput(result.stdout);
    assert.deepEqual(output.candidates.map((candidate) => candidate.runId), ["dogfood_old"]);
    await stat(join(workspace, ".protostar", "dogfood", "dogfood_old"));
  });

  it("deletes old completed dogfood sessions when confirmed", async () => {
    const workspace = await tempWorkspace();
    await createDogfoodSession(workspace, {
      sessionId: "dogfood_done",
      ageMs: days(8),
      completed: 3,
      totalRuns: 3
    });

    const result = await runPrune(workspace, ["--older-than", "7d", "--confirm"]);

    assert.equal(result.exitCode, 0);
    const output = parseOutput(result.stdout);
    assert.deepEqual(output.deleted, [{ runId: "dogfood_done" }]);
    await assertMissing(join(workspace, ".protostar", "dogfood", "dogfood_done"));
  });

  it("preserves append-only refusal and lineage files while pruning dogfood sessions", async () => {
    const workspace = await tempWorkspace();
    await createDogfoodSession(workspace, {
      sessionId: "dogfood_done",
      ageMs: days(8),
      completed: 2,
      totalRuns: 2
    });
    const refusalsPath = join(workspace, ".protostar", "refusals.jsonl");
    const lineagePath = join(workspace, ".protostar", "evolution", "lineage-X.jsonl");
    await mkdir(join(workspace, ".protostar", "evolution"), { recursive: true });
    await writeFile(refusalsPath, "{\"sessionId\":\"dogfood_done\"}\n", "utf8");
    await writeFile(lineagePath, "{\"sessionId\":\"dogfood_done\"}\n", "utf8");
    const before = {
      refusals: await sha256(refusalsPath),
      lineage: await sha256(lineagePath)
    };

    const result = await runPrune(workspace, ["--older-than", "7d", "--confirm"]);

    assert.equal(result.exitCode, 0);
    await assertMissing(join(workspace, ".protostar", "dogfood", "dogfood_done"));
    assert.deepEqual(
      {
        refusals: await sha256(refusalsPath),
        lineage: await sha256(lineagePath)
      },
      before
    );
  });

  it("protects active dogfood sessions whose cursor has incomplete runs", async () => {
    const workspace = await tempWorkspace();
    await createDogfoodSession(workspace, {
      sessionId: "dogfood_active",
      ageMs: days(8),
      completed: 1,
      totalRuns: 3
    });

    const result = await runPrune(workspace, ["--older-than", "7d", "--confirm"]);

    assert.equal(result.exitCode, 0);
    const output = parseOutput(result.stdout);
    assert.deepEqual(output.candidates, []);
    assert.deepEqual(output.deleted, []);
    assert.deepEqual(output.protected, [{ reason: "active-dogfood-session", runId: "dogfood_active" }]);
    await stat(join(workspace, ".protostar", "dogfood", "dogfood_active"));
  });

  it("reports old terminal session artifacts as dry-run candidates with events.jsonl hash evidence", async () => {
    const workspace = await tempWorkspace();
    const sessionDir = await createStressSession(workspace, {
      sessionId: "stress_20260429_001",
      ageMs: days(8),
      cursorStatus: "completed",
      finishedAt: "2026-04-29T00:10:00Z"
    });
    const eventsPath = join(sessionDir, "events.jsonl");
    const expectedHash = await sha256(eventsPath);

    const result = await runPrune(workspace, ["--older-than", "7d"]);

    assert.equal(result.exitCode, 0);
    const output = parseOutput(result.stdout);
    assert.equal(output.scanned, 1);
    assert.deepEqual(output.candidates.map((candidate) => candidate.runId), ["stress_20260429_001"]);
    assert.equal(output.candidates[0]?.eventsJsonlSha256, expectedHash);
    assert.deepEqual(output.deleted, []);
    await stat(sessionDir);
    assert.equal(await sha256(eventsPath), expectedHash);
  });

  it("protects active session artifacts with active-stress-session", async () => {
    const workspace = await tempWorkspace();
    await createStressSession(workspace, {
      sessionId: "stress_20260429_002",
      ageMs: days(8),
      cursorStatus: "running"
    });

    const result = await runPrune(workspace, ["--older-than", "7d", "--confirm"]);

    assert.equal(result.exitCode, 0);
    const output = parseOutput(result.stdout);
    assert.deepEqual(output.candidates, []);
    assert.deepEqual(output.deleted, []);
    assert.deepEqual(output.protected, [{ reason: "active-stress-session", runId: "stress_20260429_002" }]);
    await stat(join(workspace, ".protostar", "stress", "stress_20260429_002"));
  });

  it("deletes only selected terminal session artifact directories when confirmed", async () => {
    const workspace = await tempWorkspace();
    await createStressSession(workspace, {
      sessionId: "stress_20260429_003",
      ageMs: days(8),
      cursorStatus: "completed",
      finishedAt: "2026-04-29T00:10:00Z"
    });
    const refusalsPath = join(workspace, ".protostar", "refusals.jsonl");
    await writeFile(refusalsPath, "{\"sessionId\":\"stress_20260429_003\"}\n", "utf8");
    const before = await sha256(refusalsPath);

    const result = await runPrune(workspace, ["--older-than", "7d", "--confirm"]);

    assert.equal(result.exitCode, 0);
    const output = parseOutput(result.stdout);
    assert.deepEqual(output.deleted, [{ runId: "stress_20260429_003" }]);
    await assertMissing(join(workspace, ".protostar", "stress", "stress_20260429_003", "events.jsonl"));
    assert.equal(await sha256(refusalsPath), before);
  });

  for (const status of ["created", "running", "cancelling", "repairing", "ready-to-release"] as const) {
    it(`protects active status ${status}`, async () => {
      const workspace = await tempWorkspace();
      await createRun(workspace, { runId: "active_run", status, archetype: "cosmetic-tweak", ageMs: days(8) });

      const result = await runPrune(workspace, ["--older-than", "7d", "--confirm"]);

      const output = parseOutput(result.stdout);
      assert.deepEqual(output.candidates, []);
      assert.deepEqual(output.deleted, []);
      assert.deepEqual(output.protected, [{ reason: `active-${status}`, runId: "active_run" }]);
      await stat(join(workspace, ".protostar", "runs", "active_run"));
    });
  }
});

interface CommandResult {
  readonly exitCode: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutChunks: readonly string[];
}

interface PruneOutput {
  readonly scanned: number;
  readonly candidates: readonly {
    readonly runId: string;
    readonly mtimeMs: number;
    readonly status: string;
    readonly archetype: string | null;
    readonly eventsJsonlSha256?: string;
  }[];
  readonly protected: readonly { readonly runId: string; readonly reason: string }[];
  readonly deleted: readonly { readonly runId: string }[];
  readonly dryRun: boolean;
}

async function runPrune(workspace: string, args: readonly string[]): Promise<CommandResult> {
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

  await buildPruneCommand().parseAsync([...args], { from: "user" });

  return {
    exitCode: typeof process.exitCode === "number" ? process.exitCode : undefined,
    stdout: stdoutChunks.join(""),
    stderr: stderrChunks.join(""),
    stdoutChunks
  };
}

async function tempWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "prune-command-"));
  tempRoots.push(workspace);
  await writeFile(join(workspace, "pnpm-workspace.yaml"), "packages: []\n", "utf8");
  await mkdir(join(workspace, ".protostar", "runs"), { recursive: true });
  await mkdir(join(workspace, ".protostar", "dogfood"), { recursive: true });
  await mkdir(join(workspace, ".protostar", "stress"), { recursive: true });
  return workspace;
}

async function createRun(
  workspace: string,
  input: {
    readonly runId: string;
    readonly status: FactoryRunStatus;
    readonly archetype: string;
    readonly ageMs: number;
  }
): Promise<string> {
  const runDir = join(workspace, ".protostar", "runs", input.runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "manifest.json"), `${JSON.stringify(manifest(input), null, 2)}\n`, "utf8");
  const mtime = new Date(Date.now() - input.ageMs);
  await utimes(runDir, mtime, mtime);
  return runDir;
}

function manifest(input: {
  readonly runId: string;
  readonly status: FactoryRunStatus;
  readonly archetype: string;
}): FactoryRunManifest & { readonly archetype: string } {
  return {
    runId: input.runId,
    intentId: "intent_1" as never,
    archetype: input.archetype,
    status: input.status,
    createdAt: "2026-04-28T00:00:00.000Z",
    stages: []
  };
}

function parseOutput(stdout: string): PruneOutput {
  return JSON.parse(stdout) as PruneOutput;
}

function days(count: number): number {
  return count * 86_400_000;
}

async function sha256(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function assertMissing(path: string): Promise<void> {
  await assert.rejects(access(path), /ENOENT/);
}

async function createDogfoodSession(
  workspace: string,
  input: {
    readonly sessionId: string;
    readonly ageMs: number;
    readonly completed: number;
    readonly totalRuns: number;
  }
): Promise<string> {
  const sessionDir = join(workspace, ".protostar", "dogfood", input.sessionId);
  await mkdir(sessionDir, { recursive: true });
  await writeFile(
    join(sessionDir, "cursor"),
    `${JSON.stringify(
      {
        sessionId: input.sessionId,
        totalRuns: input.totalRuns,
        completed: input.completed,
        runs: []
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  const mtime = new Date(Date.now() - input.ageMs);
  await utimes(sessionDir, mtime, mtime);
  return sessionDir;
}

async function createStressSession(
  workspace: string,
  input: {
    readonly sessionId: string;
    readonly ageMs: number;
    readonly cursorStatus: "running" | "completed" | "aborted";
    readonly finishedAt?: string;
  }
): Promise<string> {
  const sessionDir = join(workspace, ".protostar", "stress", input.sessionId);
  await mkdir(sessionDir, { recursive: true });
  await writeFile(
    join(sessionDir, "cursor.json"),
    `${JSON.stringify(
      {
        sessionId: input.sessionId,
        shape: "sustained-load",
        status: input.cursorStatus,
        startedAt: "2026-04-29T00:00:00Z",
        ...(input.finishedAt !== undefined ? { finishedAt: input.finishedAt } : {}),
        completed: input.cursorStatus === "completed" ? 1 : 0,
        runs: input.cursorStatus === "completed"
          ? [
              {
                runId: "run_one",
                seedId: "button-color-hover",
                archetype: "cosmetic-tweak",
                outcome: "pass",
                durationMs: 60000
              }
            ]
          : []
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await writeFile(
    join(sessionDir, "events.jsonl"),
    "{\"at\":\"2026-04-29T00:00:01Z\",\"payload\":{\"runId\":\"run_one\"},\"sequence\":1,\"sessionId\":\"stress_20260429_001\",\"type\":\"run-started\"}\n",
    "utf8"
  );
  if (input.finishedAt !== undefined) {
    await writeFile(
      join(sessionDir, "stress-report.json"),
      `${JSON.stringify({
        finishedAt: input.finishedAt,
        headlessMode: "local-daemon",
        llmBackend: "mock",
        perArchetype: [
          {
            archetype: "cosmetic-tweak",
            met: true,
            passRate: 1,
            passes: 1,
            runs: 1,
            threshold: 0.8
          }
        ],
        perRun: [
          {
            archetype: "cosmetic-tweak",
            durationMs: 60000,
            outcome: "pass",
            runId: "run_one",
            seedId: "button-color-hover"
          }
        ],
        sessionId: input.sessionId,
        shape: "sustained-load",
        startedAt: "2026-04-29T00:00:00Z",
        totalRuns: 1
      })}\n`,
      "utf8"
    );
  }
  const mtime = new Date(Date.now() - input.ageMs);
  await utimes(sessionDir, mtime, mtime);
  return sessionDir;
}
