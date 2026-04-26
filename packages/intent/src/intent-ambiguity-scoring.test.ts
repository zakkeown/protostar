import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  INTENT_AMBIGUITY_DIMENSION_WEIGHTS,
  INTENT_AMBIGUITY_WEIGHTING_PROFILES,
  assessCosmeticTweakAmbiguityDetails,
  getIntentAmbiguityWeightingProfile,
  assessIntentAmbiguity,
  scoreConstraintsAmbiguity,
  scoreIntentAmbiguityDimension,
  scoreIntentClarity,
  scoreSuccessCriteriaAmbiguity,
  type IntentDraft
} from "./index.js";

describe("intent ambiguity scoring", () => {
  it("defines stable greenfield and brownfield weighting profiles", () => {
    assert.deepEqual(Object.keys(INTENT_AMBIGUITY_WEIGHTING_PROFILES), ["greenfield", "brownfield"]);
    assert.deepEqual(getIntentAmbiguityWeightingProfile("greenfield"), {
      id: "greenfield-v1",
      mode: "greenfield",
      version: 1,
      label: "Greenfield intent ambiguity weighting profile",
      dimensions: INTENT_AMBIGUITY_DIMENSION_WEIGHTS.greenfield,
      totalWeight: 1,
      structurallyMissingAutoFail: true
    });
    assert.deepEqual(getIntentAmbiguityWeightingProfile("brownfield"), {
      id: "brownfield-v1",
      mode: "brownfield",
      version: 1,
      label: "Brownfield intent ambiguity weighting profile",
      dimensions: INTENT_AMBIGUITY_DIMENSION_WEIGHTS.brownfield,
      totalWeight: 1,
      structurallyMissingAutoFail: true
    });
  });

  it("preserves the canonical greenfield and brownfield dimension weights", () => {
    assert.deepEqual(INTENT_AMBIGUITY_DIMENSION_WEIGHTS.greenfield, [
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
    ]);
    assert.deepEqual(INTENT_AMBIGUITY_DIMENSION_WEIGHTS.brownfield, [
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
    ]);

    assert.deepEqual(
      scoreIntentClarity(clearDraft(), "brownfield").map(({ dimension, weight }) => ({ dimension, weight })),
      INTENT_AMBIGUITY_DIMENSION_WEIGHTS.brownfield
    );
    assert.deepEqual(
      scoreIntentClarity(clearDraft(), getIntentAmbiguityWeightingProfile("brownfield")),
      scoreIntentClarity(clearDraft(), "brownfield")
    );
  });

  it("uses the exposed weighting profile for both greenfield and brownfield scoring paths", () => {
    const cases = [
      {
        mode: "greenfield",
        draft: draftWithDistinctDimensionSignals()
      },
      {
        mode: "brownfield",
        draft: draftWithDistinctDimensionSignals()
      }
    ] as const;

    for (const testCase of cases) {
      const expectedProfile = getIntentAmbiguityWeightingProfile(testCase.mode);
      const directScores = scoreIntentClarity(testCase.draft, expectedProfile);
      const assessment = assessIntentAmbiguity(testCase.draft, {
        mode: testCase.mode,
        threshold: 1
      });

      assert.equal(assessment.mode, testCase.mode);
      assert.equal(assessment.weightingProfile, expectedProfile);
      assert.deepEqual(assessment.dimensionScores, directScores);
      assert.deepEqual(assessment.scores, directScores);
      assert.deepEqual(
        assessment.dimensionScores.map(({ dimension, weight }) => ({ dimension, weight })),
        expectedProfile.dimensions
      );

      for (const score of assessment.dimensionScores) {
        assert.equal(score.weightingProfile, assessment.weightingProfile);
      }
    }
  });

  it("exposes every per-dimension score and rationale on aggregate assessments", () => {
    const assessment = assessIntentAmbiguity(clearDraft(), {
      mode: "brownfield",
      threshold: 0.2
    });

    assert.equal(assessment.dimensionScores, assessment.scores);
    assert.equal(assessment.weightingProfile.id, "brownfield-v1");
    assert.deepEqual(
      assessment.dimensionScores.map(({ dimension, score, rationale }) => ({ dimension, score, rationale })),
      [
        {
          dimension: "goal",
          score: 0,
          rationale: "Goal ambiguity is estimated from title and problem specificity."
        },
        {
          dimension: "constraints",
          score: 0,
          rationale: "Constraint ambiguity is estimated from explicit constraints, repo scope, tools, budget, and stop conditions."
        },
        {
          dimension: "successCriteria",
          score: 0,
          rationale: "Success-criteria ambiguity is estimated from AC specificity and non-manual verification signals."
        },
        {
          dimension: "context",
          score: 0,
          rationale: "Context ambiguity is estimated from brownfield context and whether the intent names a repo scope."
        }
      ]
    );
  });

  it("scores cosmetic-tweak target, scope, and success-evidence details deterministically", () => {
    const clearAssessment = assessCosmeticTweakAmbiguityDetails(clearCosmeticTweakDraft());
    assert.equal(clearAssessment.applies, true);
    assert.deepEqual(
      clearAssessment.details.map(({ detail, dimension, satisfied, scoreFloor, fieldPath }) => ({
        detail,
        dimension,
        satisfied,
        scoreFloor,
        fieldPath
      })),
      [
        {
          detail: "target",
          dimension: "goal",
          satisfied: true,
          scoreFloor: 0.85,
          fieldPath: "problem"
        },
        {
          detail: "scope",
          dimension: "constraints",
          satisfied: true,
          scoreFloor: 0.85,
          fieldPath: "constraints"
        },
        {
          detail: "success-evidence",
          dimension: "successCriteria",
          satisfied: true,
          scoreFloor: 0.85,
          fieldPath: "acceptanceCriteria"
        }
      ]
    );
    assert.deepEqual(clearAssessment.missingDetails, []);

    const missingTarget = assessIntentAmbiguity(cosmeticTweakDraftMissingTarget(), {
      mode: "brownfield",
      threshold: 0.2
    });
    const missingScope = assessIntentAmbiguity(cosmeticTweakDraftMissingScope(), {
      mode: "brownfield",
      threshold: 0.2
    });
    const missingSuccessEvidence = assessIntentAmbiguity(cosmeticTweakDraftMissingSuccessEvidence(), {
      mode: "brownfield",
      threshold: 0.2
    });
    const missingAll = assessCosmeticTweakAmbiguityDetails(cosmeticTweakDraftMissingAllCosmeticDetails());
    const repeatedMissingAll = assessCosmeticTweakAmbiguityDetails(cosmeticTweakDraftMissingAllCosmeticDetails());

    assert.equal(missingTarget.dimensionScores.find((score) => score.dimension === "goal")?.score, 0.85);
    assert.equal(missingTarget.ambiguity, 0.298);
    assert.equal(missingTarget.accepted, false);
    assert.deepEqual(missingTarget.missingFields, ["problem"]);
    assert.match(missingTarget.requiredClarifications.join(" "), /cosmetic target surface/);

    assert.equal(missingScope.dimensionScores.find((score) => score.dimension === "constraints")?.score, 0.85);
    assert.equal(missingScope.ambiguity, 0.213);
    assert.equal(missingScope.accepted, false);
    assert.deepEqual(missingScope.missingFields, ["constraints"]);
    assert.match(missingScope.requiredClarifications.join(" "), /bounded cosmetic scope/);

    assert.equal(
      missingSuccessEvidence.dimensionScores.find((score) => score.dimension === "successCriteria")?.score,
      0.85
    );
    assert.equal(missingSuccessEvidence.ambiguity, 0.213);
    assert.equal(missingSuccessEvidence.accepted, false);
    assert.deepEqual(missingSuccessEvidence.missingFields, ["acceptanceCriteria"]);
    assert.match(missingSuccessEvidence.requiredClarifications.join(" "), /test or evidence acceptance criteria/);

    assert.deepEqual(missingAll, repeatedMissingAll);
    assert.deepEqual(missingAll.missingDetails, ["target", "scope", "success-evidence"]);
  });

  it("scores each supported dimension independently and includes each result in the aggregate", () => {
    const draft = draftWithDistinctDimensionSignals();
    const weightingProfile = getIntentAmbiguityWeightingProfile("brownfield");
    const expectedDimensionScores = [
      scoreIntentAmbiguityDimension({
        intent: draft,
        dimension: "goal",
        weight: 0.35,
        weightingProfile
      }),
      scoreIntentAmbiguityDimension({
        intent: draft,
        dimension: "constraints",
        weight: 0.25,
        weightingProfile
      }),
      scoreIntentAmbiguityDimension({
        intent: draft,
        dimension: "successCriteria",
        weight: 0.25,
        weightingProfile
      }),
      scoreIntentAmbiguityDimension({
        intent: draft,
        dimension: "context",
        weight: 0.15,
        weightingProfile
      })
    ];

    assert.deepEqual(
      expectedDimensionScores.map(({ dimension, score, rationale, missingFields, requiredClarifications }) => ({
        dimension,
        score,
        rationale,
        missingFields,
        requiredClarifications
      })),
      [
        {
          dimension: "goal",
          score: 0.225,
          rationale: "Goal ambiguity is estimated from title and problem specificity.",
          missingFields: [],
          requiredClarifications: ["Clarify the title with the concrete change or outcome."]
        },
        {
          dimension: "constraints",
          score: 0.5,
          rationale: "Constraint ambiguity is estimated from explicit constraints, repo scope, tools, budget, and stop conditions.",
          missingFields: ["capabilityEnvelope.budget", "stopConditions"],
          requiredClarifications: [
            "Set at least one budget limit such as timeout, tokens, spend, or repair loops.",
            "Define deterministic stop conditions such as timeout, repair cap, policy escalation, or human checkpoint."
          ]
        },
        {
          dimension: "successCriteria",
          score: 0.4,
          rationale: "Success-criteria ambiguity is estimated from AC specificity and non-manual verification signals.",
          missingFields: [],
          requiredClarifications: [
            "Make acceptanceCriteria.0.statement specific enough to verify.",
            "Explain why manual verification is necessary for acceptanceCriteria.0."
          ]
        },
        {
          dimension: "context",
          score: 0,
          rationale: "Context ambiguity is estimated from brownfield context and whether the intent names a repo scope.",
          missingFields: [],
          requiredClarifications: []
        }
      ]
    );

    const assessment = assessIntentAmbiguity(draft, {
      mode: "brownfield",
      threshold: 0.2
    });

    assert.deepEqual(assessment.dimensionScores, expectedDimensionScores);
    assert.deepEqual(assessment.scores, expectedDimensionScores);
    assert.deepEqual(
      assessment.dimensionScores.map((score) => score.weightingProfile),
      [weightingProfile, weightingProfile, weightingProfile, weightingProfile]
    );
    assert.equal(assessment.ambiguity, 0.304);
  });

  it("scores a structurally missing dimension deterministically as an auto-fail signal", () => {
    const draft: IntentDraft = {
      title: "Clarify admission scoring",
      problem:
        "The front door needs deterministic ambiguity scores that show exactly which admission fields are missing.",
      requester: "ouroboros-ac-20102",
      acceptanceCriteria: [
        {
          statement: "Missing capability fields produce stable, operator-actionable ambiguity findings.",
          verification: "test"
        }
      ]
    };

    const first = scoreIntentAmbiguityDimension({
      intent: draft,
      dimension: "constraints",
      weight: 0.25,
      weightingProfile: getIntentAmbiguityWeightingProfile("brownfield")
    });
    const second = scoreIntentAmbiguityDimension({
      intent: draft,
      dimension: "constraints",
      weight: 0.25,
      weightingProfile: getIntentAmbiguityWeightingProfile("brownfield")
    });

    assert.deepEqual(first, second);
    assert.equal(first.score, 1);
    assert.equal(first.clarity, 0);
    assert.equal(first.weightedScore, 0.25);
    assert.equal(first.structurallyMissing, true);
    assert.deepEqual(first.missingFields, [
      "constraints",
      "capabilityEnvelope.repoScopes",
      "capabilityEnvelope.toolPermissions",
      "capabilityEnvelope.budget",
      "stopConditions"
    ]);
  });

  it("auto-fails otherwise passing aggregates when any required dimension is structurally missing", () => {
    const { context: _context, ...draftMissingContext } = clearDraft();
    const {
      constraints: _constraints,
      capabilityEnvelope: _capabilityEnvelope,
      ...draftMissingConstraints
    } = clearDraft();

    const cases: readonly {
      readonly name: string;
      readonly draft: IntentDraft;
      readonly mode: "greenfield" | "brownfield";
      readonly threshold: number;
      readonly missingDimension: "constraints" | "context";
      readonly expectedAmbiguity: number;
      readonly expectedWeightedScore: number;
      readonly expectedMissingFields: readonly string[];
    }[] = [
      {
        name: "brownfield context",
        draft: draftMissingContext,
        mode: "brownfield",
        threshold: 0.2,
        missingDimension: "context",
        expectedAmbiguity: 0.15,
        expectedWeightedScore: 0.15,
        expectedMissingFields: ["context"]
      },
      {
        name: "greenfield constraints",
        draft: draftMissingConstraints,
        mode: "greenfield",
        threshold: 0.31,
        missingDimension: "constraints",
        expectedAmbiguity: 0.3,
        expectedWeightedScore: 0.3,
        expectedMissingFields: [
          "constraints",
          "capabilityEnvelope.repoScopes",
          "capabilityEnvelope.toolPermissions",
          "capabilityEnvelope.budget",
          "stopConditions"
        ]
      }
    ];

    for (const testCase of cases) {
      const assessment = assessIntentAmbiguity(testCase.draft, {
        mode: testCase.mode,
        threshold: testCase.threshold
      });
      const dimensionScore = assessment.dimensionScores.find(
        (score) => score.dimension === testCase.missingDimension
      );

      assert.ok(dimensionScore, testCase.name);
      assert.equal(dimensionScore.score, 1, testCase.name);
      assert.equal(dimensionScore.weightedScore, testCase.expectedWeightedScore, testCase.name);
      assert.equal(dimensionScore.structurallyMissing, true, testCase.name);
      assert.equal(assessment.ambiguity, testCase.expectedAmbiguity, testCase.name);
      assert.equal(
        assessment.ambiguity <= assessment.threshold,
        true,
        `${testCase.name} should otherwise pass by aggregate ambiguity`
      );
      assert.equal(assessment.accepted, false, testCase.name);
      assert.deepEqual(assessment.structurallyMissingDimensions, [testCase.missingDimension], testCase.name);
      assert.deepEqual(assessment.missingFields, testCase.expectedMissingFields, testCase.name);
    }
  });

  it("scores ambiguous repository scope as a clarification signal for target repository boundaries", () => {
    const assessment = assessIntentAmbiguity(draftWithAmbiguousRepositoryScope(), {
      mode: "brownfield",
      threshold: 0.2
    });
    const constraints = assessment.dimensionScores.find((score) => score.dimension === "constraints");
    const context = assessment.dimensionScores.find((score) => score.dimension === "context");

    assert.ok(constraints);
    assert.ok(context);
    assert.equal(constraints.score, 0.75);
    assert.equal(context.score, 0.75);
    assert.deepEqual(constraints.missingFields, ["capabilityEnvelope.repoScopes.0"]);
    assert.deepEqual(context.missingFields, ["capabilityEnvelope.repoScopes.0"]);
    assert.match(constraints.requiredClarifications.join(" "), /target repository, concrete paths, or scope boundary/);
    assert.match(context.requiredClarifications.join(" "), /target repository, concrete paths, or scope boundary/);
    assert.equal(assessment.accepted, false);
  });

  it("scores ambiguous authority boundaries as a constraint clarification signal", () => {
    const score = scoreConstraintsAmbiguity({
      ...clearDraft(),
      constraints: ["Use judgment and do whatever is needed."]
    });

    assert.equal(score.score, 0.85);
    assert.deepEqual(score.missingFields, ["constraints"]);
    assert.match(score.requiredClarifications.join(" "), /authorized to decide, change, or execute/);
  });

  it("raises success-criteria ambiguity for manual acceptance criteria without justification", () => {
    const weakManualScore = scoreSuccessCriteriaAmbiguity({
      acceptanceCriteria: [
        {
          statement: "The operator can inspect the resulting admission-control report.",
          verification: "manual"
        }
      ]
    });
    const justifiedManualScore = scoreSuccessCriteriaAmbiguity({
      acceptanceCriteria: [
        {
          statement: "The operator can inspect the resulting admission-control report.",
          verification: "manual",
          justification: "The assertion depends on human readability of the report."
        }
      ]
    });
    const blankManualScore = scoreSuccessCriteriaAmbiguity({
      acceptanceCriteria: [
        {
          statement: "The operator can inspect the resulting admission-control report.",
          verification: "manual",
          justification: " \n\t "
        }
      ]
    });
    const invalidManualScore = scoreSuccessCriteriaAmbiguity({
      acceptanceCriteria: [
        {
          statement: "The operator can inspect the resulting admission-control report.",
          verification: "manual",
          justification: { reason: "operator review" } as never
        }
      ]
    });

    assert.equal(weakManualScore.score, 0.175);
    assert.equal(blankManualScore.score, 0.175);
    assert.equal(invalidManualScore.score, 0.175);
    assert.deepEqual(weakManualScore.missingFields, []);
    assert.deepEqual(blankManualScore.missingFields, []);
    assert.deepEqual(invalidManualScore.missingFields, []);
    assert.match(weakManualScore.requiredClarifications.join(" "), /manual verification/);
    assert.match(blankManualScore.requiredClarifications.join(" "), /manual verification/);
    assert.match(invalidManualScore.requiredClarifications.join(" "), /manual verification/);
    assert.equal(justifiedManualScore.score, 0);
  });

  it("treats non-admission verification modes as structurally missing", () => {
    const score = scoreIntentAmbiguityDimension({
      intent: {
        acceptanceCriteria: [
          {
            statement: "Every acceptance criterion chooses exactly one admission verification mode.",
            verification: "review" as "test"
          }
        ]
      },
      dimension: "successCriteria",
      weight: 0.25,
      weightingProfile: getIntentAmbiguityWeightingProfile("brownfield")
    });

    assert.equal(score.score, 1);
    assert.equal(score.structurallyMissing, true);
    assert.deepEqual(score.missingFields, ["acceptanceCriteria.0.verification"]);
  });
});

