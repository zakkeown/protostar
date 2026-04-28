import type { StageArtifactRef } from "@protostar/artifacts";
import type { ConfirmedIntent } from "@protostar/intent";
import type { DeliveryAuthorization } from "@protostar/review";

// Phase 5 type-pin for Phase 7. Phase 7 implements `createGitHubPrDeliveryPlan`
// against this signature in `packages/delivery/src/github-pr-delivery.ts` (or
// similar). Any input/output change here is a cross-phase break; coordinate with
// Phase 7.
export interface GitHubPrDeliveryInput {
  readonly confirmedIntent: ConfirmedIntent;
  readonly headRef: string;
  readonly baseRef: string;
  readonly title: string;
  readonly bodyArtifact: StageArtifactRef;
}

export interface GitHubPrDeliveryPlan {
  readonly kind: "github-pr-delivery-plan";
  readonly authorization: DeliveryAuthorization;
  readonly command: readonly string[];
  readonly artifact: StageArtifactRef;
}

export declare function createGitHubPrDeliveryPlan(
  authorization: DeliveryAuthorization,
  input: GitHubPrDeliveryInput
): GitHubPrDeliveryPlan;
