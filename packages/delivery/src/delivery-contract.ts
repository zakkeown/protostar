import type { StageArtifactRef } from "@protostar/artifacts";
import type { BranchName, PrBody, PrTitle } from "./brands.js";

declare const DeliveryAuthorizationContractBrand: unique symbol;

export interface DeliveryAuthorization {
  readonly [DeliveryAuthorizationContractBrand]: true;
  readonly runId: string;
  readonly decisionPath: string;
}

// Phase 5 type-pin for Phase 7, tightened by Q-02/Q-08: no gh argv emission,
// and delivery entry data is brand-minted before any outbound I/O.
export interface GitHubPrDeliveryTarget {
  readonly owner: string;
  readonly repo: string;
  readonly baseBranch: BranchName;
}

export interface GitHubPrDeliveryInput {
  readonly branch: BranchName;
  readonly title: PrTitle;
  readonly body: PrBody;
  readonly target: GitHubPrDeliveryTarget;
}

export interface GitHubPrDeliveryPlan {
  readonly kind: "github-pr-delivery-plan";
  readonly authorization: DeliveryAuthorization;
  readonly branch: BranchName;
  readonly title: PrTitle;
  readonly body: PrBody;
  readonly target: GitHubPrDeliveryTarget;
  readonly artifact: StageArtifactRef;
}

export declare function createGitHubPrDeliveryPlan(
  authorization: DeliveryAuthorization,
  input: GitHubPrDeliveryInput
): GitHubPrDeliveryPlan;
