import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const cliPath = resolve(repoRoot, "apps/factory-cli/dist/main.js");

describe("resume stage dispatch - Phase 9 Q-15 lock", () => {
  it("operator-cancelled terminal runs exit 4 with operator-cancelled-terminal", () => {
    const workspace = makeWorkspace();
    writeRun(workspace, "cancelled-run", "cancelled");

    const result = spawnSync(process.execPath, [cliPath, "resume", "cancelled-run"], {
      cwd: workspace,
      encoding: "utf8"
    });

    assert.equal(result.status, 4);
    assert.match(result.stdout, /operator-cancelled-terminal/);
    assert.equal(JSON.parse(result.stdout).error, "operator-cancelled-terminal");
  });

  it("transient CANCEL sentinel is unlinked before fail-closed mid-execution dispatch", () => {
    const workspace = makeWorkspace();
    const runDir = writeRun(workspace, "transient-run", "running");
    writeFileSync(join(runDir, "CANCEL"), "", "utf8");
    mkdirSync(join(runDir, "execution"), { recursive: true });
    writeFileSync(
      join(runDir, "execution", "journal.jsonl"),
      `${JSON.stringify({
        schemaVersion: "1.0.0",
        kind: "task-running",
        runId: "transient-run",
        planTaskId: "T2",
        at: "2026-04-28T00:00:00.000Z",
        attempt: 0,
        seq: 1
      })}\n`,
      "utf8"
    );

    const result = spawnSync(process.execPath, [cliPath, "resume", "transient-run"], {
      cwd: workspace,
      encoding: "utf8"
    });

    assert.equal(result.status, 6, result.stderr);
    assert.equal(existsSync(join(runDir, "CANCEL")), false);
    assert.match(result.stderr, /clearing transient cancel sentinel before resume/);
    assert.match(result.stderr, /real mid-execution resume is not wired/);
  });

  it("completed runs exit 6 as not resumable", () => {
    const workspace = makeWorkspace();
    writeRun(workspace, "completed-run", "completed");

    const result = spawnSync(process.execPath, [cliPath, "resume", "completed-run"], {
      cwd: workspace,
      encoding: "utf8"
    });

    assert.equal(result.status, 6);
    assert.match(result.stderr, /manifest.status=completed is terminal/);
  });
});

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "protostar-resume-contract-"));
  writeFileSync(join(dir, "pnpm-workspace.yaml"), "packages: []\n", "utf8");
  return dir;
}

function writeRun(workspace: string, runId: string, status: string): string {
  const runDir = join(workspace, ".protostar", "runs", runId);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "manifest.json"), JSON.stringify(makeManifest(runId, status)), "utf8");
  return runDir;
}

function makeManifest(runId: string, status: string): unknown {
  return {
    runId,
    intentId: `intent-${runId}`,
    status,
    createdAt: "2026-04-28T00:00:00.000Z",
    stages: [
      { stage: "intent", status: "passed", artifacts: [] },
      { stage: "planning", status: "passed", artifacts: [] },
      { stage: "execution", status: "running", artifacts: [] },
      { stage: "review", status: "pending", artifacts: [] },
      { stage: "release", status: "pending", artifacts: [] }
    ]
  };
}
