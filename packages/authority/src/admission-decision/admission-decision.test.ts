import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  ADMISSION_DECISION_OUTCOMES as AUTHORITY_ADMISSION_DECISION_OUTCOMES,
  GATE_NAMES,
  type AdmissionDecisionBase
} from "./index.js";

import { ADMISSION_DECISION_OUTCOMES as INTENT_ADMISSION_DECISION_OUTCOMES } from "@protostar/intent";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

const sampleDecision: AdmissionDecisionBase<{ readonly foo: string }> = {
  schemaVersion: "1.0.0",
  runId: "run-admission-base-test",
  gate: "intent",
  outcome: "allow",
  timestamp: "2026-04-27T00:00:00.000Z",
  precedenceResolution: { status: "no-conflict" },
  evidence: { foo: "bar" }
};

// @ts-expect-error missing required base fields must not satisfy the shared header.
const missingBaseFields: AdmissionDecisionBase<{ readonly foo: string }> = {
  evidence: { foo: "bar" }
};

type _EvidenceShape = Assert<Equal<typeof sampleDecision.evidence, { readonly foo: string }>>;
void missingBaseFields;

describe("admission decision base contract", () => {
  it("defines the five shared gate names", () => {
    assert.equal(GATE_NAMES.length, 5);
    assert.deepEqual(GATE_NAMES, ["intent", "planning", "capability", "repo-scope", "workspace-trust"]);
    assert.equal(Object.isFrozen(GATE_NAMES), true);
  });

  it("re-exports admission outcomes from intent as the single source of truth", () => {
    assert.deepEqual(AUTHORITY_ADMISSION_DECISION_OUTCOMES, INTENT_ADMISSION_DECISION_OUTCOMES);
  });

  it("carries per-gate evidence through the generic extension hook", () => {
    assert.deepEqual(sampleDecision.evidence, { foo: "bar" });
  });
});
