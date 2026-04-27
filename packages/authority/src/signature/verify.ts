import { createHash } from "node:crypto";

import type { CapabilityEnvelope, ConfirmedIntent } from "@protostar/intent";

import { resolveCanonicalizer } from "./canonical-form-registry.js";

import type { PolicySnapshot } from "./policy-snapshot.js";

export interface VerifiedIntent {
  readonly intent: ConfirmedIntent;
  readonly verifiedAt: string;
}

export type SignatureMismatchField =
  | "intentBody"
  | "resolvedEnvelope"
  | "policySnapshotHash"
  | "canonicalForm"
  | "algorithm";

export interface SignatureMismatch {
  readonly field: SignatureMismatchField;
  readonly expected: string;
  readonly actual: string;
}

export type VerifyConfirmedIntentSignatureResult =
  | { readonly ok: true; readonly verified: VerifiedIntent; readonly errors: readonly string[] }
  | { readonly ok: false; readonly errors: readonly string[]; readonly mismatch: SignatureMismatch };

/**
 * Q-17 central verifier. Callers pass the current ConfirmedIntent, policy
 * snapshot, and resolved envelope; this helper performs canonical-form
 * dispatch and deterministic mismatch narrowing using the signature sub-hashes.
 */
export function verifyConfirmedIntentSignature(
  intent: ConfirmedIntent,
  policySnapshot: PolicySnapshot,
  resolvedEnvelope: CapabilityEnvelope
): VerifyConfirmedIntentSignatureResult {
  const signature = intent.signature;
  if (signature === null) {
    return {
      ok: false,
      errors: ["intent has no signature"],
      mismatch: { field: "intentBody", expected: "signed", actual: "null" }
    };
  }

  if (signature.algorithm !== "sha256") {
    return {
      ok: false,
      errors: [`unsupported signature algorithm: ${signature.algorithm}`],
      mismatch: { field: "algorithm", expected: "sha256", actual: signature.algorithm }
    };
  }

  const canonicalizer = resolveCanonicalizer(signature.canonicalForm);
  if (canonicalizer === null) {
    return {
      ok: false,
      errors: [`unknown canonicalForm tag: ${signature.canonicalForm}`],
      mismatch: { field: "canonicalForm", expected: "json-c14n@1.0", actual: signature.canonicalForm }
    };
  }

  const intentBody = stripSignature(intent);
  const intentHash = sha256Hex(canonicalizer(intentBody));
  const envelopeHash = sha256Hex(canonicalizer(resolvedEnvelope));
  const policySnapshotHash = sha256Hex(canonicalizer(policySnapshot));
  const expectedValue = sha256Hex(canonicalizer({
    intent: intentBody,
    resolvedEnvelope,
    policySnapshotHash
  }));

  if (intentHash !== signature.intentHash) {
    return mismatch("intentBody", signature.intentHash, intentHash);
  }
  if (envelopeHash !== signature.envelopeHash) {
    return mismatch("resolvedEnvelope", signature.envelopeHash, envelopeHash);
  }
  if (policySnapshotHash !== signature.policySnapshotHash) {
    return mismatch("policySnapshotHash", signature.policySnapshotHash, policySnapshotHash);
  }
  if (expectedValue !== signature.value) {
    return mismatch("intentBody", expectedValue, signature.value);
  }

  return {
    ok: true,
    verified: Object.freeze({ intent, verifiedAt: new Date().toISOString() }),
    errors: []
  };
}

function mismatch(
  field: SignatureMismatchField,
  expected: string,
  actual: string
): VerifyConfirmedIntentSignatureResult {
  return {
    ok: false,
    errors: [`signature mismatch: ${field}`],
    mismatch: { field, expected, actual }
  };
}

function stripSignature(intent: ConfirmedIntent): object {
  const { signature: _signature, ...intentBody } = intent;
  return intentBody;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
