import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, afterEach, beforeEach, describe, it } from "node:test";

import { seedLibrary } from "@protostar/fixtures";

import { buildDogfoodStepCommand } from "./__dogfood-step.js";
import { parseCursor } from "../dogfood/cursor-schema.js";
import { formatReport, parseReport } from "../dogfood/report-schema.js";

const tempRoots: string[] = [];
const originalCwd = process.cwd();
const originalStdoutWrite = process.stdout.write;
const originalStderrWrite = process.stderr.write;

describe("__dogfood-step", () => {
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

  it("begin creates cursor and is idempotent on re-run", async () => {
    const workspace = await tempWorkspace();
    await runStep(workspace, ["--session", "session_1", "--action", "begin", "--total", "3"]);
    await runStep(workspace, ["--session", "session_1", "--action", "begin", "--total", "999"]);

    const cursor = parseCursor(JSON.parse(await readFile(join(workspace, ".protostar", "dogfood", "session_1", "cursor"), "utf8")));
    assert.equal(cursor.totalRuns, 3);
    assert.equal(cursor.completed, 0);
  });

  it("next-seed --json rotates round-robin as record advances the cursor", async () => {
    const workspace = await tempWorkspace();
    await runStep(workspace, ["--session", "session_2", "--action", "begin", "--total", "4"]);

    const first = await runStep(workspace, ["--session", "session_2", "--action", "next-seed", "--json"]);
    const firstJson = JSON.parse(first.stdout) as { readonly seedId: string; readonly draftPath: string };
    assert.equal(firstJson.seedId, seedLibrary["cosmetic-tweak"][0]?.id);
    const draft = JSON.parse(await readFile(firstJson.draftPath, "utf8")) as {
      readonly capabilityEnvelope?: {
        readonly repoScopes?: readonly { readonly workspace?: string; readonly path?: string; readonly access?: string }[];
        readonly delivery?: { readonly target?: Record<string, string> };
      };
    };
    assert.match(JSON.stringify(draft), /button-color-hover/);
    assert.deepEqual(draft.capabilityEnvelope?.repoScopes?.[0], {
      workspace: "protostar-toy-ttt",
      path: "src/components/PrimaryButton.tsx",
      access: "write"
    });
    assert.deepEqual(draft.capabilityEnvelope?.delivery?.target, {
      owner: "zakkeown",
      repo: "protostar-toy-ttt",
      baseBranch: "main"
    });

    await record(workspace, "session_2", "run_one", "pr-ready");
    const second = await runStep(workspace, ["--session", "session_2", "--action", "next-seed", "--json"]);
    assert.equal(JSON.parse(second.stdout).seedId, seedLibrary["cosmetic-tweak"][1]?.id);
  });

  it("record appends log.jsonl and advances the cursor", async () => {
    const workspace = await tempWorkspace();
    await runStep(workspace, ["--session", "session_3", "--action", "begin", "--total", "2"]);
    await record(workspace, "session_3", "run_one", "ci-timeout", "", "timeout");

    const sessionDir = join(workspace, ".protostar", "dogfood", "session_3");
    const cursor = parseCursor(JSON.parse(await readFile(join(sessionDir, "cursor"), "utf8")));
    const logLines = (await readFile(join(sessionDir, "log.jsonl"), "utf8")).trim().split("\n");
    assert.equal(cursor.completed, 1);
    assert.equal(cursor.runs[0]?.runId, "run_one");
    assert.equal(logLines.length, 1);
    assert.equal(JSON.parse(logLines[0] ?? "{}").ciVerdict, "timeout");
  });

  it("is hidden from root help", async () => {
    const result = await runBuiltCli(["--help"]);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout.includes("__dogfood-step"), false);
    assert.equal(result.stderr.includes("__dogfood-step"), false);
  });

  it("finalize writes a byte-stable report.json", async () => {
    const workspace = await tempWorkspace();
    await runStep(workspace, ["--session", "session_5", "--action", "begin", "--total", "1"]);
    await record(
      workspace,
      "session_5",
      "run_one",
      "pr-ready",
      "https://github.com/zakkeown/protostar-toy-ttt/pull/42",
      "success"
    );

    const finalize = await runStep(workspace, ["--session", "session_5", "--action", "finalize"]);
    assert.match(finalize.stderr, /dogfood session session_5: 1\/1 pr-ready \(100%\)/);
    const reportPath = join(workspace, ".protostar", "dogfood", "session_5", "report.json");
    const reportText = await readFile(reportPath, "utf8");
    const report = parseReport(JSON.parse(reportText));
    assert.equal(report.passRate, 1);
    assert.equal(formatReport(report), reportText);
  });
});

async function record(
  workspace: string,
  sessionId: string,
  runId: string,
  outcome: string,
  prUrl = "",
  ciVerdict = "skipped"
): Promise<void> {
  await runStep(workspace, [
    "--session",
    sessionId,
    "--action",
    "record",
    "--runId",
    runId,
    "--pr-url",
    prUrl,
    "--ci-verdict",
    ciVerdict,
    "--outcome",
    outcome,
    "--started-at",
    "2026-04-29T00:00:00Z",
    "--finished-at",
    "2026-04-29T00:01:00Z"
  ]);
}

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

  await buildDogfoodStepCommand().parseAsync([...args], { from: "user" });
  assert.equal(process.exitCode ?? 0, 0, stderrChunks.join(""));
  return {
    stdout: stdoutChunks.join(""),
    stderr: stderrChunks.join("")
  };
}

async function tempWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "dogfood-step-"));
  tempRoots.push(workspace);
  await writeFile(join(workspace, "pnpm-workspace.yaml"), "packages: []\n", "utf8");
  await mkdir(join(workspace, ".protostar", "runs"), { recursive: true });
  return workspace;
}

function runBuiltCli(args: readonly string[]): Promise<{ readonly exitCode: number | null; readonly stdout: string; readonly stderr: string }> {
  const cliPath = fileURLToPath(new URL("../main.js", import.meta.url));
  return new Promise((resolve, reject) => {
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
      resolve({ exitCode, stdout, stderr });
    });
  });
}
