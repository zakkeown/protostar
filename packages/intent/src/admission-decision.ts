// Plan 06a deviation [Rule 4 — architectural micro-shift]:
// createAdmissionDecisionArtifact + ADMISSION_DECISION_* constants and types relocated
// to @protostar/intent. Reason: the admission-decision artifact is a deterministic
// projection of promotion data (not an autonomy/governance decision); keeping it in
// intent lets admission-control.test.ts stay atomic without forcing intent to depend
// on @protostar/policy (which would create a workspace dependency cycle). policy
// continues to re-export these names from its index/admission/artifacts subbarrels for
// public-surface preservation.

import type { ClarificationQuestion } from "./clarification.js";

import type { IntentAmbiguityAssessment, IntentAmbiguityDimensionScore, IntentAmbiguityMode, IntentAmbiguityWeightingProfile } from "./ambiguity-scoring.js";

import type { IntentDraft, IntentDraftId, IntentId } from "./models.js";

import type { IntentArchetypeAutoTagSuggestion } from "./archetypes.js";

import type { IntentAdmissionHardZeroReason, IntentAdmissionMissingFieldDetection, IntentAdmissionPolicyFinding, IntentAdmissionRequiredClarification, IntentPromotionFailureDetails, PromoteIntentDraftResult, RequiredIntentDraftDimensionCheck, RequiredIntentDraftFieldCheck } from "./promotion-contracts.js";

import { evaluateIntentAmbiguityAdmission } from "./promote-intent-draft.js";

import { normalizeText } from "./admission-shared.js";

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

export function createAdmissionDecisionArtifact(
  input: CreateAdmissionDecisionArtifactInput
): AdmissionDecisionArtifactPayload {
  const promotion = input.promotion;
  const ambiguityAdmission = evaluateIntentAmbiguityAdmission(promotion.ambiguityAssessment);
  const requiredChecklistPassed =
    promotion.requiredDimensionChecklist.every((check) => check.passed) &&
    promotion.requiredFieldChecklist.every((check) => check.passed);
  const policyPassed = promotion.policyFindings.every(
    (finding) => finding.severity !== "block" && (finding.severity !== "ambiguity" || finding.overridden)
  );
  const confirmedIntentId = promotion.ok ? promotion.intent.id : undefined;
  const goalArchetype = promotion.ok
    ? promotion.intent.goalArchetype
    : normalizeText(input.draft?.goalArchetype) ??
      normalizeText(promotion.archetypeSuggestion.archetype);
  const draftId = promotion.ok ? promotion.intent.sourceDraftId : input.draft?.draftId;

  return {
    schemaVersion: ADMISSION_DECISION_SCHEMA_VERSION,
    artifact: ADMISSION_DECISION_ARTIFACT_NAME,
    decision: admissionDecisionOutcomeForPromotion(promotion),
    admitted: promotion.ok,
    ...(draftId !== undefined ? { draftId } : {}),
    mode: promotion.ambiguityAssessment.mode,
    ...(goalArchetype !== undefined ? { goalArchetype } : {}),
    ...(confirmedIntentId !== undefined ? { confirmedIntentId } : {}),
    details: {
      gate: {
        ambiguityPassed: ambiguityAdmission.accepted,
        requiredChecklistPassed,
        policyPassed,
        structurallyMissingAutoFail: promotion.ambiguityAssessment.structurallyMissingDimensions.length > 0,
        confirmedIntentCreated: promotion.ok
      },
      ambiguity: {
        mode: promotion.ambiguityAssessment.mode,
        ambiguity: promotion.ambiguityAssessment.ambiguity,
        threshold: ambiguityAdmission.admissionThreshold,
        accepted: ambiguityAdmission.accepted,
        finite: ambiguityAdmission.finite,
        weightingProfile: promotion.ambiguityAssessment.weightingProfile,
        dimensionScores: promotion.ambiguityAssessment.dimensionScores,
        missingFields: promotion.ambiguityAssessment.missingFields,
        requiredClarifications: promotion.ambiguityAssessment.requiredClarifications,
        structurallyMissingDimensions: promotion.ambiguityAssessment.structurallyMissingDimensions
      },
      requiredDimensionChecklist: promotion.requiredDimensionChecklist,
      requiredFieldChecklist: promotion.requiredFieldChecklist,
      missingFieldDetections: promotion.missingFieldDetections,
      requiredClarifications: promotion.requiredClarifications,
      hardZeroReasons: promotion.hardZeroReasons,
      clarificationQuestions: promotion.questions,
      policyFindings: promotion.policyFindings,
      archetypeSuggestion: promotion.archetypeSuggestion,
      ...(promotion.ok ? {} : { failure: promotion.failureDetails })
    },
    errors: promotion.errors
  };
}

function admissionDecisionOutcomeForPromotion(result: PromoteIntentDraftResult): AdmissionDecisionOutcome {
  if (result.ok) {
    return "allow";
  }
  return result.failureDetails.checklistFailed ? "block" : "escalate";
}
