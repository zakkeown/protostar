import {
  INTENT_AMBIGUITY_WEIGHTING_PROFILES,
  type IntentAmbiguityAssessment,
  type IntentAmbiguityDimensionScore,
  type IntentDraft
} from "./index.js";

type FixtureScore = Omit<IntentAmbiguityDimensionScore, "weightingProfile">;

function brownfieldAssessmentFixture(
  assessment: Omit<IntentAmbiguityAssessment, "dimensionScores" | "scores"> & {
    readonly scores: readonly FixtureScore[];
  }
): IntentAmbiguityAssessment {
  const scores = assessment.scores.map((score) => ({
    ...score,
    weightingProfile: assessment.weightingProfile
  }));

  return {
    ...assessment,
    dimensionScores: scores,
    scores
  };
}

export const clearBrownfieldIntentDraftFixture: IntentDraft = {
  draftId: "draft_brownfield_clear_ambiguity_fixture",
  title: "Harden existing intent ambiguity fixtures",
  problem:
    "The Protostar intent package needs brownfield ambiguity fixtures that lock deterministic scorer output before drafts are admitted.",
  requester: "ouroboros-ac-20402",
  mode: "brownfield",
  goalArchetype: "cosmetic-tweak",
  context:
    "Protostar is an existing TypeScript workspace with an intent package that owns draft clarification and admission scoring.",
  acceptanceCriteria: [
    {
      statement: "The brownfield ambiguity scorer returns the canonical output shape and dimension weights.",
      verification: "test"
    }
  ],
  constraints: [
    "Keep the fixture scoped to packages/intent ambiguity scoring tests."
  ],
  stopConditions: [
    "Stop if node:test verification fails or brownfield weights drift."
  ],
  capabilityEnvelope: {
    repoScopes: [
      {
        workspace: "protostar",
        path: "packages/intent",
        access: "write"
      }
    ],
    toolPermissions: [
      {
        tool: "node:test",
        reason: "Exercise deterministic brownfield ambiguity fixtures.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000
    }
  }
};

export const clearBrownfieldAmbiguityAssessmentFixture = brownfieldAssessmentFixture({
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

export const structurallyMissingBrownfieldIntentDraftFixture: IntentDraft = {
  draftId: "draft_brownfield_missing_context_fixture",
  title: "Harden existing intent ambiguity fixtures",
  problem:
    "The Protostar intent package needs brownfield ambiguity fixtures that prove missing repository context is a hard admission blocker.",
  requester: "ouroboros-ac-20402",
  mode: "brownfield",
  goalArchetype: "cosmetic-tweak",
  acceptanceCriteria: [
    {
      statement: "The ambiguity gate reports missing brownfield context as a structural blocker.",
      verification: "test"
    }
  ],
  constraints: [
    "Keep the fixture scoped to packages/intent ambiguity scoring tests."
  ],
  stopConditions: [
    "Stop if node:test verification fails or brownfield weights drift."
  ],
  capabilityEnvelope: {
    repoScopes: [
      {
        workspace: "protostar",
        path: "packages/intent",
        access: "write"
      }
    ],
    toolPermissions: [
      {
        tool: "node:test",
        reason: "Exercise missing brownfield context ambiguity scoring.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000
    }
  }
};

export const structurallyMissingBrownfieldAmbiguityAssessmentFixture = brownfieldAssessmentFixture({
  mode: "brownfield",
  weightingProfile: INTENT_AMBIGUITY_WEIGHTING_PROFILES.brownfield,
  threshold: 0.2,
  ambiguity: 0.15,
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
      score: 1,
      clarity: 0,
      weight: 0.15,
      weightedScore: 0.15,
      structurallyMissing: true,
      rationale: "Context ambiguity is estimated from brownfield context and whether the intent names a repo scope.",
      missingFields: ["context"],
      requiredClarifications: ["Describe the brownfield repository or product context for the requested change."]
    }
  ],
  missingFields: ["context"],
  requiredClarifications: ["Describe the brownfield repository or product context for the requested change."],
  structurallyMissingDimensions: ["context"]
});
