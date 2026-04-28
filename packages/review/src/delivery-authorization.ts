import type { StageArtifactRef } from "@protostar/artifacts";

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

// INTERNAL: only call from runReviewRepairLoop on approved exit (Plan 05-10).
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
