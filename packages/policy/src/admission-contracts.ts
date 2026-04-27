// Plan 06a: source-of-truth for the promotion-side admission contracts moved to
// @protostar/intent/promotion-contracts. This file keeps the admission-decision-artifact
// types (still produced by createAdmissionDecisionArtifact in this package) and
// re-exports every promotion-side name for backward-compatible barrel resolution.

import type { ClarificationQuestion, IntentAdmissionHardZeroReason, IntentAdmissionMissingFieldDetection, IntentAdmissionPolicyFinding, IntentAdmissionRequiredClarification, IntentAmbiguityAssessment, IntentAmbiguityDimensionScore, IntentAmbiguityMode, IntentAmbiguityWeightingProfile, IntentArchetypeAutoTagSuggestion, IntentDraft, IntentDraftId, IntentId, IntentPromotionFailureDetails, PromoteIntentDraftResult, RequiredIntentDraftDimensionCheck, RequiredIntentDraftFieldCheck } from "@protostar/intent";

// Re-exports from intent: every promotion-side declaration that previously lived here.
export {
  CAPABILITY_ENVELOPE_BUDGET_LIMIT_VIOLATION_CODES,
  CAPABILITY_ENVELOPE_EXECUTE_GRANT_VIOLATION_CODES,
  CAPABILITY_ENVELOPE_TOOL_PERMISSION_VIOLATION_CODES,
  CAPABILITY_ENVELOPE_WRITE_GRANT_VIOLATION_CODES,
  DUPLICATE_ACCEPTANCE_CRITERION_POLICY_CODE,
  INTENT_ARCHETYPE_PROPOSAL_LOW_CONFIDENCE_THRESHOLD,
  LOW_CONFIDENCE_GOAL_ARCHETYPE_POLICY_CODE,
  MANUAL_UNJUSTIFIED_ACCEPTANCE_CRITERION_POLICY_CODE,
  REPO_SCOPE_ADMISSION_REASON_CODES
} from "@protostar/intent";

export type {
  AdmitBugfixCapabilityEnvelopeInput,
  AdmitBugfixCapabilityEnvelopeResult,
  AdmitCosmeticTweakCapabilityEnvelopeInput,
  AdmitCosmeticTweakCapabilityEnvelopeResult,
  AdmitFeatureAddCapabilityEnvelopeInput,
  AdmitFeatureAddCapabilityEnvelopeResult,
  AdmitRefactorCapabilityEnvelopeInput,
  AdmitRefactorCapabilityEnvelopeResult,
  BugfixCapabilityEnvelopeUnsupportedDecision,
  CapabilityEnvelopeBudgetCapKey,
  CapabilityEnvelopeBudgetLimitViolation,
  CapabilityEnvelopeBudgetLimitViolationCode,
  CapabilityEnvelopeBudgetOverage,
  CapabilityEnvelopeExecuteGrantOverage,
  CapabilityEnvelopeExecuteGrantViolation,
  CapabilityEnvelopeExecuteGrantViolationCode,
  CapabilityEnvelopeOverageBase,
  CapabilityEnvelopeOverageDetection,
  CapabilityEnvelopeOverageFinding,
  CapabilityEnvelopeOverageKind,
  CapabilityEnvelopeRepoScopeOverage,
  CapabilityEnvelopeToolPermissionOverage,
  CapabilityEnvelopeToolPermissionViolation,
  CapabilityEnvelopeToolPermissionViolationCode,
  CapabilityEnvelopeWriteGrantViolation,
  CapabilityEnvelopeWriteGrantViolationCode,
  CosmeticTweakCapabilityEnvelopeGrant,
  DetectCapabilityEnvelopeOveragesInput,
  EvaluateRepoScopeAdmissionInput,
  FeatureAddCapabilityEnvelopeUnsupportedDecision,
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
  RefactorCapabilityEnvelopeUnsupportedDecision,
  RepoScopeAdmissionDecision,
  RepoScopeAdmissionReasonCode,
  RepoScopeAdmissionResult,
  RepoScopeAdmissionResultKind,
  RepoScopeAdmissionResultSeverity,
  RepoScopeAdmissionVerdict,
  RequiredIntentDraftDimensionCheck,
  RequiredIntentDraftFieldCheck,
  ValidateCapabilityEnvelopeBudgetLimitsInput,
  ValidateCapabilityEnvelopeBudgetLimitsResult,
  ValidateCapabilityEnvelopeExecuteGrantsInput,
  ValidateCapabilityEnvelopeExecuteGrantsResult,
  ValidateCapabilityEnvelopeRepoScopesInput,
  ValidateCapabilityEnvelopeToolPermissionsInput,
  ValidateCapabilityEnvelopeToolPermissionsResult,
  ValidateCapabilityEnvelopeWriteGrantsInput,
  ValidateCapabilityEnvelopeWriteGrantsResult,
  ValidateIntentDraftCapabilityEnvelopeAdmissionInput,
  ValidateIntentDraftCapabilityEnvelopeAdmissionResult
} from "@protostar/intent";

