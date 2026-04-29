import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyFaultInjection, mechanismForScenario, type FaultInjectionHooks } from "./fault-application.js";
import type { FaultInjectionDescriptor, FaultScenario } from "./fault-scenarios.js";

const cases = [
  ["network-drop", "adapterNetworkRefusal", "adapter-network-refusal"],
  ["llm-timeout", "llmTimeoutAbortSignal", "llm-abort-timeout"],
  ["disk-full", "diskWriteEnospc", "disk-write-enospc"],
  ["abort-signal", "externalAbortSignal", "external-abort-signal"]
] as const;

describe("applyFaultInjection", () => {
  for (const [scenario, hookName, mechanism] of cases) {
    it(`dispatches ${scenario} to ${hookName}`, async () => {
      const calls: string[] = [];
      const hooks = hooksThatTrack(calls);
      const descriptor = descriptorFor(scenario);

      const observed = await applyFaultInjection(descriptor, hooks);

      assert.deepEqual(calls, [hookName]);
      assert.deepEqual(observed, {
        scenario,
        mechanism,
        observed: true,
        runIndex: 7,
        code: mechanism
      });
    });
  }

  it("refuses invalid scenario descriptors", async () => {
    await assert.rejects(
      applyFaultInjection({ ...descriptorFor("network-drop"), scenario: "unknown" as never }, hooksThatTrack([])),
      /unsupported fault scenario/
    );
  });

  it("refuses hooks that echo labels without observing the expected mechanism", async () => {
    const hooks = hooksThatTrack([]);
    const badHooks: FaultInjectionHooks = {
      ...hooks,
      adapterNetworkRefusal: (descriptor) => ({
        scenario: descriptor.scenario,
        mechanism: "llm-abort-timeout",
        observed: true,
        runIndex: descriptor.runIndex
      })
    };

    await assert.rejects(applyFaultInjection(descriptorFor("network-drop"), badHooks), /expected adapter-network-refusal/);
  });
});

function descriptorFor(scenario: FaultScenario): FaultInjectionDescriptor {
  return {
    scenario,
    runIndex: 7,
    injectionId: `fault-7-${scenario}`
  };
}

function hooksThatTrack(calls: string[]): FaultInjectionHooks {
  return {
    adapterNetworkRefusal: (descriptor) => observe("adapterNetworkRefusal", "adapter-network-refusal", descriptor, calls),
    llmTimeoutAbortSignal: (descriptor) => observe("llmTimeoutAbortSignal", "llm-abort-timeout", descriptor, calls),
    diskWriteEnospc: (descriptor) => observe("diskWriteEnospc", "disk-write-enospc", descriptor, calls),
    externalAbortSignal: (descriptor) => observe("externalAbortSignal", "external-abort-signal", descriptor, calls)
  };
}

function observe(
  hookName: string,
  mechanism: "adapter-network-refusal" | "llm-abort-timeout" | "disk-write-enospc" | "external-abort-signal",
  descriptor: FaultInjectionDescriptor,
  calls: string[]
) {
  calls.push(hookName);
  return {
    scenario: descriptor.scenario,
    mechanism,
    observed: true,
    runIndex: descriptor.runIndex,
    code: mechanism
  };
}