function draftWithDistinctDimensionSignals(): IntentDraft {
  return {
    title: "Polish",
    problem:
      "The factory admission path needs deterministic ambiguity diagnostics that identify the exact field family blocking promotion.",
    requester: "ouroboros-ac-20104",
    context: "This scoring fixture is limited to the current Protostar intent package tests.",
    acceptanceCriteria: [
      {
        statement: "Manual check",
        verification: "manual"
      }
    ],
    constraints: ["Keep this focused on intent ambiguity scoring tests."],
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
          reason: "Exercise each supported ambiguity dimension.",
          risk: "low"
        }
      ],
      budget: {}
    }
  };
}

function draftWithAmbiguousRepositoryScope(): IntentDraft {
  return {
    title: "Clarify repository scope boundary",
    problem:
      "Intent admission needs deterministic repository-scope scoring so vague workspace and path grants cannot be promoted silently.",
    requester: "ouroboros-ac-10301",
    context: "This ambiguity fixture exercises repository-scope scoring in the current Protostar checkout.",
    acceptanceCriteria: [
      {
        statement: "The ambiguity scorer reports a target repository clarification when repository scope is vague.",
        verification: "test"
      }
    ],
    constraints: ["Keep scoring deterministic and limited to repository-scope ambiguity."],
    capabilityEnvelope: {
      repoScopes: [
        {
          workspace: "current repo",
          path: "somewhere",
          access: "write"
        }
      ],
      toolPermissions: [
        {
          tool: "node:test",
          reason: "Exercise repository-scope ambiguity scoring.",
          risk: "low"
        }
      ],
      budget: {
        timeoutMs: 30_000
      }
    }
  };
}

