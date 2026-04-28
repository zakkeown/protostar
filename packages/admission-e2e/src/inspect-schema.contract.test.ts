import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import type { InspectOutput } from "@protostar/factory-cli/inspect-types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const cliPath = resolve(repoRoot, "apps/factory-cli/dist/main.js");
const sentinel = "JUDGE_SAID_INSPECT_TEST_SENTINEL";

describe("inspect output schema - Phase 9 Q-10/Q-11 lock", () => {
  it("emits manifest, path-indexed artifacts, summary, and never inlines trace contents", () => {
    const workspace = makeWorkspace();
    const runId = "inspect-contract";
    const runDir = join(workspace, ".protostar", "runs", runId);
    mkdirSync(join(runDir, "piles", "planning", "iter-0"), { recursive: true });
    writeFileSync(join(runDir, "manifest.json"), JSON.stringify(makeManifest(runId)), "utf8");
    writeFileSync(join(runDir, "review-gate.json"), JSON.stringify({ verdict: "pass" }), "utf8");
    writeFileSync(join(runDir, "piles", "planning", "iter-0", "trace.json"), JSON.stringify({ transcript: sentinel }), "utf8");
    writeFileSync(join(runDir, "piles", "planning", "iter-0", "result.json"), JSON.stringify({ ok: true }), "utf8");

    const result = spawnSync(process.execPath, [cliPath, "inspect", runId, "--json"], {
      cwd: workspace,
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.doesNotMatch(result.stdout, /JUDGE_SAID_INSPECT_TEST_SENTINEL/);
    const output = JSON.parse(result.stdout) as InspectOutput;
    assert.equal(output.manifest.runId, runId);
    assert.ok(Array.isArray(output.artifacts));
    assert.equal(typeof output.summary, "string");

    const trace = output.artifacts.find((artifact) => artifact.kind === "trace");
    assert.ok(trace);
    assert.deepEqual(Object.keys(trace), ["bytes", "kind", "path", "sha256", "stage"]);
    assert.equal(trace.stage, "pile");
    assert.equal(trace.path, "piles/planning/iter-0/trace.json");
    assert.equal(typeof trace.sha256, "string");
    assert.equal(typeof trace.bytes, "number");
  });
});

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "protostar-inspect-contract-"));
  writeFileSync(join(dir, "pnpm-workspace.yaml"), "packages: []\n", "utf8");
  return dir;
}

function makeManifest(runId: string): unknown {
  return {
    runId,
    intentId: "intent-inspect",
    status: "completed",
    createdAt: "2026-04-28T00:00:00.000Z",
    stages: [
      { stage: "intent", status: "passed", completedAt: "2026-04-28T00:00:01.000Z", artifacts: [] },
      { stage: "planning", status: "passed", completedAt: "2026-04-28T00:00:02.000Z", artifacts: [] },
      { stage: "execution", status: "passed", completedAt: "2026-04-28T00:00:03.000Z", artifacts: [] },
      { stage: "review", status: "passed", completedAt: "2026-04-28T00:00:04.000Z", artifacts: [] },
      { stage: "release", status: "passed", completedAt: "2026-04-28T00:00:05.000Z", artifacts: [] }
    ]
  };
}
