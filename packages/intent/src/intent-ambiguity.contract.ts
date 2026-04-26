import { INTENT_AMBIGUITY_WEIGHTING_PROFILES } from "./index.js";
import type {
  IntentAmbiguityAssessment,
  IntentAmbiguityDimensionId,
  IntentAmbiguityDimensionScore,
  IntentAmbiguityWeightingProfile,
  IntentAmbiguityWeightingProfileId,
  IntentClarityDimension,
  IntentClarityScore
} from "./index.js";

type Assert<T extends true> = T;

type IfEquals<X, Y, Then = true, Else = false> = (<T>() => T extends X ? 1 : 2) extends <
  T
>() => T extends Y ? 1 : 2
  ? Then
  : Else;

type KeysEqual<T, Expected extends PropertyKey> = IfEquals<keyof T, Expected>;

export type IntentAmbiguityAssessmentShapeContract = Assert<
  KeysEqual<
    IntentAmbiguityAssessment,
    | "mode"
    | "weightingProfile"
    | "threshold"
    | "ambiguity"
    | "accepted"
    | "dimensionScores"
    | "scores"
    | "missingFields"
    | "requiredClarifications"
    | "structurallyMissingDimensions"
  >
>;

export type IntentAmbiguityDimensionScoreShapeContract = Assert<
  KeysEqual<
    IntentAmbiguityDimensionScore,
    | "dimension"
    | "weightingProfile"
    | "score"
    | "clarity"
    | "weight"
    | "weightedScore"
    | "structurallyMissing"
    | "rationale"
    | "missingFields"
    | "requiredClarifications"
  >
>;

export type IntentAmbiguityDimensionScoreRequiredCoreContract = Assert<
  IfEquals<
    Pick<IntentAmbiguityDimensionScore, "dimension" | "score" | "rationale">,
    {
      readonly dimension: IntentAmbiguityDimensionId;
      readonly score: number;
      readonly rationale: string;
    }
  >
>;

export type IntentClarityScoreAliasContract = Assert<IfEquals<IntentClarityScore, IntentAmbiguityDimensionScore>>;

export type IntentClarityDimensionContract = Assert<
  IfEquals<IntentClarityDimension, "goal" | "constraints" | "successCriteria" | "context">
>;

export type IntentAmbiguityWeightingProfileIdContract = Assert<
  IfEquals<IntentAmbiguityWeightingProfileId, "greenfield-v1" | "brownfield-v1">
>;

export type IntentAmbiguityWeightingProfileShapeContract = Assert<
  KeysEqual<
    IntentAmbiguityWeightingProfile,
    "id" | "mode" | "version" | "label" | "dimensions" | "totalWeight" | "structurallyMissingAutoFail"
  >
>;

function ambiguityAssessmentFixture(
  assessment: Omit<IntentAmbiguityAssessment, "dimensionScores" | "scores"> & {
    readonly scores: readonly Omit<IntentAmbiguityDimensionScore, "weightingProfile">[];
  }
): IntentAmbiguityAssessment {
  const scores = assessment.scores.map((score) => ({
    ...score,
    weightingProfile: assessment.weightingProfile
  }));

  return {
    ...assessment,
    scores,
    dimensionScores: scores
  };
}

export const acceptedBrownfieldAmbiguityAssessmentFixture = ambiguityAssessmentFixture({
  mode: "brownfield",
  weightingProfile: INTENT_AMBIGUITY_WEIGHTING_PROFILES.brownfield,
  threshold: 0.2,
  ambiguity: 0,
  accepted: true,
  scores: [
    {
      dimension: "goal",
      score: 0,
      clarity: 1,
      weight: 0.35,
      weightedScore: 0,
      structurallyMissing: false,
      rationale: "Goal ambiguity is estimated from title and problem specificity.",
      missingFields: [],
      requiredClarifications: []
    },
    {
      dimension: "constraints",
      score: 0,
      clarity: 1,
      weight: 0.25,
      weightedScore: 0,
      structurallyMissing: false,
      rationale: "Constraint ambiguity is estimated from explicit constraints, repo scope, tools, budget, and stop conditions.",
      missingFields: [],
      requiredClarifications: []
    },
    {
      dimension: "successCriteria",
      score: 0,
      clarity: 1,
      weight: 0.25,
      weightedScore: 0,
      structurallyMissing: false,
      rationale: "Success-criteria ambiguity is estimated from AC specificity and non-manual verification signals.",
      missingFields: [],
      requiredClarifications: []
    },
    {
      dimension: "context",
      score: 0,
      clarity: 1,
      weight: 0.15,
      weightedScore: 0,
      structurallyMissing: false,
      rationale: "Context ambiguity is estimated from brownfield context and whether the intent names a repo scope.",
      missingFields: [],
      requiredClarifications: []
    }
  ],
  missingFields: [],
  requiredClarifications: [],
  structurallyMissingDimensions: []
});

