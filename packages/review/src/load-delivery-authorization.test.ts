/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mintDeliveryAuthorization } from "./delivery-authorization.js";
import { loadDeliveryAuthorization } from "./load-delivery-authorization.js";

describe("loadDeliveryAuthorization", () => {
  it("re-mints a branded authorization from a strict pass/pass decision artifact", async () => {
    const authorization = await loadDeliveryAuthorization({
      decisionPath: "/runs/r-1/review/review-decision.json",
      async readJson() {
        return decisionArtifact();
      }
    });

    assert.equal(authorization?.runId, "r-1");
    assert.equal(authorization?.decisionPath, "/runs/r-1/review/review-decision.json");
    assert.equal(Object.getOwnPropertySymbols(authorization ?? {}).length, 1);
  });

  it("returns null when model is not pass", async () => {
    const authorization = await loadDeliveryAuthorization({
      decisionPath: "/runs/r-1/review/review-decision.json",
      async readJson() {
        return {
          ...decisionArtifact(),
          model: "skipped"
        };
      }
    });

    assert.equal(authorization, null);
  });

  it("returns null when mechanical is not pass", async () => {
    const authorization = await loadDeliveryAuthorization({
      decisionPath: "/runs/r-1/review/review-decision.json",
      async readJson() {
        return {
          ...decisionArtifact(),
          mechanical: "block"
        };
      }
    });

    assert.equal(authorization, null);
  });

  it("returns null when readJson throws an ENOENT-like error", async () => {
    const authorization = await loadDeliveryAuthorization({
      decisionPath: "/runs/r-1/review/review-decision.json",
      async readJson() {
        const error = new Error("missing") as Error & { code: string };
        error.code = "ENOENT";
        throw error;
      }
    });

    assert.equal(authorization, null);
  });

  it("returns null for malformed decision artifacts", async () => {
    const authorization = await loadDeliveryAuthorization({
      decisionPath: "/runs/r-1/review/review-decision.json",
      async readJson() {
        return { schemaVersion: "1.0.0", mechanical: "pass", model: "pass" };
      }
    });

    assert.equal(authorization, null);
  });

  it("round-trips runId and decisionPath from mint to load", async () => {
    const minted = mintDeliveryAuthorization({
      runId: "r-1",
      decisionPath: "/runs/r-1/review/review-decision.json"
    });
    const loaded = await loadDeliveryAuthorization({
      decisionPath: minted.decisionPath,
      async readJson() {
        return decisionArtifact();
      }
    });

    assert.deepEqual(
      {
        runId: loaded?.runId,
        decisionPath: loaded?.decisionPath,
        symbolCount: Object.getOwnPropertySymbols(loaded ?? {}).length
      },
      {
        runId: minted.runId,
        decisionPath: minted.decisionPath,
        symbolCount: 1
      }
    );
  });
});

function decisionArtifact() {
  return {
    schemaVersion: "1.0.0",
    runId: "r-1",
    planId: "plan-1",
    mechanical: "pass",
    model: "pass",
    authorizedAt: "2026-04-28T01:00:00.000Z",
    finalIteration: 1,
    finalDiffArtifact: {
      stage: "execution",
      kind: "diff",
      uri: "runs/r-1/execution/final.diff"
    }
  };
}
