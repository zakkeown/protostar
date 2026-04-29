import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AcceptanceCriterion, ConfirmedIntent } from "@protostar/intent";

import { createSpecOntologySnapshot } from "./create-spec-ontology-snapshot.js";

function intent(acceptanceCriteria: readonly AcceptanceCriterion[]): ConfirmedIntent {
  return {
    id: "intent_eval",
    title: "Evaluation helpers",
    problem: "Ship pure evaluation helpers",
    requester: "operator",
    confirmedAt: "2026-04-28T00:00:00.000Z",
    acceptanceCriteria,
    capabilityEnvelope: {
      repoScopes: [],
      toolPermissions: [],
      workspace: { allowDirty: false },
      network: { allow: "loopback" },
      mechanical: { allowed: ["verify", "lint"] },
      budget: {}
    },
    constraints: [],
    stopConditions: [],
    schemaVersion: "1.6.0",
    signature: null
  } as unknown as ConfirmedIntent;
}

describe("createSpecOntologySnapshot", () => {
  it("maps acceptance criteria to ontology fields", () => {
    const snapshot = createSpecOntologySnapshot(intent([
      { id: "ac_1", statement: "Build succeeds", verification: "test" },
      { id: "ac_2", statement: "No filesystem imports", verification: "test" },
      { id: "ac_3", statement: "Operator approves", verification: "manual", justification: "visual judgment" }
    ]));

    assert.equal(snapshot.generation, 0);
    assert.deepEqual(snapshot.fields, [
      { name: "ac_1", type: "test", description: "Build succeeds" },
      { name: "ac_2", type: "test", description: "No filesystem imports" },
      { name: "ac_3", type: "manual", description: "Operator approves" }
    ]);
  });

  it("returns an empty field list for an intent with no acceptance criteria", () => {
    assert.deepEqual(createSpecOntologySnapshot(intent([])).fields, []);
  });

  it("preserves acceptance-criteria ordering", () => {
    const snapshot = createSpecOntologySnapshot(intent([
      { id: "ac_b", statement: "Second", verification: "test" },
      { id: "ac_a", statement: "First", verification: "test" }
    ]));

    assert.deepEqual(snapshot.fields.map((field: { readonly name: string }) => field.name), ["ac_b", "ac_a"]);
  });
});
