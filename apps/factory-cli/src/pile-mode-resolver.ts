/**
 * Phase 6 Plan 06-07 Task 2 — `resolvePileMode`: Q-04 precedence resolver.
 *
 * Precedence (D-04): CLI flag > factory-config.json piles.{kind}.mode >
 * built-in default `"fixture"` (Q-05). Pure: no fs, no clock.
 *
 * Per Q-06 (D-06): live failures NEVER auto-fall-back to fixture; that
 * invariant is enforced at the call site that consumes the resolved mode,
 * not here.
 */

import type { PileMode, PilesConfig } from "@protostar/lmstudio-adapter";

export type FactoryCliPileKind = "planning" | "review" | "executionCoordination";

export interface PileModeCliInputs {
  readonly planningMode?: PileMode | undefined;
  readonly reviewMode?: PileMode | undefined;
  readonly execCoordMode?: PileMode | undefined;
}

export function resolvePileMode(
  kind: FactoryCliPileKind,
  cli: PileModeCliInputs,
  config: PilesConfig | undefined
): PileMode {
  const cliFlag = pickCliFlag(kind, cli);
  if (cliFlag !== undefined) return cliFlag;

  const configMode = config?.[kind]?.mode;
  if (configMode !== undefined) return configMode;

  return "fixture";
}

function pickCliFlag(kind: FactoryCliPileKind, cli: PileModeCliInputs): PileMode | undefined {
  switch (kind) {
    case "planning":
      return cli.planningMode;
    case "review":
      return cli.reviewMode;
    case "executionCoordination":
      return cli.execCoordMode;
  }
}
