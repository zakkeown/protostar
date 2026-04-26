import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createClarificationQuestionKey,
  generateClarificationQuestions,
  type ClarificationQuestion,
  type IntentDraft
} from "./index.js";

describe("generateClarificationQuestions", () => {
  it("emits concrete goal clarification questions for missing or unusably vague draft goals", () => {
    const missing = generateClarificationQuestions({
      draft: {},
      mode: "greenfield"
    });

    const missingTitleQuestion = findQuestion(missing.questions, createClarificationQuestionKey("title"));
    const missingProblemQuestion = findQuestion(missing.questions, createClarificationQuestionKey("problem"));
    assert.equal(missingTitleQuestion.category, "goal");
    assert.equal(missingProblemQuestion.category, "goal");
    assert.match(missingTitleQuestion.prompt, /concrete goal/);
    assert.match(missingProblemQuestion.prompt, /exact problem/);

    const vague = generateClarificationQuestions({
      draft: {
        title: "Make better",
        problem: "Fix it",
        requester: "ouroboros-ac-20002",
        goalArchetype: "cosmetic-tweak",
        acceptanceCriteria: [
          {
            statement: "The generator asks an actionable question for an unusably vague goal.",
            verification: "test"
          }
        ],
        constraints: ["Keep the generator deterministic."],
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
              reason: "Exercise deterministic clarification-question generation.",
              risk: "low"
            }
          ],
          budget: {
            timeoutMs: 30_000
          }
        }
      },
      mode: "greenfield"
    });

    const vagueProblemQuestion = findQuestion(vague.questions, createClarificationQuestionKey("problem"));
    assert.equal(vagueProblemQuestion.category, "goal");
    assert.equal(
      vagueProblemQuestion.prompt,
      "What problem should the factory solve, what outcome should exist afterward, and why does it matter?"
    );
  });

  it("is deterministic and orders required, goal, AC, capability, policy, and context questions", () => {
    const input = {
      draft: draftWithOrderedQuestionSignals(),
      mode: "brownfield" as const,
      requiredFields: ["requester", "capabilityEnvelope.budget"] as const
    };
    const first = generateClarificationQuestions(input);
    const second = generateClarificationQuestions(input);

    assert.deepEqual(second, first);
    assert.deepEqual(
      first.questions.map((question) => question.key),
      [
        createClarificationQuestionKey("requester"),
        createClarificationQuestionKey("title"),
        createClarificationQuestionKey("problem"),
        createClarificationQuestionKey("acceptanceCriteria.0.statement"),
        createClarificationQuestionKey("acceptanceCriteria.0.verification"),
        createClarificationQuestionKey("capabilityEnvelope"),
        createClarificationQuestionKey("capabilityEnvelope.budget"),
        createClarificationQuestionKey("constraints"),
        createClarificationQuestionKey("stopConditions"),
        createClarificationQuestionKey("capabilityEnvelope.authorityJustification"),
        createClarificationQuestionKey("context")
      ]
    );
    assert.deepEqual(second.questions.map((question) => question.id), first.questions.map((question) => question.id));
  });

  it("exposes required clarification entries generated from detected missing fields", () => {
    const result = generateClarificationQuestions({
      draft: {},
      mode: "brownfield"
    });

    assert.deepEqual(result.missingFields, [
      "title",
      "problem",
      "requester",
      "goalArchetype",
      "acceptanceCriteria",
      "constraints",
      "stopConditions",
      "capabilityEnvelope.repoScopes",
      "capabilityEnvelope.toolPermissions",
      "capabilityEnvelope.budget",
      "context"
    ]);
    assert.deepEqual(
      result.requiredClarifications.map(({ fieldPath, questionKey, source }) => ({
        fieldPath,
        questionKey,
        source
      })),
      result.missingFields.map((fieldPath) => ({
        fieldPath,
        questionKey: createClarificationQuestionKey(fieldPath),
        source: "missing-field-detection"
      }))
    );

    const titleQuestion = findQuestion(result.questions, createClarificationQuestionKey("title"));
    const titleClarification = result.requiredClarifications.find(
      (clarification) => clarification.fieldPath === "title"
    );

    assert.ok(titleClarification);
    assert.equal(titleClarification.prompt, titleQuestion.prompt);
    assert.equal(titleClarification.rationale, titleQuestion.rationale);
    assert.equal(titleClarification.questionId, titleQuestion.id);
  });

  it("emits concrete AC clarification questions for non-measurable text without observable pass/fail conditions", () => {
    const result = generateClarificationQuestions({
      draft: {
        title: "Clarify AC measurability",
        problem:
          "Intent admission needs deterministic acceptance-criteria clarification questions when draft criteria cannot be evaluated with an observable pass/fail signal.",
        requester: "ouroboros-ac-20003",
        mode: "brownfield",
        goalArchetype: "cosmetic-tweak",
        context: "The change is limited to deterministic clarification-question generation in packages/intent.",
        acceptanceCriteria: [
          {
            statement: "The user experience feels better and more intuitive.",
            verification: "evidence"
          },
          {
            statement: "Coordinate release readiness across the team.",
            verification: "manual",
            justification: "The operator must inspect the release coordination notes."
          }
        ],
        constraints: ["No live LLM calls are allowed in clarification-question generation."],
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
              reason: "Exercise deterministic acceptance-criteria clarification coverage.",
              risk: "low"
            }
          ],
          budget: {
            timeoutMs: 30_000
          }
        }
      },
      mode: "brownfield"
    });

    assert.deepEqual(
      result.questions.map((question) => question.key),
      [
        createClarificationQuestionKey("acceptanceCriteria.0.statement"),
        createClarificationQuestionKey("acceptanceCriteria.1.statement")
      ]
    );

    const subjectiveQuestion = findQuestion(
      result.questions,
      createClarificationQuestionKey("acceptanceCriteria.0.statement")
    );
    assert.equal(
      subjectiveQuestion.prompt,
      "What observable pass/fail condition should acceptance criterion 1 assert, and which test or evidence will prove it?"
    );
    assert.match(subjectiveQuestion.rationale, /subjective or non-measurable language/);

    const passFailQuestion = findQuestion(
      result.questions,
      createClarificationQuestionKey("acceptanceCriteria.1.statement")
    );
    assert.equal(
      passFailQuestion.prompt,
      "What observable pass/fail condition should acceptance criterion 2 assert, and which test or evidence will prove it?"
    );
    assert.match(passFailQuestion.rationale, /lacks an observable output/);
  });

  it("asks for the target repository, paths, or scope boundary when repository scope is missing or ambiguous", () => {
    const missingScope = generateClarificationQuestions({
      draft: {
        title: "Clarify repository scope boundary",
        problem:
          "Intent admission needs a concrete repository scope before the factory can safely decide which workspace and files are in bounds.",
        requester: "ouroboros-ac-10301",
        goalArchetype: "cosmetic-tweak",
        context: "The change is limited to deterministic repository-scope clarification in packages/intent.",
        acceptanceCriteria: [
          {
            statement: "The generator asks for target repository paths when repository scope is missing.",
            verification: "test"
          }
        ],
        constraints: ["Keep repository-scope clarification deterministic."],
        capabilityEnvelope: {
          repoScopes: [],
          toolPermissions: [
            {
              tool: "node:test",
              reason: "Exercise missing repository-scope clarification.",
              risk: "low"
            }
          ],
          budget: {
            timeoutMs: 30_000
          }
        }
      },
      mode: "brownfield"
    });
    const missingScopeQuestion = findQuestion(
      missingScope.questions,
      createClarificationQuestionKey("capabilityEnvelope.repoScopes")
    );

    assert.equal(
      missingScopeQuestion.prompt,
      "Which target repository or workspace, concrete paths, and scope boundary may the factory access?"
    );
    assert.match(missingScopeQuestion.rationale, /target repository and path boundary/);

    const ambiguousScope = generateClarificationQuestions({
      draft: {
        title: "Clarify repository scope boundary",
        problem:
          "Intent admission needs a concrete repository scope before the factory can safely decide which workspace and files are in bounds.",
        requester: "ouroboros-ac-10301",
        goalArchetype: "cosmetic-tweak",
        context: "The change is limited to deterministic repository-scope clarification in packages/intent.",
        acceptanceCriteria: [
          {
            statement: "The generator asks for a target repository boundary when repository scope is vague.",
            verification: "test"
          }
        ],
        constraints: ["Keep repository-scope clarification deterministic."],
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
              reason: "Exercise ambiguous repository-scope clarification.",
              risk: "low"
            }
          ],
          budget: {
            timeoutMs: 30_000
          }
        }
      },
      mode: "brownfield"
    });

    assert.deepEqual(
      ambiguousScope.questions.map((question) => question.key),
      [
        createClarificationQuestionKey("capabilityEnvelope"),
        createClarificationQuestionKey("capabilityEnvelope.repoScopes.0")
      ]
    );

    const ambiguousScopeQuestion = findQuestion(
      ambiguousScope.questions,
      createClarificationQuestionKey("capabilityEnvelope.repoScopes.0")
    );
    assert.equal(
      ambiguousScopeQuestion.prompt,
      "Which target repository, concrete paths, or scope boundary should repository scope 1 use?"
    );
    assert.match(ambiguousScopeQuestion.rationale, /too broad or generic/);
  });

  it("asks which capabilities, side effects, budgets, or external access are permitted when capability boundaries are missing or ambiguous", () => {
    const { capabilityEnvelope: _capabilityEnvelope, ...draftWithoutCapabilityEnvelope } =
      draftWithConcreteFactoryAction();
    const missingBoundary = generateClarificationQuestions({
      draft: draftWithoutCapabilityEnvelope,
      mode: "brownfield"
    });
    const missingBoundaryQuestion = findQuestion(
      missingBoundary.questions,
      createClarificationQuestionKey("capabilityEnvelope")
    );

    assert.equal(missingBoundaryQuestion.category, "capability-envelope");
    assert.equal(
      missingBoundaryQuestion.prompt,
      "Which capabilities, side effects, budgets, or external access are permitted for this factory action?"
    );
    assert.match(missingBoundaryQuestion.rationale, /capability boundaries undefined/);

    const ambiguousBoundary = generateClarificationQuestions({
      draft: {
        ...draftWithConcreteFactoryAction(),
        constraints: [
          "Protostar is authorized only to update packages/intent tests and must preserve execution behavior.",
          "Side effects are permitted as needed."
        ],
        capabilityEnvelope: {
          repoScopes: [
            {
              workspace: "current repository",
              path: "somewhere",
              access: "write"
            }
          ],
          toolPermissions: [
            {
              tool: "external services",
              reason: "Use network access as needed.",
              risk: "low"
            }
          ],
          budget: {
            timeoutMs: 30_000
          }
        }
      },
      mode: "brownfield"
    });
    const ambiguousBoundaryQuestion = findQuestion(
      ambiguousBoundary.questions,
      createClarificationQuestionKey("capabilityEnvelope")
    );

    assert.equal(ambiguousBoundaryQuestion.category, "capability-envelope");
    assert.equal(ambiguousBoundaryQuestion.prompt, missingBoundaryQuestion.prompt);
    assert.match(ambiguousBoundaryQuestion.rationale, /broad capability or side-effect language/);
  });

  it("emits concrete budget-limit clarification questions when limits are missing or incomplete", () => {
    const baseDraft = draftWithConcreteFactoryAction();
    const envelope = baseDraft.capabilityEnvelope;
    assert.ok(envelope);

    const result = generateClarificationQuestions({
      draft: {
        ...baseDraft,
        constraints: ["Only update packages/intent clarification-question behavior."],
        capabilityEnvelope: {
          ...envelope,
          budget: {
            maxUsd: Number.POSITIVE_INFINITY,
            maxTokens: -1,
            timeoutMs: 30_000
          }
        }
      },
      mode: "brownfield",
      requiredFields: ["capabilityEnvelope.budget.maxRepairLoops"]
    });

    assert.deepEqual(
      result.questions.map((question) => ({ category: question.category, key: question.key })),
      [
        {
          category: "required-field",
          key: createClarificationQuestionKey("capabilityEnvelope.budget.maxRepairLoops")
        },
        {
          category: "capability-envelope",
          key: createClarificationQuestionKey("capabilityEnvelope.budget.maxUsd")
        },
        {
          category: "capability-envelope",
          key: createClarificationQuestionKey("capabilityEnvelope.budget.maxTokens")
        }
      ]
    );

    const missingRepairLoopQuestion = findQuestion(
      result.questions,
      createClarificationQuestionKey("capabilityEnvelope.budget.maxRepairLoops")
    );
    assert.equal(
      missingRepairLoopQuestion.prompt,
      "What non-negative finite repair-loop cap should constrain this run?"
    );
    assert.match(missingRepairLoopQuestion.rationale, /must be explicit and valid/);

    const invalidSpendQuestion = findQuestion(
      result.questions,
      createClarificationQuestionKey("capabilityEnvelope.budget.maxUsd")
    );
    assert.equal(
      invalidSpendQuestion.prompt,
      "What non-negative finite spend cap in USD should constrain this run?"
    );
    assert.match(invalidSpendQuestion.rationale, /present but incomplete or invalid/);

    assert.deepEqual(result.missingFields, ["capabilityEnvelope.budget.maxRepairLoops"]);
    assert.deepEqual(
      result.requiredClarifications.map(({ fieldPath, questionKey, source }) => ({
        fieldPath,
        questionKey,
        source
      })),
      [
        {
          fieldPath: "capabilityEnvelope.budget.maxRepairLoops",
          questionKey: createClarificationQuestionKey("capabilityEnvelope.budget.maxRepairLoops"),
          source: "missing-field-detection"
        }
      ]
    );
  });

  it("emits concrete stop-condition clarification questions when stop rules are missing or ambiguous", () => {
    const baseDraft = {
      ...draftWithConcreteFactoryAction(),
      constraints: ["Scope limited to stop-condition clarification in packages/intent."]
    };
    const missingStop = generateClarificationQuestions({
      draft: {
        ...baseDraft,
        capabilityEnvelope: {
          ...baseDraft.capabilityEnvelope,
          budget: {
            maxUsd: 5
          }
        }
      },
      mode: "brownfield"
    });
    const missingStopQuestion = findQuestion(missingStop.questions, createClarificationQuestionKey("stopConditions"));

    assert.equal(missingStopQuestion.category, "policy");
    assert.equal(
      missingStopQuestion.prompt,
      "What deterministic stop conditions should halt, pause, or escalate this factory run?"
    );
    assert.match(missingStopQuestion.rationale, /lifecycle stop condition/);
    assert.deepEqual(missingStop.missingFields, ["stopConditions"]);
    assert.deepEqual(
      missingStop.requiredClarifications.map(({ fieldPath, questionKey, source }) => ({
        fieldPath,
        questionKey,
        source
      })),
      [
        {
          fieldPath: "stopConditions",
          questionKey: createClarificationQuestionKey("stopConditions"),
          source: "missing-field-detection"
        }
      ]
    );

    const ambiguousStop = generateClarificationQuestions({
      draft: {
        ...baseDraft,
        stopConditions: ["Stop when it feels done."],
        capabilityEnvelope: {
          ...baseDraft.capabilityEnvelope,
          budget: {
            timeoutMs: 30_000
          }
        }
      },
      mode: "brownfield"
    });
    const ambiguousStopQuestion = findQuestion(
      ambiguousStop.questions,
      createClarificationQuestionKey("stopConditions")
    );

    assert.equal(ambiguousStopQuestion.category, "policy");
    assert.equal(ambiguousStopQuestion.prompt, missingStopQuestion.prompt);
    assert.match(ambiguousStopQuestion.rationale, /concrete event, threshold, or operator checkpoint/);
    assert.deepEqual(ambiguousStop.missingFields, ["stopConditions"]);
  });

  it("asks what Protostar may decide, change, or execute when authority boundaries are missing or ambiguous", () => {
    const missingBoundary = generateClarificationQuestions({
      draft: {
        ...draftWithConcreteFactoryAction(),
        constraints: []
      },
      mode: "brownfield"
    });
    const missingBoundaryQuestion = findQuestion(
      missingBoundary.questions,
      createClarificationQuestionKey("constraints")
    );

    assert.equal(missingBoundaryQuestion.category, "policy");
    assert.equal(
      missingBoundaryQuestion.prompt,
      "What is Protostar authorized to decide, change, or execute for this factory action, and what stays outside that authority boundary?"
    );
    assert.match(missingBoundaryQuestion.rationale, /does not state which decisions, changes, or execution steps/);

    const ambiguousBoundary = generateClarificationQuestions({
      draft: {
        ...draftWithConcreteFactoryAction(),
        constraints: ["Use judgment and do whatever is needed."]
      },
      mode: "brownfield"
    });
    const ambiguousBoundaryQuestion = findQuestion(
      ambiguousBoundary.questions,
      createClarificationQuestionKey("constraints")
    );

    assert.equal(ambiguousBoundaryQuestion.category, "policy");
    assert.equal(ambiguousBoundaryQuestion.prompt, missingBoundaryQuestion.prompt);
    assert.match(ambiguousBoundaryQuestion.rationale, /broad authority language/);
  });

  it("treats required constraint placeholders as underspecified required clarifications", () => {
    const result = generateClarificationQuestions({
      draft: {
        ...draftWithConcreteFactoryAction(),
        constraints: ["N/A"]
      },
      mode: "brownfield"
    });
    const constraintQuestion = findQuestion(result.questions, createClarificationQuestionKey("constraints"));

    assert.equal(constraintQuestion.category, "policy");
    assert.equal(
      constraintQuestion.prompt,
      "What is Protostar authorized to decide, change, or execute for this factory action, and what stays outside that authority boundary?"
    );
    assert.match(constraintQuestion.rationale, /underspecified/);
    assert.deepEqual(result.missingFields, ["constraints"]);
    assert.deepEqual(
      result.requiredClarifications.map(({ fieldPath, questionKey, source }) => ({
        fieldPath,
        questionKey,
        source
      })),
      [
        {
          fieldPath: "constraints",
          questionKey: createClarificationQuestionKey("constraints"),
          source: "missing-field-detection"
        }
      ]
    );
  });

  it("dedupes by stable question key while preserving canonical question content", () => {
    const result = generateClarificationQuestions({
      draft: draftWithDuplicateQuestionSignals(),
      mode: "brownfield",
      requiredFields: [
        "context",
        "capabilityEnvelope.budget",
        "capabilityEnvelope.budget"
      ]
    });

    assert.deepEqual(
      result.questions.map((question) => question.key),
      [
        createClarificationQuestionKey("capabilityEnvelope"),
        createClarificationQuestionKey("capabilityEnvelope.budget"),
        createClarificationQuestionKey("stopConditions"),
        createClarificationQuestionKey("context")
      ]
    );
    assert.equal(new Set(result.questions.map((question) => question.key)).size, result.questions.length);

    const budgetQuestion = findQuestion(result.questions, createClarificationQuestionKey("capabilityEnvelope.budget"));
    assert.equal(budgetQuestion.category, "capability-envelope");
    assert.equal(
      budgetQuestion.prompt,
      "Which budget limit should constrain the run: spend, tokens, timeout, or repair loops?"
    );
    assert.equal(
      budgetQuestion.rationale,
      "An empty budget object is structurally present but still leaves autonomous limits ambiguous."
    );

    const contextQuestion = findQuestion(result.questions, createClarificationQuestionKey("context"));
    assert.equal(contextQuestion.category, "context");
    assert.equal(
      contextQuestion.prompt,
      "What existing repository state, files, or product context should constrain this brownfield change?"
    );
    assert.equal(
      contextQuestion.rationale,
      "Brownfield admission needs local context in addition to the capability envelope."
    );
  });
});

