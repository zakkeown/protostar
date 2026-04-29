export interface DetectStressWedgeInput {
  readonly runId: string;
  readonly status: string;
  readonly lastStatusTransitionAt: string;
  readonly now?: string;
  readonly p95SuccessfulDurationMs: number;
  readonly hasCancelSentinel: boolean;
}

export interface StressWedgeEvidence {
  readonly sessionId?: string;
  readonly runId: string;
  readonly detectedAt: string;
  readonly p95SuccessfulDurationMs: number;
  readonly idleDurationMs: number;
  readonly reason: string;
  readonly status?: string;
  readonly lastStatusTransitionAt?: string;
}

export type DetectStressWedgeResult =
  | { readonly kind: "ok" }
  | { readonly kind: "wedge"; readonly evidence: StressWedgeEvidence };

const TERMINAL_STATUSES = new Set(["completed", "blocked", "cancelled", "failed", "pass"]);

export function detectStressWedge(input: DetectStressWedgeInput): DetectStressWedgeResult {
  if (input.hasCancelSentinel || TERMINAL_STATUSES.has(input.status) || input.p95SuccessfulDurationMs <= 0) {
    return { kind: "ok" };
  }

  const detectedAt = input.now ?? new Date().toISOString();
  const idleDurationMs = Date.parse(detectedAt) - Date.parse(input.lastStatusTransitionAt);
  if (!Number.isFinite(idleDurationMs) || idleDurationMs <= 5 * input.p95SuccessfulDurationMs) {
    return { kind: "ok" };
  }

  return {
    kind: "wedge",
    evidence: {
      runId: input.runId,
      detectedAt,
      p95SuccessfulDurationMs: input.p95SuccessfulDurationMs,
      idleDurationMs,
      reason: "status unchanged for > 5x p95",
      status: input.status,
      lastStatusTransitionAt: input.lastStatusTransitionAt
    }
  };
}
