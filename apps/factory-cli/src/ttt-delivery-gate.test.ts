import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { FactoryStressCapsConfig } from "./stress/stress-caps.js";
import {
  evaluatePhase11DeliveryGate,
  evaluateTttDelivered,
  evaluateTttDeliveryCaps,
  phase11CapBreachPath,
  type TttDeliveryEvidence
} from "./ttt-delivery-gate.js";

const VALID_EVIDENCE = Object.freeze({
  sessionId: "phase11_ttt",
  runId: "phase11-ttt",
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
  checkedAt: "2026-04-29T12:00:00.000Z"
} satisfies TttDeliveryEvidence);

describe("ttt delivery gate", () => {
  it("passes only complete ttt-delivered AND stress-clean delivery evidence", () => {
    const result = evaluateTttDelivered(VALID_EVIDENCE);

    assert.deepEqual(result, {
      ok: true,
      tttDelivered: true,
      label: "ttt-delivered",
      blockers: []
    });
  });

  it("blocks missing or failed TTT evidence fields", () => {
    const result = evaluateTttDelivered({
      ...VALID_EVIDENCE,
      prUrl: "",
      ciVerdict: "fail",
      playwrightE2e: "skip",
      propertyTest: "pass",
      tauriDebugBuild: "fail",
      immutablePreflight: {
        ok: false,
        code: "toy-verification-missing",
        missingFiles: ["../protostar-toy-ttt/e2e/ttt.spec.ts"]
      },
      checkedAt: ""
    });

    assert.equal(result.ok, false);
    assert.equal(result.tttDelivered, false);
    assert.deepEqual(result.blockers, [
      "missing-prUrl",
      "ciVerdict",
      "playwrightE2e",
      "tauriDebugBuild",
      "immutable-preflight",
      "missing-checkedAt"
    ]);
  });

  it("requires ttt-game seed and materialized signed inputs under the stress run directory", () => {
    const result = evaluateTttDelivered({
      ...VALID_EVIDENCE,
      seedId: "other-seed",
      draftPath: ".protostar/stress/phase11_ttt/other/intent.draft.json",
      confirmedIntentPath: ".protostar/stress/phase11_ttt/inputs/other-run/confirmed-intent.json"
    });

    assert.equal(result.ok, false);
    assert.deepEqual(result.blockers, [
      "seedId",
      "draftPath",
      "confirmedIntentPath"
    ]);
  });

  it("resolves ttt-delivery caps with defaults, config, then CLI override", () => {
    const config: FactoryStressCapsConfig = {
      sustainedLoad: { maxRuns: 500, maxWallClockDays: 7 },
      concurrency: { maxSessions: 20, maxWallClockDays: 3 },
      faultInjection: { maxFaults: 100, maxWallClockDays: 3 },
      tttDelivery: { maxAttempts: 12, maxWallClockDays: 6 }
    };

    assert.equal(evaluateTttDeliveryCaps({ sessionId: "s", attemptCount: 1, startedAt: "2026-04-29T00:00:00Z", now: "2026-04-29T01:00:00Z" }).caps.maxAttempts, 50);
    assert.equal(evaluateTttDeliveryCaps({ sessionId: "s", attemptCount: 1, startedAt: "2026-04-29T00:00:00Z", now: "2026-04-29T01:00:00Z", config }).caps.maxWallClockDays, 6);
    assert.equal(
      evaluateTttDeliveryCaps({
        sessionId: "s",
        attemptCount: 1,
        startedAt: "2026-04-29T00:00:00Z",
        now: "2026-04-29T01:00:00Z",
        config,
        cli: { maxAttempts: 3 }
      }).caps.maxAttempts,
      3
    );
  });

  it("blocks the 51st attempt and requires phase-11-cap-breach.json evidence", () => {
    const result = evaluateTttDeliveryCaps({
      sessionId: "phase11_ttt",
      attemptCount: 51,
      startedAt: "2026-04-29T00:00:00Z",
      now: "2026-04-29T01:00:00Z"
    });

    assert.equal(result.ok, false);
    assert.deepEqual(result.breach, {
      kind: "run-count",
      value: 51,
      limit: 50,
      shape: "ttt-delivery"
    });
    assert.equal(result.capBreachPath, ".protostar/stress/phase11_ttt/phase-11-cap-breach.json");
    assert.equal(result.blockers.includes("ttt-delivery-cap-breach:run-count"), true);
  });

  it("blocks elapsed time greater than 14 days and references phase-11-cap-breach.json", () => {
    const result = evaluateTttDeliveryCaps({
      sessionId: "phase11_ttt",
      attemptCount: 1,
      startedAt: "2026-04-01T00:00:00Z",
      now: "2026-04-16T00:00:00Z"
    });

    assert.equal(result.ok, false);
    assert.deepEqual(result.breach, {
      kind: "wall-clock",
      value: 15,
      limit: 14,
      shape: "ttt-delivery"
    });
    assert.equal(result.capBreachPath, phase11CapBreachPath("phase11_ttt"));
  });

  it("blocks final completion unless ttt-delivered AND stress-clean is true", () => {
    assert.deepEqual(evaluatePhase11DeliveryGate({ tttDelivered: true, stressClean: true }), {
      ok: true,
      tttDelivered: true,
      stressClean: true
    });

    assert.deepEqual(
      evaluatePhase11DeliveryGate({
        tttDelivered: true,
        stressClean: false,
        blockers: ["missing-stress-clean"]
      }),
      {
        ok: false,
        code: "phase-11-gate-not-met",
        tttDelivered: true,
        stressClean: false,
        blockers: ["missing-stress-clean"]
      }
    );
  });
});
