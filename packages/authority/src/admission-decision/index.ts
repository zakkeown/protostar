export type {
  AdmissionDecisionBase,
  GateName,
  PrecedenceResolutionSummary
} from "./base.js";
export { GATE_NAMES } from "./base.js";
export {
  ADMISSION_DECISION_OUTCOMES,
  type AdmissionDecisionOutcome
} from "./outcome.js";
export {
  signAdmissionDecision,
  verifySignedAdmissionDecision
} from "./signed-admission-decision.js";
export type {
  SignedAdmissionDecision,
  SignedAdmissionDecisionData,
  VerifySignedAdmissionDecisionResult
} from "./signed-admission-decision.js";
