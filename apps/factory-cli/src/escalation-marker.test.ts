import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { writeEscalationMarker, type EscalationMarker } from "./escalation-marker.js";

describe("escalation marker writer", () => {
  it("writes escalation-marker.json with the marker content", async () => {
    await withTempDir(async (tempDir) => {
      const runDir = resolve(tempDir, "runs", "run_marker");
      const marker = buildMarker({ reason: "operator confirmation required" });

      const result = await writeEscalationMarker({ runDir, marker });

      assert.equal(result.artifactPath, resolve(runDir, "escalation-marker.json"));
      assert.deepEqual(await readJsonObject(result.artifactPath), marker);
    });
  });

  it("writes content that matches escalation-marker.schema.json", async () => {
    await withTempDir(async (tempDir) => {
      const runDir = resolve(tempDir, "runs", "run_marker_schema");
      const marker = buildMarker({ gate: "workspace-trust" });

      const result = await writeEscalationMarker({ runDir, marker });

      assertEscalationMarkerSchema(await readJsonObject(result.artifactPath));
    });
  });

  it("overwrites the marker for repeated writes to the same run directory", async () => {
    await withTempDir(async (tempDir) => {
      const runDir = resolve(tempDir, "runs", "run_marker_overwrite");

      await writeEscalationMarker({ runDir, marker: buildMarker({ reason: "first" }) });
      const result = await writeEscalationMarker({ runDir, marker: buildMarker({ reason: "second" }) });

      assert.equal((await readJsonObject(result.artifactPath))["reason"], "second");
    });
  });
});

function buildMarker(overrides: Partial<EscalationMarker> = {}): EscalationMarker {
  return {
    schemaVersion: "1.0.0",
    runId: "run_marker",
    gate: "intent",
    reason: "operator confirmation required",
    createdAt: "2026-04-27T00:00:00.000Z",
    awaiting: "operator-confirm",
    ...overrides
  };
}

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  const value = JSON.parse(await readFile(path, "utf8")) as unknown;
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as Record<string, unknown>;
}

async function readEscalationMarkerSchema(): Promise<Record<string, unknown>> {
  const schemaPath = fileURLToPath(
    new URL("../../../packages/authority/schema/escalation-marker.schema.json", import.meta.url)
  );
  return readJsonObject(schemaPath);
}

async function assertEscalationMarkerSchema(marker: Record<string, unknown>): Promise<void> {
  const schema = await readEscalationMarkerSchema();
  assert.equal(schema["additionalProperties"], false);
  assert.deepEqual(schema["required"], ["schemaVersion", "runId", "gate", "reason", "createdAt"]);
  assert.equal(marker["schemaVersion"], "1.0.0");
  assert.equal(typeof marker["runId"], "string");
  assert.ok(["intent", "planning", "capability", "repo-scope", "workspace-trust"].includes(String(marker["gate"])));
  assert.equal(typeof marker["reason"], "string");
  assert.notEqual(marker["reason"], "");
  assert.equal(typeof marker["createdAt"], "string");
  assert.ok(["operator-confirm", "operator-resume"].includes(String(marker["awaiting"])));
}

async function withTempDir(callback: (tempDir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(resolve(tmpdir(), "protostar-escalation-marker-"));
  try {
    await callback(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
