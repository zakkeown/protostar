import type { CapabilityEnvelope } from "./capability-envelope.js";

import type { AcceptanceCriterionId, AcceptanceCriterionWeakness, IntentDraft, IntentDraftId, IntentId, NormalizeAcceptanceCriteriaDiagnostic } from "./models.js";

import type { IntentDraftFieldPath } from "./draft-validation.js";

import { detectMissingIntentDraftFields } from "./draft-validation.js";

import { INTENT_AMBIGUITY_THRESHOLD, assessIntentAmbiguity, getIntentAmbiguityWeightingProfile } from "./ambiguity-scoring.js";

import type { IntentAmbiguityAssessment, IntentAmbiguityDimensionScore } from "./ambiguity-scoring.js";

import { generateClarificationQuestions } from "./clarification.js";

import type { ClarificationQuestion, ClarificationRequiredEntry } from "./clarification.js";

import { mintConfirmedIntent } from "./confirmed-intent.js";

import { normalizeAcceptanceCriteria } from "./acceptance-criteria.js";

import { DUPLICATE_ACCEPTANCE_CRITERION_POLICY_CODE, INTENT_ARCHETYPE_PROPOSAL_LOW_CONFIDENCE_THRESHOLD, LOW_CONFIDENCE_GOAL_ARCHETYPE_POLICY_CODE, MANUAL_UNJUSTIFIED_ACCEPTANCE_CRITERION_POLICY_CODE } from "./promotion-contracts.js";

import type { IntentAdmissionAcceptanceCriterionReference, IntentAdmissionHardZeroDimensionId, IntentAdmissionHardZeroReason, IntentAdmissionIssueReference, IntentAdmissionMissingFieldDetection, IntentAdmissionOutputContractSections, IntentAdmissionPolicyFinding, IntentAdmissionPolicyFindingCode, IntentAdmissionRequiredClarification, IntentAmbiguityAdmissionDecision, IntentPromotionFailureDetails, PromoteIntentDraftInput, PromoteIntentDraftResult, RequiredIntentDraftDimensionCheck, RequiredIntentDraftFieldCheck } from "./promotion-contracts.js";

import { formatAmbiguityScore, normalizeText, roundScore, stableHash, uniqueBy, uniqueOrdered } from "./admission-shared.js";

import { proposeIntentDraftArchetype } from "./archetype-autotag.js";

import { admitBugfixCapabilityEnvelope, admitCosmeticTweakCapabilityEnvelope, admitFeatureAddCapabilityEnvelope, admitRefactorCapabilityEnvelope, validateIntentDraftCapabilityEnvelopeAdmission } from "./capability-admission.js";

import { normalizeDraftCapabilityEnvelope } from "./capability-normalization.js";

import { BUGFIX_GOAL_ARCHETYPE, COSMETIC_TWEAK_GOAL_ARCHETYPE, FEATURE_ADD_GOAL_ARCHETYPE, REFACTOR_GOAL_ARCHETYPE, SUPPORTED_GOAL_ARCHETYPES } from "./archetypes.js";

import type { IntentArchetypeAutoTagSuggestion } from "./archetypes.js";

export function evaluateIntentAmbiguityAdmission(
  assessment: IntentAmbiguityAssessment
): IntentAmbiguityAdmissionDecision {
  const admissionThreshold = Number.isFinite(assessment.threshold)
    ? Math.min(assessment.threshold, INTENT_AMBIGUITY_THRESHOLD)
    : INTENT_AMBIGUITY_THRESHOLD;
  const finite = Number.isFinite(assessment.ambiguity);
  const errors: string[] = [];

  if (!finite) {
    errors.push("Intent ambiguity must be finite before promotion.");
  } else {
    if (assessment.ambiguity > INTENT_AMBIGUITY_THRESHOLD) {
      errors.push(
        `Intent ambiguity ${formatAmbiguityScore(assessment.ambiguity)} exceeds admission ceiling ${formatAmbiguityScore(INTENT_AMBIGUITY_THRESHOLD)}.`
      );
    }
    if (admissionThreshold < INTENT_AMBIGUITY_THRESHOLD && assessment.ambiguity > admissionThreshold) {
      errors.push(
        `Intent ambiguity ${formatAmbiguityScore(assessment.ambiguity)} exceeds configured threshold ${formatAmbiguityScore(admissionThreshold)}.`
      );
    }
  }

  if (assessment.structurallyMissingDimensions.length > 0) {
    errors.push(`Structurally missing dimensions: ${assessment.structurallyMissingDimensions.join(", ")}.`);
  }

  return {
    accepted: errors.length === 0,
    ambiguity: assessment.ambiguity,
    admissionThreshold,
    configuredThreshold: assessment.threshold,
    finite,
    errors
  };
}

