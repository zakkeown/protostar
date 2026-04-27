// Plan 06a: promotion-side names sourced from @protostar/intent; admission-decision-artifact concerns
// continue to come from the policy admission module.
export {
  authorizeFactoryStart,
  evaluateIntentAmbiguityAdmission,
  promoteIntentDraft
} from "../admission.js";
export type { PolicyVerdict } from "../admission.js";
export {
  DUPLICATE_ACCEPTANCE_CRITERION_POLICY_CODE,
  INTENT_ARCHETYPE_PROPOSAL_LOW_CONFIDENCE_THRESHOLD,
  LOW_CONFIDENCE_GOAL_ARCHETYPE_POLICY_CODE,
  MANUAL_UNJUSTIFIED_ACCEPTANCE_CRITERION_POLICY_CODE
} from "@protostar/intent";
export type {
  IntentAdmissionAcceptanceCriterionReference,
  IntentAdmissionHardZeroDimensionId,
  IntentAdmissionHardZeroReason,
  IntentAdmissionHardZeroReasonSource,
  IntentAdmissionIssueCode,
  IntentAdmissionIssueReference,
  IntentAdmissionMissingFieldDetection,
  IntentAdmissionMissingFieldDetectionSource,
  IntentAdmissionOutputContractSections,
  IntentAdmissionPolicyFinding,
  IntentAdmissionPolicyFindingCode,
  IntentAdmissionRequiredClarification,
  IntentAdmissionRequiredClarificationSource,
  IntentAmbiguityAdmissionDecision,
  IntentPromotionFailureDetails,
  IntentPromotionFailureState,
  PromoteIntentDraftInput,
  PromoteIntentDraftResult,
  RequiredIntentDraftDimensionCheck,
  RequiredIntentDraftFieldCheck
} from "@protostar/intent";
