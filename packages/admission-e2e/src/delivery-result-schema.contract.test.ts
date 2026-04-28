import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { DELIVERY_RESULT_SCHEMA_VERSION, type DeliveryResult, type DeliveryResultCiVerdict } from "@protostar/delivery-runtime";

describe("delivery-result.json schema contract (Q-17)", () => {
  it("round-trips a delivered fixture through JSON", () => {
    const validDelivered: DeliveryResult = buildDeliveredResult();
    const parsed = JSON.parse(JSON.stringify(validDelivered)) as unknown;

    assertDeliveryResult(parsed);
    assert.deepEqual(parsed, validDelivered);
  });

  it("pins schemaVersion to 1.0.0", () => {
    const validDelivered = buildDeliveredResult();

    assert.equal(validDelivered.schemaVersion, "1.0.0");
    assert.equal(validDelivered.schemaVersion, DELIVERY_RESULT_SCHEMA_VERSION);
  });

  it("validates a delivery-blocked fixture with refusal evidence", () => {
    const validBlocked: DeliveryResult = buildBlockedResult();
    const parsed = JSON.parse(JSON.stringify(validBlocked)) as unknown;

    assertDeliveryResult(parsed);
    assert.deepEqual(parsed, validBlocked);
  });

  it("pins deferred screenshot status from Q-11", () => {
    const validDelivered = buildDeliveredResult();

    assert.equal(validDelivered.screenshots.status, "deferred-v01");
  });

  it("rejects an old fixture missing schemaVersion", () => {
    const oldResult = {
      ...buildDeliveredResult(),
      schemaVersion: undefined
    };
    delete (oldResult as { schemaVersion?: unknown }).schemaVersion;

    assert.throws(() => assertDeliveryResult(oldResult));
  });

  it("accepts every CI verdict union value", () => {
    const verdicts: readonly DeliveryResultCiVerdict[] = [
      "pass",
      "fail",
      "pending",
      "timeout-pending",
      "no-checks-configured",
      "cancelled"
    ];

    for (const ciVerdict of verdicts) {
      const parsed = JSON.parse(JSON.stringify(buildDeliveredResult({ ciVerdict }))) as unknown;
      assertDeliveryResult(parsed);
    }
  });
});

function buildDeliveredResult(overrides: Partial<DeliveryResult> = {}): DeliveryResult {
  return {
    schemaVersion: DELIVERY_RESULT_SCHEMA_VERSION,
    runId: "run_delivery_result_contract",
    status: "delivered",
    branch: "protostar/cosmetic-tweak/result-contract-a1b2c3",
    prUrl: "https://github.com/protostar-test/fixture-toy/pull/42",
    prNumber: 42,
    headSha: "0123456789abcdef0123456789abcdef01234567",
    baseSha: "abcdef0123456789abcdef0123456789abcdef01",
    baseBranch: "main",
    createdAt: "2026-04-28T00:00:00.000Z",
    ciVerdict: "pass",
    ciVerdictUpdatedAt: "2026-04-28T00:01:00.000Z",
    ciSnapshots: [
      {
        at: "2026-04-28T00:00:30.000Z",
        checks: [
          {
            name: "verify",
            status: "completed",
            conclusion: "success"
          }
        ]
      }
    ],
    evidenceComments: [
      {
        kind: "mechanical-full",
        commentId: 1001,
        url: "https://github.com/protostar-test/fixture-toy/pull/42#issuecomment-1001"
      }
    ],
    commentFailures: [],
    screenshots: {
      status: "deferred-v01",
      reason: "Tauri capture pipeline lands in Phase 10 with toy repo"
    },
    ...overrides
  };
}

function buildBlockedResult(): DeliveryResult {
  const { prUrl: _prUrl, prNumber: _prNumber, headSha: _headSha, baseSha: _baseSha, ...base } = buildDeliveredResult({
    status: "delivery-blocked",
    ciVerdict: "cancelled"
  });

  return {
    ...base,
    refusal: {
      kind: "base-branch-missing",
      evidence: {
        baseBranch: "release/missing"
      }
    }
  };
}

function assertDeliveryResult(value: unknown): asserts value is DeliveryResult {
  assertRecord(value);
  assert.equal(value.schemaVersion, DELIVERY_RESULT_SCHEMA_VERSION);
  assert.ok(value.status === "delivered" || value.status === "delivery-blocked");
  assertString(value.runId, "runId");
  assertString(value.branch, "branch");
  assertString(value.baseBranch, "baseBranch");
  assertString(value.createdAt, "createdAt");
  assert.ok(
    ["pass", "fail", "pending", "timeout-pending", "no-checks-configured", "cancelled"].includes(
      getString(value, "ciVerdict")
    )
  );
  assertString(value.ciVerdictUpdatedAt, "ciVerdictUpdatedAt");
  assert.ok(Array.isArray(value.ciSnapshots));
  assert.ok(Array.isArray(value.evidenceComments));
  assert.ok(Array.isArray(value.commentFailures));
  assertRecord(value.screenshots);
  assert.equal(value.screenshots.status, "deferred-v01");
  assertString(value.screenshots.reason, "screenshots.reason");

  if (value.status === "delivered") {
    assertString(value.prUrl, "prUrl");
    assert.equal(typeof value.prNumber, "number");
    assertString(value.headSha, "headSha");
    assertString(value.baseSha, "baseSha");
  } else {
    assertRecord(value.refusal);
    assertString(value.refusal.kind, "refusal.kind");
  }
}

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
}

function assertString(value: unknown, field: string): asserts value is string {
  assert.equal(typeof value, "string", `${field} must be a string`);
}

function getString(value: Record<string, unknown>, field: string): string {
  const candidate = value[field];
  assertString(candidate, field);
  return candidate;
}
