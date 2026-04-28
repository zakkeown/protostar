import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { IntentId } from "@protostar/intent";

import type { FactoryRunManifest, FactoryRunStatus } from "./index.js";
import { setFactoryRunStatus } from "./index.js";

function manifest(): FactoryRunManifest {
  return {
    runId: "run-status-test",
    intentId: "intent-status-test" as IntentId,
    status: "created",
    createdAt: "2026-04-28T00:00:00.000Z",
    stages: []
  };
}

describe("FactoryRunStatus", () => {
  it("accepts the Phase 9 Q-18 status union in locked order", () => {
    const allStatuses: FactoryRunStatus[] = [
      "created",
      "running",
      "cancelling",
      "cancelled",
      "orphaned",
      "blocked",
      "repairing",
      "ready-to-release",
      "completed"
    ];

    assert.deepEqual(allStatuses, [
      "created",
      "running",
      "cancelling",
      "cancelled",
      "orphaned",
      "blocked",
      "repairing",
      "ready-to-release",
      "completed"
    ]);
  });

  it("sets new and existing manifest statuses", () => {
    assert.equal(setFactoryRunStatus(manifest(), "cancelling").status, "cancelling");
    assert.equal(setFactoryRunStatus(manifest(), "cancelled").status, "cancelled");
    assert.equal(setFactoryRunStatus(manifest(), "orphaned").status, "orphaned");
    assert.equal(setFactoryRunStatus(manifest(), "completed").status, "completed");
  });
});
