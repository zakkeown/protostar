import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mintDeliveryAuthorization,
  reAuthorizeFromPayload,
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

describe("reAuthorizeFromPayload", () => {
  it("re-mints a delivery authorization after re-reading a pass/pass decision", async () => {
    const result = await reAuthorizeFromPayload(validAuthorizationPayload(), {
      async readReviewDecision() {
        return validReviewDecision({ runId: "run-1" });
      }
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.authorization.runId, "run-1");
      assert.equal(result.authorization.decisionPath, "runs/run-1/review/review-decision.json");
      assert.equal(Object.getOwnPropertySymbols(result.authorization).length, 1);
    }
  });

  it("rejects when the persisted decision belongs to a different run", async () => {
    const result = await reAuthorizeFromPayload(validAuthorizationPayload(), {
      async readReviewDecision() {
        return validReviewDecision({ runId: "run-other" });
      }
    });

    assert.deepEqual(result, { ok: false, reason: "runId-mismatch" });
  });

  it("rejects when the mechanical gate is not pass", async () => {
    const result = await reAuthorizeFromPayload(validAuthorizationPayload(), {
      async readReviewDecision() {
        return { ...validReviewDecision({ runId: "run-1" }), mechanical: "fail" };
      }
    });

    assert.deepEqual(result, { ok: false, reason: "gate-not-pass" });
  });

  it("rejects when the model gate is not pass", async () => {
    const result = await reAuthorizeFromPayload(validAuthorizationPayload(), {
      async readReviewDecision() {
        return { ...validReviewDecision({ runId: "run-1" }), model: "block" };
      }
    });

    assert.deepEqual(result, { ok: false, reason: "gate-not-pass" });
  });

  it("rejects forged minimal pass/pass decisions", async () => {
    const result = await reAuthorizeFromPayload(validAuthorizationPayload(), {
      async readReviewDecision() {
        return { runId: "run-1", mechanical: "pass", model: "pass" };
      }
    });

    assert.deepEqual(result, { ok: false, reason: "gate-not-pass" });
  });

  it("rejects legacy verdict aliases instead of treating them as authorization evidence", async () => {
    const result = await reAuthorizeFromPayload(validAuthorizationPayload(), {
      async readReviewDecision() {
        return {
          schemaVersion: "1.0.0",
          runId: "run-1",
          planId: "plan-1",
          mechanicalVerdict: "pass",
          modelVerdict: "pass",
          authorizedAt: "2026-04-28T00:00:00.000Z",
          finalIteration: 1,
          finalDiffArtifact: {
            stage: "execution",
            kind: "diff",
            uri: "runs/run-1/execution/final.diff"
          }
        };
      }
    });

    assert.deepEqual(result, { ok: false, reason: "gate-not-pass" });
  });

  it("rejects decisions missing final diff evidence", async () => {
    const result = await reAuthorizeFromPayload(validAuthorizationPayload(), {
      async readReviewDecision() {
        const { finalDiffArtifact: _finalDiffArtifact, ...decision } = validReviewDecision({ runId: "run-1" });
        return decision;
      }
    });

    assert.deepEqual(result, { ok: false, reason: "gate-not-pass" });
  });

  it("rejects when the decision cannot be read", async () => {
    const result = await reAuthorizeFromPayload(validAuthorizationPayload(), {
      async readReviewDecision() {
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      }
    });

    assert.deepEqual(result, { ok: false, reason: "decision-missing" });
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

function validAuthorizationPayload() {
  return {
    schemaVersion: "1.0.0",
    runId: "run-1",
    decisionPath: "runs/run-1/review/review-decision.json",
    target: {
      owner: "owner",
      repo: "repo",
      baseBranch: "main"
    },
    branchName: "protostar/run-1",
    title: "Protostar factory run run-1",
    body: "Factory run body",
    headSha: "abc123",
    baseSha: "def456",
    mintedAt: "2026-04-28T19:00:00.000Z"
  } as const;
}

function validReviewDecision(input: { readonly runId: string }): ReviewDecisionArtifact {
  return {
    schemaVersion: "1.0.0",
    runId: input.runId,
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
}