export function promoteIntentDraft(input: PromoteIntentDraftInput): PromoteIntentDraftResult {
  const draft = input.draft;
  const mode = input.mode ?? draft.mode ?? "brownfield";
  const threshold = input.threshold ?? INTENT_AMBIGUITY_THRESHOLD;
  const weightingProfile = getIntentAmbiguityWeightingProfile(mode);
  const archetypeSuggestion = proposeIntentDraftArchetype(draft);
  const clarificationOutput = generateClarificationQuestions({ draft, mode });
  const questions = clarificationOutput.questions;
  const completenessReport = detectMissingIntentDraftFields({ draft, mode });
  const requiredDimensionChecklist = completenessReport.dimensions;
  const requiredFieldChecklist = completenessReport.fieldChecks;
  const capabilityEnvelopeAdmission = validateIntentDraftCapabilityEnvelopeAdmission({
    draft
  });
  const capabilityPolicyFindings = capabilityEnvelopeAdmission.findings;
  const normalizedAcceptanceCriteria = requiredFieldCheckPassed(requiredFieldChecklist, "acceptanceCriteria")
    ? normalizeAcceptanceCriteria(draft.acceptanceCriteria)
    : undefined;
  const normalizedCapabilityEnvelope = capabilityEnvelopeRequiredFieldsPassed(requiredFieldChecklist)
    ? normalizeDraftCapabilityEnvelope(draft.capabilityEnvelope)
    : undefined;
  const archetypeProposalPolicyFindings = lowConfidenceArchetypeProposalPolicyFindings(archetypeSuggestion);
  const policyFindings = [
    ...capabilityPolicyFindings,
    ...archetypeProposalPolicyFindings,
    ...manualAcceptanceCriterionPolicyFindings(normalizedAcceptanceCriteria?.weakAcceptanceCriteria ?? []),
    ...duplicateAcceptanceCriterionPolicyFindings(normalizedAcceptanceCriteria?.diagnostics ?? [])
  ];
  const admissionContractErrors = [
    ...(normalizedAcceptanceCriteria?.errors ?? []),
    ...(normalizedCapabilityEnvelope?.errors ?? [])
  ];
  const checklistErrors = uniqueOrdered([
    ...requiredDimensionChecklist.filter((check) => !check.passed).map((check) => check.message),
    ...requiredFieldChecklist.flatMap((check) => check.failures.map((failure) => failure.message)),
    ...admissionContractErrors,
    ...policyFindings.filter((finding) => finding.severity === "block").map((finding) => finding.message)
  ]);
  const ambiguityAssessment = applyAdmissionVerdict(
    assessIntentAmbiguity(draft, {
      mode,
      threshold
    }),
    policyFindings
      .filter(findingRaisesAdmissionAmbiguity)
      .map((finding) => ({
        dimension: finding.ambiguityDimension ?? "constraints",
        score: 0.85,
        fieldPath: finding.fieldPath,
        message: finding.message
      }))
  );
  const ambiguityAdmission = evaluateIntentAmbiguityAdmission(ambiguityAssessment);
  const outputSections = buildIntentAdmissionOutputSections({
    requiredDimensionChecklist,
    requiredFieldChecklist,
    missingFieldClarifications: clarificationOutput.requiredClarifications,
    questions,
    policyFindings,
    ambiguityAssessment
  });
  const ambiguityErrors = ambiguityAdmission.accepted
    ? []
    : uniqueOrdered([
        ...ambiguityAdmission.errors,
        ...ambiguityAssessment.requiredClarifications
      ]);

  if (checklistErrors.length > 0 || ambiguityErrors.length > 0) {
    const failureDetails = createPromotionFailureDetails({
      checklistErrors,
      ambiguityErrors
    });

    return {
      ok: false,
      failureState: failureDetails.state,
      failureDetails,
      weightingProfile,
      ambiguityAssessment,
      requiredDimensionChecklist,
      requiredFieldChecklist,
      ...outputSections,
      questions,
      policyFindings,
      archetypeSuggestion,
      errors: uniqueOrdered([...checklistErrors, ...ambiguityErrors])
    };
  }

  if (
    normalizedAcceptanceCriteria === undefined ||
    normalizedCapabilityEnvelope?.envelope === undefined
  ) {
    throw new Error("Draft promotion reached confirmation without normalized admission contracts.");
  }

  const confirmedAt = input.confirmedAt ?? draft.updatedAt ?? draft.createdAt;
  const confirmedGoalArchetype = selectConfirmedIntentGoalArchetype(draft);
  const admittedCapabilityEnvelope = grantCapabilityEnvelopeForPromotion({
    draft,
    envelope: normalizedCapabilityEnvelope.envelope
  });
  const intent = mintConfirmedIntent({
    id: createPromotedIntentId(draft),
    ...optionalSourceDraftIdProperty(draft),
    mode,
    goalArchetype: confirmedGoalArchetype,
    title: normalizeText(draft.title) ?? "",
    problem: normalizeText(draft.problem) ?? "",
    requester: normalizeText(draft.requester) ?? "",
    ...optionalDraftTextProperty("context", draft.context),
    acceptanceCriteria: normalizedAcceptanceCriteria.acceptanceCriteria,
    capabilityEnvelope: admittedCapabilityEnvelope,
    constraints: normalizeStringList(draft.constraints),
    stopConditions: normalizeStringList(draft.stopConditions),
    ...(confirmedAt !== undefined ? { confirmedAt } : {}),
    schemaVersion: "1.2.0",
    signature: null
  });

  return {
    ok: true,
    intent,
    weightingProfile: ambiguityAssessment.weightingProfile,
    ambiguityAssessment,
    requiredDimensionChecklist,
    requiredFieldChecklist,
    ...outputSections,
    questions,
    policyFindings,
    archetypeSuggestion,
    errors: []
  };
}

