/**
 * Q-13 SDK→Protostar failure translation.
 *
 * Maps the pinned `@dogpile/sdk` `NormalizedStopReason` enum to Protostar's
 * `PileFailure` discriminated union. Returns `null` for non-failure stops
 * (`budget:cost`, `convergence`, `judge:accepted`, `judge:score-threshold`).
 *
 * `pile-network` and `pile-cancelled` arise from caught exceptions in
 * Plan 04's `runFactoryPile`, NOT from a NormalizedStopReason — so this helper
 * does not produce them.
 *
 * Exhaustive switch with `assertNever` default — adding a new SDK enum value
 * becomes a TypeScript compile error here, never a silent fallthrough.
 *
 * Pure: no I/O, no clock reads. `elapsedMs` is supplied by the caller.
 */

import type { NormalizedStopReason } from "@protostar/dogpile-types";

import type {
  PileFailure,
  PileKind,
  ResolvedPileBudget
} from "./pile-failure-types.js";

export interface MapSdkStopContext {
  readonly kind: PileKind;
  readonly elapsedMs: number;
  readonly budget: ResolvedPileBudget;
  readonly tokensConsumed?: number;
  readonly iterationsConsumed?: number;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled NormalizedStopReason: ${String(value)}`);
}

export function mapSdkStopToPileFailure(
  stop: NormalizedStopReason,
  ctx: MapSdkStopContext
): PileFailure | null {
  switch (stop) {
    case "budget:timeout":
      return {
        kind: ctx.kind,
        class: "pile-timeout",
        elapsedMs: ctx.elapsedMs,
        configuredTimeoutMs: ctx.budget.timeoutMs
      };
    case "budget:tokens":
      return {
        kind: ctx.kind,
        class: "pile-budget-exhausted",
        dimension: "tokens",
        consumed: ctx.tokensConsumed ?? 0,
        cap: ctx.budget.maxTokens
      };
    case "budget:iterations":
      return {
        kind: ctx.kind,
        class: "pile-budget-exhausted",
        dimension: "calls",
        consumed: ctx.iterationsConsumed ?? 0,
        cap: ctx.budget.maxCalls ?? Number.MAX_SAFE_INTEGER
      };
    case "judge:rejected":
      return {
        kind: ctx.kind,
        class: "pile-all-rejected",
        candidatesEvaluated: 0,
        judgeDecisions: []
      };
    case "budget:cost":
    case "convergence":
    case "judge:accepted":
    case "judge:score-threshold":
      return null;
    default:
      return assertNever(stop);
  }
}
