import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ReviewLifecycleEvent } from "./lifecycle-events.js";

describe("ReviewLifecycleEvent contract", () => {
  it("constructs all seven review lifecycle event kinds", () => {
    const events: readonly ReviewLifecycleEvent[] = [
      {
        kind: "review-iteration-started",
        runId: "run-1",
        attempt: 1,
        at: "2026-04-28T00:00:00.000Z"
      },
      {
        kind: "mechanical-verdict",
        runId: "run-1",
        attempt: 1,
        verdict: "repair",
        findingsCount: 2,
        at: "2026-04-28T00:00:01.000Z"
      },
      {
        kind: "model-verdict",
        runId: "run-1",
        attempt: 1,
        verdict: "pass",
        judgeIds: ["qwen-primary"],
        at: "2026-04-28T00:00:02.000Z"
      },
      {
        kind: "repair-plan-emitted",
        runId: "run-1",
        attempt: 1,
        repairTaskIds: ["task-1"],
        at: "2026-04-28T00:00:03.000Z"
      },
      {
        kind: "loop-approved",
        runId: "run-1",
        finalAttempt: 2,
        decisionUri: "runs/run-1/review/review-decision.json",
        at: "2026-04-28T00:00:04.000Z"
      },
      {
        kind: "loop-blocked",
        runId: "run-1",
        reason: "model-block",
        finalAttempt: 2,
        blockUri: "runs/run-1/review/review-block.json",
        at: "2026-04-28T00:00:05.000Z"
      },
      {
        kind: "loop-budget-exhausted",
        runId: "run-1",
        attempted: 3,
        blockUri: "runs/run-1/review/review-block.json",
        at: "2026-04-28T00:00:06.000Z"
      }
    ];

    assert.deepEqual(
      events.map((event) => classifyLifecycleEvent(event)),
      [
        "review-iteration-started",
        "mechanical-verdict",
        "model-verdict",
        "repair-plan-emitted",
        "loop-approved",
        "loop-blocked",
        "loop-budget-exhausted"
      ]
    );
  });

  it("keeps review lifecycle switches exhaustive", () => {
    const event: ReviewLifecycleEvent = {
      kind: "loop-approved",
      runId: "run-1",
      finalAttempt: 1,
      decisionUri: "runs/run-1/review/review-decision.json",
      at: "2026-04-28T00:00:00.000Z"
    };

    assert.equal(classifyLifecycleEvent(event), "loop-approved");
  });

  it("accepts only closed loop-blocked reasons and mechanical verdicts", () => {
    const reasons: readonly Extract<ReviewLifecycleEvent, { readonly kind: "loop-blocked" }>["reason"][] = [
      "budget-exhausted",
      "critical-finding",
      "mechanical-block",
      "model-block"
    ];
    const verdicts: readonly Extract<ReviewLifecycleEvent, { readonly kind: "mechanical-verdict" }>["verdict"][] = [
      "pass",
      "repair",
      "block"
    ];

    assert.deepEqual(reasons, ["budget-exhausted", "critical-finding", "mechanical-block", "model-block"]);
    assert.deepEqual(verdicts, ["pass", "repair", "block"]);
  });
});

function classifyLifecycleEvent(event: ReviewLifecycleEvent): ReviewLifecycleEvent["kind"] {
  switch (event.kind) {
    case "review-iteration-started":
    case "mechanical-verdict":
    case "model-verdict":
    case "repair-plan-emitted":
    case "loop-approved":
    case "loop-blocked":
    case "loop-budget-exhausted":
      return event.kind;
    default:
      return assertExhaustive(event);
  }
}

type SyntheticReviewLifecycleEvent = ReviewLifecycleEvent | {
  readonly kind: "synthetic-kind";
  readonly runId: string;
};

function classifyWithSyntheticEvent(event: SyntheticReviewLifecycleEvent): string {
  switch (event.kind) {
    case "review-iteration-started":
    case "mechanical-verdict":
    case "model-verdict":
    case "repair-plan-emitted":
    case "loop-approved":
    case "loop-blocked":
    case "loop-budget-exhausted":
      return event.kind;
    default:
      // @ts-expect-error synthetic events prove consumers must update exhaustive switches.
      return assertExhaustive(event);
  }
}
assert.equal(classifyWithSyntheticEvent({ kind: "synthetic-kind", runId: "run-1" }), "synthetic-kind");

const _badBlockedReason: ReviewLifecycleEvent = {
  kind: "loop-blocked",
  runId: "run-1",
  // @ts-expect-error loop-blocked reasons are a closed discriminator set.
  reason: "operator-block",
  finalAttempt: 1,
  blockUri: "runs/run-1/review/review-block.json",
  at: "2026-04-28T00:00:00.000Z"
};
assert.equal(_badBlockedReason.kind, "loop-blocked");

const _badMechanicalVerdict: ReviewLifecycleEvent = {
  kind: "mechanical-verdict",
  runId: "run-1",
  attempt: 1,
  // @ts-expect-error mechanical verdicts reuse the pass/repair/block review verdict set.
  verdict: "warn",
  findingsCount: 1,
  at: "2026-04-28T00:00:00.000Z"
};
assert.equal(_badMechanicalVerdict.kind, "mechanical-verdict");

function assertExhaustive(value: never): never {
  throw new Error(String(value));
}