function createPromotionFailureDetails(input: {
  readonly checklistErrors: readonly string[];
  readonly ambiguityErrors: readonly string[];
}): IntentPromotionFailureDetails {
  const checklistErrors = uniqueOrdered(input.checklistErrors);
  const ambiguityErrors = uniqueOrdered(input.ambiguityErrors);
  const checklistFailed = checklistErrors.length > 0;
  const ambiguityFailed = ambiguityErrors.length > 0;

  return {
    state: checklistFailed && ambiguityFailed ? "combined" : ambiguityFailed ? "ambiguity-only" : "checklist-only",
    checklistFailed,
    ambiguityFailed,
    confirmedIntentCreated: false,
    checklistErrors,
    ambiguityErrors
  };
}

function findingRaisesAdmissionAmbiguity(finding: IntentAdmissionPolicyFinding): boolean {
  return (finding.severity === "ambiguity" && !finding.overridden) || finding.code === "missing-goal-archetype";
}

function manualAcceptanceCriterionPolicyFindings(
  weaknesses: readonly AcceptanceCriterionWeakness[]
): readonly IntentAdmissionPolicyFinding[] {
  return weaknesses.map((weakness): IntentAdmissionPolicyFinding => {
    const reference: IntentAdmissionAcceptanceCriterionReference = {
      type: "acceptance-criterion",
      id: weakness.criterionId,
      index: weakness.index,
      fieldPath: `acceptanceCriteria.${weakness.index}` as `acceptanceCriteria.${number}`
    };

    return {
      code: MANUAL_UNJUSTIFIED_ACCEPTANCE_CRITERION_POLICY_CODE,
      fieldPath: weakness.fieldPath,
      severity: "ambiguity",
      message:
        `Manual acceptance criterion ${weakness.index + 1} (${weakness.criterionId}) requires a non-empty justification before admission.`,
      overridable: false,
      overridden: false,
      ambiguityDimension: "successCriteria",
      acceptanceCriterionId: weakness.criterionId,
      acceptanceCriterionIndex: weakness.index,
      affectedAcceptanceCriterionIds: [weakness.criterionId],
      references: [reference]
    };
  });
}

