import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  INTENT_AMBIGUITY_DIMENSION_WEIGHTS,
  assessIntentAmbiguity,
  type IntentAmbiguityAssessment,
  type IntentAmbiguityDimensionScore
} from "./index.js";
import {
  clearGreenfieldAmbiguityAssessmentFixture,
  clearGreenfieldIntentDraftFixture,
  structurallyMissingGreenfieldAmbiguityAssessmentFixture,
  structurallyMissingGreenfieldIntentDraftFixture
} from "./greenfield-ambiguity.fixtures.js";

describe("greenfield ambiguity fixtures", () => {
  it("match the live scorer output shape for a clear greenfield draft", () => {
    const assessment = assessIntentAmbiguity(clearGreenfieldIntentDraftFixture, {
      mode: "greenfield"
    });

    assertAmbiguityAssessmentShape(assessment);
    assert.equal(assessment.dimensionScores, assessment.scores);
    assert.deepEqual(assessment, clearGreenfieldAmbiguityAssessmentFixture);
  });

  it("preserve greenfield dimension weights on accepted and blocked fixture outputs", () => {
    const accepted = assessIntentAmbiguity(clearGreenfieldIntentDraftFixture, {
      mode: "greenfield"
    });
    const blocked = assessIntentAmbiguity(structurallyMissingGreenfieldIntentDraftFixture, {
      mode: "greenfield",
      threshold: 1
    });
    const expectedWeights = [
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
    ];

    assert.deepEqual(INTENT_AMBIGUITY_DIMENSION_WEIGHTS.greenfield, expectedWeights);
    assert.deepEqual(accepted, clearGreenfieldAmbiguityAssessmentFixture);
    assert.deepEqual(blocked, structurallyMissingGreenfieldAmbiguityAssessmentFixture);

    for (const assessment of [accepted, blocked]) {
      assert.deepEqual(
        assessment.dimensionScores.map(({ dimension, weight }) => ({ dimension, weight })),
        expectedWeights
      );
      assert.equal(
        assessment.dimensionScores.reduce((total, score) => total + score.weight, 0),
        assessment.weightingProfile.totalWeight
      );
      assert.deepEqual(assessment.weightingProfile.dimensions, expectedWeights);
      assert.equal(assessment.weightingProfile.structurallyMissingAutoFail, true);
    }
  });
});

function assertAmbiguityAssessmentShape(assessment: IntentAmbiguityAssessment): void {
  assert.deepEqual(Object.keys(assessment), [
    "mode",
    "weightingProfile",
    "threshold",
    "ambiguity",
    "accepted",
    "dimensionScores",
    "scores",
    "missingFields",
    "requiredClarifications",
    "structurallyMissingDimensions"
  ]);
  assert.deepEqual(Object.keys(assessment.weightingProfile), [
    "id",
    "mode",
    "version",
    "label",
    "dimensions",
    "totalWeight",
    "structurallyMissingAutoFail"
  ]);

  for (const score of assessment.dimensionScores) {
    assertAmbiguityDimensionScoreShape(score);
  }
}

function assertAmbiguityDimensionScoreShape(score: IntentAmbiguityDimensionScore): void {
  assert.deepEqual(Object.keys(score), [
    "dimension",
    "weightingProfile",
    "score",
    "clarity",
    "weight",
    "weightedScore",
    "structurallyMissing",
    "rationale",
    "missingFields",
    "requiredClarifications"
  ]);
}
