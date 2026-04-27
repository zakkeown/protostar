import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import { appendAdmissionDecisionIndexEntry, formatAdmissionDecisionIndexLine } from "./admission-decisions-index.js";

describe("admission-decisions.jsonl index writer", () => {
  it("formats one stable JSON line", () => {
    const line = formatAdmissionDecisionIndexLine({
      runId: "run_123",
      timestamp: "2026-04-27T00:00:00.000Z",
      gate: "intent",
      outcome: "allow",
      artifactPath: "runs/run_123/intent-admission-decision.json",
      schemaVersion: "1.0.0",
      precedenceStatus: "no-conflict"
    });

    assert.equal(line.endsWith("\n"), true);
    assert.deepEqual(JSON.parse(line), {
      runId: "run_123",
      timestamp: "2026-04-27T00:00:00.000Z",
      gate: "intent",
      outcome: "allow",
      artifactPath: "runs/run_123/intent-admission-decision.json",
      schemaVersion: "1.0.0",
      precedenceStatus: "no-conflict"
    });
  });

  it("creates parent directories and preserves appended lines", async () => {
    await withTempDir(async (tempDir) => {
      const jsonlPath = resolve(tempDir, "nested", "admission-decisions.jsonl");

      await appendAdmissionDecisionIndexEntry(jsonlPath, {
        runId: "run_1",
        timestamp: "2026-04-27T00:00:00.000Z",
        gate: "intent",
        outcome: "allow",
        artifactPath: "runs/run_1/intent-admission-decision.json",
        schemaVersion: "1.0.0",
        precedenceStatus: "no-conflict"
      });
      await appendAdmissionDecisionIndexEntry(jsonlPath, {
        runId: "run_1",
        timestamp: "2026-04-27T00:00:01.000Z",
        gate: "planning",
        outcome: "block",
        artifactPath: "runs/run_1/planning-admission-decision.json",
        schemaVersion: "1.0.0",
        precedenceStatus: "blocked-by-tier"
      });

      const lines = (await readFile(jsonlPath, "utf8")).trimEnd().split("\n");
      assert.equal(lines.length, 2);
      assert.equal(JSON.parse(lines[0] ?? "{}").gate, "intent");
      assert.equal(JSON.parse(lines[1] ?? "{}").gate, "planning");
    });
  });
});

async function withTempDir(callback: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(resolve(tmpdir(), "protostar-admission-index-"));
  try {
    await callback(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
