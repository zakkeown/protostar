import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

const OUTCOMES = [
  "token-missing",
  "token-invalid",
  "repo-inaccessible",
  "base-branch-missing",
  "excessive-pat-scope"
] as const;

describe("delivery preflight refusal artifact shapes", () => {
  for (const outcome of OUTCOMES) {
    it(`validates ${outcome} refusal artifact shape`, () => {
      const artifact = buildRefusalArtifact(outcome);

      assertPreflightRefusalArtifact(artifact);
      assert.equal(artifact.result.outcome, outcome);
    });
  }

  it("rejects refusal JSON that includes a classic PAT", () => {
    const artifact = buildRefusalArtifact("token-invalid", {
      reason: "401",
      message: "Bad credentials for ghp_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE"
    });

    assert.throws(() => assertPreflightRefusalArtifact(artifact));
  });

  it("rejects refusal JSON that includes a fine-grained PAT", () => {
    const artifact = buildRefusalArtifact("repo-inaccessible", {
      status: 403,
      token: "github_pat_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE"
    });

    assert.throws(() => assertPreflightRefusalArtifact(artifact));
  });
});

function buildRefusalArtifact(outcome: (typeof OUTCOMES)[number], extraResult: Record<string, unknown> = {}) {
  const baseResult = resultFor(outcome);
  return {
    phase: outcome === "token-missing" ? "fast" : "full",
    result: {
      ...baseResult,
      ...extraResult
    },
    runId: "run_preflight_refusal_contract",
    at: "2026-04-28T00:00:00.000Z"
  };
}

function resultFor(outcome: (typeof OUTCOMES)[number]): Record<string, unknown> {
  switch (outcome) {
    case "token-missing":
      return { outcome };
    case "token-invalid":
      return { outcome, reason: "401" };
    case "repo-inaccessible":
      return { outcome, status: 403 };
    case "base-branch-missing":
      return { outcome, baseBranch: "release/missing" };
    case "excessive-pat-scope":
      return { outcome, scopes: ["repo", "admin:org"], forbidden: ["admin:org"] };
  }
}
