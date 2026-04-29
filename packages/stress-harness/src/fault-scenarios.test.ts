import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FAULT_SCENARIOS,
  STRESS_SHAPES,
  isFaultScenario,
  isStressShape,
  planFaultInjections
} from "./fault-scenarios.js";

describe("stress fault scenarios", () => {
  it("exports the locked fault scenarios and TS-owned stress shapes", () => {
    assert.deepEqual(FAULT_SCENARIOS, ["network-drop", "llm-timeout", "disk-full", "abort-signal"]);
    assert.deepEqual(STRESS_SHAPES, ["concurrency", "fault-injection"]);
  });

  it("plans deterministic run-indexed fault descriptors", () => {
    const first = planFaultInjections({ scenario: "network-drop", runs: 3 });
    const second = planFaultInjections({ scenario: "network-drop", runs: 3 });

    assert.deepEqual(first, second);
    assert.deepEqual(
      first.map((descriptor) => descriptor.injectionId),
      ["fault-0-network-drop", "fault-1-network-drop", "fault-2-network-drop"]
    );
    assert.deepEqual(
      first.map((descriptor) => descriptor.runIndex),
      [0, 1, 2]
    );
  });

  it("refuses invalid scenarios and invalid run counts", () => {
    assert.equal(isFaultScenario("network-drop"), true);
    assert.equal(isFaultScenario("sustained-load"), false);
    assert.equal(isStressShape("concurrency"), true);
    assert.equal(isStressShape("sustained-load"), false);
    assert.throws(
      () => planFaultInjections({ scenario: "unsupported" as never, runs: 1 }),
      /unsupported fault scenario/
    );
    assert.throws(() => planFaultInjections({ scenario: "disk-full", runs: 0 }), /positive integer/);
  });
});
