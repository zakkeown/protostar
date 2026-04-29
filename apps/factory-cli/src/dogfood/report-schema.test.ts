import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatReport, parseReport } from "./report-schema.js";

describe("report-schema", () => {
  const baseReport = {
    sessionId: "20260429T000000Z-1234",
    startedAt: "2026-04-29T00:00:00Z",
    finishedAt: "2026-04-29T00:10:00Z",
    totalRuns: 2,
    passCount: 1,
    passRate: 0.5,
    rows: [
      {
        runId: "run_abc123",
        seedId: "button-color-hover",
        outcome: "pr-ready",
        prUrl: "https://github.com/zakkeown/protostar-toy-ttt/pull/12",
        ciVerdict: "success",
        durationMs: 120000
      },
      {
        runId: "run_def456",
        seedId: "card-shadow",
        outcome: "ci-timeout",
        ciVerdict: "timeout",
        durationMs: 600000
      }
    ]
  };

  it("parses a valid report", () => {
    assert.equal(parseReport(baseReport).sessionId, baseReport.sessionId);
  });

  it("validates passRate and rejects passCount greater than totalRuns", () => {
    assert.throws(() => parseReport({ ...baseReport, passRate: 1.1 }));
    assert.throws(() => parseReport({ ...baseReport, passCount: 3 }));
  });

  it("validates row shape and toy repo PR URLs", () => {
    assert.throws(() => parseReport({
      ...baseReport,
      rows: [{ ...baseReport.rows[0], prUrl: "https://github.com/zakkeown/other/pull/1" }, baseReport.rows[1]]
    }));
  });

  it("allows only known CI verdicts when present", () => {
    assert.throws(() => parseReport({
      ...baseReport,
      rows: [baseReport.rows[0], { ...baseReport.rows[1], ciVerdict: "pending" }]
    }));
  });

  it("rejects unknown top-level fields", () => {
    assert.throws(() => parseReport({ ...baseReport, extra: true }));
  });

  it("formats byte-stable canonical JSON", () => {
    const first = formatReport(parseReport(baseReport));
    const second = formatReport(parseReport(JSON.parse(first)));
    assert.equal(second, first);
    assert.ok(first.endsWith("\n"));
  });
});
