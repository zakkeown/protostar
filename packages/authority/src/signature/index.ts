export { CANONICAL_FORM_TAGS, resolveCanonicalizer } from "./canonical-form-registry.js";
export { CanonicalizationError, canonicalizeJsonC14nV1, validateCanonicalInput } from "./canonicalize.js";
export { buildPolicySnapshot, hashPolicySnapshot } from "./policy-snapshot.js";
export { buildSignatureEnvelope, buildSignatureValue } from "./sign.js";
export { verifyConfirmedIntentSignature } from "./verify.js";
export type { PolicySnapshot } from "./policy-snapshot.js";
export type { SignatureInputs } from "./sign.js";
export type {
  SignatureMismatch,
  SignatureMismatchField,
  VerifiedIntent,
  VerifyConfirmedIntentSignatureResult
} from "./verify.js";
