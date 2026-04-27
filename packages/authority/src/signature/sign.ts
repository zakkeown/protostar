import { createHash } from "node:crypto";

import type { CapabilityEnvelope, SignatureEnvelope } from "@protostar/intent";

import { resolveCanonicalizer } from "./canonical-form-registry.js";

const SIGNATURE_ALGORITHM = "sha256";
const SIGNATURE_CANONICAL_FORM = "json-c14n@1.0";

export interface SignatureInputs {
  readonly intent: object;
  readonly resolvedEnvelope: CapabilityEnvelope;
  readonly policySnapshotHash: string;
}

export function buildSignatureValue(inputs: SignatureInputs): string {
  return sha256Hex(canonicalizeForSignature({
    intent: inputs.intent,
    resolvedEnvelope: inputs.resolvedEnvelope,
    policySnapshotHash: inputs.policySnapshotHash
  }));
}

export function buildSignatureEnvelope(inputs: SignatureInputs): SignatureEnvelope {
  return Object.freeze({
    algorithm: SIGNATURE_ALGORITHM,
    canonicalForm: SIGNATURE_CANONICAL_FORM,
    value: buildSignatureValue(inputs),
    intentHash: sha256Hex(canonicalizeForSignature(inputs.intent)),
    envelopeHash: sha256Hex(canonicalizeForSignature(inputs.resolvedEnvelope)),
    policySnapshotHash: inputs.policySnapshotHash
  } as const);
}

function canonicalizeForSignature(value: unknown): string {
  const canonicalizer = resolveCanonicalizer(SIGNATURE_CANONICAL_FORM);
  if (canonicalizer === null) {
    throw new Error(`signature canonicalizer missing: ${SIGNATURE_CANONICAL_FORM}`);
  }
  return canonicalizer(value);
}

function sha256Hex(value: string): string {
  return createHash(SIGNATURE_ALGORITHM).update(value, "utf8").digest("hex");
}
