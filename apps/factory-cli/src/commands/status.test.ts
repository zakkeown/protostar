import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, it } from "node:test";

import type { FactoryRunManifest, FactoryRunStatus } from "@protostar/artifacts";

import { buildStatusCommand } from "./status.js";

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

describe("status command", () => {
  it("renders a human table to stdout in one chunk", async () => {
    const workspace = await tempWorkspace();
    await createRun(workspace, { runId: "run_a", archetype: "cosmetic-tweak", status: "completed" });
    await createRun(workspace, { runId: "run_b", archetype: "bugfix", status: "blocked" });
    await createRun(workspace, { runId: "run_c", archetype: "refactor", status: "running" });

    const result = await runStatus(workspace, []);

    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.equal(result.stdoutChunks.length, 1);
    assert.match(result.stdout, /RUN ID\s+ARCHETYPE\s+VERDICT\s+DURATION/);
    assert.match(result.stdout, /run_c/);
    assert.match(result.stdout, /run_b/);
    assert.match(result.stdout, /run_a/);
  });

  it("emits StatusRowMinimal[] as one canonical JSON chunk with --json", async () => {
    const workspace = await tempWorkspace();
    await createRun(workspace, { runId: "run_json", archetype: "cosmetic-tweak", status: "completed" });

    const result = await runStatus(workspace, ["--json"]);

    assert.equal(result.exitCode, 0);
    assert.equal(result.stdoutChunks.length, 1);
    const rows = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    assert.deepEqual(Object.keys(rows[0] ?? {}), ["archetype", "durationMs", "runId", "verdict"]);
    assert.equal(rows[0]?.["runId"], "run_json");
    assert.equal(rows[0]?.["verdict"], "pass");
  });

  it("emits StatusRowFull[] with --json --full and reads optional artifacts", async () => {
    const workspace = await tempWorkspace();
    const runDir = await createRun(workspace, {
      runId: "run_full",
      archetype: "cosmetic-tweak",
      status: "completed"
    });
    await writeJson(join(runDir, "evolution", "snapshot.json"), { lineageId: "lineage_a", generation: 3 });
    await writeJson(join(runDir, "delivery", "result.json"), { prUrl: "https://github.com/acme/repo/pull/7" });

    const result = await runStatus(workspace, ["--json", "--full"]);

    assert.equal(result.exitCode, 0);
    const rows = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    assert.equal(rows[0]?.["runId"], "run_full");
    assert.equal(rows[0]?.["lineageId"], "lineage_a");
    assert.equal(rows[0]?.["generation"], 3);
    assert.equal(rows[0]?.["prUrl"], "https://github.com/acme/repo/pull/7");
    assert.equal(rows[0]?.["reviewVerdict"], "pass");
    assert.equal(rows[0]?.["evaluationVerdict"], "pass");
  });

  it("rejects invalid --run values with exit 2 and the regex hint", async () => {
    const workspace = await tempWorkspace();

    const result = await runStatus(workspace, ["--run", "../nope", "--json"]);

    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /runId must match/);
  });

  it("emits a single JSON object for --run <validId> --json", async () => {
    const workspace = await tempWorkspace();
    await createRun(workspace, { runId: "run_one", archetype: "bugfix", status: "blocked" });

    const result = await runStatus(workspace, ["--run", "run_one", "--json"]);

    assert.equal(result.exitCode, 0);
    const row = JSON.parse(result.stdout) as Record<string, unknown>;
    assert.equal(Array.isArray(row), false);
    assert.equal(row["runId"], "run_one");
    assert.equal(row["verdict"], "block");
  });

  it("returns exit 3 for a missing --run id", async () => {
    const workspace = await tempWorkspace();

    const result = await runStatus(workspace, ["--run", "missing_run", "--json"]);

    assert.equal(result.exitCode, 3);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /not found/i);
  });

  it("filters --since through parseDuration", async () => {
    const workspace = await tempWorkspace();
    await createRun(workspace, { runId: "run_old", archetype: "bugfix", status: "completed", mtimeMs: Date.now() - 3_700_000 });
    await createRun(workspace, { runId: "run_new", archetype: "bugfix", status: "completed", mtimeMs: Date.now() - 10_000 });

    const result = await runStatus(workspace, ["--json", "--since", "1h"]);

    const rows = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    assert.deepEqual(rows.map((row) => row["runId"]), ["run_new"]);
  });

  it("rejects malformed --since values with exit 2", async () => {
    const workspace = await tempWorkspace();

    const result = await runStatus(workspace, ["--since", "bogus"]);

    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /duration must match/);
  });

  it("--all ignores the default limit", async () => {
    const workspace = await tempWorkspace();
    for (let index = 0; index < 26; index += 1) {
      await createRun(workspace, {
        runId: `run_${index}`,
        archetype: "bugfix",
        status: "completed",
        mtimeMs: 1_700_000_000_000 + index * 1000
      });
    }

    const limited = await runStatus(workspace, ["--json"]);
    const all = await runStatus(workspace, ["--json", "--all"]);

    assert.equal((JSON.parse(limited.stdout) as unknown[]).length, 25);
    assert.equal((JSON.parse(all.stdout) as unknown[]).length, 26);
  });

  it("intersects --limit and --since", async () => {
    const workspace = await tempWorkspace();
    const recentBase = Date.now() - 1_000;
    await createRun(workspace, { runId: "run_1", archetype: "bugfix", status: "completed", mtimeMs: recentBase });
    await createRun(workspace, { runId: "run_2", archetype: "bugfix", status: "completed", mtimeMs: recentBase + 1 });
    await createRun(workspace, { runId: "run_3", archetype: "bugfix", status: "completed", mtimeMs: recentBase + 2 });

    const result = await runStatus(workspace, ["--json", "--limit", "2", "--since", "24h"]);

    const rows = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    assert.deepEqual(rows.map((row) => row["runId"]), ["run_3", "run_2"]);
  });

  it("derives state=orphaned for stale running manifests using config threshold", async () => {
    const workspace = await tempWorkspace({ livenessThresholdMs: 1000 });
    const runDir = await createRun(workspace, { runId: "run_stale", archetype: "bugfix", status: "running" });
    const journalPath = join(runDir, "execution", "journal.jsonl");
    await writeFile(journalPath, "{}\n", "utf8");
    const staleTime = new Date(Date.now() - 10_000);
    await utimes(journalPath, staleTime, staleTime);

    const result = await runStatus(workspace, ["--json", "--full"]);

    const rows = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    assert.equal(rows[0]?.["state"], "orphaned");
  });
});

