import type { ConfirmedIntent, ConfirmedIntentData } from "./confirmed-intent.js";

import type { AcceptanceCriterion, AcceptanceCriterionVerificationMode, IntentDraft, IntentDraftAcceptanceCriterion, IntentDraftCapabilityEnvelope, IntentDraftRepoScopeGrant, IntentDraftToolPermissionGrant } from "./models.js";

import type { IntentDraftFieldPath } from "./draft-validation.js";

import { average, draftFieldValue, hasNonEmptyText, isRecord, isRepoAccess, normalizeOptionalText, roundScore, uniqueOrdered } from "./shared.js";

import { hasBudgetLimit, isValidBudgetLimitValue } from "./capability-envelope.js";

import type { FactoryBudget, RepoScopeGrant, ToolPermissionGrant } from "./capability-envelope.js";

import type { ClarificationQuestionCandidate } from "./clarification.js";

import { analyzeAcceptanceCriterionVerificationMode, validateManualAcceptanceCriterionJustification } from "./acceptance-criteria.js";

export type IntentAmbiguityMode = "greenfield" | "brownfield";

export type IntentClarityDimension = "goal" | "constraints" | "successCriteria" | "context";

export type IntentAmbiguityDimensionId = IntentClarityDimension;

export const INTENT_AMBIGUITY_THRESHOLD = 0.2;

export interface IntentAmbiguityDimensionWeight {
  readonly dimension: IntentClarityDimension;
  readonly weight: number;
}

export type IntentAmbiguityWeightingProfileId = `${IntentAmbiguityMode}-v1`;

export interface IntentAmbiguityWeightingProfile {
  readonly id: IntentAmbiguityWeightingProfileId;
  readonly mode: IntentAmbiguityMode;
  readonly version: 1;
  readonly label: string;
  readonly dimensions: readonly IntentAmbiguityDimensionWeight[];
  readonly totalWeight: 1;
  readonly structurallyMissingAutoFail: true;
}

export const INTENT_AMBIGUITY_WEIGHTING_PROFILES = {
  greenfield: {
    id: "greenfield-v1",
    mode: "greenfield",
    version: 1,
    label: "Greenfield intent ambiguity weighting profile",
    dimensions: [
      {
        dimension: "goal",
        weight: 0.4
      },
      {
        dimension: "constraints",
        weight: 0.3
      },
      {
        dimension: "successCriteria",
        weight: 0.3
      }
    ],
    totalWeight: 1,
    structurallyMissingAutoFail: true
  },
  brownfield: {
    id: "brownfield-v1",
    mode: "brownfield",
    version: 1,
    label: "Brownfield intent ambiguity weighting profile",
    dimensions: [
      {
        dimension: "goal",
        weight: 0.35
      },
      {
        dimension: "constraints",
        weight: 0.25
      },
      {
        dimension: "successCriteria",
        weight: 0.25
      },
      {
        dimension: "context",
        weight: 0.15
      }
    ],
    totalWeight: 1,
    structurallyMissingAutoFail: true
  }
} as const satisfies Readonly<Record<IntentAmbiguityMode, IntentAmbiguityWeightingProfile>>;

export const INTENT_AMBIGUITY_DIMENSION_WEIGHTS = {
  greenfield: INTENT_AMBIGUITY_WEIGHTING_PROFILES.greenfield.dimensions,
  brownfield: INTENT_AMBIGUITY_WEIGHTING_PROFILES.brownfield.dimensions
} as const satisfies Readonly<Record<IntentAmbiguityMode, readonly IntentAmbiguityDimensionWeight[]>>;

export function getIntentAmbiguityWeightingProfile(
  mode: IntentAmbiguityMode
): IntentAmbiguityWeightingProfile {
  return INTENT_AMBIGUITY_WEIGHTING_PROFILES[mode];
}

export const INTENT_AMBIGUITY_WEIGHTING_PROFILE_IDS = {
  greenfield: INTENT_AMBIGUITY_WEIGHTING_PROFILES.greenfield.id,
  brownfield: INTENT_AMBIGUITY_WEIGHTING_PROFILES.brownfield.id
} as const satisfies Readonly<Record<IntentAmbiguityMode, IntentAmbiguityWeightingProfileId>>;

export type IntentAmbiguityScoringSubject = ConfirmedIntent | ConfirmedIntentData | IntentDraft;

export type IntentAmbiguityWeightingProfileInput = IntentAmbiguityMode | IntentAmbiguityWeightingProfile;

export interface IntentAmbiguityDimensionSignal {
  readonly score: number;
  readonly rationale: string;
  readonly missingFields: readonly string[];
  readonly requiredClarifications: readonly string[];
}

export interface ScoreIntentAmbiguityDimensionInput {
  readonly intent: IntentAmbiguityScoringSubject;
  readonly dimension: IntentClarityDimension;
  readonly weight?: number;
  readonly weightingProfile: IntentAmbiguityWeightingProfile;
}

export interface IntentAmbiguityDimensionScore {
  readonly dimension: IntentAmbiguityDimensionId;
  readonly weightingProfile: IntentAmbiguityWeightingProfile;
  readonly score: number;
  readonly clarity: number;
  readonly weight: number;
  readonly weightedScore: number;
  readonly structurallyMissing: boolean;
  readonly rationale: string;
  readonly missingFields: readonly string[];
  readonly requiredClarifications: readonly string[];
}

export type IntentClarityScore = IntentAmbiguityDimensionScore;