function duplicateAcceptanceCriterionPolicyFindings(
  diagnostics: readonly NormalizeAcceptanceCriteriaDiagnostic[]
): readonly IntentAdmissionPolicyFinding[] {
  return diagnostics
    .filter(isDuplicateAcceptanceCriterionDiagnostic)
    .map((diagnostic): IntentAdmissionPolicyFinding => {
      const reference: IntentAdmissionAcceptanceCriterionReference = {
        type: "acceptance-criterion",
        id: diagnostic.criterionId,
        index: diagnostic.index,
        fieldPath: `acceptanceCriteria.${diagnostic.index}` as `acceptanceCriteria.${number}`
      };

      return {
        code: DUPLICATE_ACCEPTANCE_CRITERION_POLICY_CODE,
        fieldPath: diagnostic.fieldPath,
        severity: "ambiguity",
        message: diagnostic.message,
        overridable: false,
        overridden: false,
        ambiguityDimension: "successCriteria",
        acceptanceCriterionId: diagnostic.criterionId,
        acceptanceCriterionIndex: diagnostic.index,
        affectedAcceptanceCriterionIds: [diagnostic.criterionId],
        references: [reference]
      };
    });
}

function isDuplicateAcceptanceCriterionDiagnostic(
  diagnostic: NormalizeAcceptanceCriteriaDiagnostic
): diagnostic is NormalizeAcceptanceCriteriaDiagnostic & {
  readonly index: number;
  readonly criterionId: AcceptanceCriterionId;
  readonly fieldPath: `acceptanceCriteria.${number}.statement`;
} {
  return (
    diagnostic.code === DUPLICATE_ACCEPTANCE_CRITERION_POLICY_CODE &&
    diagnostic.index !== undefined &&
    diagnostic.criterionId !== undefined &&
    diagnostic.fieldPath.startsWith("acceptanceCriteria.") &&
    diagnostic.fieldPath.endsWith(".statement")
  );
}

function requiredFieldCheckPassed(
  checks: readonly RequiredIntentDraftFieldCheck[],
  fieldPath: IntentDraftFieldPath
): boolean {
  return checks.find((check) => check.fieldPath === fieldPath)?.passed === true;
}

function capabilityEnvelopeRequiredFieldsPassed(
  checks: readonly RequiredIntentDraftFieldCheck[]
): boolean {
  return (
    requiredFieldCheckPassed(checks, "capabilityEnvelope.repoScopes") &&
    requiredFieldCheckPassed(checks, "capabilityEnvelope.toolPermissions") &&
    requiredFieldCheckPassed(checks, "capabilityEnvelope.budget")
  );
}

function buildIntentAdmissionOutputSections(input: {
  readonly requiredDimensionChecklist: readonly RequiredIntentDraftDimensionCheck[];
  readonly requiredFieldChecklist: readonly RequiredIntentDraftFieldCheck[];
  readonly missingFieldClarifications: readonly ClarificationRequiredEntry[];
  readonly questions: readonly ClarificationQuestion[];
  readonly policyFindings: readonly IntentAdmissionPolicyFinding[];
  readonly ambiguityAssessment?: IntentAmbiguityAssessment;
}): IntentAdmissionOutputContractSections {
  const hardZeroReasons = buildIntentAdmissionHardZeroReasons({
    requiredDimensionChecklist: input.requiredDimensionChecklist,
    ...(input.ambiguityAssessment !== undefined ? { ambiguityAssessment: input.ambiguityAssessment } : {})
  });
  const missingFieldDetections: IntentAdmissionMissingFieldDetection[] = [
    ...input.requiredFieldChecklist
      .filter((check) => !check.passed)
      .flatMap((check) => check.failures.map((failure) => ({
        code: failure.code,
        checklistIndex: failure.checklistIndex,
        fieldPath: failure.fieldPath,
        dimensionId: failure.dimensionId,
        label: failure.label,
        message: failure.message,
        source: "required-field-checklist" as const
      }))),
    ...(input.ambiguityAssessment?.dimensionScores.flatMap((score) =>
      score.missingFields.map((fieldPath) => ({
        fieldPath,
        message: `${fieldPath} is missing or structurally incomplete for ${score.dimension} clarity.`,
        source: "ambiguity-assessment" as const
      }))
    ) ?? []),
    ...input.policyFindings
      .filter((finding) => finding.severity === "block")
      .map((finding) => ({
        code: finding.code,
        ...policyFindingAdmissionIssueFields(finding),
        fieldPath: finding.fieldPath,
        message: finding.message,
        source: "policy-finding" as const
      }))
  ];
  const requiredClarifications: IntentAdmissionRequiredClarification[] = [
    ...hardZeroReasons.map((reason) => ({
      fieldPath: reason.fieldPath,
      prompt: reason.message,
      rationale: `${reason.dimensionId} is a required admission dimension; missing dimensions are deterministic hard-zero clarification reasons independent of weighted ambiguity.`,
      source: reason.source
    })),
    ...input.missingFieldClarifications.map((clarification) => ({
      fieldPath: clarification.fieldPath,
      prompt: clarification.prompt,
      rationale: clarification.rationale,
      source: "missing-field-detection" as const,
      questionId: clarification.questionId,
      questionKey: clarification.questionKey
    })),
    ...input.questions.map((question) => ({
      fieldPath: question.fieldPath,
      prompt: question.prompt,
      rationale: question.rationale,
      source: "clarification-question-generator" as const,
      questionId: question.id,
      questionKey: question.key
    })),
    ...(input.ambiguityAssessment?.dimensionScores.flatMap((score) =>
      score.requiredClarifications.map((prompt, index) => ({
        fieldPath: score.missingFields[index] ?? `dimension:${score.dimension}`,
        prompt,
        rationale: score.rationale,
        source: "ambiguity-assessment" as const
      }))
    ) ?? []),
    ...input.policyFindings
      .filter((finding) => finding.severity === "ambiguity" && !finding.overridden)
      .map((finding) => ({
        ...policyFindingAdmissionIssueFields(finding),
        fieldPath: finding.fieldPath,
        prompt: finding.message,
        rationale: policyFindingClarificationRationale(finding),
        source: "policy-finding" as const
      }))
  ];

  return {
    missingFieldDetections: dedupeMissingFieldDetections(missingFieldDetections),
    requiredClarifications: dedupeRequiredClarifications(requiredClarifications),
    hardZeroReasons
  };
}

