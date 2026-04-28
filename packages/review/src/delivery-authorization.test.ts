import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mintDeliveryAuthorization,
  type DeliveryAuthorization,
  type LoadDeliveryAuthorization,
  type ReviewDecisionArtifact
} from "./delivery-authorization.js";

describe("DeliveryAuthorization brand", () => {
  it("mints a branded delivery authorization with runtime symbol evidence", () => {
    const authorization: DeliveryAuthorization = mintDeliveryAuthorization({
      runId: "run-1",
      decisionPath: "/path/to/review-decision.json"
    });

    assert.equal(authorization.runId, "run-1");
    assert.equal(authorization.decisionPath, "/path/to/review-decision.json");
    assert.equal(Object.getOwnPropertySymbols(authorization).length, 1);
  });

  it("keeps review decision artifacts strict pass/pass and load helpers callable", async () => {
    const artifact: ReviewDecisionArtifact = {
      schemaVersion: "1.0.0",
      runId: "run-1",
      planId: "plan-1",
      mechanical: "pass",
      model: "pass",
      authorizedAt: "2026-04-28T00:00:00.000Z",
      finalIteration: 1,
      finalDiffArtifact: {
        stage: "execution",
        kind: "diff",
        uri: "runs/run-1/execution/final.diff"
      }
    };
    const load: LoadDeliveryAuthorization = async () => mintDeliveryAuthorization({
      runId: artifact.runId,
      decisionPath: "/path/to/review-decision.json"
    });

    const loaded = await load({
      decisionPath: "/path/to/review-decision.json",
      async readJson() {
        return artifact;
      }
    });

    assert.equal(artifact.model, "pass");
    assert.equal(loaded?.runId, "run-1");
  });
});

// @ts-expect-error direct object literals cannot satisfy the private delivery brand.
const _forgedDeliveryAuthorization: DeliveryAuthorization = {
  runId: "run-1",
  decisionPath: "x"
};

const _forgedWithAssertion: DeliveryAuthorization = {
  runId: "run-1",
  decisionPath: "x"
} as DeliveryAuthorization;
assert.equal(_forgedWithAssertion.runId, "run-1");

const _skippedModelDecision: ReviewDecisionArtifact = {
  schemaVersion: "1.0.0",
  runId: "run-1",
  planId: "plan-1",
  mechanical: "pass",
  // @ts-expect-error delivery authorization requires model review to pass explicitly.
  model: "skipped",
  authorizedAt: "2026-04-28T00:00:00.000Z",
  finalIteration: 1,
  finalDiffArtifact: {
    stage: "execution",
    kind: "diff",
    uri: "runs/run-1/execution/final.diff"
  }
};
assert.equal(_skippedModelDecision.mechanical, "pass");
