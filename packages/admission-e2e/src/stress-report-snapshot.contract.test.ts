import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { formatStressReport, parseStressReport } from "@protostar/artifacts";

const validReport = {
  sessionId: "stress_session_snapshot",
  startedAt: "2026-04-29T01:00:00Z",
  finishedAt: "2026-04-29T01:05:00Z",
  totalRuns: 1,
  headlessMode: "github-hosted",
  llmBackend: "mock",
  shape: "fault-injection",
  perArchetype: [
    {
      archetype: "feature-add",
      runs: 1,
      passes: 0,
      passRate: 0,
      threshold: 0.3,
      met: false
    }
  ],
  perRun: [
    {
      runId: "run_fault_1",
      seedId: "ttt-game",
      archetype: "feature-add",
      outcome: "blocked",
      ciVerdict: "skipped",
      durationMs: 95000,
      faultInjected: "disk-full"
    }
  ],
  capBreached: {
    kind: "wall-clock",
    value: 259201000,
    limit: 259200000
  }
};

describe("stress-report-snapshot contract", () => {
  it("keeps format(parse(JSON.parse(format(report)))) byte-stable", () => {
    const first = formatStressReport(parseStressReport(validReport));
    const second = formatStressReport(parseStressReport(JSON.parse(first)));

    assert.equal(second, first);
    assert.equal(first, "{\"capBreached\":{\"kind\":\"wall-clock\",\"limit\":259200000,\"value\":259201000},\"finishedAt\":\"2026-04-29T01:05:00Z\",\"headlessMode\":\"github-hosted\",\"llmBackend\":\"mock\",\"perArchetype\":[{\"archetype\":\"feature-add\",\"met\":false,\"passRate\":0,\"passes\":0,\"runs\":1,\"threshold\":0.3}],\"perRun\":[{\"archetype\":\"feature-add\",\"ciVerdict\":\"skipped\",\"durationMs\":95000,\"faultInjected\":\"disk-full\",\"outcome\":\"blocked\",\"runId\":\"run_fault_1\",\"seedId\":\"ttt-game\"}],\"sessionId\":\"stress_session_snapshot\",\"shape\":\"fault-injection\",\"startedAt\":\"2026-04-29T01:00:00Z\",\"totalRuns\":1}\n");
  });

  it("rejects malformed reports", () => {
    assert.throws(() => parseStressReport({
      ...validReport,
      perArchetype: [{ ...validReport.perArchetype[0], passes: 2 }]
    }));
    assert.throws(() => parseStressReport({
      ...validReport,
      perArchetype: [{ ...validReport.perArchetype[0], passRate: -0.1 }]
    }));
    assert.throws(() => parseStressReport({
      ...validReport,
      totalRuns: 2
    }));
    assert.throws(() => parseStressReport({
      ...validReport,
      extraField: true
    }));
  });
});
