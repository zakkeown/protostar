import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { writeStdoutJson } from "@protostar/factory-cli/io";
import type { StatusRowFull, StatusRowMinimal } from "@protostar/factory-cli/status-types";

describe("status row schemas - Phase 9 Q-07 lock", () => {
  it("locks the minimal status row key set", () => {
    const row = {
      runId: "run-status-min",
      archetype: "cosmetic-tweak",
      verdict: "pass",
      durationMs: 1234
    } satisfies StatusRowMinimal;

    const parsed = JSON.parse(captureStdout(() => writeStdoutJson(row))) as Record<string, unknown>;
    assert.deepEqual(Object.keys(parsed), ["archetype", "durationMs", "runId", "verdict"]);
  });

  it("locks the full status row key set", () => {
    const row = {
      runId: "run-status-full",
      archetype: "cosmetic-tweak",
      status: "ready-to-release",
      state: "live",
      reviewVerdict: "pass",
      evaluationVerdict: "pass",
      lineageId: "lineage-1",
      generation: 3,
      prUrl: null,
      durationMs: 5678,
      createdAt: 1777400000000
    } satisfies StatusRowFull;

    const parsed = JSON.parse(captureStdout(() => writeStdoutJson(row))) as Record<string, unknown>;
    assert.deepEqual(Object.keys(parsed), [
      "archetype",
      "createdAt",
      "durationMs",
      "evaluationVerdict",
      "generation",
      "lineageId",
      "prUrl",
      "reviewVerdict",
      "runId",
      "state",
      "status"
    ]);
  });
});

function captureStdout(fn: () => void): string {
  const originalWrite = process.stdout.write;
  let chunk = "";
  process.stdout.write = ((value: string | Uint8Array) => {
    chunk += typeof value === "string" ? value : Buffer.from(value).toString("utf8");
    return true;
  }) as typeof process.stdout.write;
  try {
    fn();
  } finally {
    process.stdout.write = originalWrite;
  }
  return chunk;
}
