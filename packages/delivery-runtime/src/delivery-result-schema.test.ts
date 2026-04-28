import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  DELIVERY_RESULT_SCHEMA_VERSION,
  type CiEvent,
  type DeliveryResult,
  type DeliveryResultCiVerdict
} from "./delivery-result-schema.js";

const checks = [{ name: "build", status: "completed", conclusion: "success" }];

describe("delivery-result schema", () => {
  it("pins the delivery-result schema version", () => {
    assert.equal(DELIVERY_RESULT_SCHEMA_VERSION, "1.0.0");
  });

  it("round-trips a delivered result with every happy-path field", () => {
    const result: DeliveryResult = {
      schemaVersion: DELIVERY_RESULT_SCHEMA_VERSION,
      runId: "run_123",
      status: "delivered",
      branch: "protostar/cosmetic-tweak/123456-a1b2c3",
      prUrl: "https://github.com/octo/repo/pull/17",
      prNumber: 17,
      headSha: "head-sha",
      baseSha: "base-sha",
      baseBranch: "main",
      createdAt: "2026-04-28T14:00:00.000Z",
      ciVerdict: "pass",
      ciVerdictUpdatedAt: "2026-04-28T14:01:00.000Z",
      ciSnapshots: [{ at: "2026-04-28T14:01:00.000Z", checks }],
      evidenceComments: [{ kind: "mechanical-full", commentId: 101, url: "https://github.com/octo/repo/pull/17#issuecomment-101" }],
      commentFailures: [],
      screenshots: { status: "deferred-v01", reason: "Tauri capture pipeline lands in Phase 10 with toy repo" }
    };

    const parsed = roundTrip(result);

    assert.deepEqual(parsed, result);
    assertRequiredFields(parsed, [
      "schemaVersion",
      "runId",
      "status",
      "branch",
      "prUrl",
      "prNumber",
      "headSha",
      "baseSha",
      "baseBranch",
      "createdAt",
      "ciVerdict",
      "ciVerdictUpdatedAt",
      "ciSnapshots",
      "evidenceComments",
      "commentFailures",
      "screenshots"
    ]);
    assert.equal(parsed.screenshots.status, "deferred-v01");
  });

  it("round-trips a delivery-blocked result with refusal and exhaustedAt", () => {
    const result: DeliveryResult = {
      schemaVersion: DELIVERY_RESULT_SCHEMA_VERSION,
      runId: "run_456",
      status: "delivery-blocked",
      branch: "protostar/cosmetic-tweak/456789-d4e5f6",
      baseBranch: "main",
      createdAt: "2026-04-28T15:00:00.000Z",
      ciVerdict: "timeout-pending",
      ciVerdictUpdatedAt: "2026-04-28T15:10:00.000Z",
      ciSnapshots: [{ at: "2026-04-28T15:09:00.000Z", checks: [] }],
      evidenceComments: [],
      commentFailures: [{ kind: "judge-transcripts", reason: "Validation Failed" }],
      exhaustedAt: "2026-04-28T15:10:00.000Z",
      screenshots: { status: "deferred-v01", reason: "Toy repo screenshots are deferred to Phase 10" },
      refusal: { kind: "token-missing", evidence: { envVar: "PROTOSTAR_GITHUB_TOKEN" } }
    };

    assert.deepEqual(roundTrip(result), result);
  });

  it("allows every terminal delivery CI verdict literal", () => {
    const verdicts: readonly DeliveryResultCiVerdict[] = [
      "pass",
      "fail",
      "pending",
      "timeout-pending",
      "no-checks-configured",
      "cancelled"
    ];

    assert.deepEqual(JSON.parse(JSON.stringify(verdicts)), verdicts);
  });

  for (const event of ciEvents()) {
    it(`round-trips CiEvent kind ${event.kind}`, () => {
      assert.deepEqual(roundTrip(event), event);
    });
  }

  it("pins exactly seven CiEvent variants", () => {
    const events = ciEvents();
    assert.equal(events.length, 7);
    assert.deepEqual(
      events.map((event) => event.kind),
      ["pr-created", "comment-posted", "comment-failed", "ci-snapshot", "ci-terminal", "ci-timeout", "ci-cancelled"]
    );
  });
});

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertRequiredFields(value: object, keys: readonly string[]): void {
  for (const key of keys) {
    assert.equal(Object.hasOwn(value, key), true, `expected field ${key}`);
  }
}

function ciEvents(): readonly CiEvent[] {
  return [
    { kind: "pr-created", at: "2026-04-28T14:00:00.000Z", prNumber: 17, prUrl: "https://github.com/octo/repo/pull/17", headSha: "head-sha" },
    { kind: "comment-posted", at: "2026-04-28T14:00:01.000Z", commentKind: "mechanical-full", commentId: 101 },
    { kind: "comment-failed", at: "2026-04-28T14:00:02.000Z", commentKind: "judge-transcripts", reason: "Validation Failed" },
    { kind: "ci-snapshot", at: "2026-04-28T14:00:03.000Z", checks },
    { kind: "ci-terminal", at: "2026-04-28T14:00:04.000Z", verdict: "pass" },
    { kind: "ci-timeout", at: "2026-04-28T14:10:00.000Z" },
    { kind: "ci-cancelled", at: "2026-04-28T14:02:00.000Z", reason: "sigint" }
  ];
}
