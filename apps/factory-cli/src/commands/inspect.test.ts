import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, it } from "node:test";

import type { FactoryRunManifest } from "@protostar/artifacts";

import { buildInspectCommand } from "./inspect.js";

const originalCwd = process.cwd();
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);
const tempRoots: string[] = [];
const traceSentinel = "JUDGE_SAID_XXX_INSPECT_TEST";

afterEach(async () => {
  process.chdir(originalCwd);
  process.exitCode = undefined;
  process.stdout.write = originalStdoutWrite as typeof process.stdout.write;
  process.stderr.write = originalStderrWrite as typeof process.stderr.write;
  await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("inspect command", () => {
  it("emits one canonical InspectOutput JSON value for a populated run", async () => {
    const workspace = await tempWorkspace();
    const runDir = await createPopulatedRun(workspace, "run_inspect");
    const manifest = JSON.parse(await readFile(join(runDir, "manifest.json"), "utf8")) as FactoryRunManifest;

    const result = await runInspect(workspace, ["run_inspect"]);

    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.equal(result.stdoutChunks.length, 1);
    const output = JSON.parse(result.stdout) as InspectOutputForTest;
    assert.deepEqual(output.manifest, manifest);
    assert.equal(output.summary.includes("run_inspect"), true);
    assert.deepEqual(Object.keys(output), ["artifacts", "manifest", "summary"]);
    assert.deepEqual(
      output.artifacts.map((artifact) => `${artifact.stage}:${artifact.kind}:${artifact.path}`),
      [
        "manifest:manifest:manifest.json",
        "plan:plan:plan.json",
        "execution:journal:execution/journal.jsonl",
        "execution:snapshot:execution/snapshot.json",
        "review:review-gate:review-gate.json",
        "evaluation:evaluation-report:evaluation-report.json",
        "evolution:evolution-snapshot:evolution/snapshot.json",
        "ci:ci-events:ci-events.jsonl",
        "pile:pile-result:piles/planning/iter-1/result.json",
        "pile:trace:piles/planning/iter-1/trace.json",
        "pile:pile-refusal:piles/planning/iter-1/refusal.json",
        "delivery:delivery-authorization:delivery/authorization.json",
        "delivery:delivery-result:delivery/result.json"
      ]
    );
    for (const artifact of output.artifacts) {
      assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
      assert.equal(typeof artifact.bytes, "number");
      assert.equal(artifact.bytes > 0, true);
    }
  });

  it("references trace.json by path and hash without inlining trace contents", async () => {
    const workspace = await tempWorkspace();
    const runDir = await createPopulatedRun(workspace, "run_trace");
    const traceText = await readFile(join(runDir, "piles", "planning", "iter-1", "trace.json"), "utf8");

    const result = await runInspect(workspace, ["run_trace"]);

    assert.match(traceText, new RegExp(traceSentinel));
    assert.doesNotMatch(result.stdout, new RegExp(traceSentinel));
    const output = JSON.parse(result.stdout) as InspectOutputForTest;
    const traceArtifact = output.artifacts.find((artifact) => artifact.kind === "trace");
    assert.equal(traceArtifact?.path, "piles/planning/iter-1/trace.json");
    assert.match(traceArtifact?.sha256 ?? "", /^[a-f0-9]{64}$/);
  });

  it("filters artifacts by --stage while preserving the manifest", async () => {
    const workspace = await tempWorkspace();
    await createPopulatedRun(workspace, "run_stage");

    const result = await runInspect(workspace, ["run_stage", "--stage", "execution"]);

    assert.equal(result.exitCode, 0);
    const output = JSON.parse(result.stdout) as InspectOutputForTest;
    assert.equal(output.manifest.runId, "run_stage");
    assert.deepEqual(
      output.artifacts.map((artifact) => artifact.stage),
      ["execution", "execution"]
    );
  });

  it("returns exit 3 for a missing run", async () => {
    const workspace = await tempWorkspace();

    const result = await runInspect(workspace, ["missing_run"]);

    assert.equal(result.exitCode, 3);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /no manifest at/);
  });

  it("returns exit 2 for an invalid run id", async () => {
    const workspace = await tempWorkspace();

    const result = await runInspect(workspace, ["../bad"]);

    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /runId must match/);
  });

  it("silently omits pile artifacts when piles is empty", async () => {
    const workspace = await tempWorkspace();
    await createRun(workspace, "run_no_piles");

    const result = await runInspect(workspace, ["run_no_piles"]);

    assert.equal(result.exitCode, 0);
    const output = JSON.parse(result.stdout) as InspectOutputForTest;
    assert.equal(output.artifacts.some((artifact) => artifact.stage === "pile"), false);
  });
});

