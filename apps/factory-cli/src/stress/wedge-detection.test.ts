import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { detectStressWedge } from "./wedge-detection.js";

describe("stress wedge detection", () => {
  it("returns wedge when a run has no status transition for more than 5x p95 and no cancel sentinel", () => {
    const result = detectStressWedge({
      runId: "run_wedged",
      status: "running",
      lastStatusTransitionAt: "2026-04-29T00:00:00Z",
      now: "2026-04-29T00:00:51Z",
      p95SuccessfulDurationMs: 10_000,
      hasCancelSentinel: false
    });

    assert.equal(result.kind, "wedge");
    assert.equal(result.evidence.runId, "run_wedged");
    assert.equal(result.evidence.idleDurationMs, 51_000);
    assert.equal(result.evidence.p95SuccessfulDurationMs, 10_000);
  });

  it("does not report wedge at exactly 5x p95, with cancel sentinel, or for terminal statuses", () => {
    assert.equal(
      detectStressWedge({
        runId: "run_boundary",
        status: "running",
        lastStatusTransitionAt: "2026-04-29T00:00:00Z",
        now: "2026-04-29T00:00:50Z",
        p95SuccessfulDurationMs: 10_000,
        hasCancelSentinel: false
      }).kind,
      "ok"
    );
    assert.equal(
      detectStressWedge({
        runId: "run_cancel",
        status: "running",
        lastStatusTransitionAt: "2026-04-29T00:00:00Z",
        now: "2026-04-29T00:00:51Z",
        p95SuccessfulDurationMs: 10_000,
        hasCancelSentinel: true
      }).kind,
      "ok"
    );
    assert.equal(
      detectStressWedge({
        runId: "run_done",
        status: "completed",
        lastStatusTransitionAt: "2026-04-29T00:00:00Z",
        now: "2026-04-29T00:00:51Z",
        p95SuccessfulDurationMs: 10_000,
        hasCancelSentinel: false
      }).kind,
      "ok"
    );
  });
});
