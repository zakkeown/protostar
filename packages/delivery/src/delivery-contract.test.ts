import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { StageArtifactRef } from "@protostar/artifacts";
import { mintDeliveryAuthorization } from "@protostar/review";

import type { BranchName, PrBody, PrTitle } from "./brands.js";
import type {
  createGitHubPrDeliveryPlan as createGitHubPrDeliveryPlanType,
  GitHubPrDeliveryInput,
  GitHubPrDeliveryPlan
} from "./delivery-contract.js";

declare const createGitHubPrDeliveryPlan: typeof createGitHubPrDeliveryPlanType;

const bodyArtifact = {
  stage: "release",
  kind: "github-pr-body",
  uri: "delivery/pr-body.md"
} satisfies StageArtifactRef;

const branch = "protostar/run-1" as BranchName;
const baseBranch = "main" as BranchName;
const title = "Protostar factory run run-1" as PrTitle;
const body = "Factory run body" as PrBody;

describe("DeliveryAuthorization-gated GitHub PR delivery contract", () => {
  it("accepts a minted DeliveryAuthorization as the required first argument", () => {
    const authorization = mintDeliveryAuthorization({
      runId: "run-1",
      decisionPath: "runs/run-1/review/review-decision.json"
    });

    type InputMatchesContract = Parameters<typeof createGitHubPrDeliveryPlan>[1] extends GitHubPrDeliveryInput
      ? true
      : false;
    type OutputMatchesContract = ReturnType<typeof createGitHubPrDeliveryPlan> extends GitHubPrDeliveryPlan
      ? true
      : false;

    const inputMatches: InputMatchesContract = true;
    const outputMatches: OutputMatchesContract = true;

    assert.equal(inputMatches, true);
    assert.equal(outputMatches, true);
    assert.equal(authorization.runId, "run-1");
  });
});

if (false) {
  // @ts-expect-error delivery planning requires DeliveryAuthorization as the first argument.
  void createGitHubPrDeliveryPlan({
    branch,
    title,
    body,
    target: { owner: "owner", repo: "repo", baseBranch }
  });

  void createGitHubPrDeliveryPlan(
    // @ts-expect-error plain object literals cannot satisfy the private DeliveryAuthorization brand.
    { runId: "run-1", decisionPath: "runs/run-1/review/review-decision.json" },
    {
      branch,
      title,
      body,
      target: { owner: "owner", repo: "repo", baseBranch }
    }
  );

  void createGitHubPrDeliveryPlan(mintDeliveryAuthorization({ runId: "run-1", decisionPath: "decision.json" }), {
    // @ts-expect-error raw strings cannot satisfy the delivery branch brand.
    branch: "protostar/run-1",
    // @ts-expect-error raw strings cannot satisfy the delivery title brand.
    title: "Protostar factory run run-1",
    // @ts-expect-error raw strings cannot satisfy the delivery body brand.
    body: "Factory run body",
    target: {
      owner: "owner",
      repo: "repo",
      // @ts-expect-error raw strings cannot satisfy the base branch brand.
      baseBranch: "main"
    }
  });

  void bodyArtifact;
}
