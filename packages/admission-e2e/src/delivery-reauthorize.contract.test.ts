import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { StageArtifactRef } from "@protostar/artifacts";
import type { AuthorizationPayload } from "@protostar/delivery";
import { reAuthorizeFromPayload } from "@protostar/review";

describe("delivery reauthorization - Phase 9 Q-21 lock", () => {
  it("round-trips a persisted authorization payload through reAuthorizeFromPayload", async () => {
    const payload = makePayload();
    const result = await reAuthorizeFromPayload(payload, {
      readReviewDecision: async () => makeReviewDecision(payload.runId, "pass", "pass")
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.authorization.runId, payload.runId);
    assert.equal(result.authorization.decisionPath, payload.decisionPath);
  });

  it("rejects a tampered payload runId with runId-mismatch", async () => {
    const payload = { ...makePayload(), runId: "tampered-run" };
    const result = await reAuthorizeFromPayload(payload, {
      readReviewDecision: async () => makeReviewDecision("delivery-run", "pass", "pass")
    });

    assert.deepEqual(result, { ok: false, reason: 'runId-mismatch' });
  });

  it("rejects a non-pass review decision with gate-not-pass", async () => {
    const payload = makePayload();
    const result = await reAuthorizeFromPayload(payload, {
      readReviewDecision: async () => makeReviewDecision(payload.runId, "pass", "fail")
    });

    assert.deepEqual(result, { ok: false, reason: 'gate-not-pass' });
  });
});

function makePayload(): AuthorizationPayload {
  return {
    schemaVersion: "1.0.0",
    runId: "delivery-run",
    decisionPath: "review/review-decision.json",
    target: {
      owner: "protostar",
      repo: "toy",
      baseBranch: "main"
    },
    branchName: "protostar/delivery-run",
    title: "Deliver delivery-run",
    body: "Evidence bundle",
    headSha: "abc123",
    baseSha: "def456",
    mintedAt: "2026-04-28T00:00:00.000Z"
  };
}

function makeReviewDecision(runId: string, mechanical: "pass", model: "pass" | "fail"): unknown {
  return {
    schemaVersion: "1.0.0",
    runId,
    planId: "plan-delivery",
    mechanical,
    model,
    authorizedAt: "2026-04-28T00:00:01.000Z",
    finalIteration: 0,
    finalDiffArtifact: {
      stage: "review",
      kind: "diff",
      uri: "review/final.diff"
    } satisfies StageArtifactRef
  };
}