function findQuestion(
  questions: readonly ClarificationQuestion[],
  key: ClarificationQuestion["key"]
): ClarificationQuestion {
  const question = questions.find((candidate) => candidate.key === key);
  assert.ok(question, `Expected clarification question with key ${key}.`);
  return question;
}

function draftWithDuplicateQuestionSignals(): IntentDraft {
  return {
    title: "Clarify intent admission",
    problem:
      "The factory needs a deterministic admission-control front door that asks only actionable clarification questions before promotion.",
    requester: "ouroboros-ac-10004",
    goalArchetype: "cosmetic-tweak",
    acceptanceCriteria: [
      {
        statement: "Duplicate clarification signals are collapsed to one operator-facing question per stable key.",
        verification: "test"
      }
    ],
    constraints: ["Scope remains inside packages/intent clarification behavior."],
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
          reason: "Exercise deterministic clarification-question generation.",
          risk: "low"
        }
      ],
      budget: {}
    }
  };
}

function draftWithOrderedQuestionSignals(): IntentDraft {
  return {
    title: "Tiny",
    problem: "Needs polish",
    acceptanceCriteria: [
      {
        statement: "Short"
      }
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
          tool: "shell",
          reason: "Exercise policy overage clarification ordering.",
          risk: "high"
        }
      ],
      budget: {}
    }
  };
}

function draftWithConcreteFactoryAction(): IntentDraft {
  return {
    title: "Clarify factory authority boundary",
    problem:
      "Intent admission needs a deterministic authority-boundary question when the draft leaves Protostar's decision, change, or execution authority unclear.",
    requester: "ouroboros-ac-10302",
    goalArchetype: "cosmetic-tweak",
    context: "The change is limited to deterministic clarification-question generation in packages/intent.",
    acceptanceCriteria: [
      {
        statement: "The generator emits a concrete authority-boundary question for missing or ambiguous constraints.",
        verification: "test"
      }
    ],
    constraints: ["Protostar may only change packages/intent clarification tests and must preserve factory behavior."],
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
          reason: "Exercise deterministic authority-boundary clarification.",
          risk: "low"
        }
      ],
      budget: {
        timeoutMs: 30_000
      }
    }
  };
}