// ──────────────────────────────────────────────────────────
// Admission-decision artifact (still produced by policy/admission.ts → createAdmissionDecisionArtifact).
// ──────────────────────────────────────────────────────────

export const ADMISSION_DECISION_ARTIFACT_NAME = "admission-decision.json";

export const ADMISSION_DECISION_SCHEMA_VERSION = "protostar.intent.admission-decision.v1";

export const ADMISSION_DECISION_OUTCOMES = ["allow", "block", "escalate"] as const;

export type AdmissionDecisionOutcome = (typeof ADMISSION_DECISION_OUTCOMES)[number];

export interface AdmissionDecisionGateSummary {
  readonly ambiguityPassed: boolean;
  readonly requiredChecklistPassed: boolean;
  readonly policyPassed: boolean;
  readonly structurallyMissingAutoFail: boolean;
  readonly confirmedIntentCreated: boolean;
}

export interface AdmissionDecisionAmbiguityDetail {
  readonly mode: IntentAmbiguityAssessment["mode"];
  readonly ambiguity: number;
  readonly threshold: number;
  readonly accepted: boolean;
  readonly finite: boolean;
  readonly weightingProfile: IntentAmbiguityWeightingProfile;
  readonly dimensionScores: readonly IntentAmbiguityDimensionScore[];
  readonly missingFields: readonly string[];
  readonly requiredClarifications: readonly string[];
  readonly structurallyMissingDimensions: readonly IntentAmbiguityDimensionScore["dimension"][];
}

export interface AdmissionDecisionArtifactDetails {
  readonly gate: AdmissionDecisionGateSummary;
  readonly ambiguity: AdmissionDecisionAmbiguityDetail;
  readonly requiredDimensionChecklist: readonly RequiredIntentDraftDimensionCheck[];
  readonly requiredFieldChecklist: readonly RequiredIntentDraftFieldCheck[];
  readonly missingFieldDetections: readonly IntentAdmissionMissingFieldDetection[];
  readonly requiredClarifications: readonly IntentAdmissionRequiredClarification[];
  readonly hardZeroReasons: readonly IntentAdmissionHardZeroReason[];
  readonly clarificationQuestions: readonly ClarificationQuestion[];
  readonly policyFindings: readonly IntentAdmissionPolicyFinding[];
  readonly archetypeSuggestion: IntentArchetypeAutoTagSuggestion;
  readonly failure?: IntentPromotionFailureDetails;
}

export interface AdmissionDecisionArtifactPayload {
  readonly schemaVersion: typeof ADMISSION_DECISION_SCHEMA_VERSION;
  readonly artifact: typeof ADMISSION_DECISION_ARTIFACT_NAME;
  readonly decision: AdmissionDecisionOutcome;
  readonly admitted: boolean;
  readonly draftId?: IntentDraftId;
  readonly mode: IntentAmbiguityMode;
  readonly goalArchetype?: string;
  readonly confirmedIntentId?: IntentId;
  readonly details: AdmissionDecisionArtifactDetails;
  readonly errors: readonly string[];
}

export interface CreateAdmissionDecisionArtifactInput {
  readonly promotion: PromoteIntentDraftResult;
  readonly draft?: IntentDraft;
}