interface InspectOutputForTest {
  readonly manifest: FactoryRunManifest;
  readonly artifacts: readonly {
    readonly stage: string;
    readonly kind: string;
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
  }[];
  readonly summary: string;
}

interface InspectResult {
  readonly exitCode: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutChunks: readonly string[];
}

async function runInspect(workspace: string, args: readonly string[]): Promise<InspectResult> {
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

  await buildInspectCommand().parseAsync([...args], { from: "user" });

  return {
    exitCode: typeof process.exitCode === "number" ? process.exitCode : undefined,
    stdout: stdoutChunks.join(""),
    stderr: stderrChunks.join(""),
    stdoutChunks
  };
}

async function tempWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "inspect-command-"));
  tempRoots.push(workspace);
  await writeFile(join(workspace, "pnpm-workspace.yaml"), "packages: []\n", "utf8");
  await mkdir(join(workspace, ".protostar", "runs"), { recursive: true });
  return workspace;
}

async function createPopulatedRun(workspace: string, runId: string): Promise<string> {
  const runDir = await createRun(workspace, runId);
  await writeJson(join(runDir, "plan.json"), { plan: "demo" });
  await writeFile(join(runDir, "execution", "journal.jsonl"), "{\"event\":\"started\"}\n", "utf8");
  await writeJson(join(runDir, "execution", "snapshot.json"), { tasks: [] });
  await writeJson(join(runDir, "review-gate.json"), { verdict: "pass" });
  await writeJson(join(runDir, "evaluation-report.json"), { verdict: "pass" });
  await writeJson(join(runDir, "evolution", "snapshot.json"), { lineageId: "lineage_1", generation: 1 });
  await writeFile(join(runDir, "ci-events.jsonl"), "{\"status\":\"ok\"}\n", "utf8");
  await writeJson(join(runDir, "piles", "planning", "iter-1", "result.json"), { ok: true });
  await writeJson(join(runDir, "piles", "planning", "iter-1", "trace.json"), { text: traceSentinel });
  await writeJson(join(runDir, "piles", "planning", "iter-1", "refusal.json"), { class: "none" });
  await writeJson(join(runDir, "delivery", "authorization.json"), { runId });
  await writeJson(join(runDir, "delivery", "result.json"), { prUrl: "https://github.com/acme/repo/pull/42" });
  return runDir;
}

async function createRun(workspace: string, runId: string): Promise<string> {
  const runDir = join(workspace, ".protostar", "runs", runId);
  await mkdir(join(runDir, "execution"), { recursive: true });
  await mkdir(join(runDir, "piles"), { recursive: true });
  await writeJson(join(runDir, "manifest.json"), manifest(runId));
  return runDir;
}

function manifest(runId: string): FactoryRunManifest {
  return {
    runId,
    intentId: "intent_1" as never,
    status: "completed",
    createdAt: "2026-04-28T00:00:00.000Z",
    stages: [
      {
        stage: "release",
        status: "passed",
        completedAt: "2026-04-28T00:12:13.000Z",
        artifacts: []
      }
    ]
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(resolve(filePath, ".."), { recursive: true });
  await writeFile(filePath, JSON.stringify(value), "utf8");
}
