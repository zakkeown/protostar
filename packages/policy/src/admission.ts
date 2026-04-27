import type { FactoryStage } from "@protostar/artifacts";

import { evaluateIntentAmbiguityAdmission } from "@protostar/intent";

import type { ConfirmedIntent, FactoryAutonomyPolicy, PromoteIntentDraftResult } from "@protostar/intent";

import { ADMISSION_DECISION_ARTIFACT_NAME, ADMISSION_DECISION_SCHEMA_VERSION } from "./admission-contracts.js";

import type { AdmissionDecisionArtifactPayload, AdmissionDecisionOutcome, CreateAdmissionDecisionArtifactInput } from "./admission-contracts.js";

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : undefined;
}

function riskRank(risk: "low" | "medium" | "high"): number {
  return risk === "high" ? 3 : risk === "medium" ? 2 : 1;
}

// Re-export evaluateIntentAmbiguityAdmission for backward-compat policy/index.ts and policy/admission/index.ts barrels.
export { evaluateIntentAmbiguityAdmission } from "@protostar/intent";

// Re-export promoteIntentDraft for backward-compat policy/index.ts and policy/admission/index.ts barrels.
export { promoteIntentDraft } from "@protostar/intent";

export type PolicyVerdict =
  | {
      readonly type: "allow";
      readonly rationale: string;
    }
  | {
      readonly type: "needs-human";
      readonly checkpoint: FactoryStage;
      readonly rationale: string;
    }
  | {
      readonly type: "block";
      readonly rationale: string;
    };

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

export function authorizeFactoryStart(intent: ConfirmedIntent, policy: FactoryAutonomyPolicy): PolicyVerdict {
  if (!policy.allowDarkRun) {
    return {
      type: "needs-human",
      checkpoint: "intent",
      rationale: "Autonomous factory runs are disabled by policy."
    };
  }

  if (policy.requiredHumanCheckpoints.includes("planning")) {
    return {
      type: "needs-human",
      checkpoint: "planning",
      rationale: "Policy requires a human planning checkpoint before execution."
    };
  }

  const highestToolRisk = intent.capabilityEnvelope.toolPermissions.some((grant) => grant.risk === "high")
    ? "high"
    : intent.capabilityEnvelope.toolPermissions.some((grant) => grant.risk === "medium")
      ? "medium"
      : "low";

  if (riskRank(highestToolRisk) > riskRank(policy.maxAutonomousRisk)) {
    return {
      type: "block",
      rationale: `Capability envelope exceeds autonomous risk limit: ${highestToolRisk}.`
    };
  }

  return {
    type: "allow",
    rationale: "Confirmed intent and capability envelope fit the autonomy policy."
  };
}
