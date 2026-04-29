export const FAULT_SCENARIOS = ["network-drop", "llm-timeout", "disk-full", "abort-signal"] as const;
export const STRESS_SHAPES = ["concurrency", "fault-injection"] as const;

export type FaultScenario = typeof FAULT_SCENARIOS[number];
export type StressShape = typeof STRESS_SHAPES[number];

export interface PlanFaultInjectionsInput {
  readonly scenario: FaultScenario;
  readonly runs: number;
}

export interface FaultInjectionDescriptor {
  readonly scenario: FaultScenario;
  readonly runIndex: number;
  readonly injectionId: string;
}

const FAULT_SCENARIO_SET = new Set<string>(FAULT_SCENARIOS);
const STRESS_SHAPE_SET = new Set<string>(STRESS_SHAPES);

export function isFaultScenario(value: string): value is FaultScenario {
  return FAULT_SCENARIO_SET.has(value);
}

export function isStressShape(value: string): value is StressShape {
  return STRESS_SHAPE_SET.has(value);
}

export function planFaultInjections(input: PlanFaultInjectionsInput): readonly FaultInjectionDescriptor[] {
  if (!isFaultScenario(input.scenario)) {
    throw new Error(`unsupported fault scenario: ${String(input.scenario)}`);
  }
  if (!Number.isInteger(input.runs) || input.runs < 1) {
    throw new Error("runs must be a positive integer");
  }

  return Array.from({ length: input.runs }, (_, runIndex) => ({
    scenario: input.scenario,
    runIndex,
    injectionId: `fault-${runIndex}-${input.scenario}`
  }));
}
