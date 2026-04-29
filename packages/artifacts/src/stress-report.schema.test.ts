import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  formatStressEventLine,
  formatStressReport,
  parseStressEvent,
  parseStressReport
} from "./stress-report.schema.js";

const validReport = {
  sessionId: "stress_session_1",
  startedAt: "2026-04-29T00:00:00Z",
  finishedAt: "2026-04-29T00:30:00Z",
  totalRuns: 2,
  headlessMode: "local-daemon",
  llmBackend: "mock",
  shape: "sustained-load",
  perArchetype: [
    {
      archetype: "cosmetic-tweak",
      runs: 1,
      passes: 1,
      passRate: 1,
      threshold: 0.8,
      met: true
    },
    {
      archetype: "feature-add",
      runs: 1,
      passes: 0,
      passRate: 0,
      threshold: 0.5,
      met: false
    }
  ],
  perRun: [
    {
      runId: "run_cosmetic_1",
      seedId: "button-color-hover",
      archetype: "cosmetic-tweak",
      outcome: "pass",
      prUrl: "https://github.com/zakkeown/protostar-toy-ttt/pull/41",
      ciVerdict: "success",
      durationMs: 120000
    },
    {
      runId: "run_feature_1",
      seedId: "ttt-game",
      archetype: "feature-add",
      outcome: "failed",
      ciVerdict: "failure",
      durationMs: 240000,
      faultInjected: "llm-timeout"
    }
  ]
};

describe("stress report schema", () => {
  it("parses exact report fields and formats canonical JSON", () => {
    const parsed = parseStressReport(validReport);
    const formatted = formatStressReport(parsed);

    assert.equal(formatted.endsWith("\n"), true);
    assert.equal(formatStressReport(parseStressReport(JSON.parse(formatted))), formatted);
    assert.deepEqual(Object.keys(JSON.parse(formatted)), [
      "finishedAt",
      "headlessMode",
      "llmBackend",
      "perArchetype",
      "perRun",
      "sessionId",
      "shape",
      "startedAt",
      "totalRuns"
    ]);
  });

  it("accepts the three locked stress shapes and exact outcomes", () => {
    for (const shape of ["sustained-load", "concurrency", "fault-injection"]) {
      assert.equal(parseStressReport({ ...validReport, shape }).shape, shape);
    }

    for (const outcome of ["pass", "failed", "blocked", "cancelled", "orphaned", "wedge"]) {
      const report = {
        ...validReport,
        perRun: [{ ...validReport.perRun[0], outcome }],
        totalRuns: 1
      };
      assert.equal(parseStressReport(report).perRun[0]?.outcome, outcome);
    }
  });

  it("rejects malformed report rollups and unknown keys", () => {
    assert.throws(() => parseStressReport({
      ...validReport,
      perArchetype: [{ ...validReport.perArchetype[0], passes: 2 }]
    }));
    assert.throws(() => parseStressReport({
      ...validReport,
      perArchetype: [{ ...validReport.perArchetype[0], passRate: 1.1 }]
    }));
    assert.throws(() => parseStressReport({
      ...validReport,
      totalRuns: 3
    }));
    assert.throws(() => parseStressReport({
      ...validReport,
      unexpected: true
    }));
  });

  it("parses optional wedge and cap-breach evidence", () => {
    const parsed = parseStressReport({
      ...validReport,
      wedgeEvent: {
        runId: "run_feature_1",
        detectedAt: "2026-04-29T00:29:00Z",
        reason: "status unchanged for 5x p95"
      },
      capBreached: {
        kind: "run-count",
        value: 101,
        limit: 100
      }
    });

    assert.equal(parsed.wedgeEvent?.runId, "run_feature_1");
    assert.equal(parsed.capBreached?.kind, "run-count");
  });
});

describe("stress event schema", () => {
  it("parses and formats one canonical JSON object per line", () => {
    const event = parseStressEvent({
      sessionId: "stress_session_1",
      sequence: 1,
      at: "2026-04-29T00:01:00Z",
      type: "run-started",
      payload: {
        runId: "run_cosmetic_1",
        seedId: "button-color-hover"
      }
    });

    const line = formatStressEventLine(event);
    assert.equal(line, "{\"at\":\"2026-04-29T00:01:00Z\",\"payload\":{\"runId\":\"run_cosmetic_1\",\"seedId\":\"button-color-hover\"},\"sequence\":1,\"sessionId\":\"stress_session_1\",\"type\":\"run-started\"}\n");
    assert.deepEqual(parseStressEvent(JSON.parse(line)), event);
  });

  it("rejects malformed event lines and unknown top-level keys", () => {
    assert.throws(() => parseStressEvent({
      sessionId: "stress_session_1",
      sequence: 0,
      at: "2026-04-29T00:01:00Z",
      type: "run-started",
      payload: {}
    }));
    assert.throws(() => parseStressEvent({
      sessionId: "stress_session_1",
      sequence: 1,
      at: "2026-04-29T00:01:00Z",
      type: "run-started",
      payload: {},
      extra: true
    }));
  });
});
