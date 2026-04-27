import { createHash } from "node:crypto";

import type { SignatureEnvelope } from "@protostar/intent";

import { canonicalizeJsonC14nV1 } from "../signature/canonicalize.js";
import { resolveCanonicalizer } from "../signature/canonical-form-registry.js";
import type { AdmissionDecisionBase } from "./base.js";

declare const SignedAdmissionDecisionBrand: unique symbol;

export interface SignedAdmissionDecisionData<E extends object = object>
  extends AdmissionDecisionBase<E> {
  readonly signature: SignatureEnvelope;
}

export type SignedAdmissionDecision<E extends object = object> =
  SignedAdmissionDecisionData<E> & {
    readonly [SignedAdmissionDecisionBrand]: true;
  };

function mintSignedAdmissionDecision<E extends object>(
  data: SignedAdmissionDecisionData<E>
): SignedAdmissionDecision<E> {
  return Object.freeze({ ...data }) as SignedAdmissionDecision<E>;
}

export function signAdmissionDecision<E extends object>(
  decision: AdmissionDecisionBase<E>
): SignedAdmissionDecision<E> {
  const value = hashCanonical(decision);
  const signature: SignatureEnvelope = Object.freeze({
    algorithm: "sha256",
    canonicalForm: "json-c14n@1.0",
    value,
    intentHash: value,
    envelopeHash: value,
    policySnapshotHash: value
  });

  return mintSignedAdmissionDecision({ ...decision, signature });
}

export type VerifySignedAdmissionDecisionResult<E extends object = object> =
  | {
      readonly ok: true;
      readonly decision: AdmissionDecisionBase<E>;
      readonly errors: readonly string[];
    }
  | {
      readonly ok: false;
      readonly errors: readonly string[];
    };

export function verifySignedAdmissionDecision<E extends object>(
  signed: SignedAdmissionDecision<E>
): VerifySignedAdmissionDecisionResult<E> {
  const canonicalizer = resolveCanonicalizer(signed.signature.canonicalForm);
  if (canonicalizer === null) {
    return {
      ok: false,
      errors: [`unknown canonicalForm tag: ${signed.signature.canonicalForm}`]
    };
  }

  if (signed.signature.algorithm !== "sha256") {
    return {
      ok: false,
      errors: [`unsupported algorithm: ${signed.signature.algorithm}`]
    };
  }

  const { signature, ...decision } = signed as SignedAdmissionDecisionData<E>;
  const expected = createHash("sha256")
    .update(canonicalizer(decision), "utf8")
    .digest("hex");

  if (expected !== signature.value) {
    return {
      ok: false,
      errors: ["signature mismatch on signed admission decision"]
    };
  }

  return { ok: true, decision, errors: [] };
}

function hashCanonical(value: unknown): string {
  return createHash("sha256")
    .update(canonicalizeJsonC14nV1(value), "utf8")
    .digest("hex");
}

export type SignedAdmissionDecisionBrandWitness = SignedAdmissionDecision;

export { mintSignedAdmissionDecision };
