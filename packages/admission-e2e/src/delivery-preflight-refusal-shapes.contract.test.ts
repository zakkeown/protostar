import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

const OUTCOMES = [
  "token-missing",
  "token-invalid",
  "repo-inaccessible",
  "base-branch-missing",
  "excessive-pat-scope"
] as const;

type RefusalOutcome = (typeof OUTCOMES)[number];

interface PreflightRefusalArtifact {
  readonly phase: "fast" | "full";
  readonly result: { readonly outcome: RefusalOutcome; readonly [key: string]: unknown };
  readonly runId: string;
  readonly at: string;
}

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

// Mirrors factory-cli's `{ phase, result, runId, at }` refusal JSON for Phase 9 inspect consumers.
function assertPreflightRefusalArtifact(value: unknown): asserts value is PreflightRefusalArtifact {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes("ghp_"), false, "classic GitHub PAT leaked into refusal artifact");
  assert.equal(serialized.includes("github_pat_"), false, "fine-grained GitHub PAT leaked into refusal artifact");

  assertRecord(value);
  assert.ok(value.phase === "fast" || value.phase === "full");
  assertString(value.runId, "runId");
  assertIsoTimestamp(value.at, "at");
  assertRecord(value.result);

  const outcome = value.result.outcome;
  assert.ok(isRefusalOutcome(outcome), `unexpected refusal outcome: ${String(outcome)}`);
  assertOutcomeShape(value.result as { readonly outcome: RefusalOutcome; readonly [key: string]: unknown });
}

function assertOutcomeShape(result: { readonly outcome: RefusalOutcome; readonly [key: string]: unknown }): void {
  switch (result.outcome) {
    case "token-missing":
      return;
    case "token-invalid":
      assert.ok(result.reason === "format" || result.reason === "401");
      return;
    case "repo-inaccessible":
      assert.ok(result.status === 403 || result.status === 404);
      return;
    case "base-branch-missing":
      assertString(result.baseBranch, "baseBranch");
      return;
    case "excessive-pat-scope":
      assert.ok(Array.isArray(result.scopes));
      assert.ok(Array.isArray(result.forbidden));
      return;
  }
}

function isRefusalOutcome(value: unknown): value is RefusalOutcome {
  return typeof value === "string" && (OUTCOMES as readonly string[]).includes(value);
}

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
}

function assertString(value: unknown, field: string): asserts value is string {
  assert.equal(typeof value, "string", `${field} must be a string`);
}

function assertIsoTimestamp(value: unknown, field: string): asserts value is string {
  assertString(value, field);
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(new Date(value).toISOString(), value);
}