interface StatusResult {
  readonly exitCode: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutChunks: readonly string[];
}

async function runStatus(workspace: string, args: readonly string[]): Promise<StatusResult> {
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

  await buildStatusCommand().parseAsync([...args], { from: "user" });

  return {
    exitCode: typeof process.exitCode === "number" ? process.exitCode : undefined,
    stdout: stdoutChunks.join(""),
    stderr: stderrChunks.join(""),
    stdoutChunks
  };
}

async function tempWorkspace(config?: { readonly livenessThresholdMs?: number }): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "status-command-"));
  tempRoots.push(workspace);
  await writeFile(join(workspace, "pnpm-workspace.yaml"), "packages: []\n", "utf8");
  await mkdir(join(workspace, ".protostar", "runs"), { recursive: true });
  if (config?.livenessThresholdMs !== undefined) {
    await writeJson(join(workspace, ".protostar", "factory-config.json"), {
      operator: { livenessThresholdMs: config.livenessThresholdMs }
    });
  }
  return workspace;
}

async function createRun(
  workspace: string,
  input: {
    readonly runId: string;
    readonly archetype: string;
    readonly status: FactoryRunStatus;
    readonly mtimeMs?: number;
  }
): Promise<string> {
  const runDir = join(workspace, ".protostar", "runs", input.runId);
  await mkdir(join(runDir, "execution"), { recursive: true });
  await writeJson(join(runDir, "manifest.json"), manifest(input));
  await writeJson(join(runDir, "review-gate.json"), {
    verdict: input.status === "blocked" ? "block" : "pass"
  });
  await writeJson(join(runDir, "evaluation-report.json"), {
    verdict: input.status === "blocked" ? "fail" : "pass"
  });
  const mtime = new Date(input.mtimeMs ?? Date.now());
  await utimes(runDir, mtime, mtime);
  return runDir;
}

function manifest(input: {
  readonly runId: string;
  readonly archetype: string;
  readonly status: FactoryRunStatus;
}): FactoryRunManifest & { readonly archetype: string } {
  return {
    runId: input.runId,
    intentId: "intent_1" as never,
    archetype: input.archetype,
    status: input.status,
    createdAt: "2026-04-28T00:00:00.000Z",
    stages: [
      {
        stage: "release",
        status: input.status === "completed" ? "passed" : "pending",
        ...(input.status === "completed" ? { completedAt: "2026-04-28T00:00:03.000Z" } : {}),
        artifacts: []
      }
    ]
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(resolve(filePath, ".."), { recursive: true });
  await writeFile(filePath, JSON.stringify(value), "utf8");
}
