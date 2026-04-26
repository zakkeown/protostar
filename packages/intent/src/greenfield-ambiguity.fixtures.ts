import {
  INTENT_AMBIGUITY_WEIGHTING_PROFILES,
  type IntentAmbiguityAssessment,
  type IntentAmbiguityDimensionScore,
  type IntentDraft
} from "./index.js";

type FixtureScore = Omit<IntentAmbiguityDimensionScore, "weightingProfile">;

function greenfieldAssessmentFixture(
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

export const clearGreenfieldIntentDraftFixture: IntentDraft = {
  draftId: "draft_greenfield_clear_ambiguity_fixture",
  title: "Scaffold deterministic intent admission checks",
  problem:
    "The factory front door needs deterministic ambiguity scoring before mutable greenfield drafts can be promoted into confirmed intents.",
  requester: "ouroboros-ac-20401",
  mode: "greenfield",
  goalArchetype: "cosmetic-tweak",
  acceptanceCriteria: [
    {
      statement: "The greenfield ambiguity scorer returns the canonical output shape and dimension weights.",
      verification: "test"
    }
  ],
  constraints: [
    "Keep implementation scoped to packages/intent and packages/policy admission surfaces."
  ],
  stopConditions: [
    "Stop if node:test verification fails or policy scope changes are requested."
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
        reason: "Exercise deterministic greenfield ambiguity fixtures.",
        risk: "low"
      }
    ],
    budget: {
      timeoutMs: 30_000
    }
  }
};

export const clearGreenfieldAmbiguityAssessmentFixture = greenfieldAssessmentFixture({
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

export const structurallyMissingGreenfieldIntentDraftFixture: IntentDraft = {
  draftId: "draft_greenfield_missing_capability_fixture",
  title: "Define deterministic intent admission",
  problem:
    "The factory front door needs deterministic greenfield ambiguity fixtures that show missing capability boundaries as hard admission blockers.",
  requester: "ouroboros-ac-20401",
  mode: "greenfield",
  goalArchetype: "cosmetic-tweak",
  acceptanceCriteria: [
    {
      statement: "The ambiguity gate reports a structural missing constraints dimension for incomplete greenfield drafts.",
      verification: "test"
    }
  ],
  capabilityEnvelope: {
    repoScopes: [],
    toolPermissions: [],
    budget: {}
  }
};

export const structurallyMissingGreenfieldAmbiguityAssessmentFixture = greenfieldAssessmentFixture({
  mode: "greenfield",
  weightingProfile: INTENT_AMBIGUITY_WEIGHTING_PROFILES.greenfield,
  threshold: 1,
  ambiguity: 0.3,
  accepted: false,
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
      score: 1,
      clarity: 0,
      weight: 0.3,
      weightedScore: 0.3,
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
      weight: 0.3,
      weightedScore: 0,
      structurallyMissing: false,
      rationale: "Success-criteria ambiguity is estimated from AC specificity and non-manual verification signals.",
      missingFields: [],
      requiredClarifications: []
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
    "Define deterministic stop conditions such as timeout, repair cap, policy escalation, or human checkpoint."
  ],
  structurallyMissingDimensions: ["constraints"]
});
