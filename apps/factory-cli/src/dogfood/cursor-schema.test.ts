import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatCursor, parseCursor } from "./cursor-schema.js";

describe("cursor-schema", () => {
  const baseCursor = {
    sessionId: "20260429T000000Z-1234",
    totalRuns: 2,
    completed: 1,
    runs: [
      {
        runId: "run_abc123",
        seedId: "button-color-hover",
        outcome: "pr-ready",
        startedAt: "2026-04-29T00:00:00Z",
        finishedAt: "2026-04-29T00:02:00Z"
      }
    ]
  };

  it("parses a valid cursor", () => {
    assert.equal(parseCursor(baseCursor).sessionId, baseCursor.sessionId);
  });

  it("rejects completed greater than totalRuns", () => {
    assert.throws(() => parseCursor({ ...baseCursor, totalRuns: 0 }));
  });

  it("requires run entries with runId, seedId, outcome, startedAt, and finishedAt", () => {
    assert.throws(() => parseCursor({ ...baseCursor, runs: [{ runId: "run_abc123" }] }));
  });

  it("accepts terminal resume state when completed equals totalRuns", () => {
    const terminal = {
      ...baseCursor,
      totalRuns: 1,
      completed: 1
    };
    assert.equal(parseCursor(terminal).completed, 1);
  });

  it("rejects unknown fields", () => {
    assert.throws(() => parseCursor({ ...baseCursor, surprise: true }));
  });

  it("formats byte-stable canonical JSON", () => {
    const first = formatCursor(parseCursor(baseCursor));
    const second = formatCursor(parseCursor(JSON.parse(first)));
    assert.equal(second, first);
    assert.ok(first.endsWith("\n"));
  });
});