function policyFindingAdmissionIssueFields(
  finding: IntentAdmissionPolicyFinding
): {
  readonly issueCode: IntentAdmissionPolicyFindingCode;
  readonly affectedAcceptanceCriterionIds?: readonly AcceptanceCriterionId[];
  readonly references?: readonly IntentAdmissionIssueReference[];
} {
  return {
    issueCode: finding.code,
    ...(finding.affectedAcceptanceCriterionIds !== undefined
      ? { affectedAcceptanceCriterionIds: finding.affectedAcceptanceCriterionIds }
      : {}),
    ...(finding.references !== undefined ? { references: finding.references } : {})
  };
}

function policyFindingClarificationRationale(finding: IntentAdmissionPolicyFinding): string {
  if (finding.code === MANUAL_UNJUSTIFIED_ACCEPTANCE_CRITERION_POLICY_CODE) {
    return "Add a non-empty manual verification justification or choose test/evidence so the affected acceptance criterion is measurable.";
  }
  if (finding.code === DUPLICATE_ACCEPTANCE_CRITERION_POLICY_CODE) {
    return "Remove or rewrite the duplicate acceptance criterion so every criterion proves a distinct normalized outcome.";
  }
  if (finding.code === LOW_CONFIDENCE_GOAL_ARCHETYPE_POLICY_CODE) {
    return "Select an explicit supported goalArchetype so policy caps are not applied from a weak deterministic proposal.";
  }

  return "Provide an explicit authority justification to override this policy overage.";
}

function buildIntentAdmissionHardZeroReasons(input: {
  readonly requiredDimensionChecklist: readonly RequiredIntentDraftDimensionCheck[];
  readonly ambiguityAssessment?: IntentAmbiguityAssessment;
}): readonly IntentAdmissionHardZeroReason[] {
  return dedupeHardZeroReasons([
    ...input.requiredDimensionChecklist
      .filter((check) => !check.passed)
      .map((check): IntentAdmissionHardZeroReason => ({
        dimensionId: check.dimensionId,
        fieldPath: `dimension:${check.dimensionId}`,
        score: 1,
        clarity: 0,
        missingFields: check.missingFields,
        message: hardZeroReasonMessage(check.dimensionId, check.missingFields),
        source: "required-dimension-checklist"
      })),
    ...(input.ambiguityAssessment?.dimensionScores
      .filter((score) => score.structurallyMissing)
      .map((score): IntentAdmissionHardZeroReason => ({
        dimensionId: score.dimension,
        fieldPath: `dimension:${score.dimension}`,
        score: 1,
        clarity: 0,
        missingFields: score.missingFields,
        message: hardZeroReasonMessage(score.dimension, score.missingFields),
        source: "ambiguity-assessment"
      })) ?? [])
  ]);
}

