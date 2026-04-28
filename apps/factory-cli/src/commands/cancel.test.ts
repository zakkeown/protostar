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

import { writeCancelledManifestForSentinelAbort } from "../main.js";
import { buildCancelCommand } from "./cancel.js";

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

describe("cancel command", () => {
  it("marks a running manifest as cancelling, touches CANCEL, and emits canonical JSON", async () => {
    const workspace = await tempWorkspace();
    const runDir = await createRun(workspace, "run_cancel", "running");

    const result = await runCancel(workspace, ["run_cancel"]);

    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.equal(result.stdoutChunks.length, 1);
    const output = JSON.parse(result.stdout) as Record<string, unknown>;
    assert.deepEqual(Object.keys(output), ["action", "manifestStatus", "runId", "sentinelPath"]);
    assert.equal(output["runId"], "run_cancel");
    assert.equal(output["action"], "cancelling-requested");
    assert.equal(output["manifestStatus"], "cancelling");
    assert.equal(output["sentinelPath"], join(runDir, "CANCEL"));
    assert.equal((await readManifest(runDir)).status, "cancelling");
    await stat(join(runDir, "CANCEL"));
  });

  for (const status of ["completed", "blocked", "cancelled"] as const) {
    it(`refuses ${status} manifests with exit 4 and terminal status JSON`, async () => {
      const workspace = await tempWorkspace();
      await createRun(workspace, "run_terminal", status);

      const result = await runCancel(workspace, ["run_terminal"]);

      assert.equal(result.exitCode, 4);
      assert.match(result.stderr, new RegExp(`already ${status}`));
      assert.deepEqual(JSON.parse(result.stdout), {
        error: "already-terminal",
        runId: "run_terminal",
        terminalStatus: status
      });
    });
  }

  it("rejects invalid run ids with exit 2 and a regex hint", async () => {
    const workspace = await tempWorkspace();

    const result = await runCancel(workspace, ["../escape"]);

    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /runId must match/);
  });

  it("returns exit 3 for a missing manifest", async () => {
    const workspace = await tempWorkspace();

    const result = await runCancel(workspace, ["missing_run"]);

    assert.equal(result.exitCode, 3);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /no manifest/);
  });

  it("uses a tmp rename manifest write and documents the accepted cancelling-to-completed race", async () => {
    const source = await readFile(join(sourceDir, "commands", "cancel.ts"), "utf8");

    assert.match(source, /rename\(/);
    assert.match(source, /\.tmp/);
    assert.match(source, /cancelling -> completed/);
  });

  it("transitions cancelling to cancelled during sentinel abort teardown", async () => {
    const workspace = await tempWorkspace();
    const runDir = await createRun(workspace, "run_teardown", "cancelling");

    await writeCancelledManifestForSentinelAbort({ runDir, abortReason: "sentinel" });

    assert.equal((await readManifest(runDir)).status, "cancelled");
  });

  it("does not mark cancelled for non-sentinel abort reasons", async () => {
    const workspace = await tempWorkspace();
    const runDir = await createRun(workspace, "run_sigint", "cancelling");

    await writeCancelledManifestForSentinelAbort({ runDir, abortReason: "sigint" });

    assert.equal((await readManifest(runDir)).status, "cancelling");
  });
});

interface CommandResult {
  readonly exitCode: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutChunks: readonly string[];
}

async function runCancel(workspace: string, args: readonly string[]): Promise<CommandResult> {
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

  await buildCancelCommand().parseAsync([...args], { from: "user" });

  return {
    exitCode: typeof process.exitCode === "number" ? process.exitCode : undefined,
    stdout: stdoutChunks.join(""),
    stderr: stderrChunks.join(""),
    stdoutChunks
  };
}

async function tempWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "cancel-command-"));
  tempRoots.push(workspace);
  await writeFile(join(workspace, "pnpm-workspace.yaml"), "packages: []\n", "utf8");
  await mkdir(join(workspace, ".protostar", "runs"), { recursive: true });
  return workspace;
}

async function createRun(
  workspace: string,
  runId: string,
  status: FactoryRunStatus
): Promise<string> {
  const runDir = join(workspace, ".protostar", "runs", runId);
  await mkdir(runDir, { recursive: true });
  await writeManifest(runDir, setFactoryRunStatus(baseManifest(runId), status));
  return runDir;
}

async function readManifest(runDir: string): Promise<FactoryRunManifest> {
  return JSON.parse(await readFile(join(runDir, "manifest.json"), "utf8")) as FactoryRunManifest;
}

async function writeManifest(runDir: string, manifest: FactoryRunManifest): Promise<void> {
  await writeFile(join(runDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function baseManifest(runId: string): FactoryRunManifest {
  return createFactoryRunManifest({
    runId,
    intentId: "intent_1" as never,
    createdAt: "2026-04-28T00:00:00.000Z"
  });
}
