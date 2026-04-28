/**
 * Q-10 envelope-clamps-preset budget resolver.
 *
 * Mirrors Phase 2's `intersectEnvelopes` precedence kernel: preset is the
 * developer-proposed default; envelope is the operator-authoritative cap.
 * Per-field min where both are defined; envelope-omitted fields pass preset
 * through (envelope is a CAP, not a FLOOR).
 *
 * Pure: no I/O, no clock reads.
 */

import type {
  EnvelopeBudget,
  PresetBudget,
  ResolvedPileBudget
} from "./pile-failure-types.js";

function minDefined(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.min(a, b);
}

export function resolvePileBudget(
  preset: PresetBudget,
  envelope: EnvelopeBudget
): ResolvedPileBudget {
  const maxTokens = minDefined(preset.maxTokens, envelope.maxTokens) ?? Number.MAX_SAFE_INTEGER;
  const timeoutMs = minDefined(preset.timeoutMs, envelope.timeoutMs) ?? Number.MAX_SAFE_INTEGER;
  const maxCalls = minDefined(preset.maxCalls, envelope.maxCalls);

  if (maxCalls === undefined) {
    return { maxTokens, timeoutMs };
  }
  return { maxTokens, timeoutMs, maxCalls };
}
