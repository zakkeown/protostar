import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

interface ReportSchemaModule {
  readonly parseReport: (input: unknown) => unknown;
  readonly formatReport: (input: never) => string;
}

const validReport = {
  sessionId: "dogfood_session_1",
  startedAt: "2026-04-29T00:00:00Z",
  finishedAt: "2026-04-29T00:10:00Z",
  totalRuns: 2,
  passCount: 1,
  passRate: 0.5,
  rows: [
    {
      runId: "run_one",
      seedId: "button-color-hover",
      outcome: "pr-ready",
      prUrl: "https://github.com/zakkeown/protostar-toy-ttt/pull/42",
      ciVerdict: "success",
      durationMs: 120000
    },
    {
      runId: "run_two",
      seedId: "card-shadow",
      outcome: "ci-timeout",
      ciVerdict: "timeout",
      durationMs: 600000
    }
  ]
};

describe("dogfood-report-byte-equality", () => {
  it("formatReport(parseReport(report)) is byte-stable", async () => {
    const schema = await loadReportSchema();
    const first = schema.formatReport(schema.parseReport(validReport) as never);
    const second = schema.formatReport(schema.parseReport(JSON.parse(first)) as never);
    assert.equal(second, first);
  });

  it("rejects malformed reports", async () => {
    const schema = await loadReportSchema();
    assert.throws(() => schema.parseReport({ ...validReport, passCount: 3 }));
    assert.throws(() => schema.parseReport({
      ...validReport,
      rows: [
        {
          ...validReport.rows[0],
          prUrl: "https://github.com/zakkeown/other/pull/1"
        },
        validReport.rows[1]
      ]
    }));
    assert.throws(() => schema.parseReport({
      ...validReport,
      rows: [
        {
          ...validReport.rows[0],
          ciVerdict: "failure"
        },
        validReport.rows[1]
      ]
    }));
  });
});

async function loadReportSchema(): Promise<ReportSchemaModule> {
  return await import("../../../apps/factory-cli/dist/dogfood/report-schema.js") as ReportSchemaModule;
}