export interface IntentAmbiguityAssessment {
  readonly mode: IntentAmbiguityMode;
  readonly weightingProfile: IntentAmbiguityWeightingProfile;
  readonly threshold: number;
  readonly ambiguity: number;
  readonly accepted: boolean;
  readonly dimensionScores: readonly IntentAmbiguityDimensionScore[];
  readonly scores: readonly IntentAmbiguityDimensionScore[];
  readonly missingFields: readonly string[];
  readonly requiredClarifications: readonly string[];
  readonly structurallyMissingDimensions: readonly IntentClarityDimension[];
}

export type CosmeticTweakAmbiguityDetailId = "target" | "scope" | "success-evidence";

export interface CosmeticTweakAmbiguityDetailSignal {
  readonly detail: CosmeticTweakAmbiguityDetailId;
  readonly dimension: IntentClarityDimension;
  readonly satisfied: boolean;
  readonly scoreFloor: number;
  readonly fieldPath: IntentDraftFieldPath;
  readonly missingField: string;
  readonly requiredClarification: string;
}

export interface CosmeticTweakAmbiguityDetailAssessment {
  readonly applies: boolean;
  readonly details: readonly CosmeticTweakAmbiguityDetailSignal[];
  readonly missingDetails: readonly CosmeticTweakAmbiguityDetailId[];
}

export function assessIntentAmbiguity(
  intent: IntentAmbiguityScoringSubject,
  input?: {
    readonly mode?: IntentAmbiguityMode;
    readonly threshold?: number;
  }
): IntentAmbiguityAssessment {
  const mode = input?.mode ?? "brownfield";
  const threshold = input?.threshold ?? INTENT_AMBIGUITY_THRESHOLD;
  const weightingProfile = getIntentAmbiguityWeightingProfile(mode);
  const dimensionScores = scoreIntentClarity(intent, weightingProfile);
  const ambiguity = roundScore(dimensionScores.reduce((total, score) => total + score.weightedScore, 0));
  const structurallyMissingDimensions = dimensionScores
    .filter((score) => score.structurallyMissing)
    .map((score) => score.dimension);
  const missingFields = uniqueOrdered(dimensionScores.flatMap((score) => score.missingFields));
  const requiredClarifications = uniqueOrdered(dimensionScores.flatMap((score) => score.requiredClarifications));

  return {
    mode,
    weightingProfile,
    threshold,
    ambiguity,
    accepted: ambiguity <= threshold && structurallyMissingDimensions.length === 0,
    dimensionScores,
    scores: dimensionScores,
    missingFields,
    requiredClarifications,
    structurallyMissingDimensions
  };
}

export function assessConfirmedIntentAmbiguity(
  intent: ConfirmedIntent | ConfirmedIntentData,
  input?: {
    readonly mode?: IntentAmbiguityMode;
    readonly threshold?: number;
  }
): IntentAmbiguityAssessment {
  return assessIntentAmbiguity(intent, input);
}

export function assertIntentAmbiguityAccepted(assessment: IntentAmbiguityAssessment): IntentAmbiguityAssessment {
  if (!assessment.accepted) {
    const details = [
      `Intent ambiguity ${assessment.ambiguity.toFixed(2)} exceeds threshold ${assessment.threshold.toFixed(2)}.`,
      assessment.structurallyMissingDimensions.length > 0
        ? `Structurally missing dimensions: ${assessment.structurallyMissingDimensions.join(", ")}.`
        : "",
      assessment.missingFields.length > 0 ? `Missing fields: ${assessment.missingFields.join(", ")}.` : "",
      assessment.requiredClarifications.length > 0
        ? `Required clarifications: ${assessment.requiredClarifications.join(" ")}`
        : ""
    ].filter((entry) => entry.length > 0);
    throw new Error(
      details.join(" ")
    );
  }
  return assessment;
}

export type AuthorityBoundaryIssue = "missing" | "underspecified" | "ambiguous";

export function classifyStopConditionIssue(intent: IntentAmbiguityScoringSubject): StopConditionIssue | undefined {
  const stopConditions = stopConditionsForScoring(intent);
  const hasLifecycleStopCap = hasLifecycleStopBudgetLimit(intent.capabilityEnvelope?.budget);

  if (stopConditions.length === 0) {
    return hasLifecycleStopCap ? undefined : "missing";
  }

  if (stopConditions.every(isUnderspecifiedStopCondition)) {
    return "underspecified";
  }

  return stopConditions.some(isAmbiguousStopCondition) ? "ambiguous" : undefined;
}

function stopConditionsForScoring(intent: IntentAmbiguityScoringSubject): readonly string[] {
  return "stopConditions" in intent && Array.isArray(intent.stopConditions)
    ? intent.stopConditions.filter(hasNonEmptyText)
    : [];
}

function hasLifecycleStopBudgetLimit(budget: FactoryBudget | IntentDraftCapabilityEnvelope["budget"] | undefined):
  boolean {
  return isValidBudgetLimitValue(budget?.timeoutMs) || isValidBudgetLimitValue(budget?.maxRepairLoops);
}

export function isUnderspecifiedStopCondition(condition: string): boolean {
  const normalized = normalizeStopCondition(condition);
  return UNDERSPECIFIED_STOP_CONDITION_VALUES.has(normalized);
}

