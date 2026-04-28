import type { StageArtifactRef } from "@protostar/artifacts";
import {
  isAuthorizationPayload,
  type AuthorizationPayload
} from "@protostar/delivery/authorization-payload";

const DeliveryAuthorizationBrand: unique symbol = Symbol("DeliveryAuthorization");

export interface DeliveryAuthorization {
  readonly [DeliveryAuthorizationBrand]: true;
  readonly runId: string;
  readonly decisionPath: string;
}

export interface ReviewDecisionArtifact {
  readonly schemaVersion: "1.0.0";
  readonly runId: string;
  readonly planId: string;
  readonly mechanical: "pass";
  readonly model: "pass";
  readonly authorizedAt: string;
  readonly finalIteration: number;
  readonly finalDiffArtifact: StageArtifactRef;
  readonly signature?: string;
}

// Mints DeliveryAuthorization. Legitimate callers: runReviewRepairLoop (in-loop), reAuthorizeFromPayload (external resume via factory-cli deliver). All other callers must use reAuthorizeFromPayload.
export function mintDeliveryAuthorization(input: {
  readonly runId: string;
  readonly decisionPath: string;
}): DeliveryAuthorization {
  return Object.freeze({
    [DeliveryAuthorizationBrand]: true as const,
    runId: input.runId,
    decisionPath: input.decisionPath
  });
}

export type LoadDeliveryAuthorization = (input: {
  readonly decisionPath: string;
  readonly readJson: (path: string) => Promise<unknown>;
}) => Promise<DeliveryAuthorization | null>;

export interface ReAuthorizeRuntimeDeps {
  readonly readReviewDecision: (decisionPath: string) => Promise<unknown>;
}

export type ReAuthorizeResult =
  | { readonly ok: true; readonly authorization: DeliveryAuthorization }
  | { readonly ok: false; readonly reason: string };

/**
 * Re-mint a DeliveryAuthorization brand from a persisted AuthorizationPayload.
 *
 * This is the heavyweight validator entrypoint for Phase 9 Q-21 / Plan 09-09:
 * callers may persist validator inputs, but the brand is always minted here
 * after the on-disk review decision is re-read and checked for pass/pass.
 */
export async function reAuthorizeFromPayload(
  payload: AuthorizationPayload,
  deps: ReAuthorizeRuntimeDeps
): Promise<ReAuthorizeResult> {
  if (!isAuthorizationPayload(payload)) {
    return { ok: false, reason: 'invalid-payload' };
  }

  let decisionRaw: unknown;
  try {
    decisionRaw = await deps.readReviewDecision(payload.decisionPath);
  } catch {
    return { ok: false, reason: 'decision-missing' };
  }

  if (!isApprovedReviewDecision(decisionRaw)) {
    return { ok: false, reason: 'gate-not-pass' };
  }

  if (decisionRaw.runId !== payload.runId) {
    return { ok: false, reason: 'runId-mismatch' };
  }

  return {
    ok: true,
    authorization: mintDeliveryAuthorization({
      runId: payload.runId,
      decisionPath: payload.decisionPath
    })
  };
}

function isApprovedReviewDecision(value: unknown): value is ReviewDecisionArtifact {
  return (
    isRecord(value) &&
    value["schemaVersion"] === "1.0.0" &&
    typeof value["runId"] === "string" &&
    typeof value["planId"] === "string" &&
    value["mechanical"] === "pass" &&
    value["model"] === "pass" &&
    typeof value["authorizedAt"] === "string" &&
    typeof value["finalIteration"] === "number" &&
    isStageArtifactRef(value["finalDiffArtifact"])
  );
}

function isStageArtifactRef(value: unknown): value is StageArtifactRef {
  return (
    isRecord(value) &&
    typeof value["stage"] === "string" &&
    typeof value["kind"] === "string" &&
    typeof value["uri"] === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