function hardZeroReasonMessage(
  dimensionId: IntentAdmissionHardZeroDimensionId,
  missingFields: readonly string[]
): string {
  const missingFieldSummary = missingFields.length > 0
    ? ` missing fields: ${missingFields.join(", ")}.`
    : "";

  return `${dimensionId} dimension is structurally missing; deterministic hard-zero reason (score 1, clarity 0) blocks promotion.${missingFieldSummary}`;
}

function applyAdmissionVerdict(
  assessment: IntentAmbiguityAssessment,
  bumps: readonly {
    readonly dimension: IntentAmbiguityDimensionScore["dimension"];
    readonly score: number;
    readonly fieldPath: IntentDraftFieldPath;
    readonly message: string;
  }[]
): IntentAmbiguityAssessment {
  const bumpedAssessment = applyAdmissionAmbiguityBumps(assessment, bumps);
  const admission = evaluateIntentAmbiguityAdmission(bumpedAssessment);

  return {
    ...bumpedAssessment,
    accepted: admission.accepted
  };
}

function applyAdmissionAmbiguityBumps(
  assessment: IntentAmbiguityAssessment,
  bumps: readonly {
    readonly dimension: IntentAmbiguityDimensionScore["dimension"];
    readonly score: number;
    readonly fieldPath: IntentDraftFieldPath;
    readonly message: string;
  }[]
): IntentAmbiguityAssessment {
  if (bumps.length === 0) {
    return assessment;
  }

  const dimensionScores = assessment.dimensionScores.map((score): IntentAmbiguityDimensionScore => {
    const dimensionBumps = bumps.filter((bump) => bump.dimension === score.dimension);
    if (dimensionBumps.length === 0) {
      return score;
    }

    const bumpedScore = roundScore(Math.max(score.score, ...dimensionBumps.map((bump) => bump.score)));
    return {
      ...score,
      score: bumpedScore,
      clarity: roundScore(1 - bumpedScore),
      weightedScore: roundScore(bumpedScore * score.weight),
      requiredClarifications: uniqueOrdered([
        ...score.requiredClarifications,
        ...dimensionBumps.map((bump) => bump.message)
      ]),
      missingFields: uniqueOrdered([
        ...score.missingFields,
        ...dimensionBumps.map((bump) => bump.fieldPath)
      ])
    };
  });
  const ambiguity = roundScore(dimensionScores.reduce((total, score) => total + score.weightedScore, 0));
  const structurallyMissingDimensions = dimensionScores
    .filter((score) => score.structurallyMissing)
    .map((score) => score.dimension);

  return {
    ...assessment,
    ambiguity,
    accepted: ambiguity <= assessment.threshold && structurallyMissingDimensions.length === 0,
    dimensionScores,
    scores: dimensionScores,
    missingFields: uniqueOrdered(dimensionScores.flatMap((score) => score.missingFields)),
    requiredClarifications: uniqueOrdered(dimensionScores.flatMap((score) => score.requiredClarifications)),
    structurallyMissingDimensions
  };
}

function createPromotedIntentId(draft: IntentDraft): IntentId {
  const draftId = normalizeText(draft.draftId);
  if (draftId !== undefined) {
    return `intent_${draftId.replace(/^draft_/, "").replace(/[^a-zA-Z0-9_]+/g, "_")}` as IntentId;
  }

  return `intent_${stableHash(
    [draft.title, draft.problem, draft.requester].map((value) => normalizeText(value) ?? "").join("|")
  )}` as IntentId;
}

function selectConfirmedIntentGoalArchetype(draft: IntentDraft): string {
  const goalArchetype = normalizeText(draft.goalArchetype);
  if (goalArchetype === undefined) {
    throw new Error("Draft promotion reached confirmation without an explicit goalArchetype.");
  }

  return goalArchetype;
}

