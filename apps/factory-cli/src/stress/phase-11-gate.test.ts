import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { StressEvent, StressReport, StressShape } from "@protostar/artifacts";

import { evaluatePhase11Gate, evaluateStressClean } from "./phase-11-gate.js";
import type { TttDeliveryEvidence } from "../ttt-delivery-gate.js";

const CHECKED_AT = "2026-04-29T12:00:00Z";

describe("phase 11 gate", () => {
  it("passes only when ttt-delivered AND stress-clean are both true", () => {
    const result = evaluatePhase11Gate({
      tttEvidence: passingTttEvidence(),
      tttCaps: passingTttCaps(),
      reports: allCleanReports(),
      faultObservationEvents: allFaultObservedEvents()
    });

    assert.deepEqual(result, {
      ok: true,
      tttDelivered: true,
      stressClean: true
    });
  });

  it("blocks with phase-11-gate-not-met when TTT delivery evidence is incomplete", () => {
    const result = evaluatePhase11Gate({
      tttEvidence: {
        ...passingTttEvidence(),
        tauriDebugBuild: "fail"
      },
      tttCaps: passingTttCaps(),
      reports: allCleanReports(),
      faultObservationEvents: allFaultObservedEvents()
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "phase-11-gate-not-met");
      assert.equal(result.tttDelivered, false);
      assert.equal(result.stressClean, true);
      assert.equal(result.blockers.includes("tauriDebugBuild"), true);
    }
  });

  it("blocks final completion when the ttt-delivery cap breaches", () => {
    const result = evaluatePhase11Gate({
      tttEvidence: passingTttEvidence(),
      tttCaps: {
        sessionId: "phase11_ttt",
        attemptCount: 51,
        startedAt: "2026-04-29T00:00:00Z",
        now: "2026-04-29T01:00:00Z"
      },
      reports: allCleanReports(),
      faultObservationEvents: allFaultObservedEvents()
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "phase-11-gate-not-met");
      assert.equal(result.blockers.includes("ttt-delivery-cap-breach:run-count"), true);
      assert.equal(result.blockers.includes("requires:.protostar/stress/phase11_ttt/phase-11-cap-breach.json"), true);
    }
  });

  it("requires one terminal report for sustained-load, concurrency, and fault-injection", () => {
    const reportWithWedge = {
      ...stressReport("concurrency"),
      wedgeEvent: {
        runId: "stress-1",
        detectedAt: CHECKED_AT,
        reason: "status unchanged for > 5x p95"
      }
    };
    const reportWithoutFinishedAt = { ...stressReport("fault-injection") } as Partial<StressReport>;
    delete reportWithoutFinishedAt.finishedAt;
    const result = evaluateStressClean({
      reports: [
        stressReport("sustained-load", { capBreached: { kind: "run-count", value: 501, limit: 500 } }),
        reportWithWedge,
        reportWithoutFinishedAt,
        stressReport("sustained-load")
      ],
      faultObservationEvents: allFaultObservedEvents()
    });

    assert.equal(result.stressClean, false);
    assert.deepEqual([...result.blockers].sort(), [
      "cap-breached:sustained-load",
      "duplicate-stress-report:sustained-load",
      "missing-finished-at:2",
      "missing-stress-report:fault-injection",
      "wedge-event:concurrency"
    ].sort());
  });

  it("does not accept perRun faultInjected labels as observed fault evidence", () => {
    const result = evaluateStressClean({
      reports: [
        stressReport("sustained-load"),
        stressReport("concurrency"),
        stressReport("fault-injection", {
          perRun: [
            stressRun("network-drop"),
            stressRun("llm-timeout"),
            stressRun("disk-full"),
            stressRun("abort-signal")
          ],
          totalRuns: 4
        })
      ],
      faultObservationEvents: []
    });

    assert.equal(result.stressClean, false);
    assert.deepEqual([...result.blockers].sort(), [
      "missing-fault-observation:abort-signal",
      "missing-fault-observation:disk-full",
      "missing-fault-observation:llm-timeout",
      "missing-fault-observation:network-drop"
    ].sort());
  });

  it("requires exact observed mechanisms for all four fault scenarios", () => {
    const result = evaluateStressClean({
      reports: allCleanReports(),
      faultObservationEvents: [
        faultObserved("network-drop", "adapter-network-refusal"),
        faultObserved("llm-timeout", "llm-abort-timeout"),
        faultObserved("disk-full", "adapter-network-refusal"),
        faultObserved("abort-signal", "external-abort-signal")
      ]
    });

    assert.equal(result.stressClean, false);
    assert.deepEqual(result.blockers, ["wrong-fault-mechanism:disk-full"]);
  });
});