export const acceptedGreenfieldAmbiguityAssessmentFixture = ambiguityAssessmentFixture({
  mode: "greenfield",
  weightingProfile: INTENT_AMBIGUITY_WEIGHTING_PROFILES.greenfield,
  threshold: 0.2,
  ambiguity: 0,
  accepted: true,
  scores: [
    {
      dimension: "goal",
      score: 0,
      clarity: 1,
      weight: 0.4,
      weightedScore: 0,
      structurallyMissing: false,
      rationale: "Goal ambiguity is estimated from title and problem specificity.",
      missingFields: [],
      requiredClarifications: []
    },
    {
      dimension: "constraints",
      score: 0,
      clarity: 1,
      weight: 0.3,
      weightedScore: 0,
      structurallyMissing: false,
      rationale: "Constraint ambiguity is estimated from explicit constraints, repo scope, tools, budget, and stop conditions.",
      missingFields: [],
      requiredClarifications: []
    },
    {
      dimension: "successCriteria",
      score: 0,
      clarity: 1,
      weight: 0.3,
      weightedScore: 0,
      structurallyMissing: false,
      rationale: "Success-criteria ambiguity is estimated from AC specificity and non-manual verification signals.",
      missingFields: [],
      requiredClarifications: []
    }
  ],
  missingFields: [],
  requiredClarifications: [],
  structurallyMissingDimensions: []
});

export const blockedBrownfieldAmbiguityAssessmentFixture = ambiguityAssessmentFixture({
  mode: "brownfield",
  weightingProfile: INTENT_AMBIGUITY_WEIGHTING_PROFILES.brownfield,
  threshold: 0.2,
  ambiguity: 0.4,
  accepted: false,
  scores: [
    {
      dimension: "goal",
      score: 0,
      clarity: 1,
      weight: 0.35,
      weightedScore: 0,
      structurallyMissing: false,
      rationale: "Goal ambiguity is estimated from title and problem specificity.",
      missingFields: [],
      requiredClarifications: []
    },
    {
      dimension: "constraints",
      score: 1,
      clarity: 0,
      weight: 0.25,
      weightedScore: 0.25,
      structurallyMissing: true,
      rationale: "Constraint ambiguity is estimated from explicit constraints, repo scope, tools, budget, and stop conditions.",
      missingFields: [
        "constraints",
        "capabilityEnvelope.repoScopes",
        "capabilityEnvelope.toolPermissions",
        "capabilityEnvelope.budget",
        "stopConditions"
      ],
      requiredClarifications: [
        "List any explicit operator, product, or safety constraints.",
        "Name the repository paths and access levels the factory may use.",
        "Name the tools the factory may invoke and why they are needed.",
        "Set at least one budget limit such as timeout, tokens, spend, or repair loops.",
        "Define deterministic stop conditions such as timeout, repair cap, policy escalation, or human checkpoint."
      ]
    },
    {
      dimension: "successCriteria",
      score: 0,
      clarity: 1,
      weight: 0.25,
      weightedScore: 0,
      structurallyMissing: false,
      rationale: "Success-criteria ambiguity is estimated from AC specificity and non-manual verification signals.",
      missingFields: [],
      requiredClarifications: []
    },
    {
      dimension: "context",
      score: 1,
      clarity: 0,
      weight: 0.15,
      weightedScore: 0.15,
      structurallyMissing: true,
      rationale: "Context ambiguity is estimated from brownfield context and whether the intent names a repo scope.",
      missingFields: ["capabilityEnvelope.repoScopes"],
      requiredClarifications: ["Identify the brownfield workspace and path context for the requested change."]
    }
  ],
  missingFields: [
    "constraints",
    "capabilityEnvelope.repoScopes",
    "capabilityEnvelope.toolPermissions",
    "capabilityEnvelope.budget",
    "stopConditions"
  ],
  requiredClarifications: [
    "List any explicit operator, product, or safety constraints.",
    "Name the repository paths and access levels the factory may use.",
    "Name the tools the factory may invoke and why they are needed.",
    "Set at least one budget limit such as timeout, tokens, spend, or repair loops.",
    "Define deterministic stop conditions such as timeout, repair cap, policy escalation, or human checkpoint.",
    "Identify the brownfield workspace and path context for the requested change."
  ],
  structurallyMissingDimensions: ["constraints", "context"]
});
