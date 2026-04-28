import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, it, mock } from "node:test";
import { fileURLToPath } from "node:url";

import {
  createFactoryRunManifest,
  setFactoryRunStatus,
  type FactoryRunManifest,
  type FactoryRunStatus
} from "@protostar/artifacts";
import type { DeliveryRunOutcome } from "@protostar/delivery-runtime";
import { mintDeliveryAuthorization, type ReAuthorizeResult } from "@protostar/review";

import { buildDeliverCommand } from "./deliver.js";

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
  mock.restoreAll();
});

describe("deliver command", () => {
  it("noops completed runs with a valid PR URL and CI capture", async () => {
    const workspace = await tempWorkspace();
    await createRun(workspace, "run_delivered", "completed");
    const runDir = runPath(workspace, "run_delivered");
    await writeJson(join(runDir, "delivery", "result.json"), { prUrl: "https://github.com/acme/repo/pull/42" });
    await writeFile(join(runDir, "delivery", "ci-events.jsonl"), "{\"kind\":\"ci-terminal\"}\n", "utf8");
    const executeDelivery = mock.fn(async (): Promise<DeliveryRunOutcome> => deliveredOutcome());

    const result = await runDeliver(workspace, ["run_delivered"], { executeDelivery });

    assert.equal(result.exitCode, 0);
    assert.deepEqual(JSON.parse(result.stdout), {
      action: "noop",
      prUrl: "https://github.com/acme/repo/pull/42",
      reason: "already-delivered",
      runId: "run_delivered"
    });
    assert.equal(executeDelivery.mock.callCount(), 0);
  });

  it("re-delivers completed runs when the delivery result is missing", async () => {
    const workspace = await tempWorkspace();
    const runDir = await createAuthorizedRun(workspace, "run_retry", "completed");
    const reAuthorizeFromPayload = mock.fn(async (): Promise<ReAuthorizeResult> => ({
      ok: true,
      authorization: mintDeliveryAuthorization({ runId: "run_retry", decisionPath: "review-gate.json" })
    }));
    const executeDelivery = mock.fn(async (): Promise<DeliveryRunOutcome> => deliveredOutcome());

    const result = await runDeliver(workspace, ["run_retry"], { reAuthorizeFromPayload, executeDelivery });

    assert.equal(result.exitCode, 0);
    assert.deepEqual(JSON.parse(result.stdout), {
      action: "delivered",
      baseSha: "base-sha",
      headSha: "head-sha",
      prUrl: "https://github.com/acme/repo/pull/7",
      runId: "run_retry"
    });
    assert.equal(reAuthorizeFromPayload.mock.callCount(), 1);
    assert.equal(executeDelivery.mock.callCount(), 1);
    assert.equal((await readJson(join(runDir, "delivery", "result.json")))["prUrl"], "https://github.com/acme/repo/pull/7");
  });

  it("delivers ready-to-release runs and atomically transitions manifest to completed", async () => {
    const workspace = await tempWorkspace();
    const runDir = await createAuthorizedRun(workspace, "run_gated", "ready-to-release");
    const reAuthorizeFromPayload = mock.fn(async (): Promise<ReAuthorizeResult> => ({
      ok: true,
      authorization: mintDeliveryAuthorization({ runId: "run_gated", decisionPath: "review-gate.json" })
    }));

    const result = await runDeliver(workspace, ["run_gated"], { reAuthorizeFromPayload });

    assert.equal(result.exitCode, 0);
    assert.equal(JSON.parse(result.stdout)["action"], "delivered");
    assert.equal((await readManifest(runDir)).status, "completed");
    await assertRejectsStat(join(runDir, "manifest.json.tmp"));
  });

  for (const status of ["running", "repairing", "blocked", "cancelled", "cancelling", "created", "orphaned"] as const) {
    it(`refuses ${status} runs as conflicts`, async () => {
      const workspace = await tempWorkspace();
      await createRun(workspace, "run_conflict", status);

      const result = await runDeliver(workspace, ["run_conflict"]);

      assert.equal(result.exitCode, 4);
      assert.deepEqual(JSON.parse(result.stdout), {
        error: "conflict",
        manifestStatus: status,
        reason: `not-deliverable-from-${status}`,
        runId: "run_conflict"
      });
    });
  }

  it("returns authorization-missing when authorization.json is absent", async () => {
    const workspace = await tempWorkspace();
    await createRun(workspace, "run_no_auth", "ready-to-release");

    const result = await runDeliver(workspace, ["run_no_auth"]);

    assert.equal(result.exitCode, 4);
    assert.deepEqual(JSON.parse(result.stdout), {
      error: "authorization-missing",
      reason: "run delivery/authorization.json absent — was the run loop reach ready-to-release?",
      runId: "run_no_auth"
    });
  });

  it("surfaces reauthorization validator reasons without direct minting", async () => {
    const workspace = await tempWorkspace();
    await createAuthorizedRun(workspace, "run_gate_fail", "ready-to-release");
    const reAuthorizeFromPayload = mock.fn(async (): Promise<ReAuthorizeResult> => ({ ok: false, reason: "gate-not-pass" }));

    const result = await runDeliver(workspace, ["run_gate_fail"], { reAuthorizeFromPayload });

    assert.equal(result.exitCode, 4);
    assert.deepEqual(JSON.parse(result.stdout), {
      error: "gate-not-pass",
      reason: "gate-not-pass",
      runId: "run_gate_fail"
    });
  });

  it("rejects invalid and missing run ids with operator exit codes", async () => {
    const workspace = await tempWorkspace();

    const invalid = await runDeliver(workspace, ["../escape"]);
    const missing = await runDeliver(workspace, ["missing_run"]);

    assert.equal(invalid.exitCode, 2);
    assert.equal(missing.exitCode, 3);
  });

  it("keeps the security boundary in source: reAuthorizeFromPayload only, no direct mint import", async () => {
    const source = await readFile(join(sourceDir, "commands", "deliver.ts"), "utf8");

    assert.match(source, /reAuthorizeFromPayload/);
    assert.doesNotMatch(source, /mintDeliveryAuthorization/);
  });
});

