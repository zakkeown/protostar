import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AcceptanceCriterion, ConfirmedIntent } from "@protostar/intent";

import { computeLineageId } from "./lineage-hash.js";

function intent(input: {
  readonly problem?: string;
  readonly acceptanceCriteria?: readonly AcceptanceCriterion[];
} = {}): ConfirmedIntent {
  return {
    id: "intent_eval",
    title: "Evaluation helpers",
    problem: input.problem ?? "Ship pure evaluation helpers",
    requester: "operator",
    confirmedAt: "2026-04-28T00:00:00.000Z",
    acceptanceCriteria: input.acceptanceCriteria ?? [
      { id: "ac_1", statement: "Build succeeds", verification: "test" },
      { id: "ac_2", statement: "No filesystem imports", verification: "test" }
    ],
    capabilityEnvelope: {
      repoScopes: [],
      toolPermissions: [],
      workspace: { allowDirty: false },
      network: { allow: "loopback" },
      budget: {}
    },
    constraints: [],
    stopConditions: [],
    schemaVersion: "1.5.0",
    signature: null
  } as unknown as ConfirmedIntent;
}

describe("computeLineageId", () => {
  it("returns the same hash for the same intent", () => {
    const subject = intent();

    assert.equal(computeLineageId(subject), computeLineageId(subject));
  });

  it("returns a different hash for a different intent", () => {
    assert.notEqual(computeLineageId(intent()), computeLineageId(intent({ problem: "Ship different helpers" })));
  });

  it("changes when acceptance criteria order changes", () => {
    const first = intent({
      acceptanceCriteria: [
        { id: "ac_1", statement: "Build succeeds", verification: "test" },
        { id: "ac_2", statement: "No filesystem imports", verification: "test" }
      ]
    });
    const reordered = intent({
      acceptanceCriteria: [
        { id: "ac_2", statement: "No filesystem imports", verification: "test" },
        { id: "ac_1", statement: "Build succeeds", verification: "test" }
      ]
    });

    assert.notEqual(computeLineageId(first), computeLineageId(reordered));
  });

  it("is invariant under top-level input object key ordering", () => {
    const ordered = {
      problem: "Ship pure evaluation helpers",
      acceptanceCriteria: [
        { id: "ac_1", statement: "Build succeeds", verification: "test" },
        { id: "ac_2", statement: "No filesystem imports", verification: "test" }
      ]
    } satisfies { readonly problem: string; readonly acceptanceCriteria: readonly AcceptanceCriterion[] };
    const reordered = {
      acceptanceCriteria: ordered.acceptanceCriteria,
      problem: ordered.problem
    };

    assert.equal(computeLineageId(intent(ordered)), computeLineageId(intent(reordered)));
  });

  it("returns a 12-character lowercase hex digest prefix", () => {
    assert.match(computeLineageId(intent()), /^[0-9a-f]{12}$/);
  });
});
