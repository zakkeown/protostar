import type { ExecutionAdapter } from "@protostar/execution";

// Phase 5 Plan 05-07 lands the real createMechanicalChecksAdapter implementation.
// This skeleton exists so downstream Wave 2 plans can register imports.
export const __MECHANICAL_CHECKS_PACKAGE_SKELETON__ = true as const;

export interface MechanicalChecksAdapterConfig {
  readonly commands?: readonly unknown[];
}

export function createMechanicalChecksAdapter(
  _config: MechanicalChecksAdapterConfig = {}
): ExecutionAdapter {
  return {
    id: "mechanical-checks",
    async *execute() {
      throw new Error("createMechanicalChecksAdapter implementation lands in Phase 5 Plan 05-07");
    }
  };
}
