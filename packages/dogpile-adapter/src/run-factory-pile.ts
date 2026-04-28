/**
 * Plan 06-04 Task 1 — `runFactoryPile`: the network-only SDK invocation seam.
 *
 * Per Phase 6 D-01 (Q-01): single SDK call seam — `factory-cli` passes ctx,
 * receives a structured `PileRunOutcome`. Adapter is the only network surface
 * that touches `@dogpile/sdk`.
 *
 * Per D-02 (Q-02): uses `stream()` (NOT `run()`) and consumes `RunEvent` events
 * via `for await` on the StreamHandle. `ctx.onEvent` forwards each non-error
 * event so factory-cli can translate them into `ReviewLifecycleEvent` and
 * Phase 9 inspect signals. The handle yields `StreamEvent = RunEvent |
 * StreamErrorEvent`; we skip `error` because `handle.result` already rejects
 * with the same underlying error and our catch block classifies it.
 *
 * Per D-11 (Q-11): hierarchical AbortControllers via `AbortSignal.any` —
 * parent (factory-cli SIGINT) cascades; pile-level timeout aborts ONLY the
 * pile. On abort, classification reads `signal.reason`: a DOMException with
 * `name === "TimeoutError"` is the timeout branch; everything else is treated
 * as a parent cancel (`reason: "parent-abort"`).
 *
 * Per D-09 (Q-09): zero filesystem imports — Plan 06-01 Task 3's static
 * contract test enforces this.
 */

import {
  stream as defaultStream,
  type ConfiguredModelProvider,
  type DogpileOptions,
  type NormalizedStopReason,
  type RunAccounting,
  type RunEvent,
  type RunResult,
  type StreamEvent,
  type StreamHandle,
  type Trace
} from "@protostar/dogpile-types";

import type { FactoryPileMission } from "./index.js";
import {
  mapSdkStopToPileFailure
} from "./map-sdk-stop-to-pile-failure.js";
import type {
  PileFailure,
  ResolvedPileBudget
} from "./pile-failure-types.js";

export interface PileRunContext {
  readonly provider: ConfiguredModelProvider;
  readonly signal: AbortSignal;
  readonly budget: ResolvedPileBudget;
  readonly now?: () => number;
  readonly onEvent?: (e: RunEvent) => void;
}

export type PileRunOutcome =
  | {
      readonly ok: true;
      readonly result: RunResult;
      readonly trace: Trace;
      readonly accounting: RunAccounting;
      readonly stopReason: NormalizedStopReason | null;
    }
  | {
      readonly ok: false;
      readonly failure: PileFailure;
    };

export interface RunFactoryPileDeps {
  readonly stream?: (options: DogpileOptions) => StreamHandle;
}

function isTimeoutAbort(reason: unknown): boolean {
  return (
    typeof DOMException !== "undefined" &&
    reason instanceof DOMException &&
    reason.name === "TimeoutError"
  );
}

function extractErrorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  if (err instanceof Error) {
    // Common Node net errors embed code in the message tail (e.g. "connect ECONNREFUSED 127.0.0.1:1234").
    const match = /\b(E[A-Z0-9_]{3,})\b/.exec(err.message);
    if (match && match[1]) return match[1];
    return err.name || "Error";
  }
  return "UnknownError";
}

/**
 * Walk a successful RunResult's eventLog from the end and return the first
 * normalized stop reason found.
 *
 * Two terminal-ish event shapes carry stop information:
 *   - `FinalEvent.termination?.normalizedReason` is already normalized.
 *   - `BudgetStopEvent.reason` is a `BudgetStopReason` (cost|tokens|iterations|
 *     timeout); prefix with `"budget:"` to lift it into NormalizedStopReason.
 *
 * Returns null if neither is present (e.g., a clean convergence run with no
 * termination record).
 */
function extractStopReason(result: RunResult): NormalizedStopReason | null {
  const events = result.eventLog?.events ?? [];
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i] as RunEvent;
    if (ev.type === "final") {
      const final = ev as RunEvent & {
        termination?: { normalizedReason?: NormalizedStopReason };
      };
      if (final.termination && final.termination.normalizedReason) {
        return final.termination.normalizedReason;
      }
      // FinalEvent without termination: clean run; keep walking for an
      // earlier BudgetStopEvent if any.
      continue;
    }
    if (ev.type === "budget-stop") {
      const bs = ev as RunEvent & { reason: "cost" | "tokens" | "iterations" | "timeout" };
      return `budget:${bs.reason}` as NormalizedStopReason;
    }
  }
  return null;
}

export async function runFactoryPile(
  mission: FactoryPileMission,
  ctx: PileRunContext,
  deps: RunFactoryPileDeps = {}
): Promise<PileRunOutcome> {
  const streamFn = deps.stream ?? defaultStream;
  const now = ctx.now ?? Date.now;
  const startedAt = now();
  const childSignal = AbortSignal.any([
    ctx.signal,
    AbortSignal.timeout(ctx.budget.timeoutMs)
  ]);

  const kind = mission.preset.kind;

  try {
    const handle = streamFn({
      intent: mission.intent,
      model: ctx.provider,
      protocol: mission.preset.protocol,
      tier: mission.preset.tier,
      agents: mission.preset.agents,
      budget: {
        maxTokens: ctx.budget.maxTokens,
        timeoutMs: ctx.budget.timeoutMs
      },
      terminate: mission.preset.terminate,
      signal: childSignal
    });

    for await (const ev of handle as AsyncIterable<StreamEvent>) {
      // StreamErrorEvent is stream-only and redundant with handle.result rejection.
      if (ev.type === "error") continue;
      ctx.onEvent?.(ev as RunEvent);
    }

    const result = await handle.result;
    const elapsedMs = now() - startedAt;
    const stopReason = extractStopReason(result);

    if (stopReason !== null) {
      const failure = mapSdkStopToPileFailure(stopReason, {
        kind,
        elapsedMs,
        budget: ctx.budget
      });
      if (failure !== null) {
        return { ok: false, failure };
      }
    }

    return {
      ok: true,
      result,
      trace: result.trace,
      accounting: result.accounting,
      stopReason
    };
  } catch (err) {
    const elapsedMs = now() - startedAt;
    if (childSignal.aborted) {
      if (isTimeoutAbort(childSignal.reason)) {
        return {
          ok: false,
          failure: {
            kind,
            class: "pile-timeout",
            elapsedMs,
            configuredTimeoutMs: ctx.budget.timeoutMs
          }
        };
      }
      return {
        ok: false,
        failure: {
          kind,
          class: "pile-cancelled",
          reason: ctx.signal.aborted ? "parent-abort" : "sigint"
        }
      };
    }
    return {
      ok: false,
      failure: {
        kind,
        class: "pile-network",
        attempt: 1,
        lastError: {
          code: extractErrorCode(err),
          message: err instanceof Error ? err.message : String(err)
        }
      }
    };
  }
}