interface CommandResult {
  readonly exitCode: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
}

type DeliverDeps = NonNullable<Parameters<typeof buildDeliverCommand>[0]>;

async function runDeliver(workspace: string, args: readonly string[], deps: DeliverDeps = {}): Promise<CommandResult> {
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

  await buildDeliverCommand(deps).parseAsync([...args], { from: "user" });

  return {
    exitCode: typeof process.exitCode === "number" ? process.exitCode : undefined,
    stdout: stdoutChunks.join(""),
    stderr: stderrChunks.join("")
  };
}

async function tempWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "deliver-command-"));
  tempRoots.push(workspace);
  await writeFile(join(workspace, "pnpm-workspace.yaml"), "packages: []\n", "utf8");
  await mkdir(join(workspace, ".protostar", "runs"), { recursive: true });
  return workspace;
}

function runPath(workspace: string, runId: string): string {
  return join(workspace, ".protostar", "runs", runId);
}

async function createAuthorizedRun(
  workspace: string,
  runId: string,
  status: FactoryRunStatus
): Promise<string> {
  const runDir = await createRun(workspace, runId, status);
  await writeJson(join(runDir, "review-gate.json"), {
    runId,
    mechanical: "pass",
    model: "pass"
  });
  await writeJson(join(runDir, "delivery", "authorization.json"), authorizationPayload(runId));
  return runDir;
}

async function createRun(workspace: string, runId: string, status: FactoryRunStatus): Promise<string> {
  const runDir = runPath(workspace, runId);
  await mkdir(runDir, { recursive: true });
  await writeJson(join(runDir, "manifest.json"), setFactoryRunStatus(baseManifest(runId), status));
  return runDir;
}

function baseManifest(runId: string): FactoryRunManifest {
  return createFactoryRunManifest({
    runId,
    intentId: "intent_1" as never,
    createdAt: "2026-04-28T00:00:00.000Z"
  });
}

function authorizationPayload(runId: string) {
  return {
    schemaVersion: "1.0.0",
    runId,
    decisionPath: "review-gate.json",
    target: { owner: "acme", repo: "repo", baseBranch: "main" },
    branchName: `protostar/cosmetic-tweak/${runId}`,
    title: "Deliver the factory run",
    body: "Ready to deliver.",
    headSha: "head-sha",
    baseSha: "base-sha",
    mintedAt: "2026-04-28T00:00:00.000Z"
  };
}

function deliveredOutcome(): DeliveryRunOutcome {
  return {
    status: "delivered",
    prUrl: "https://github.com/acme/repo/pull/7",
    prNumber: 7,
    headSha: "head-sha",
    baseSha: "base-sha",
    initialCiSnapshot: {
      at: "2026-04-28T00:00:01.000Z",
      checks: []
    },
    evidenceComments: [],
    commentFailures: []
  };
}

async function readManifest(runDir: string): Promise<FactoryRunManifest> {
  return JSON.parse(await readFile(join(runDir, "manifest.json"), "utf8")) as FactoryRunManifest;
}

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(resolve(filePath, ".."), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function assertRejectsStat(filePath: string): Promise<void> {
  await assert.rejects(stat(filePath), Object);
}