function allCleanReports(): readonly StressReport[] {
  return [
    stressReport("sustained-load"),
    stressReport("concurrency"),
    stressReport("fault-injection", {
      perRun: [
        stressRun("network-drop"),
        stressRun("llm-timeout"),
        stressRun("disk-full"),
        stressRun("abort-signal")
      ],
      totalRuns: 4
    })
  ];
}

function stressReport(shape: StressShape, overrides: Partial<StressReport> = {}): StressReport {
  const perRun = overrides.perRun ?? [stressRun()];
  return {
    sessionId: `stress-${shape}`,
    startedAt: "2026-04-29T00:00:00Z",
    finishedAt: "2026-04-29T00:01:00Z",
    totalRuns: perRun.length,
    headlessMode: "local-daemon",
    llmBackend: "mock",
    shape,
    perArchetype: [
      {
        archetype: "cosmetic-tweak",
        runs: perRun.length,
        passes: 1,
        passRate: 1,
        threshold: 0.8,
        met: true
      }
    ],
    perRun,
    ...overrides
  };
}

function stressRun(faultInjected?: string): StressReport["perRun"][number] {
  return {
    runId: `run-${faultInjected ?? "clean"}`,
    seedId: "cosmetic-copy",
    archetype: "cosmetic-tweak",
    outcome: faultInjected === undefined ? "pass" : "failed",
    durationMs: 1,
    ...(faultInjected !== undefined ? { faultInjected } : {})
  };
}

function allFaultObservedEvents(): readonly StressEvent[] {
  return [
    faultObserved("network-drop", "adapter-network-refusal"),
    faultObserved("llm-timeout", "llm-abort-timeout"),
    faultObserved("disk-full", "disk-write-enospc"),
    faultObserved("abort-signal", "external-abort-signal")
  ];
}

function faultObserved(scenario: string, mechanism: string): StressEvent {
  return {
    sessionId: "stress-faults",
    sequence: Math.max(1, scenario.length),
    at: CHECKED_AT,
    type: "fault-observed",
    payload: {
      runId: `run-${scenario}`,
      scenario,
      mechanism,
      observed: true,
      code: mechanism
    }
  };
}

function passingTttEvidence(): TttDeliveryEvidence {
  return {
    seedId: "ttt-game",
    draftPath: ".protostar/stress/phase11_ttt/inputs/phase11-ttt/intent.draft.json",
    confirmedIntentPath: ".protostar/stress/phase11_ttt/inputs/phase11-ttt/confirmed-intent.json",
    prUrl: "https://github.com/zkeown/protostar-toy-ttt/pull/42",
    ciVerdict: "pass",
    playwrightE2e: "pass",
    propertyTest: "pass",
    tauriDebugBuild: "pass",
    immutablePreflight: {
      ok: true,
      files: [
        "../protostar-toy-ttt/e2e/ttt.spec.ts",
        "../protostar-toy-ttt/tests/ttt-state.property.test.ts"
      ]
    },
    checkedAt: CHECKED_AT
  };
}

function passingTttCaps() {
  return {
    sessionId: "phase11_ttt",
    attemptCount: 1,
    startedAt: "2026-04-29T00:00:00Z",
    now: "2026-04-29T01:00:00Z"
  };
}
