import type { DeliveryRefusal } from "@protostar/delivery";

import type { CiCheckRun } from "./compute-ci-verdict.js";

export const DELIVERY_RESULT_SCHEMA_VERSION = "1.0.0" as const;

export type DeliveryResultCiVerdict = "pass" | "fail" | "pending" | "timeout-pending" | "no-checks-configured" | "cancelled";
export type CiTerminalVerdict = "pass" | "fail" | "no-checks-configured";
export type CiCancelledReason = "sigint" | "timeout" | "sentinel" | "parent-abort";

export interface DeliveryResultCiSnapshot {
  readonly at: string;
  readonly checks: readonly CiCheckRun[];
}

export interface DeliveryResultEvidenceComment {
  readonly kind: string;
  readonly commentId: number;
  readonly url: string;
}

export interface DeliveryResultCommentFailure {
  readonly kind: string;
  readonly reason: string;
}

export interface DeferredScreenshotStatus {
  readonly status: "deferred-v01";
  readonly reason: string;
}

/**
 * Phase 7 Q-17/Q-16 delivery-result.json wire shape. Screenshots are pinned to
 * Q-11's v0.1 deferred status until Phase 10 adds capture artifacts.
 */
export interface DeliveryResult {
  readonly schemaVersion: typeof DELIVERY_RESULT_SCHEMA_VERSION;
  readonly runId: string;
  readonly status: "delivered" | "delivery-blocked";
  readonly branch: string;
  readonly prUrl?: string;
  readonly prNumber?: number;
  readonly headSha?: string;
  readonly baseSha?: string;
  readonly baseBranch: string;
  readonly createdAt: string;
  readonly ciVerdict: DeliveryResultCiVerdict;
  readonly ciVerdictUpdatedAt: string;
  readonly ciSnapshots: readonly DeliveryResultCiSnapshot[];
  readonly evidenceComments: readonly DeliveryResultEvidenceComment[];
  readonly commentFailures: readonly DeliveryResultCommentFailure[];
  readonly exhaustedAt?: string;
  readonly screenshots: DeferredScreenshotStatus;
  readonly refusal?: DeliveryRefusal;
}

export type CiEvent =
  | { readonly kind: "pr-created"; readonly at: string; readonly prNumber: number; readonly prUrl: string; readonly headSha: string }
  | { readonly kind: "comment-posted"; readonly at: string; readonly commentKind: string; readonly commentId: number }
  | { readonly kind: "comment-failed"; readonly at: string; readonly commentKind: string; readonly reason: string }
  | { readonly kind: "ci-snapshot"; readonly at: string; readonly checks: readonly CiCheckRun[] }
  | { readonly kind: "ci-terminal"; readonly at: string; readonly verdict: CiTerminalVerdict }
  | { readonly kind: "ci-timeout"; readonly at: string }
  | { readonly kind: "ci-cancelled"; readonly at: string; readonly reason: CiCancelledReason };