export function isAmbiguousStopCondition(condition: string): boolean {
  const normalized = normalizeStopCondition(condition);

  return (
    normalized.length < 16 ||
    AMBIGUOUS_STOP_CONDITION_PATTERNS.some((pattern) => pattern.test(normalized))
  ) && !CONCRETE_STOP_CONDITION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function normalizeStopCondition(condition: string): string {
  return condition.toLowerCase().replace(/[^a-z0-9<>:=.]+/g, " ").replace(/\s+/g, " ").trim();
}

const UNDERSPECIFIED_STOP_CONDITION_VALUES = new Set([
  "n a",
  "na",
  "none",
  "not applicable",
  "tbd",
  "unknown"
]);

const AMBIGUOUS_STOP_CONDITION_PATTERNS: readonly RegExp[] = [
  /\b(?:anything|everything|whatever)\b/,
  /\b(?:as needed|as necessary|when appropriate)\b/,
  /\b(?:done|finished|complete|good|ready|works?)\b/,
  /\b(?:feels?|looks?)\b.*\b(?:done|good|ready|right)\b/,
  /\b(?:until|when)\b.*\b(?:done|finished|complete|good|ready|works?)\b/
];

const CONCRETE_STOP_CONDITION_PATTERNS: readonly RegExp[] = [
  /\b(?:timeout|deadline|timebox|minutes?|seconds?|ms)\b/,
  /\b(?:budget|spend|tokens?|cost)\b/,
  /\b(?:repair loops?|attempts?|retries?)\b/,
  /\b(?:policy|safety|security|scope|authority)\b/,
  /\b(?:block|blocked|fail|failed|failure|error|exception)\b/,
  /\b(?:human|operator|approval|manual|checkpoint|escalat(?:e|ion))\b/,
  /\b(?:test|tests|verification|review|gate)\b/,
  /\b(?:>=|<=|>|<|=|[0-9]+)\b/
];

export type StopConditionIssue = "missing" | "underspecified" | "ambiguous";

export type RepositoryScopeForAmbiguity = IntentDraftRepoScopeGrant | RepoScopeGrant;

export function repositoryScopeAmbiguityQuestion(index: number): ClarificationQuestionCandidate {
  return {
    category: "capability-envelope",
    fieldPath: `capabilityEnvelope.repoScopes.${index}` as IntentDraftFieldPath,
    prompt: `Which target repository, concrete paths, or scope boundary should repository scope ${index + 1} use?`,
    rationale: "The repository scope is present but too broad or generic to define a safe target boundary."
  };
}

function ambiguousRepositoryScopeFieldPaths(
  repoScopes: readonly RepositoryScopeForAmbiguity[]
): readonly string[] {
  return repoScopes.flatMap((scope, index) =>
    isAmbiguousRepositoryScope(scope) ? [`capabilityEnvelope.repoScopes.${index}`] : []
  );
}

export function isAmbiguousRepositoryScope(scope: RepositoryScopeForAmbiguity): boolean {
  const workspace = normalizeRepositoryScopePhrase(scope.workspace);
  const path = normalizeRepositoryScopeValue(scope.path);

  if (workspace === undefined || path === undefined) {
    return false;
  }

  return AMBIGUOUS_REPOSITORY_WORKSPACE_VALUES.has(workspace) || isAmbiguousRepositoryPath(path);
}

function isAmbiguousRepositoryPath(path: string): boolean {
  return (
    AMBIGUOUS_REPOSITORY_PATH_VALUES.has(path) ||
    AMBIGUOUS_REPOSITORY_PATH_PHRASES.has(normalizeRepositoryScopePhrase(path) ?? "")
  );
}

function normalizeRepositoryScopeValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeRepositoryScopePhrase(value: unknown): string | undefined {
  const normalized = normalizeRepositoryScopeValue(value)?.replace(/[^a-z0-9]+/g, " ").trim();
  return normalized !== undefined && normalized.length > 0 ? normalized : undefined;
}

const AMBIGUOUS_REPOSITORY_WORKSPACE_VALUES = new Set([
  "app",
  "application",
  "codebase",
  "current codebase",
  "current repo",
  "current repository",
  "current workspace",
  "project",
  "repo",
  "repository",
  "target",
  "this codebase",
  "this repo",
  "this repository",
  "this workspace",
  "workspace"
]);

const AMBIGUOUS_REPOSITORY_PATH_VALUES = new Set([
  "*",
  "**",
  "**/*",
  "/",
  "/*",
  "n/a",
  "na",
  "tbd",
  "unknown"
]);

const AMBIGUOUS_REPOSITORY_PATH_PHRASES = new Set([
  "all files",
  "anywhere",
  "codebase",
  "current repo",
  "current repository",
  "everything",
  "misc",
  "project",
  "repo",
  "repository",
  "somewhere",
  "this repo",
  "this repository",
  "various"
]);

export function scoreIntentClarity(
  intent: IntentAmbiguityScoringSubject,
  profile: IntentAmbiguityWeightingProfileInput
): readonly IntentAmbiguityDimensionScore[] {
  const weightingProfile = typeof profile === "string" ? getIntentAmbiguityWeightingProfile(profile) : profile;
  return weightingProfile.dimensions.map(({ dimension, weight }) =>
    scoreIntentAmbiguityDimension({
      intent,
      dimension,
      weight,
      weightingProfile
    })
  );
}

export function scoreIntentAmbiguityDimension(
  input: ScoreIntentAmbiguityDimensionInput
): IntentAmbiguityDimensionScore {
  const signal = scoreIntentAmbiguityDimensionSignal(input.intent, input.dimension);
  const ambiguityScore = roundScore(signal.score);
  const dimensionWeight = roundScore(input.weight ?? 1);

  return {
    dimension: input.dimension,
    weightingProfile: input.weightingProfile,
    score: ambiguityScore,
    clarity: roundScore(1 - ambiguityScore),
    weight: dimensionWeight,
    weightedScore: roundScore(ambiguityScore * dimensionWeight),
    structurallyMissing: ambiguityScore >= 1,
    rationale: signal.rationale,
    missingFields: uniqueOrdered(signal.missingFields),
    requiredClarifications: uniqueOrdered(signal.requiredClarifications)
  };
}

function scoreIntentAmbiguityDimensionSignal(
  intent: IntentAmbiguityScoringSubject,
  dimension: IntentClarityDimension
): IntentAmbiguityDimensionSignal {
  switch (dimension) {
    case "goal":
      return scoreGoalAmbiguity(intent);
    case "constraints":
      return scoreConstraintsAmbiguity(intent);
    case "successCriteria":
      return scoreSuccessCriteriaAmbiguity(intent);
    case "context":
      return scoreContextAmbiguity(intent);
  }
}

export function scoreGoalAmbiguity(intent: IntentAmbiguityScoringSubject): IntentAmbiguityDimensionSignal {
  const title = normalizeOptionalText(draftFieldValue(intent as IntentDraft, "title")) ?? "";
  const problem = normalizeOptionalText(draftFieldValue(intent as IntentDraft, "problem")) ?? "";
  const cosmeticTargetSignal = cosmeticTweakAmbiguityDetailSignal(intent, "target");
  const missingFields: string[] = [];
  const requiredClarifications: string[] = [];
  const componentScores: number[] = [];
  let structurallyMissing = false;

  if (title.length === 0) {
    missingFields.push("title");
    requiredClarifications.push("Provide a concrete title for the requested outcome.");
    componentScores.push(1);
    structurallyMissing = true;
  } else if (title.length < 12) {
    requiredClarifications.push("Clarify the title with the concrete change or outcome.");
    componentScores.push(0.45);
  } else {
    componentScores.push(0);
  }

  if (problem.length === 0) {
    missingFields.push("problem");
    requiredClarifications.push("Describe the problem and desired outcome.");
    componentScores.push(1);
    structurallyMissing = true;
  } else if (problem.length < 80) {
    requiredClarifications.push("Describe the problem, desired outcome, and why it matters in more detail.");
    componentScores.push(0.35);
  } else {
    componentScores.push(0);
  }

  if (cosmeticTargetSignal !== undefined && !cosmeticTargetSignal.satisfied) {
    missingFields.push(cosmeticTargetSignal.missingField);
    requiredClarifications.push(cosmeticTargetSignal.requiredClarification);
  }

  const score = structurallyMissing
    ? 1
    : Math.max(
        average(componentScores),
        cosmeticTargetSignal !== undefined && !cosmeticTargetSignal.satisfied
          ? cosmeticTargetSignal.scoreFloor
          : 0
      );

  return {
    score,
    rationale: "Goal ambiguity is estimated from title and problem specificity.",
    missingFields,
    requiredClarifications
  };
}

export function scoreConstraintsAmbiguity(intent: IntentAmbiguityScoringSubject): IntentAmbiguityDimensionSignal {
  const constraints = constraintsForScoring(intent);
  const repoScopes = repoScopesForScoring(intent);
  const ambiguousRepoScopeFields = ambiguousRepositoryScopeFieldPaths(repoScopes);
  const toolPermissions = toolPermissionsForScoring(intent);
  const hasBudget = hasBudgetLimit(intent.capabilityEnvelope?.budget);
  const authorityBoundaryIssue = classifyAuthorityBoundaryIssue(constraints);
  const stopConditionIssue = classifyStopConditionIssue(intent);
  const cosmeticScopeSignal = cosmeticTweakAmbiguityDetailSignal(intent, "scope");
  const suppressCosmeticScopeSignal = hasMalformedRepositoryScopeForCosmetic(repoScopes);
  const missingFields: string[] = [];
  const requiredClarifications: string[] = [];

  if (constraints.length === 0) {
    missingFields.push("constraints");
    requiredClarifications.push("List any explicit operator, product, or safety constraints.");
  } else if (authorityBoundaryIssue !== undefined) {
    missingFields.push("constraints");
    requiredClarifications.push(
      "Clarify what Protostar is authorized to decide, change, or execute for this factory action."
    );
  }
  if (repoScopes.length === 0) {
    missingFields.push("capabilityEnvelope.repoScopes");
    requiredClarifications.push("Name the repository paths and access levels the factory may use.");
  } else if (ambiguousRepoScopeFields.length > 0) {
    missingFields.push(...ambiguousRepoScopeFields);
    requiredClarifications.push(
      ...ambiguousRepoScopeFields.map((fieldPath) =>
        `Clarify the target repository, concrete paths, or scope boundary for ${fieldPath}.`
      )
    );
  }
  if (toolPermissions.length === 0) {
    missingFields.push("capabilityEnvelope.toolPermissions");
    requiredClarifications.push("Name the tools the factory may invoke and why they are needed.");
  }
  if (!hasBudget) {
    missingFields.push("capabilityEnvelope.budget");
    requiredClarifications.push("Set at least one budget limit such as timeout, tokens, spend, or repair loops.");
  }
  if (stopConditionIssue !== undefined) {
    missingFields.push("stopConditions");
    requiredClarifications.push(
      stopConditionIssue === "missing"
        ? "Define deterministic stop conditions such as timeout, repair cap, policy escalation, or human checkpoint."
        : "Clarify the deterministic event, threshold, or operator checkpoint that should stop this factory run."
    );
  }
  const structurallyMissing =
    constraints.length === 0 &&
    repoScopes.length === 0 &&
    toolPermissions.length === 0 &&
    !hasBudget &&
    stopConditionIssue === "missing";
  const componentScore = average([
    constraints.length > 0 ? 0 : 0.55,
    repoScopes.length > 0 ? (ambiguousRepoScopeFields.length > 0 ? 0.75 : 0) : 0.55,
    toolPermissions.length > 0 ? 0 : 0.55,
    hasBudget && stopConditionIssue === undefined ? 0 : 0.5
  ]);
  const score = structurallyMissing
    ? 1
    : ambiguousRepoScopeFields.length > 0
      ? Math.max(componentScore, 0.75)
      : authorityBoundaryIssue !== undefined && constraints.length > 0
        ? Math.max(componentScore, authorityBoundaryScoreFloor(authorityBoundaryIssue))
        : stopConditionIssue !== undefined
          ? Math.max(componentScore, stopConditionScoreFloor(stopConditionIssue))
          : componentScore;
  if (
    !structurallyMissing &&
    !suppressCosmeticScopeSignal &&
    cosmeticScopeSignal !== undefined &&
    !cosmeticScopeSignal.satisfied
  ) {
    missingFields.push(cosmeticScopeSignal.missingField);
    requiredClarifications.push(cosmeticScopeSignal.requiredClarification);
  }
  const cosmeticScore = !suppressCosmeticScopeSignal &&
    cosmeticScopeSignal !== undefined &&
    !cosmeticScopeSignal.satisfied
    ? Math.max(score, cosmeticScopeSignal.scoreFloor)
    : score;

  return {
    score: cosmeticScore,
    rationale: "Constraint ambiguity is estimated from explicit constraints, repo scope, tools, budget, and stop conditions.",
    missingFields,
    requiredClarifications
  };
}

function authorityBoundaryScoreFloor(issue: AuthorityBoundaryIssue): number {
  return issue === "missing" ? 1 : 0.85;
}

function stopConditionScoreFloor(issue: StopConditionIssue): number {
  return issue === "missing" ? 0.5 : 0.85;
}

export function scoreSuccessCriteriaAmbiguity(intent: IntentAmbiguityScoringSubject): IntentAmbiguityDimensionSignal {
  const criteria = acceptanceCriteriaForScoring(intent);
  const cosmeticSuccessEvidenceSignal = cosmeticTweakAmbiguityDetailSignal(intent, "success-evidence");
  const suppressCosmeticSuccessEvidenceSignal = hasAcceptanceCriterionAdmissionIssue(criteria);
  const missingFields: string[] = [];
  const requiredClarifications: string[] = [];

  if (criteria.length === 0) {
    missingFields.push("acceptanceCriteria");
    requiredClarifications.push("Add at least one measurable acceptance criterion.");
    return {
      score: 1,
      rationale: "Success-criteria ambiguity is estimated from AC presence, specificity, and verification mode.",
      missingFields,
      requiredClarifications
    };
  }

  const componentScores = criteria.flatMap((criterion, index) => {
    const scores: number[] = [];
    const statementPath = `acceptanceCriteria.${index}.statement`;
    const verificationPath = `acceptanceCriteria.${index}.verification`;
    const statement = scorableCriterionStatement(criterion);
    const verification = scorableCriterionVerification(criterion);

    if (statement === undefined) {
      missingFields.push(statementPath);
      requiredClarifications.push(`Write measurable text for ${statementPath}.`);
      scores.push(1);
    } else if (statement.length < 24) {
      requiredClarifications.push(`Make ${statementPath} specific enough to verify.`);
      scores.push(0.45);
    } else {
      scores.push(0);
    }

    if (!isAdmissionVerification(verification)) {
      missingFields.push(verificationPath);
      requiredClarifications.push(`Choose test, evidence, or manual verification for ${verificationPath}.`);
      scores.push(1);
    } else if (verification === "manual" && !hasNonEmptyText(scorableCriterionJustification(criterion))) {
      requiredClarifications.push(`Explain why manual verification is necessary for ${criterionLabel(criterion, index)}.`);
      scores.push(0.35);
    } else {
      scores.push(0);
    }

    return scores;
  });
  if (
    !suppressCosmeticSuccessEvidenceSignal &&
    cosmeticSuccessEvidenceSignal !== undefined &&
    !cosmeticSuccessEvidenceSignal.satisfied
  ) {
    missingFields.push(cosmeticSuccessEvidenceSignal.missingField);
    requiredClarifications.push(cosmeticSuccessEvidenceSignal.requiredClarification);
  }
  const structurallyMissing = missingFields.some(
    (fieldPath) => /^acceptanceCriteria\.\d+\.(?:statement|verification)$/.test(fieldPath)
  );
  const score = structurallyMissing
    ? 1
    : Math.max(
        average(componentScores),
        !suppressCosmeticSuccessEvidenceSignal &&
          cosmeticSuccessEvidenceSignal !== undefined &&
          !cosmeticSuccessEvidenceSignal.satisfied
          ? cosmeticSuccessEvidenceSignal.scoreFloor
          : 0
      );

  return {
    score,
    rationale: "Success-criteria ambiguity is estimated from AC specificity and non-manual verification signals.",
    missingFields,
    requiredClarifications
  };
}

export function scoreContextAmbiguity(intent: IntentAmbiguityScoringSubject): IntentAmbiguityDimensionSignal {
  const repoScopes = repoScopesForScoring(intent);
  const ambiguousRepoScopeFields = ambiguousRepositoryScopeFieldPaths(repoScopes);
  const missingFields: string[] = [];
  const requiredClarifications: string[] = [];
  const draftContextMissing = isDraftScoringSubject(intent) && !hasNonEmptyText(intent.context);

  if (draftContextMissing) {
    missingFields.push("context");
    requiredClarifications.push("Describe the brownfield repository or product context for the requested change.");
  }

  if (repoScopes.length === 0) {
    missingFields.push("capabilityEnvelope.repoScopes");
    requiredClarifications.push("Identify the brownfield workspace and path context for the requested change.");
  } else if (ambiguousRepoScopeFields.length > 0) {
    missingFields.push(...ambiguousRepoScopeFields);
    requiredClarifications.push(
      ...ambiguousRepoScopeFields.map((fieldPath) =>
        `Clarify the target repository, concrete paths, or scope boundary for ${fieldPath}.`
      )
    );
  }

  return {
    score: draftContextMissing || repoScopes.length === 0 ? 1 : ambiguousRepoScopeFields.length > 0 ? 0.75 : 0,
    rationale: "Context ambiguity is estimated from brownfield context and whether the intent names a repo scope.",
    missingFields,
    requiredClarifications
  };
}

const COSMETIC_TWEAK_AMBIGUITY_SCORE_FLOOR = 0.85;

const COSMETIC_TWEAK_DETAIL_METADATA = {
  target: {
    dimension: "goal",
    fieldPath: "problem",
    missingField: "problem",
    requiredClarification:
      "Name the cosmetic target surface, component, copy, style token, or repository path that should change."
  },
  scope: {
    dimension: "constraints",
    fieldPath: "constraints",
    missingField: "constraints",
    requiredClarification:
      "State the bounded cosmetic scope, including the repository path or product surface in bounds and what behavior must remain unchanged."
  },
  "success-evidence": {
    dimension: "successCriteria",
    fieldPath: "acceptanceCriteria",
    missingField: "acceptanceCriteria",
    requiredClarification:
      "Add test or evidence acceptance criteria that prove the cosmetic tweak landed and non-cosmetic behavior stayed unchanged."
  }
} as const satisfies Readonly<
  Record<
    CosmeticTweakAmbiguityDetailId,
    {
      readonly dimension: IntentClarityDimension;
      readonly fieldPath: IntentDraftFieldPath;
      readonly missingField: string;
      readonly requiredClarification: string;
    }
  >
>;

export function assessCosmeticTweakAmbiguityDetails(
  intent: IntentAmbiguityScoringSubject
): CosmeticTweakAmbiguityDetailAssessment {
  if (!isCosmeticTweakScoringSubject(intent)) {
    return {
      applies: false,
      details: [],
      missingDetails: []
    };
  }

  const details = (Object.keys(COSMETIC_TWEAK_DETAIL_METADATA) as CosmeticTweakAmbiguityDetailId[]).map(
    (detail): CosmeticTweakAmbiguityDetailSignal => {
      const metadata = COSMETIC_TWEAK_DETAIL_METADATA[detail];

      return {
        detail,
        dimension: metadata.dimension,
        satisfied: isCosmeticTweakDetailSatisfied(intent, detail),
        scoreFloor: COSMETIC_TWEAK_AMBIGUITY_SCORE_FLOOR,
        fieldPath: metadata.fieldPath,
        missingField: metadata.missingField,
        requiredClarification: metadata.requiredClarification
      };
    }
  );

  return {
    applies: true,
    details,
    missingDetails: details.filter((detail) => !detail.satisfied).map((detail) => detail.detail)
  };
}

function cosmeticTweakAmbiguityDetailSignal(
  intent: IntentAmbiguityScoringSubject,
  detail: CosmeticTweakAmbiguityDetailId
): CosmeticTweakAmbiguityDetailSignal | undefined {
  return assessCosmeticTweakAmbiguityDetails(intent).details.find((signal) => signal.detail === detail);
}

function isCosmeticTweakDetailSatisfied(
  intent: IntentAmbiguityScoringSubject,
  detail: CosmeticTweakAmbiguityDetailId
): boolean {
  switch (detail) {
    case "target":
      return hasCosmeticTweakTargetDetail(intent);
    case "scope":
      return hasCosmeticTweakScopeDetail(intent);
    case "success-evidence":
      return hasCosmeticTweakSuccessEvidenceDetail(intent);
  }
}

function isCosmeticTweakScoringSubject(intent: IntentAmbiguityScoringSubject): boolean {
  return normalizeOptionalText((intent as IntentDraft).goalArchetype)?.toLowerCase() === "cosmetic-tweak";
}

function hasCosmeticTweakTargetDetail(intent: IntentAmbiguityScoringSubject): boolean {
  return COSMETIC_TWEAK_TARGET_PATTERNS.some((pattern) => pattern.test(cosmeticTweakTargetText(intent)));
}

function hasCosmeticTweakScopeDetail(intent: IntentAmbiguityScoringSubject): boolean {
  return (hasBoundedCosmeticRepositoryScope(repoScopesForScoring(intent)) || hasCosmeticAuthorityJustification(intent)) &&
    COSMETIC_TWEAK_SCOPE_PATTERNS.some((pattern) => pattern.test(cosmeticTweakText(intent)));
}

function hasCosmeticTweakSuccessEvidenceDetail(intent: IntentAmbiguityScoringSubject): boolean {
  return acceptanceCriteriaForScoring(intent).some((criterion) => {
    const verification = scorableCriterionVerification(criterion);
    const statement = scorableCriterionStatement(criterion);

    if ((verification !== "test" && verification !== "evidence") || statement === undefined) {
      return false;
    }

    return COSMETIC_TWEAK_SUCCESS_EVIDENCE_PATTERNS.some((pattern) => pattern.test(statement));
  });
}

function cosmeticTweakText(intent: IntentAmbiguityScoringSubject): string {
  return [
    draftFieldValue(intent as IntentDraft, "title"),
    draftFieldValue(intent as IntentDraft, "problem"),
    draftFieldValue(intent as IntentDraft, "context"),
    ...constraintsForScoring(intent),
    ...acceptanceCriteriaForScoring(intent).map((criterion) => scorableCriterionStatement(criterion)),
    ...repoScopesForScoring(intent).flatMap((scope) => [scope.workspace, scope.path])
  ].flatMap((value) => {
    const normalized = normalizeOptionalText(value);
    return normalized === undefined ? [] : [normalized];
  }).join(" ");
}

function cosmeticTweakTargetText(intent: IntentAmbiguityScoringSubject): string {
  return [
    draftFieldValue(intent as IntentDraft, "title"),
    draftFieldValue(intent as IntentDraft, "problem"),
    draftFieldValue(intent as IntentDraft, "context"),
    ...acceptanceCriteriaForScoring(intent).map((criterion) => scorableCriterionStatement(criterion))
  ].flatMap((value) => {
    const normalized = normalizeOptionalText(value);
    return normalized === undefined ? [] : [normalized];
  }).join(" ");
}

function hasBoundedCosmeticRepositoryScope(
  repoScopes: readonly (IntentDraftRepoScopeGrant | RepoScopeGrant)[]
): boolean {
  return repoScopes.some((scope) => {
    const path = normalizeRepositoryScopeValue(scope.path);

    return path !== undefined &&
      !isAmbiguousRepositoryPath(path) &&
      path !== "." &&
      path !== "./" &&
      !path.includes("*");
  });
}

function hasMalformedRepositoryScopeForCosmetic(
  repoScopes: readonly (IntentDraftRepoScopeGrant | RepoScopeGrant)[]
): boolean {
  return repoScopes.some((scope) =>
    normalizeRepositoryScopeValue(scope.workspace) === undefined ||
    normalizeRepositoryScopeValue(scope.path) === undefined ||
    !isRepoAccess(scope.access)
  );
}

function hasCosmeticAuthorityJustification(intent: IntentAmbiguityScoringSubject): boolean {
  const envelope = intent.capabilityEnvelope;
  const record: Record<string, unknown> | undefined = isRecord(envelope) ? envelope : undefined;

  return record !== undefined &&
    (hasNonEmptyText(record["authorityJustification"]) || hasNonEmptyText(record["authority_justification"]));
}

function hasAcceptanceCriterionAdmissionIssue(criteria: readonly ScorableAcceptanceCriterion[]): boolean {
  return criteria.some((criterion) => {
    const verification = analyzeAcceptanceCriterionVerificationMode(criterion).mode;

    return analyzeAcceptanceCriterionVerificationMode(criterion).issues.length > 0 ||
      (
        verification === "manual" &&
        validateManualAcceptanceCriterionJustification(
          typeof criterion === "string" ? undefined : criterion.justification
        ).manualUnjustified
      );
  });
}

const COSMETIC_TWEAK_TARGET_PATTERNS: readonly RegExp[] = [
  /\b(?:front door|intent package|factory cli|settings surface)\b/i,
  /\b(?:settings|profile|dashboard|checkout|login|signup|admin|operator|factory|intent|admission|review|execution|planning)\s+(?:page|screen|view|surface|component|panel|modal|dialog|form|button|field|label|tooltip|copy|wording|text|message|heading|style|theme|color|spacing|icon|layout)\b/i,
  /\b[a-z0-9][a-z0-9_-]*(?:\s+[a-z0-9][a-z0-9_-]*){0,3}\s+(?:page|screen|view|surface|component|panel|modal|dialog|form|button|field|label|tooltip|heading|style|theme|color|spacing|icon|layout)\b/i,
  /\b(?:copy|wording|label|tooltip|microcopy|style|theme|color|spacing|icon|layout)\b.*\b(?:page|screen|view|surface|component|panel|button|field)\b/i
];

const COSMETIC_TWEAK_SCOPE_PATTERNS: readonly RegExp[] = [
  /\b(?:bounded|limited|scope|scoped|only|inside|outside|focus|focused)\b/i,
  /\b(?:do not|don't|must not|should not|cannot|can't|without changing|leave\b.*\bunchanged|behavior unchanged|no behavior changes?)\b/i,
  /\b(?:packages|apps|examples|docs|src)\/[a-z0-9._/-]+\b/i
];

const COSMETIC_TWEAK_SUCCESS_EVIDENCE_PATTERNS: readonly RegExp[] = [
  /\b(?:test|tests|passes?|asserts?|verifies?|evidence|snapshot|screenshot|fixture|artifact|report|reports|stdout|stderr)\b/i,
  /\b(?:copy|wording|label|tooltip|microcopy|text|style|theme|color|spacing|icon|layout|visual|render(?:ed|s)?)\b/i,
  /\b(?:unchanged|without changing|behavior|approved|expected|operator-facing|operator-visible|deterministic|stable)\b/i,
  /\b(?:returns?|emits?|produces?|writes?|updates?|contains?|matches?|shows?|displays?)\b/i
];

type ScorableAcceptanceCriterion = string | IntentDraftAcceptanceCriterion | AcceptanceCriterion;

export function constraintsForScoring(intent: IntentAmbiguityScoringSubject): readonly string[] {
  return Array.isArray(intent.constraints) ? intent.constraints.filter(hasNonEmptyText) : [];
}

export function classifyAuthorityBoundaryIssue(
  constraints: readonly string[]
): AuthorityBoundaryIssue | undefined {
  if (constraints.length === 0) {
    return "missing";
  }

  if (constraints.some(isAmbiguousAuthorityBoundaryConstraint)) {
    return "ambiguous";
  }

  if (constraints.some(isConcreteAuthorityBoundaryConstraint)) {
    return undefined;
  }

  return "underspecified";
}

function isConcreteAuthorityBoundaryConstraint(constraint: string): boolean {
  const normalized = normalizeAuthorityBoundaryConstraint(constraint);

  return (
    CONCRETE_AUTHORITY_BOUNDARY_PATTERNS.some((pattern) => pattern.test(normalized)) &&
    !AMBIGUOUS_AUTHORITY_BOUNDARY_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

function isAmbiguousAuthorityBoundaryConstraint(constraint: string): boolean {
  const normalized = normalizeAuthorityBoundaryConstraint(constraint);
  return AMBIGUOUS_AUTHORITY_BOUNDARY_PATTERNS.some((pattern) => pattern.test(normalized));
}

function normalizeAuthorityBoundaryConstraint(constraint: string): string {
  return constraint.toLowerCase().replace(/\s+/g, " ").trim();
}

const CONCRETE_AUTHORITY_BOUNDARY_PATTERNS: readonly RegExp[] = [
  /\bauthori(?:ty|zed|ses?|zes?)\b/,
  /\b(?:boundary|boundaries|bounded|focus|focused|scope|scoped|limited|inside|outside|only)\b/,
  /\b(?:do not|don't|must not|should not|cannot|can't|no live|no changes?|without changing)\b/,
  /\b(?:decide|change|execute|edit|write|read|run|invoke|touch|modify|preserve)\b/,
  /\b(?:packages|apps|examples|docs|src)\//,
  /\b(?:operator|human|protostar|factory|dogpile)\b/
];

const AMBIGUOUS_AUTHORITY_BOUNDARY_PATTERNS: readonly RegExp[] = [
  /\b(?:anything|everything|whatever|wherever)\b/,
  /\b(?:as needed|as necessary|do what(?:ever)? it takes|do whatever|full autonomy)\b/,
  /\b(?:handle it|handle everything|use judgment|you decide|decide for me|all decisions)\b/
];

function repoScopesForScoring(
  intent: IntentAmbiguityScoringSubject
): readonly (IntentDraftRepoScopeGrant | RepoScopeGrant)[] {
  const envelope = intent.capabilityEnvelope;
  if (!isRecord(envelope)) {
    return [];
  }

  const repoScopes = envelope["repoScopes"];
  return Array.isArray(repoScopes)
    ? (repoScopes.filter(isRecord) as readonly (IntentDraftRepoScopeGrant | RepoScopeGrant)[])
    : [];
}

function isDraftScoringSubject(intent: IntentAmbiguityScoringSubject): intent is IntentDraft {
  return !("id" in intent);
}

function toolPermissionsForScoring(
  intent: IntentAmbiguityScoringSubject
): readonly (IntentDraftToolPermissionGrant | ToolPermissionGrant)[] {
  const envelope = intent.capabilityEnvelope;
  if (!isRecord(envelope)) {
    return [];
  }

  const toolPermissions = envelope["toolPermissions"];
  return Array.isArray(toolPermissions)
    ? (toolPermissions.filter(isRecord) as readonly (IntentDraftToolPermissionGrant | ToolPermissionGrant)[])
    : [];
}

function acceptanceCriteriaForScoring(
  intent: IntentAmbiguityScoringSubject
): readonly ScorableAcceptanceCriterion[] {
  return Array.isArray(intent.acceptanceCriteria)
    ? (intent.acceptanceCriteria.filter((criterion) => typeof criterion === "string" || isRecord(criterion)) as
        readonly ScorableAcceptanceCriterion[])
    : [];
}

function scorableCriterionStatement(criterion: ScorableAcceptanceCriterion): string | undefined {
  if (typeof criterion === "string") {
    return criterion.trim().length > 0 ? criterion.trim() : undefined;
  }

  const statement = typeof criterion.statement === "string" ? criterion.statement.trim() : undefined;
  if (statement !== undefined && statement.length > 0) {
    return statement;
  }

  const text = "text" in criterion && typeof criterion.text === "string" ? criterion.text.trim() : undefined;
  return text !== undefined && text.length > 0 ? text : undefined;
}

function scorableCriterionVerification(criterion: ScorableAcceptanceCriterion): unknown {
  return analyzeAcceptanceCriterionVerificationMode(criterion).mode;
}

function scorableCriterionJustification(criterion: ScorableAcceptanceCriterion): string | undefined {
  return validateManualAcceptanceCriterionJustification(
    typeof criterion === "string" ? undefined : criterion.justification
  ).normalizedJustification;
}

function criterionLabel(criterion: ScorableAcceptanceCriterion, index: number): string {
  if (typeof criterion === "string" || !("id" in criterion)) {
    return `acceptanceCriteria.${index}`;
  }
  return criterion.id;
}

function isAdmissionVerification(value: unknown): value is AcceptanceCriterionVerificationMode {
  return value === "test" || value === "evidence" || value === "manual";
}
