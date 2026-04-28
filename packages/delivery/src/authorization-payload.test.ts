import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isAuthorizationPayload, type AuthorizationPayload } from "./authorization-payload.js";

const validPayload = {
  schemaVersion: "1.0.0",
  runId: "run_123",
  decisionPath: "runs/run_123/review/review-decision.json",
  target: {
    owner: "owner",
    repo: "repo",
    baseBranch: "main"
  },
  branchName: "protostar/run_123",
  title: "Protostar factory run run_123",
  body: "Factory run body",
  headSha: "abc123",
  baseSha: "def456",
  mintedAt: "2026-04-28T19:00:00.000Z"
} satisfies AuthorizationPayload;

describe("AuthorizationPayload", () => {
  it("accepts a valid persisted authorization payload", () => {
    assert.equal(isAuthorizationPayload(validPayload), true);
  });

  it("rejects missing runId", () => {
    const { runId: _runId, ...payload } = validPayload;

    assert.equal(isAuthorizationPayload(payload), false);
  });

  it("rejects missing target", () => {
    const { target: _target, ...payload } = validPayload;

    assert.equal(isAuthorizationPayload(payload), false);
  });

  it("rejects malformed branchName", () => {
    assert.equal(
      isAuthorizationPayload({
        ...validPayload,
        branchName: "protostar/run 123"
      }),
      false
    );
  });

  it("rejects missing schemaVersion", () => {
    const { schemaVersion: _schemaVersion, ...payload } = validPayload;

    assert.equal(isAuthorizationPayload(payload), false);
  });
});