function clearDraft(): IntentDraft {
  return {
    title: "Harden deterministic intent ambiguity scoring",
    problem:
      "The factory front door needs deterministic scoring signals before it can safely admit intent drafts.",
    requester: "ouroboros-ac-20102",
    context: "This clear draft is scoped to deterministic brownfield scoring in the current Protostar checkout.",
    acceptanceCriteria: [
      {
        statement: "The scorer returns stable per-dimension ambiguity scores for clear drafts.",
        verification: "test"
      }
    ],
    constraints: ["Keep scoring deterministic and scoped to the intent package."],
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
          reason: "Exercise ambiguity scoring contracts.",
          risk: "low"
        }
      ],
      budget: {
        timeoutMs: 30_000
      }
    }
  };
}

function clearCosmeticTweakDraft(): IntentDraft {
  return {
    ...clearDraft(),
    title: "Polish settings copy",
    problem:
      "The settings page contains unclear operator-facing copy, and the bounded cosmetic update should leave existing behavior unchanged while making the text easier to scan.",
    goalArchetype: "cosmetic-tweak",
    context: "The change is limited to the settings surface in the current Protostar checkout.",
    acceptanceCriteria: [
      {
        statement: "The settings page copy uses the approved operator-facing wording without changing behavior.",
        verification: "evidence"
      }
    ],
    constraints: ["Keep the cosmetic tweak bounded to packages/intent and do not alter runtime behavior."],
    capabilityEnvelope: {
      ...clearDraft().capabilityEnvelope,
      repoScopes: [
        {
          workspace: "protostar",
          path: "packages/intent",
          access: "write"
        }
      ]
    }
  };
}

