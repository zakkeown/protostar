import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { mapOctokitErrorToRefusal } from "./map-octokit-error.js";

const target = { owner: "protostar", repo: "factory", baseBranch: "main" } as const;
const token = "ghp_123456789012345678901234567890123456";
const fineGrainedToken =
  "github_pat_1234567890123456789012_12345678901234567890123456789012345678901234567890123456789";

describe("mapOctokitErrorToRefusal", () => {
  it("maps 401 to token-invalid", () => {
    assert.deepEqual(mapOctokitErrorToRefusal({ status: 401, message: "Bad credentials" }, { phase: "preflight" }), {
      kind: "token-invalid",
      evidence: { reason: "401" }
    });
  });

  it("maps preflight 403 with target to repo-inaccessible without leaking auth headers", () => {
    const refusal = mapOctokitErrorToRefusal(
      {
        status: 403,
        message: "Forbidden",
        request: { headers: { authorization: `Bearer ${token}`, cookie: `sid=${token}` } }
      },
      { phase: "preflight", target }
    );

    assert.deepEqual(refusal, {
      kind: "repo-inaccessible",
      evidence: { status: 403, owner: "protostar", repo: "factory" }
    });
    assert.equal(JSON.stringify(refusal).includes(token), false);
  });

  it("maps branch-shaped preflight 404 to base-branch-missing", () => {
    assert.deepEqual(
      mapOctokitErrorToRefusal({ status: 404, message: "Branch not found" }, { phase: "preflight", target }),
      { kind: "base-branch-missing", evidence: { baseBranch: "main" } }
    );
  });

  it("maps AbortError to cancelled parent-abort", () => {
    assert.deepEqual(mapOctokitErrorToRefusal({ name: "AbortError" }, { phase: "push" }), {
      kind: "cancelled",
      evidence: { reason: "parent-abort", phase: "push" }
    });
  });

  it("maps PR title validation errors to invalid-title with a redacted message excerpt", () => {
    assert.deepEqual(
      mapOctokitErrorToRefusal({ status: 422, message: `Validation Failed: title ${token}` }, { phase: "pr-create" }),
      { kind: "invalid-title", evidence: { input: "Validation Failed: title ***" } }
    );
  });

  it("maps PR body validation errors to invalid-body with fine-grained tokens redacted", () => {
    const refusal = mapOctokitErrorToRefusal(
      {
        status: 422,
        message: `Validation Failed: body ${fineGrainedToken}`,
        request: { headers: { "x-github-token": fineGrainedToken } }
      },
      { phase: "pr-create" }
    );

    assert.deepEqual(refusal, { kind: "invalid-body", evidence: { input: "Validation Failed: body ***" } });
    assert.equal(JSON.stringify(refusal).includes(fineGrainedToken), false);
  });

  it("falls back to a github-api-error refusal without serializing the raw Octokit error", () => {
    const refusal = mapOctokitErrorToRefusal(
      {
        status: 500,
        message: `Server error for ${token}`,
        request: { headers: { authorization: `Bearer ${token}` } }
      },
      { phase: "poll" }
    );

    assert.deepEqual(refusal, {
      kind: "github-api-error",
      evidence: { phase: "poll", status: 500, message: "Server error for ***" }
    });
    assert.equal(JSON.stringify(refusal).includes(token), false);
  });
});
