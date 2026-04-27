import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import * as Authority from "@protostar/authority";

import type { SignatureEnvelope } from "@protostar/intent";

import type { AdmissionDecisionBase } from "./base.js";
import {
  signAdmissionDecision,
  verifySignedAdmissionDecision,
  type SignedAdmissionDecision,
  type SignedAdmissionDecisionData
} from "./index.js";

const baseDecision: AdmissionDecisionBase<{ readonly foo: string }> = {
  schemaVersion: "1.0.0",
  runId: "run-signed-admission-test",
  gate: "planning",
  outcome: "allow",
  timestamp: "2026-04-27T00:00:00.000Z",
  precedenceResolution: { status: "resolved", precedenceDecisionPath: "authority/precedence-decision.json" },
  evidence: { foo: "bar" }
};

describe("signed admission decision producer", () => {
  it("round-trips a signed decision body through verification", () => {
    const signed = signAdmissionDecision(baseDecision);
    const result = verifySignedAdmissionDecision(signed);

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected signed decision to verify");
    assert.deepEqual(result.decision, baseDecision);
  });

  it("detects decision body mutation", () => {
    const signed = signAdmissionDecision(baseDecision);
    const tampered = {
      ...signed,
      evidence: { foo: "mutated" }
    } as SignedAdmissionDecision<{ readonly foo: string }>;

    const result = verifySignedAdmissionDecision(tampered);

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /signature mismatch/);
  });

  it("rejects an unknown canonical form tag", () => {
    const signed = signAdmissionDecision(baseDecision);
    const unknownCanonicalForm = {
      ...signed,
      signature: {
        ...signed.signature,
        canonicalForm: "json-c14n@2.0"
      } as unknown as SignatureEnvelope
    } as SignedAdmissionDecisionData<{ readonly foo: string }> as SignedAdmissionDecision<{ readonly foo: string }>;

    const result = verifySignedAdmissionDecision(unknownCanonicalForm);

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /unknown canonicalForm tag/);
  });

  it("rejects unsupported algorithms", () => {
    const signed = signAdmissionDecision(baseDecision);
    const wrongAlgorithm = {
      ...signed,
      signature: {
        ...signed.signature,
        algorithm: "sha512"
      } as unknown as SignatureEnvelope
    } as SignedAdmissionDecisionData<{ readonly foo: string }> as SignedAdmissionDecision<{ readonly foo: string }>;

    const result = verifySignedAdmissionDecision(wrongAlgorithm);

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /unsupported algorithm/);
  });

  it("signs the same base decision deterministically", () => {
    const first = signAdmissionDecision(baseDecision);
    const second = signAdmissionDecision(baseDecision);

    assert.equal(first.signature.value, second.signature.value);
  });

  it("freezes the signed wrapper", () => {
    const signed = signAdmissionDecision(baseDecision);

    assert.equal(Object.isFrozen(signed), true);
    assert.throws(() => {
      (signed as { evidence: object }).evidence = { foo: "mutated" };
    }, TypeError);
  });

  it("does not expose the signed admission mint on the public authority surface", () => {
    assert.equal("mintSignedAdmissionDecision" in Authority, false);
  });
});
