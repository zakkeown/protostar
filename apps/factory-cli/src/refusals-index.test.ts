import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import {
  appendRefusalIndexEntry,
  buildTerminalStatusArtifact,
  formatRefusalIndexLine,
  REFUSAL_INDEX_SCHEMA_VERSION,
  REFUSALS_INDEX_FILE_NAME,
  TERMINAL_STATUS_ARTIFACT_NAME,
  type RefusalIndexEntry
} from "./refusals-index.js";

const sampleEntry: RefusalIndexEntry = {
  runId: "run_2026_unit_sample",
  timestamp: "2026-04-26T12:00:00.000Z",
  stage: "intent",
  reason: "ambiguity gate blocked draft promotion",
  artifactPath: ".protostar/runs/run_2026_unit_sample/clarification-report.json",
  schemaVersion: "1.0.0"
};

describe("formatRefusalIndexLine", () => {
  it("returns a string ending in a single trailing newline", () => {
    const line = formatRefusalIndexLine(sampleEntry);
    assert.equal(line.endsWith("\n"), true, "Line must end with \\n.");
    assert.equal(line.endsWith("\n\n"), false, "Line must not end with double newline.");
    assert.equal(line.split("\n").filter((segment) => segment.length > 0).length, 1, "Line must contain one JSON object.");
  });

  it("produces valid JSON when the trailing newline is trimmed", () => {
    const line = formatRefusalIndexLine(sampleEntry);
    const trimmed = line.slice(0, -1);
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    assert.equal(typeof parsed, "object");
    assert.notEqual(parsed, null);
  });

  it("preserves every field of the input entry byte-equal after JSON round-trip", () => {
    const line = formatRefusalIndexLine(sampleEntry);
    const parsed = JSON.parse(line.slice(0, -1)) as Record<string, unknown>;
    assert.equal(parsed["runId"], sampleEntry.runId);
    assert.equal(parsed["timestamp"], sampleEntry.timestamp);
    assert.equal(parsed["stage"], sampleEntry.stage);
    assert.equal(parsed["reason"], sampleEntry.reason);
    assert.equal(parsed["artifactPath"], sampleEntry.artifactPath);
    assert.equal(parsed["schemaVersion"], sampleEntry.schemaVersion);
  });

  it("is deterministic — repeated calls on the same input return identical strings", () => {
    const a = formatRefusalIndexLine(sampleEntry);
    const b = formatRefusalIndexLine(sampleEntry);
    assert.equal(a, b);
  });

  // Phase 6 Plan 06-07 Task 1 — refusal-stage extension for pile failures (Q-12).
  it("formats a pile-planning refusal entry as a single JSON line", () => {
    const entry: RefusalIndexEntry = {
      ...sampleEntry,
      stage: "pile-planning",
      reason: "pile-timeout: planning pile elapsed 120000ms",
      artifactPath: ".protostar/runs/x/piles/planning/iter-0/refusal.json"
    };
    const parsed = JSON.parse(formatRefusalIndexLine(entry).slice(0, -1)) as Record<string, unknown>;
    assert.equal(parsed["stage"], "pile-planning");
  });

  it("RefusalStage type accepts the three pile-* extensions", () => {
    const stages: ReadonlyArray<RefusalIndexEntry["stage"]> = [
      "pile-planning",
      "pile-review",
      "pile-execution-coordination"
    ];
    // Compile-time check — if the type doesn't include these, this assignment fails.
    assert.equal(stages.length, 3);
  });

  it("emits stage: planning correctly when the input stage is planning", () => {
    const planningEntry: RefusalIndexEntry = {
      ...sampleEntry,
      stage: "planning",
      artifactPath: ".protostar/runs/run_xyz/no-plan-admitted.json",
      reason: "candidate plan graph contains a dependency cycle"
    };
    const parsed = JSON.parse(formatRefusalIndexLine(planningEntry).slice(0, -1)) as Record<string, unknown>;
    assert.equal(parsed["stage"], "planning");
  });
});

describe("appendRefusalIndexEntry", () => {
  it("appends one JSON line per call to the index file", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "refusals-index-test-"));
    try {
      const filePath = resolve(dir, REFUSALS_INDEX_FILE_NAME);
      await appendRefusalIndexEntry(filePath, sampleEntry);
      await appendRefusalIndexEntry(filePath, { ...sampleEntry, runId: "run_two" });
      const contents = await readFile(filePath, "utf8");
      const lines = contents.split("\n").filter((segment) => segment.length > 0);
      assert.equal(lines.length, 2);
      assert.equal((JSON.parse(lines[0] ?? "{}") as Record<string, unknown>)["runId"], sampleEntry.runId);
      assert.equal((JSON.parse(lines[1] ?? "{}") as Record<string, unknown>)["runId"], "run_two");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("buildTerminalStatusArtifact", () => {
  it("always returns status: 'refused' and schemaVersion: '1.0.0'", () => {
    const artifact = buildTerminalStatusArtifact({
      runId: "run_a",
      stage: "intent",
      reason: "blocked",
      refusalArtifact: "clarification-report.json"
    });
    assert.equal(artifact.status, "refused");
    assert.equal(artifact.schemaVersion, REFUSAL_INDEX_SCHEMA_VERSION);
    assert.equal(artifact.artifact, TERMINAL_STATUS_ARTIFACT_NAME);
  });

  it("propagates runId, stage, reason, refusalArtifact verbatim", () => {
    const artifact = buildTerminalStatusArtifact({
      runId: "run_b",
      stage: "planning",
      reason: "cycle in plan graph",
      refusalArtifact: "no-plan-admitted.json"
    });
    assert.equal(artifact.runId, "run_b");
    assert.equal(artifact.stage, "planning");
    assert.equal(artifact.reason, "cycle in plan graph");
    assert.equal(artifact.refusalArtifact, "no-plan-admitted.json");
  });

  it("produces the same shape regardless of stage", () => {
    const intentArtifact = buildTerminalStatusArtifact({
      runId: "x",
      stage: "intent",
      reason: "r",
      refusalArtifact: "a"
    });
    const planningArtifact = buildTerminalStatusArtifact({
      runId: "x",
      stage: "planning",
      reason: "r",
      refusalArtifact: "a"
    });
    assert.deepEqual(Object.keys(intentArtifact).sort(), Object.keys(planningArtifact).sort());
  });
});
