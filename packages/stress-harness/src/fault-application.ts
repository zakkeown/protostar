import { isFaultScenario, type FaultInjectionDescriptor, type FaultScenario } from "./fault-scenarios.js";

export const FAULT_MECHANISMS = [
  "adapter-network-refusal",
  "llm-abort-timeout",
  "disk-write-enospc",
  "external-abort-signal"
] as const;

export type FaultMechanism = typeof FAULT_MECHANISMS[number];

export interface FaultObservation {
  readonly scenario: FaultScenario;
  readonly mechanism: FaultMechanism;
  readonly observed: boolean;
  readonly runIndex: number;
  readonly details?: string;
  readonly code?: string;
}

export interface FaultInjectionHooks {
  readonly adapterNetworkRefusal: (descriptor: FaultInjectionDescriptor) => Promise<FaultObservation> | FaultObservation;
  readonly llmTimeoutAbortSignal: (descriptor: FaultInjectionDescriptor) => Promise<FaultObservation> | FaultObservation;
  readonly diskWriteEnospc: (descriptor: FaultInjectionDescriptor) => Promise<FaultObservation> | FaultObservation;
  readonly externalAbortSignal: (descriptor: FaultInjectionDescriptor) => Promise<FaultObservation> | FaultObservation;
}

const MECHANISM_BY_SCENARIO: Record<FaultScenario, FaultMechanism> = {
  "network-drop": "adapter-network-refusal",
  "llm-timeout": "llm-abort-timeout",
  "disk-full": "disk-write-enospc",
  "abort-signal": "external-abort-signal"
};

export function mechanismForScenario(scenario: FaultScenario): FaultMechanism {
  if (!isFaultScenario(scenario)) {
    throw new Error(`unsupported fault scenario: ${String(scenario)}`);
  }
  return MECHANISM_BY_SCENARIO[scenario];
}

export async function applyFaultInjection(
  descriptor: FaultInjectionDescriptor,
  hooks: FaultInjectionHooks
): Promise<FaultObservation> {
  if (!isFaultScenario(descriptor.scenario)) {
    throw new Error(`unsupported fault scenario: ${String(descriptor.scenario)}`);
  }

  const observation = await dispatchFault(descriptor, hooks);
  const expectedMechanism = mechanismForScenario(descriptor.scenario);
  if (observation.mechanism !== expectedMechanism) {
    throw new Error(
      `fault scenario ${descriptor.scenario} observed ${observation.mechanism}, expected ${expectedMechanism}`
    );
  }
  if (observation.scenario !== descriptor.scenario) {
    throw new Error(`fault observation scenario ${observation.scenario} does not match ${descriptor.scenario}`);
  }
  if (observation.runIndex !== descriptor.runIndex) {
    throw new Error(`fault observation runIndex ${observation.runIndex} does not match ${descriptor.runIndex}`);
  }
  return observation;
}

function dispatchFault(
  descriptor: FaultInjectionDescriptor,
  hooks: FaultInjectionHooks
): Promise<FaultObservation> | FaultObservation {
  switch (descriptor.scenario) {
    case "network-drop":
      return hooks.adapterNetworkRefusal(descriptor);
    case "llm-timeout":
      return hooks.llmTimeoutAbortSignal(descriptor);
    case "disk-full":
      return hooks.diskWriteEnospc(descriptor);
    case "abort-signal":
      return hooks.externalAbortSignal(descriptor);
  }
}
