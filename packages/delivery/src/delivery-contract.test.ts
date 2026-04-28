import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { StageArtifactRef } from "@protostar/artifacts";
import type { ConfirmedIntent } from "@protostar/intent";
import { mintDeliveryAuthorization } from "@protostar/review";

import {
  createGitHubPrDeliveryPlan,
  type GitHubPrDeliveryInput,
  type GitHubPrDeliveryPlan
} from "./delivery-contract.js";

const confirmedIntent = {
  id: "intent-1",
  title: "Deliver a reviewed run"
} as ConfirmedIntent;

const bodyArtifact = {
  stage: "release",
  kind: "github-pr-body",
  uri: "delivery/pr-body.md"
} satisfies StageArtifactRef;

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

    void createGitHubPrDeliveryPlan(authorization, {
      confirmedIntent,
      headRef: "protostar/run-1",
      baseRef: "main",
      title: "Protostar factory run run-1",
      bodyArtifact
    });
  });
});

// @ts-expect-error delivery planning requires DeliveryAuthorization as the first argument.
void createGitHubPrDeliveryPlan({
  confirmedIntent,
  headRef: "protostar/run-1",
  baseRef: "main",
  title: "Protostar factory run run-1",
  bodyArtifact
});

// @ts-expect-error plain object literals cannot satisfy the private DeliveryAuthorization brand.
void createGitHubPrDeliveryPlan(
  {
    runId: "run-1",
    decisionPath: "runs/run-1/review/review-decision.json"
  },
  {
    confirmedIntent,
    headRef: "protostar/run-1",
    baseRef: "main",
    title: "Protostar factory run run-1",
    bodyArtifact
  }
);
