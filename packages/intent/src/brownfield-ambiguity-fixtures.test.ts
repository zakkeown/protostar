import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  INTENT_AMBIGUITY_DIMENSION_WEIGHTS,
  assessIntentAmbiguity,
  type IntentAmbiguityAssessment,
  type IntentAmbiguityDimensionScore
} from "./index.js";
import {
  clearBrownfieldAmbiguityAssessmentFixture,
  clearBrownfieldIntentDraftFixture,
  structurallyMissingBrownfieldAmbiguityAssessmentFixture,
  structurallyMissingBrownfieldIntentDraftFixture
} from "./brownfield-ambiguity.fixtures.js";

describe("brownfield ambiguity fixtures", () => {
  it("match the live scorer output shape for a clear brownfield draft", () => {
    const assessment = assessIntentAmbiguity(clearBrownfieldIntentDraftFixture, {
      mode: "brownfield"
    });

    assertAmbiguityAssessmentShape(assessment);
    assert.equal(assessment.dimensionScores, assessment.scores);
    assert.deepEqual(assessment, clearBrownfieldAmbiguityAssessmentFixture);
  });

  it("preserve brownfield dimension weights on accepted and blocked fixture outputs", () => {
    const accepted = assessIntentAmbiguity(clearBrownfieldIntentDraftFixture, {
      mode: "brownfield"
    });
    const blocked = assessIntentAmbiguity(structurallyMissingBrownfieldIntentDraftFixture, {
      mode: "brownfield"
    });
    const expectedWeights = [
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
    ];

    assert.deepEqual(INTENT_AMBIGUITY_DIMENSION_WEIGHTS.brownfield, expectedWeights);
    assert.deepEqual(accepted, clearBrownfieldAmbiguityAssessmentFixture);
    assert.deepEqual(blocked, structurallyMissingBrownfieldAmbiguityAssessmentFixture);

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

  it("keeps missing brownfield context as an auto-fail even below the aggregate threshold", () => {
    const blocked = assessIntentAmbiguity(structurallyMissingBrownfieldIntentDraftFixture, {
      mode: "brownfield"
    });

    assert.equal(blocked.ambiguity, 0.15);
    assert.equal(blocked.ambiguity <= blocked.threshold, true);
    assert.equal(blocked.accepted, false);
    assert.deepEqual(blocked.structurallyMissingDimensions, ["context"]);
    assert.deepEqual(blocked.missingFields, ["context"]);
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
