// Plan 06a (Rule-4 deviation): admission-decision-artifact constants, types, and the
// createAdmissionDecisionArtifact function relocated to @protostar/intent. This subbarrel
// preserves the @protostar/policy/artifacts import surface byte-equivalent.
export {
  ADMISSION_DECISION_ARTIFACT_NAME,
  ADMISSION_DECISION_OUTCOMES,
  ADMISSION_DECISION_SCHEMA_VERSION
} from "@protostar/intent";
export type {
  AdmissionDecisionAmbiguityDetail,
  AdmissionDecisionArtifactDetails,
  AdmissionDecisionArtifactPayload,
  AdmissionDecisionGateSummary,
  AdmissionDecisionOutcome,
  CreateAdmissionDecisionArtifactInput
} from "@protostar/intent";
export { createAdmissionDecisionArtifact } from "@protostar/intent";