function grantCapabilityEnvelopeForPromotion(input: {
  readonly draft: IntentDraft;
  readonly envelope: CapabilityEnvelope;
}): CapabilityEnvelope {
  const goalArchetype = selectConfirmedIntentGoalArchetype(input.draft);

  if (goalArchetype !== COSMETIC_TWEAK_GOAL_ARCHETYPE) {
    if (goalArchetype === FEATURE_ADD_GOAL_ARCHETYPE) {
      const admission = admitFeatureAddCapabilityEnvelope({
        draft: input.draft
      });
      throw new Error(
        `Draft promotion reached confirmation despite unsupported feature-add admission: ${admission.errors.join("; ")}`
      );
    }
    if (goalArchetype === REFACTOR_GOAL_ARCHETYPE) {
      const admission = admitRefactorCapabilityEnvelope({
        draft: input.draft
      });
      throw new Error(
        `Draft promotion reached confirmation despite unsupported refactor admission: ${admission.errors.join("; ")}`
      );
    }
    if (goalArchetype === BUGFIX_GOAL_ARCHETYPE) {
      const admission = admitBugfixCapabilityEnvelope({
        draft: input.draft
      });
      throw new Error(
        `Draft promotion reached confirmation despite unsupported bugfix admission: ${admission.errors.join("; ")}`
      );
    }

    return input.envelope;
  }

  const admission = admitCosmeticTweakCapabilityEnvelope({
    draft: input.draft
  });
  if (!admission.ok) {
    throw new Error(
      `Draft promotion reached confirmation without a granted cosmetic-tweak capability envelope: ${admission.errors.join("; ")}`
    );
  }

  return admission.grant.capabilityEnvelope;
}

function optionalSourceDraftIdProperty(draft: IntentDraft): { readonly sourceDraftId?: IntentDraftId } {
  const draftId = normalizeText(draft.draftId);
  return draftId === undefined ? {} : { sourceDraftId: draftId as IntentDraftId };
}

function optionalDraftTextProperty<Key extends string>(key: Key, value: unknown): Partial<Record<Key, string>> {
  const normalized = normalizeText(value);
  return normalized === undefined ? {} : { [key]: normalized } as Partial<Record<Key, string>>;
}

function normalizeStringList(values: readonly string[] | undefined): readonly string[] {
  return values?.map((value) => normalizeText(value)).filter((value): value is string => value !== undefined) ?? [];
}

function lowConfidenceArchetypeProposalPolicyFindings(
  suggestion: IntentArchetypeAutoTagSuggestion
): readonly IntentAdmissionPolicyFinding[] {
  if (
    suggestion.confidence <= 0 ||
    suggestion.confidence >= INTENT_ARCHETYPE_PROPOSAL_LOW_CONFIDENCE_THRESHOLD
  ) {
    return [];
  }

  return [
    {
      code: LOW_CONFIDENCE_GOAL_ARCHETYPE_POLICY_CODE,
      fieldPath: "goalArchetype",
      severity: "ambiguity",
      message:
        `Goal archetype proposal '${suggestion.archetype}' is low confidence ` +
        `(${suggestion.confidence.toFixed(3)} below ` +
        `${INTENT_ARCHETYPE_PROPOSAL_LOW_CONFIDENCE_THRESHOLD.toFixed(3)}); ` +
        `select one supported goalArchetype explicitly before admission. Supported archetypes: ` +
        `${SUPPORTED_GOAL_ARCHETYPES.join(", ")}.`,
      overridable: false,
      overridden: false,
      ambiguityDimension: "goal"
    }
  ];
}

function dedupeMissingFieldDetections(
  detections: readonly IntentAdmissionMissingFieldDetection[]
): readonly IntentAdmissionMissingFieldDetection[] {
  return uniqueBy(detections, (detection) =>
    [detection.source, detection.fieldPath, detection.message].join("|")
  );
}

function dedupeRequiredClarifications(
  clarifications: readonly IntentAdmissionRequiredClarification[]
): readonly IntentAdmissionRequiredClarification[] {
  return uniqueBy(clarifications, (clarification) => {
    const sourceKey = isAuthorityOverageClarification(clarification)
      ? `${clarification.source}:${clarification.issueCode}`
      : "";

    return [sourceKey, clarification.fieldPath, clarification.prompt].join("|");
  });
}

function isAuthorityOverageClarification(clarification: IntentAdmissionRequiredClarification): boolean {
  return (
    clarification.source === "policy-finding" &&
    (clarification.issueCode === "repo-authority-overage" ||
      clarification.issueCode === "execute-authority-overage" ||
      clarification.issueCode === "tool-authority-overage" ||
      clarification.issueCode === "budget-authority-overage")
  );
}

function dedupeHardZeroReasons(
  reasons: readonly IntentAdmissionHardZeroReason[]
): readonly IntentAdmissionHardZeroReason[] {
  return uniqueBy(reasons, (reason) =>
    [reason.source, reason.dimensionId, reason.fieldPath, reason.message].join("|")
  );
}
