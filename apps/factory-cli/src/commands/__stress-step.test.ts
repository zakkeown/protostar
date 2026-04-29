import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, afterEach, beforeEach, describe, it } from "node:test";

import { buildStressStepCommand } from "./__stress-step.js";

const tempRoots: string[] = [];
const originalCwd = process.cwd();
const originalStdoutWrite = process.stdout.write;
const originalStderrWrite = process.stderr.write;

describe("__stress-step", () => {
  beforeEach(() => {
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exitCode = undefined;
  });

  after(async () => {
    await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  });

  it("begin creates a stress cursor and emits JSON only with --json", async () => {
    const workspace = await tempWorkspace();

    const quiet = await runStep(workspace, [
      "--session",
      "stress_20260429_009",
      "--action",
      "begin",
      "--shape",
      "sustained-load"
    ]);
    assert.equal(quiet.stdout, "");

    const json = await runStep(workspace, [
      "--session",
      "stress_20260429_010",
      "--action",
      "begin",
      "--shape",
      "sustained-load",
      "--json"
    ]);
    const output = JSON.parse(json.stdout) as { readonly sessionId: string; readonly cursorPath: string };
    assert.equal(output.sessionId, "stress_20260429_010");
    assert.equal(output.cursorPath.endsWith("/.protostar/stress/stress_20260429_010/cursor.json"), true);
  });

  it("exposes next-seed, materialize-draft, sign-intent, append-event, record-run, finalize, cap-breach, and wedge actions", async () => {
    const workspace = await tempWorkspace();
    await writePermissiveRepoPolicy(workspace);
    await writeFactoryConfig(workspace);
    await runStep(workspace, [
      "--session",
      "stress_20260429_011",
      "--action",
      "begin",
      "--shape",
      "sustained-load"
    ]);

    const nextSeed = await runStep(workspace, [
      "--session",
      "stress_20260429_011",
      "--action",
      "next-seed",
      "--seed-archetypes",
      "cosmetic-tweak,feature-add",
      "--run-index",
      "3",
      "--json"
    ]);
    assert.equal(JSON.parse(nextSeed.stdout).seedId, "ttt-game");

    const materialized = await runStep(workspace, [
      "--session",
      "stress_20260429_011",
      "--action",
      "materialize-draft",
      "--seed-archetypes",
      "feature-add",
      "--seed-id",
      "ttt-game",
      "--run-index",
      "0",
      "--run-id",
      "run_ttt_004",
      "--json"
    ]);
    assert.equal(JSON.parse(materialized.stdout).draftPath.endsWith("/intent.draft.json"), true);

    const signed = await runStep(workspace, [
      "--session",
      "stress_20260429_011",
      "--action",
      "sign-intent",
      "--run-id",
      "run_ttt_004",
      "--draft",
      JSON.parse(materialized.stdout).draftPath,
      "--json"
    ]);
    assert.equal(JSON.parse(signed.stdout).confirmedIntentPath.endsWith("/confirmed-intent.json"), true);

    const event = await runStep(workspace, [
      "--session",
      "stress_20260429_011",
      "--action",
      "append-event",
      "--event-type",
      "run-started",
      "--payload-json",
      "{\"runId\":\"run_ttt_004\"}",
      "--json"
    ]);
    assert.equal(JSON.parse(event.stdout).sequence, 1);

    await runStep(workspace, [
      "--session",
      "stress_20260429_011",
      "--action",
      "record-run",
      "--run-id",
      "run_ttt_004",
      "--seed-id",
      "ttt-game",
      "--archetype",
      "feature-add",
      "--outcome",
      "pass",
      "--duration-ms",
      "1234"
    ]);

    await runStep(workspace, [
      "--session",
      "stress_20260429_011",
      "--action",
      "cap-breach",
      "--shape",
      "sustained-load",
      "--cap-kind",
      "run-count",
      "--cap-value",
      "501",
      "--cap-limit",
      "500",
      "--cap-source",
      "factory.stress.caps"
    ]);
    await runStep(workspace, [
      "--session",
      "stress_20260429_011",
      "--action",
      "wedge",
      "--run-id",
      "run_ttt_004",
      "--p95-ms",
      "1000",
      "--idle-ms",
      "5001"
    ]);
    await runStep(workspace, [
      "--session",
      "stress_20260429_011",
      "--action",
      "finalize",
      "--headless-mode",
      "local-daemon",
      "--llm-backend",
      "mock"
    ]);

    assert.match(
      await readFile(join(workspace, ".protostar", "stress", "stress_20260429_011", "events.jsonl"), "utf8"),
      /run-started/
    );
    await readFile(
      join(workspace, ".protostar", "stress", "stress_20260429_011", "phase-11-cap-breach.json"),
      "utf8"
    );
    await readFile(join(workspace, ".protostar", "stress", "stress_20260429_011", "wedge-evidence.json"), "utf8");
  });

  it("is hidden from root help", async () => {
    const result = await runBuiltCli(["--help"]);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout.includes("__stress-step"), false);
    assert.equal(result.stderr.includes("__stress-step"), false);
  });
});

async function runStep(workspace: string, args: readonly string[]): Promise<{ readonly stdout: string; readonly stderr: string }> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  process.chdir(workspace);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdoutChunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderrChunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;

  await buildStressStepCommand().parseAsync([...args], { from: "user" });
  assert.equal(process.exitCode ?? 0, 0, stderrChunks.join(""));
  return {
    stdout: stdoutChunks.join(""),
    stderr: stderrChunks.join("")
  };
}

async function tempWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "stress-step-"));
  tempRoots.push(workspace);
  await writeFile(join(workspace, "pnpm-workspace.yaml"), "packages: []\n", "utf8");
  await mkdir(join(workspace, ".protostar"), { recursive: true });
  return workspace;
}

async function writePermissiveRepoPolicy(workspace: string): Promise<void> {
  await writeFile(
    join(workspace, ".protostar", "repo-policy.json"),
    `${JSON.stringify({
      schemaVersion: "1.0.0",
      repoScopes: [
        {
          workspace: "protostar-toy-ttt",
          path: "src/App.tsx",
          access: "write"
        },
        {
          workspace: "protostar-toy-ttt",
          path: "src/components/TicTacToeBoard.tsx",
          access: "write"
        },
        {
          workspace: "protostar-toy-ttt",
          path: "src/lib/ttt-state.ts",
          access: "write"
        }
      ],
      toolPermissions: [
        {
          tool: "shell",
          permissionLevel: "use",
          reason: "Run bounded local commands needed to inspect and verify the toy app change.",
          risk: "low"
        },
        {
          tool: "network",
          permissionLevel: "use",
          reason: "Open the stress PR and inspect its required CI result.",
          risk: "low"
        }
      ],
      network: {
        allow: "allowlist",
        allowedHosts: ["github.com"]
      },
      budgetCaps: {
        timeoutMs: 900000,
        maxRepairLoops: 9
      },
      trustOverride: "trusted"
    })}\n`,
    "utf8"
  );
}

async function writeFactoryConfig(workspace: string): Promise<void> {
  await writeFile(
    join(workspace, ".protostar", "factory-config.json"),
    `${JSON.stringify({
      factory: {
        headlessMode: "local-daemon",
        llmBackend: "mock",
        nonInteractive: true
      }
    })}\n`,
    "utf8"
  );
}

function runBuiltCli(args: readonly string[]): Promise<{ readonly exitCode: number | null; readonly stdout: string; readonly stderr: string }> {
  const cliPath = fileURLToPath(new URL("../main.js", import.meta.url));
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: originalCwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolveResult({ exitCode, stdout, stderr });
    });
  });
}
