import {
  mintDeliveryAuthorization,
  type DeliveryAuthorization
} from "./delivery-authorization.js";

export interface LoadDeliveryAuthorizationInput {
  readonly decisionPath: string;
  readonly readJson: (path: string) => Promise<unknown>;
}

export async function loadDeliveryAuthorization(
  input: LoadDeliveryAuthorizationInput
): Promise<DeliveryAuthorization | null> {
  try {
    const raw = await input.readJson(input.decisionPath);
    if (!isApprovedReviewDecision(raw)) {
      return null;
    }

    return mintDeliveryAuthorization({
      runId: raw.runId,
      decisionPath: input.decisionPath
    });
  } catch {
    return null;
  }
}

function isApprovedReviewDecision(value: unknown): value is {
  readonly schemaVersion: "1.0.0";
  readonly runId: string;
  readonly planId: string;
  readonly mechanical: "pass";
  readonly model: "pass";
  readonly authorizedAt: string;
  readonly finalIteration: number;
  readonly finalDiffArtifact: unknown;
} {
  return (
    isRecord(value) &&
    value["schemaVersion"] === "1.0.0" &&
    typeof value["runId"] === "string" &&
    typeof value["planId"] === "string" &&
    value["mechanical"] === "pass" &&
    value["model"] === "pass" &&
    typeof value["authorizedAt"] === "string" &&
    typeof value["finalIteration"] === "number" &&
    isRecord(value["finalDiffArtifact"])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