function cosmeticTweakDraftMissingTarget(): IntentDraft {
  return {
    ...clearCosmeticTweakDraft(),
    title: "Adjust presentation details",
    problem:
      "The requested nonfunctional presentation update needs a precise admission decision while preserving the existing operator workflow and lifecycle semantics.",
    context: "The change is limited to the named product area in the current checkout.",
    acceptanceCriteria: [
      {
        statement: "The bounded outcome is recorded in the approval artifact without behavior changes.",
        verification: "evidence"
      }
    ],
    constraints: ["Keep the change bounded and do not alter behavior."],
    capabilityEnvelope: {
      ...clearCosmeticTweakDraft().capabilityEnvelope,
      repoScopes: [
        {
          workspace: "protostar",
          path: "ui-area",
          access: "write"
        }
      ]
    }
  };
}

function cosmeticTweakDraftMissingScope(): IntentDraft {
  return {
    ...clearCosmeticTweakDraft(),
    constraints: ["Operator authority is limited to the requested presentation update."],
    acceptanceCriteria: [
      {
        statement: "The screenshot artifact shows the approved settings page copy.",
        verification: "evidence"
      }
    ],
    capabilityEnvelope: {
      ...clearCosmeticTweakDraft().capabilityEnvelope,
      repoScopes: [
        {
          workspace: "protostar",
          path: ".",
          access: "write"
        }
      ]
    }
  };
}

function cosmeticTweakDraftMissingSuccessEvidence(): IntentDraft {
  return {
    ...clearCosmeticTweakDraft(),
    acceptanceCriteria: [
      {
        statement: "The reviewer signs off that the requested presentation outcome meets the supplied note.",
        verification: "manual",
        justification: "Human readability of the final wording requires operator judgment."
      }
    ]
  };
}

function cosmeticTweakDraftMissingAllCosmeticDetails(): IntentDraft {
  return {
    ...clearDraft(),
    title: "Adjust presentation details",
    problem:
      "The requested nonfunctional presentation update needs a precise admission decision while preserving the existing operator workflow and lifecycle semantics.",
    goalArchetype: "cosmetic-tweak",
    context: "The change is limited to the named product area in the current checkout.",
    acceptanceCriteria: [
      {
        statement: "The reviewer signs off that the requested presentation outcome meets the supplied note.",
        verification: "manual",
        justification: "Human readability of the final wording requires operator judgment."
      }
    ],
    constraints: ["Operator authority is limited to the requested presentation update."],
    capabilityEnvelope: {
      ...clearDraft().capabilityEnvelope,
      repoScopes: [
        {
          workspace: "protostar",
          path: ".",
          access: "write"
        }
      ]
    }
  };
}
