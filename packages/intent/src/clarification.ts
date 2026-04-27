import { detectMissingIntentDraftFields, isDraftFieldMissing, requiredIntentDraftFieldPaths } from "./draft-validation.js";

import type { ClarificationQuestionCategory, ClarificationQuestionId, ClarificationQuestionKey, IntentDraftFieldPath } from "./draft-validation.js";

import type { IntentDraft, IntentDraftCapabilityEnvelope, IntentDraftId, IntentDraftToolPermissionGrant } from "./models.js";

import { classifyAuthorityBoundaryIssue, classifyStopConditionIssue, constraintsForScoring, isAmbiguousRepositoryScope, normalizeRepositoryScopePhrase, repositoryScopeAmbiguityQuestion } from "./ambiguity-scoring.js";

import type { AuthorityBoundaryIssue, IntentAmbiguityMode, RepositoryScopeForAmbiguity, StopConditionIssue } from "./ambiguity-scoring.js";

import { draftFieldValue, hasNonEmptyText, isRecord, isRepoAccess, isRiskLevel, normalizeOptionalText, stableHash } from "./shared.js";

import { analyzeAcceptanceCriterionStatement, analyzeAcceptanceCriterionVerificationMode, validateManualAcceptanceCriterionJustification } from "./acceptance-criteria.js";

import { CAPABILITY_ENVELOPE_BUDGET_LIMIT_FIELDS, hasBudgetLimit, isValidBudgetLimitValue } from "./capability-envelope.js";

import type { BudgetLimitField, BudgetLimitFieldPath, FactoryBudget, ToolPermissionGrant } from "./capability-envelope.js";

export interface ClarificationQuestion {
  readonly id: ClarificationQuestionId;
  readonly key: ClarificationQuestionKey;
  readonly category: ClarificationQuestionCategory;
  readonly fieldPath: IntentDraftFieldPath;
  readonly prompt: string;
  readonly rationale: string;
}

export type ClarificationRequiredEntrySource = "missing-field-detection";

export interface ClarificationRequiredEntry {
  readonly fieldPath: IntentDraftFieldPath;
  readonly prompt: string;
  readonly rationale: string;
  readonly source: ClarificationRequiredEntrySource;
  readonly questionId: ClarificationQuestionId;
  readonly questionKey: ClarificationQuestionKey;
}

export const CLARIFICATION_QUESTION_CATEGORY_RANK: Readonly<Record<ClarificationQuestionCategory, number>> = {
  "required-field": 10,
  goal: 20,
  "acceptance-criteria": 30,
  "capability-envelope": 40,
  policy: 50,
  context: 60
};

export interface GenerateClarificationQuestionsInput {
  readonly draft: IntentDraft;
  readonly mode?: IntentAmbiguityMode;
  readonly requiredFields?: readonly IntentDraftFieldPath[];
}

export interface GenerateClarificationQuestionsOutput {
  readonly questions: readonly ClarificationQuestion[];
  readonly missingFields: readonly IntentDraftFieldPath[];
  readonly requiredClarifications: readonly ClarificationRequiredEntry[];
}

export type ClarificationQuestionGeneratorInput = GenerateClarificationQuestionsInput;

export type ClarificationQuestionGeneratorOutput = GenerateClarificationQuestionsOutput;

export const CLARIFICATION_REPORT_SCHEMA_VERSION = "1.0.0";

export const CLARIFICATION_REPORT_ARTIFACT_NAME = "clarification-report.json";

export type ClarificationReportStatus = "clear" | "needs-clarification";

export type ClarificationReportUnresolvedQuestionSource = "required-field-detection" | "ambiguity-signal";

export interface ClarificationReportSummary {
  readonly questionCount: number;
  readonly requiredClarificationCount: number;
  readonly unresolvedQuestionCount: number;
  readonly missingFieldCount: number;
}

export interface ClarificationReportUnresolvedQuestion {
  readonly questionId: ClarificationQuestionId;
  readonly questionKey: ClarificationQuestionKey;
  readonly fieldPath: IntentDraftFieldPath;
  readonly category: ClarificationQuestionCategory;
  readonly prompt: string;
  readonly rationale: string;
  readonly required: boolean;
  readonly source: ClarificationReportUnresolvedQuestionSource;
}

export interface ClarificationReport {
  readonly schemaVersion: typeof CLARIFICATION_REPORT_SCHEMA_VERSION;
  readonly artifact: typeof CLARIFICATION_REPORT_ARTIFACT_NAME;
  readonly mode: IntentAmbiguityMode;
  readonly draftId?: IntentDraftId;
  readonly status: ClarificationReportStatus;
  readonly summary: ClarificationReportSummary;
  readonly missingFields: readonly IntentDraftFieldPath[];
  readonly questions: readonly ClarificationQuestion[];
  readonly requiredClarifications: readonly ClarificationRequiredEntry[];
  readonly unresolvedQuestions: readonly ClarificationReportUnresolvedQuestion[];
}

export interface CreateClarificationReportInput extends GenerateClarificationQuestionsInput {
  readonly clarification?: GenerateClarificationQuestionsOutput;
}

export const CLARIFICATION_REPORT_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://protostar.dev/schemas/clarification-report.json",
  title: "Protostar deterministic clarification report",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "artifact",
    "mode",
    "status",
    "summary",
    "missingFields",
    "questions",
    "requiredClarifications",
    "unresolvedQuestions"
  ],
  properties: {
    schemaVersion: {
      const: CLARIFICATION_REPORT_SCHEMA_VERSION
    },
    artifact: {
      const: CLARIFICATION_REPORT_ARTIFACT_NAME
    },
    mode: {
      enum: ["greenfield", "brownfield"]
    },
    draftId: {
      type: "string",
      pattern: "^draft_.+"
    },
    status: {
      enum: ["clear", "needs-clarification"]
    },
    summary: {
      type: "object",
      additionalProperties: false,
      required: [
        "questionCount",
        "requiredClarificationCount",
        "unresolvedQuestionCount",
        "missingFieldCount"
      ],
      properties: {
        questionCount: {
          type: "integer",
          minimum: 0
        },
        requiredClarificationCount: {
          type: "integer",
          minimum: 0
        },
        unresolvedQuestionCount: {
          type: "integer",
          minimum: 0
        },
        missingFieldCount: {
          type: "integer",
          minimum: 0
        }
      }
    },
    missingFields: {
      type: "array",
      items: {
        type: "string"
      }
    },
    questions: {
      type: "array",
      items: {
        $ref: "#/$defs/clarificationQuestion"
      }
    },
    requiredClarifications: {
      type: "array",
      items: {
        $ref: "#/$defs/requiredClarification"
      }
    },
    unresolvedQuestions: {
      type: "array",
      items: {
        $ref: "#/$defs/unresolvedQuestion"
      }
    }
  },
  $defs: {
    clarificationQuestion: {
      type: "object",
      additionalProperties: false,
      required: ["id", "key", "category", "fieldPath", "prompt", "rationale"],
      properties: {
        id: {
          type: "string",
          pattern: "^clarify_.+"
        },
        key: {
          type: "string",
          pattern: "^field:.+"
        },
        category: {
          enum: ["goal", "required-field", "acceptance-criteria", "capability-envelope", "policy", "context"]
        },
        fieldPath: {
          type: "string"
        },
        prompt: {
          type: "string",
          minLength: 1
        },
        rationale: {
          type: "string",
          minLength: 1
        }
      }
    },
    requiredClarification: {
      type: "object",
      additionalProperties: false,
      required: ["fieldPath", "prompt", "rationale", "source", "questionId", "questionKey"],
      properties: {
        fieldPath: {
          type: "string"
        },
        prompt: {
          type: "string",
          minLength: 1
        },
        rationale: {
          type: "string",
          minLength: 1
        },
        source: {
          const: "missing-field-detection"
        },
        questionId: {
          type: "string",
          pattern: "^clarify_.+"
        },
        questionKey: {
          type: "string",
          pattern: "^field:.+"
        }
      }
    },
    unresolvedQuestion: {
      type: "object",
      additionalProperties: false,
      required: ["questionId", "questionKey", "fieldPath", "category", "prompt", "rationale", "required", "source"],
      properties: {
        questionId: {
          type: "string",
          pattern: "^clarify_.+"
        },
        questionKey: {
          type: "string",
          pattern: "^field:.+"
        },
        fieldPath: {
          type: "string"
        },
        category: {
          enum: ["goal", "required-field", "acceptance-criteria", "capability-envelope", "policy", "context"]
        },
        prompt: {
          type: "string",
          minLength: 1
        },
        rationale: {
          type: "string",
          minLength: 1
        },
        required: {
          type: "boolean"
        },
        source: {
          enum: ["required-field-detection", "ambiguity-signal"]
        }
      }
    }
  }
} as const;

export const CLARIFICATION_REPORT_SCHEMA = CLARIFICATION_REPORT_JSON_SCHEMA;

export type ClarificationQuestionCandidate = Omit<ClarificationQuestion, "id" | "key">;

export function generateClarificationQuestions(
  input: GenerateClarificationQuestionsInput
): GenerateClarificationQuestionsOutput {
  const draft = input.draft;
  const mode = input.mode ?? draft.mode ?? "brownfield";
  const requiredFields = input.requiredFields ?? defaultRequiredDraftFields(mode);
  const detectedMissingFields = detectRequiredClarificationMissingFields(draft, mode, requiredFields);
  const candidates = [
    ...generateMissingFieldQuestions(draft, detectedMissingFields),
    ...generateGoalAmbiguityQuestions(draft),
    ...generateAcceptanceCriteriaQuestions(draft),
    ...generateAuthorityBoundaryQuestions(draft),
    ...generateCapabilityEnvelopeQuestions(draft),
    ...generateStopConditionQuestions(draft),
    ...generatePolicySignalQuestions(draft),
    ...generateContextQuestions(draft, mode)
  ];
  const questions = orderClarificationQuestionCandidates(dedupeQuestionCandidates(candidates)).map(
    toClarificationQuestion
  );

  return {
    questions,
    missingFields: detectedMissingFields,
    requiredClarifications: generateRequiredClarificationEntries(detectedMissingFields, questions)
  };
}

export function createClarificationReport(input: CreateClarificationReportInput): ClarificationReport {
  const mode = input.mode ?? input.draft.mode ?? "brownfield";
  const clarification = input.clarification ??
    generateClarificationQuestions({
      draft: input.draft,
      mode,
      ...(input.requiredFields !== undefined ? { requiredFields: input.requiredFields } : {})
    });
  const requiredQuestionKeys = new Set(
    clarification.requiredClarifications.map((clarificationEntry) => clarificationEntry.questionKey)
  );
  const unresolvedQuestions = clarification.questions.map((question): ClarificationReportUnresolvedQuestion => {
    const required = requiredQuestionKeys.has(question.key);

    return {
      questionId: question.id,
      questionKey: question.key,
      fieldPath: question.fieldPath,
      category: question.category,
      prompt: question.prompt,
      rationale: question.rationale,
      required,
      source: required ? "required-field-detection" : "ambiguity-signal"
    };
  });

  return {
    schemaVersion: CLARIFICATION_REPORT_SCHEMA_VERSION,
    artifact: CLARIFICATION_REPORT_ARTIFACT_NAME,
    mode,
    ...(input.draft.draftId !== undefined ? { draftId: input.draft.draftId } : {}),
    status: unresolvedQuestions.length === 0 ? "clear" : "needs-clarification",
    summary: {
      questionCount: clarification.questions.length,
      requiredClarificationCount: clarification.requiredClarifications.length,
      unresolvedQuestionCount: unresolvedQuestions.length,
      missingFieldCount: clarification.missingFields.length
    },
    missingFields: clarification.missingFields,
    questions: clarification.questions,
    requiredClarifications: clarification.requiredClarifications,
    unresolvedQuestions
  };
}

export function createClarificationQuestionKey(fieldPath: IntentDraftFieldPath): ClarificationQuestionKey {
  return `field:${fieldPath}` as ClarificationQuestionKey;
}

function defaultRequiredDraftFields(_mode: IntentAmbiguityMode): readonly IntentDraftFieldPath[] {
  return requiredIntentDraftFieldPaths(_mode);
}

function detectRequiredClarificationMissingFields(
  draft: IntentDraft,
  mode: IntentAmbiguityMode,
  requiredFields: readonly IntentDraftFieldPath[]
): readonly IntentDraftFieldPath[] {
  const completenessReport = detectMissingIntentDraftFields({ draft, mode });
  const detectedMissingFields = new Set(completenessReport.missingFields);

  return requiredFields.filter(
    (fieldPath) =>
      detectedMissingFields.has(fieldPath) ||
      isDraftFieldMissing(draft, fieldPath) ||
      isRequiredDraftFieldUnderspecified(draft, fieldPath)
  );
}

function isRequiredDraftFieldUnderspecified(draft: IntentDraft, fieldPath: IntentDraftFieldPath): boolean {
  return (
    (fieldPath === "constraints" && classifyAuthorityBoundaryIssue(constraintsForScoring(draft)) !== undefined) ||
    (fieldPath === "stopConditions" && classifyStopConditionIssue(draft) !== undefined)
  );
}

function generateMissingFieldQuestions(
  draft: IntentDraft,
  requiredFields: readonly IntentDraftFieldPath[]
): readonly ClarificationQuestionCandidate[] {
  return requiredFields
    .filter((fieldPath) => isDraftFieldMissing(draft, fieldPath))
    .map((fieldPath) => requiredFieldQuestion(fieldPath));
}

function generateRequiredClarificationEntries(
  missingFields: readonly IntentDraftFieldPath[],
  questions: readonly ClarificationQuestion[]
): readonly ClarificationRequiredEntry[] {
  return missingFields.map((fieldPath) => {
    const question = questions.find((candidate) => candidate.fieldPath === fieldPath) ??
      toClarificationQuestion(requiredFieldQuestion(fieldPath));

    return {
      fieldPath,
      prompt: question.prompt,
      rationale: question.rationale,
      source: "missing-field-detection",
      questionId: question.id,
      questionKey: question.key
    };
  });
}

function generateGoalAmbiguityQuestions(draft: IntentDraft): readonly ClarificationQuestionCandidate[] {
  const candidates: ClarificationQuestionCandidate[] = [];
  const title = normalizeOptionalText(draftFieldValue(draft, "title"));
  const problem = normalizeOptionalText(draftFieldValue(draft, "problem"));

  if (title === undefined || title.length === 0) {
    candidates.push({
      category: "goal",
      fieldPath: "title",
      prompt: "What concrete goal should this intent title summarize?",
      rationale: "The draft is missing a usable title, so the requested goal is not clear enough to admit."
    });
  } else if (title.length < 12 || isUnusablyVagueGoalText(title)) {
    candidates.push({
      category: "goal",
      fieldPath: "title",
      prompt: "What concrete change or operator-visible outcome should this title name?",
      rationale: "Short titles tend to hide the actual requested factory outcome."
    });
  }

  if (problem === undefined || problem.length === 0) {
    candidates.push({
      category: "goal",
      fieldPath: "problem",
      prompt: "What exact problem should the factory solve, what outcome should exist afterward, and why does it matter?",
      rationale: "The draft is missing a usable problem statement, so the requested goal is not clear enough to admit."
    });
  } else if (problem.length < 80 || isUnusablyVagueGoalText(problem)) {
    candidates.push({
      category: "goal",
      fieldPath: "problem",
      prompt: "What problem should the factory solve, what outcome should exist afterward, and why does it matter?",
      rationale: "The problem statement is present but too thin to admit without clarification."
    });
  }

  return candidates;
}

const VAGUE_GOAL_TEXT = new Set([
  "change",
  "cleanup",
  "clean up",
  "do it",
  "fix",
  "fix it",
  "improve",
  "improve it",
  "make better",
  "make it better",
  "misc",
  "miscellaneous",
  "polish",
  "stuff",
  "things",
  "todo",
  "update"
]);

const VAGUE_GOAL_TOKENS = new Set([
  "better",
  "change",
  "cleanup",
  "fix",
  "improve",
  "misc",
  "polish",
  "stuff",
  "things",
  "todo",
  "update"
]);

function isUnusablyVagueGoalText(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (VAGUE_GOAL_TEXT.has(normalized)) {
    return true;
  }

  const tokens = normalized.split(/\s+/).filter((token) => token.length > 0);
  return tokens.length > 0 && tokens.length <= 3 && tokens.every((token) => VAGUE_GOAL_TOKENS.has(token));
}

function generateAcceptanceCriteriaQuestions(draft: IntentDraft): readonly ClarificationQuestionCandidate[] {
  const criteria = draft.acceptanceCriteria;
  if (!Array.isArray(criteria) || criteria.length === 0) {
    return [];
  }

  return criteria.flatMap((criterion, index): ClarificationQuestionCandidate[] => {
    const candidates: ClarificationQuestionCandidate[] = [];
    const statementAnalysis = analyzeAcceptanceCriterionStatement(criterion);
    const statement = statementAnalysis.normalizedStatement;
    const verificationAnalysis = analyzeAcceptanceCriterionVerificationMode(criterion);
    const verification = verificationAnalysis.mode;

    if (statement === undefined) {
      candidates.push({
        category: "acceptance-criteria",
        fieldPath: `acceptanceCriteria.${index}.statement` as IntentDraftFieldPath,
        prompt: `What measurable outcome should acceptance criterion ${index + 1} assert?`,
        rationale: statementAnalysis.emptyAfterNormalization
          ? "This acceptance criterion becomes empty after deterministic text normalization."
          : "Every acceptance criterion needs normalized measurable text before admission."
      });
    } else {
      const measurabilityQuestion = acceptanceCriterionMeasurabilityQuestion(statement, index);
      if (measurabilityQuestion !== undefined) {
        candidates.push(measurabilityQuestion);
      } else if (statement.length < 24) {
        candidates.push({
          category: "acceptance-criteria",
          fieldPath: `acceptanceCriteria.${index}.statement` as IntentDraftFieldPath,
          prompt: `How can acceptance criterion ${index + 1} be made specific enough to verify deterministically?`,
          rationale: "Brief acceptance criteria are weak ambiguity signals even when they are non-empty."
        });
      }
    }

    if (verificationAnalysis.issues.length > 0) {
      candidates.push({
        category: "acceptance-criteria",
        fieldPath: `acceptanceCriteria.${index}.verification` as IntentDraftFieldPath,
        prompt: `Which single mode should acceptance criterion ${index + 1} use: test, evidence, or manual?`,
        rationale: "Each acceptance criterion must choose exactly one closed-set verification mode."
      });
    }

    if (
      verification === "manual" &&
      validateManualAcceptanceCriterionJustification(
        typeof criterion === "string" ? undefined : criterion.justification
      ).manualUnjustified
    ) {
      candidates.push({
        category: "acceptance-criteria",
        fieldPath: `acceptanceCriteria.${index}.justification` as IntentDraftFieldPath,
        prompt: `Why does acceptance criterion ${index + 1} require manual verification, and what evidence should the operator inspect?`,
        rationale: "Manual verification without justification is a weak measurability signal."
      });
    }

    return candidates;
  });
}

function generateAuthorityBoundaryQuestions(draft: IntentDraft): readonly ClarificationQuestionCandidate[] {
  const issue = classifyAuthorityBoundaryIssue(constraintsForScoring(draft));
  return issue === undefined ? [] : [authorityBoundaryQuestion(issue)];
}

function authorityBoundaryQuestion(issue: AuthorityBoundaryIssue): ClarificationQuestionCandidate {
  return {
    category: "policy",
    fieldPath: "constraints",
    prompt:
      "What is Protostar authorized to decide, change, or execute for this factory action, and what stays outside that authority boundary?",
    rationale: authorityBoundaryRationale(issue)
  };
}

function authorityBoundaryRationale(issue: AuthorityBoundaryIssue): string {
  switch (issue) {
    case "missing":
      return "The draft does not state which decisions, changes, or execution steps belong to Protostar instead of the operator or another system.";
    case "underspecified":
      return "The draft lists required constraints only as placeholders or thin statements, leaving the authority boundary underspecified.";
    case "ambiguous":
      return "The draft uses broad authority language without a concrete decision, change, or execution boundary.";
  }
}

type AcceptanceCriterionMeasurabilityIssue = "non-measurable-language" | "missing-observable-pass-fail";

function acceptanceCriterionMeasurabilityQuestion(
  statement: string,
  index: number
): ClarificationQuestionCandidate | undefined {
  const issue = classifyAcceptanceCriterionMeasurability(statement);
  if (issue === undefined) {
    return undefined;
  }

  return {
    category: "acceptance-criteria",
    fieldPath: `acceptanceCriteria.${index}.statement` as IntentDraftFieldPath,
    prompt: `What observable pass/fail condition should acceptance criterion ${index + 1} assert, and which test or evidence will prove it?`,
    rationale: issue === "non-measurable-language"
      ? "The acceptance criterion uses subjective or non-measurable language without an observable pass/fail condition."
      : "The acceptance criterion lacks an observable output, artifact, behavior, threshold, or pass/fail condition."
  };
}

function classifyAcceptanceCriterionMeasurability(
  statement: string
): AcceptanceCriterionMeasurabilityIssue | undefined {
  const hasObservableSignal = OBSERVABLE_ACCEPTANCE_CRITERION_PATTERNS.some((pattern) => pattern.test(statement));
  if (hasObservableSignal) {
    return undefined;
  }

  const hasNonMeasurableLanguage = NON_MEASURABLE_ACCEPTANCE_CRITERION_PATTERNS.some((pattern) =>
    pattern.test(statement)
  );
  return hasNonMeasurableLanguage ? "non-measurable-language" : "missing-observable-pass-fail";
}

const NON_MEASURABLE_ACCEPTANCE_CRITERION_PATTERNS: readonly RegExp[] = [
  /\bas expected\b/i,
  /\b(?:better|best|clean(?:er)?|clear(?:er)?|easy|easier|good|great|improved?|intuitive)\b/i,
  /\b(?:nice|polished|proper(?:ly)?|quality|robust|seamless|simple|smooth|usable|user-friendly|works?)\b/i,
  /\b(?:production-ready|ready)\b/i,
  /\bfeels?\b/i
];

const OBSERVABLE_ACCEPTANCE_CRITERION_PATTERNS: readonly RegExp[] = [
  /\b(?:accepts?|adds?|allows?|asks?|asserts?|blocks?|builds?|captures?|chooses?|compiles?|contains?)\b/i,
  /\b(?:creates?|deletes?|denies?|displays?|emits?|equals?|exits?|exports?|fails?|flags?|generates?)\b/i,
  /\b(?:includes?|lists?|loads?|matches?|normalizes?|passes?|persists?|prints?|produces?|promotes?)\b/i,
  /\b(?:records?|refuses?|rejects?|renders?|reports?|requires?|returns?|routes?|runs?|saves?|shows?)\b/i,
  /\b(?:starts?|stops?|stores?|surfaces?|throws?|updates?|uses?|validates?|verifies?|writes?)\b/i,
  /\b(?:artifact|artifacts|cli|copy|deterministic|evidence|exit code|file|fixture|fixtures|id|ids)\b/i,
  /\b(?:json|operator-facing|operator-visible|report|snapshot|stable|stderr|stdout|test|tests|unchanged|visible)\b/i,
  /\b(?:at least|exactly|no more than|percent|seconds?|minutes?|ms|within|<=|>=|<|>|=|[0-9]+)\b/i
];

function generateCapabilityEnvelopeQuestions(draft: IntentDraft): readonly ClarificationQuestionCandidate[] {
  const envelope = draftFieldValue(draft, "capabilityEnvelope");
  const candidates: ClarificationQuestionCandidate[] = [];
  const capabilityBoundaryIssue = classifyCapabilityBoundaryIssue(draft);

  if (capabilityBoundaryIssue !== undefined) {
    candidates.push(capabilityBoundaryQuestion(capabilityBoundaryIssue));
  }

  if (envelope === undefined) {
    return candidates;
  }
  if (!isRecord(envelope)) {
    return candidates;
  }

  const repoScopes = envelope["repoScopes"];
  const toolPermissions = envelope["toolPermissions"];

  if (Array.isArray(repoScopes)) {
    repoScopes.forEach((scope, index) => {
      if (!isRecord(scope)) {
        candidates.push({
          category: "capability-envelope",
          fieldPath: `capabilityEnvelope.repoScopes.${index}` as IntentDraftFieldPath,
          prompt: `Which workspace, path, and access level should repository scope ${index + 1} allow?`,
          rationale: "Repository authority grants must be structured before admission can evaluate them."
        });
        return;
      }
      if (!hasNonEmptyText(scope["workspace"])) {
        candidates.push({
          category: "capability-envelope",
          fieldPath: `capabilityEnvelope.repoScopes.${index}.workspace` as IntentDraftFieldPath,
          prompt: `Which workspace does repository scope ${index + 1} apply to?`,
          rationale: "Repository authority needs an explicit workspace boundary."
        });
      }
      if (!hasNonEmptyText(scope["path"])) {
        candidates.push({
          category: "capability-envelope",
          fieldPath: `capabilityEnvelope.repoScopes.${index}.path` as IntentDraftFieldPath,
          prompt: `Which repository path does scope ${index + 1} allow the factory to access?`,
          rationale: "Repository authority needs a bounded path before admission."
        });
      }
      if (!isRepoAccess(scope["access"])) {
        candidates.push({
          category: "capability-envelope",
          fieldPath: `capabilityEnvelope.repoScopes.${index}.access` as IntentDraftFieldPath,
          prompt: `Should repository scope ${index + 1} allow read, write, or execute access?`,
          rationale: "Repository authority needs exactly one explicit access level."
        });
      }
      if (isAmbiguousRepositoryScope(scope as RepositoryScopeForAmbiguity)) {
        candidates.push(repositoryScopeAmbiguityQuestion(index));
      }
    });
  }

  if (Array.isArray(toolPermissions)) {
    toolPermissions.forEach((grant, index) => {
      if (!isRecord(grant)) {
        candidates.push({
          category: "capability-envelope",
          fieldPath: `capabilityEnvelope.toolPermissions.${index}` as IntentDraftFieldPath,
          prompt: `Which tool, reason, and risk level should permission grant ${index + 1} allow?`,
          rationale: "Tool authority grants must be structured before admission can evaluate them."
        });
        return;
      }
      if (!hasNonEmptyText(grant["tool"])) {
        candidates.push({
          category: "capability-envelope",
          fieldPath: `capabilityEnvelope.toolPermissions.${index}.tool` as IntentDraftFieldPath,
          prompt: `Which tool does permission grant ${index + 1} allow?`,
          rationale: "Tool authority needs a named tool before policy checks can run."
        });
      }
      if (!hasNonEmptyText(grant["reason"])) {
        candidates.push({
          category: "capability-envelope",
          fieldPath: `capabilityEnvelope.toolPermissions.${index}.reason` as IntentDraftFieldPath,
          prompt: `Why is tool permission grant ${index + 1} necessary for this intent?`,
          rationale: "Tool authority needs a concrete reason before admission."
        });
      }
      if (!isRiskLevel(grant["risk"])) {
        candidates.push({
          category: "capability-envelope",
          fieldPath: `capabilityEnvelope.toolPermissions.${index}.risk` as IntentDraftFieldPath,
          prompt: `Is tool permission grant ${index + 1} low, medium, or high risk?`,
          rationale: "Tool authority needs a deterministic risk level for policy checks."
        });
      }
    });
  }

  const budget = envelope["budget"];
  if (budget !== undefined && !isRecord(budget)) {
    return candidates;
  }

  if (budget !== undefined && !hasBudgetLimit(budget as IntentDraftCapabilityEnvelope["budget"])) {
    candidates.push({
      category: "capability-envelope",
      fieldPath: "capabilityEnvelope.budget",
      prompt: "Which budget limit should constrain the run: spend, tokens, timeout, or repair loops?",
      rationale: "An empty budget object is structurally present but still leaves autonomous limits ambiguous."
    });
  }
  if (budget !== undefined) {
    candidates.push(...budgetLimitValueQuestions(budget));
  }

  return candidates;
}

export const BUDGET_LIMIT_FIELDS = CAPABILITY_ENVELOPE_BUDGET_LIMIT_FIELDS;

const BUDGET_LIMIT_LABELS = {
  maxUsd: "spend cap in USD",
  maxTokens: "token cap",
  timeoutMs: "timeout in milliseconds",
  maxRepairLoops: "repair-loop cap"
} as const satisfies Readonly<Record<BudgetLimitField, string>>;

function budgetLimitValueQuestions(
  budget: FactoryBudget | NonNullable<IntentDraftCapabilityEnvelope["budget"]> | Record<string, unknown>
): readonly ClarificationQuestionCandidate[] {
  return BUDGET_LIMIT_FIELDS.flatMap((field): ClarificationQuestionCandidate[] => {
    if (!Object.hasOwn(budget, field) || isValidBudgetLimitValue(budget[field])) {
      return [];
    }

    return [
      {
        category: "capability-envelope",
        fieldPath: `capabilityEnvelope.budget.${field}` as BudgetLimitFieldPath,
        prompt: `What non-negative finite ${BUDGET_LIMIT_LABELS[field]} should constrain this run?`,
        rationale: `The ${field} budget limit is present but incomplete or invalid, so admission cannot use it as a deterministic cap.`
      }
    ];
  });
}

type CapabilityBoundaryIssue = "missing" | "ambiguous";

function classifyCapabilityBoundaryIssue(draft: IntentDraft): CapabilityBoundaryIssue | undefined {
  const envelope = draftFieldValue(draft, "capabilityEnvelope");

  if (envelope === undefined) {
    return "missing";
  }
  if (!isRecord(envelope)) {
    return "missing";
  }

  const repoScopes = Array.isArray(envelope["repoScopes"])
    ? envelope["repoScopes"].filter(isRecord) as readonly RepositoryScopeForAmbiguity[]
    : [];
  const toolPermissions = Array.isArray(envelope["toolPermissions"])
    ? envelope["toolPermissions"].filter(isRecord) as readonly (IntentDraftToolPermissionGrant | ToolPermissionGrant)[]
    : [];
  const budget = envelope["budget"];
  const hasBudget = isRecord(budget) && hasBudgetLimit(budget as IntentDraftCapabilityEnvelope["budget"]);

  if (repoScopes.length === 0 || toolPermissions.length === 0 || !hasBudget) {
    return "missing";
  }

  if (
    repoScopes.some(isAmbiguousRepositoryScope) ||
    toolPermissions.some(isAmbiguousToolPermissionGrant) ||
    hasAmbiguousSideEffectBoundary(draft.constraints)
  ) {
    return "ambiguous";
  }

  return undefined;
}

function capabilityBoundaryQuestion(issue: CapabilityBoundaryIssue): ClarificationQuestionCandidate {
  return {
    category: "capability-envelope",
    fieldPath: "capabilityEnvelope",
    prompt:
      "Which capabilities, side effects, budgets, or external access are permitted for this factory action?",
    rationale: issue === "missing"
      ? "The draft leaves one or more capability boundaries undefined, so admission cannot tell what authority is permitted."
      : "The draft uses broad capability or side-effect language without a concrete permitted boundary."
  };
}

function isAmbiguousToolPermissionGrant(grant: IntentDraftToolPermissionGrant | ToolPermissionGrant): boolean {
  const tool = normalizeCapabilityBoundaryPhrase(grant.tool);
  const reason = normalizeCapabilityBoundaryPhrase(grant.reason);

  if (tool === undefined && reason === undefined) {
    return false;
  }

  return (
    (tool !== undefined && AMBIGUOUS_TOOL_PERMISSION_VALUES.has(tool)) ||
    (reason !== undefined && AMBIGUOUS_TOOL_PERMISSION_REASON_PATTERNS.some((pattern) => pattern.test(reason)))
  );
}

function hasAmbiguousSideEffectBoundary(constraints: readonly string[] | undefined): boolean {
  return constraints?.some((constraint) =>
    AMBIGUOUS_SIDE_EFFECT_BOUNDARY_PATTERNS.some((pattern) =>
      pattern.test(normalizeCapabilityBoundaryPhrase(constraint) ?? "")
    )
  ) === true;
}

function normalizeCapabilityBoundaryPhrase(value: unknown): string | undefined {
  const normalized = normalizeRepositoryScopePhrase(value);
  return normalized !== undefined && normalized.length > 0 ? normalized : undefined;
}

const AMBIGUOUS_TOOL_PERMISSION_VALUES = new Set([
  "all tools",
  "any tool",
  "anything",
  "external",
  "external access",
  "external services",
  "internet",
  "network",
  "online access",
  "whatever"
]);

const AMBIGUOUS_TOOL_PERMISSION_REASON_PATTERNS: readonly RegExp[] = [
  /\b(?:anything|everything|whatever)\b/,
  /\b(?:as needed|as necessary|do what(?:ever)? it takes)\b/,
  /\b(?:external access|external services|internet|network|online access)\b/
];

const AMBIGUOUS_SIDE_EFFECT_BOUNDARY_PATTERNS: readonly RegExp[] = [
  /\bside effects?\b.*\b(?:allowed|ok|okay|permitted)?\s*(?:as needed|as necessary|whatever|any)\b/,
  /\b(?:any|whatever)\b.*\bside effects?\b/
];

function generatePolicySignalQuestions(draft: IntentDraft): readonly ClarificationQuestionCandidate[] {
  if (!hasAuthorityOverageSignal(draft) || hasNonEmptyText(draft.capabilityEnvelope?.authorityJustification)) {
    return [];
  }

  return [
    {
      category: "policy",
      fieldPath: "capabilityEnvelope.authorityJustification",
      prompt: "Why is the requested high-authority capability necessary, and what operator boundary should contain it?",
      rationale: "High-risk tools or execute-level repository access are policy ambiguity signals unless justified explicitly."
    }
  ];
}

function generateStopConditionQuestions(draft: IntentDraft): readonly ClarificationQuestionCandidate[] {
  const issue = classifyStopConditionIssue(draft);
  return issue === undefined ? [] : [stopConditionQuestion(issue)];
}

function stopConditionQuestion(issue: StopConditionIssue): ClarificationQuestionCandidate {
  return {
    category: "policy",
    fieldPath: "stopConditions",
    prompt:
      "What deterministic stop conditions should halt, pause, or escalate this factory run?",
    rationale: stopConditionRationale(issue)
  };
}

function stopConditionRationale(issue: StopConditionIssue): string {
  switch (issue) {
    case "missing":
      return "The draft does not define a concrete lifecycle stop condition, timeout, repair cap, or escalation trigger.";
    case "underspecified":
      return "The draft lists stop conditions only as placeholders or thin statements, leaving the factory without a deterministic halt rule.";
    case "ambiguous":
      return "The draft uses broad stop-condition language without a concrete event, threshold, or operator checkpoint.";
  }
}

function generateContextQuestions(
  draft: IntentDraft,
  mode: IntentAmbiguityMode
): readonly ClarificationQuestionCandidate[] {
  if (mode !== "brownfield") {
    return [];
  }

  const context = normalizeOptionalText(draftFieldValue(draft, "context"));
  if (context === undefined || context.length === 0) {
    return [
      {
        category: "context",
        fieldPath: "context",
        prompt: "What existing repository state, files, or product context should constrain this brownfield change?",
        rationale: "Brownfield admission needs local context in addition to the capability envelope."
      }
    ];
  }

  if (context.length < 40) {
    return [
      {
        category: "context",
        fieldPath: "context",
        prompt: "What additional brownfield context would help distinguish safe local edits from unintended scope expansion?",
        rationale: "The context field is present but too short to reduce brownfield ambiguity."
      }
    ];
  }

  return [];
}

function requiredFieldQuestion(fieldPath: IntentDraftFieldPath): ClarificationQuestionCandidate {
  switch (fieldPath) {
    case "title":
      return {
        category: "required-field",
        fieldPath,
        prompt: "What concise title names the concrete factory outcome?",
        rationale: "A draft cannot be admitted without a non-empty title."
      };
    case "problem":
      return {
        category: "required-field",
        fieldPath,
        prompt: "What problem should the factory solve, and what should be true after the run?",
        rationale: "A draft cannot be admitted without a problem statement."
      };
    case "requester":
      return {
        category: "required-field",
        fieldPath,
        prompt: "Who is requesting and accountable for this factory intent?",
        rationale: "A draft cannot be admitted without a requester."
      };
    case "goalArchetype":
      return {
        category: "required-field",
        fieldPath,
        prompt: "Which goal archetype should policy use for this intent?",
        rationale: "Goal-archetype policy caps cannot be applied when the archetype is missing."
      };
    case "acceptanceCriteria":
      return {
        category: "required-field",
        fieldPath,
        prompt: "What measurable acceptance criteria prove the requested outcome is done?",
        rationale: "A draft cannot be admitted without acceptance criteria."
      };
    case "constraints":
      return {
        category: "required-field",
        fieldPath,
        prompt: "What operator, product, policy, or safety constraints should govern the run?",
        rationale: "Explicit constraints reduce autonomous execution ambiguity."
      };
    case "stopConditions":
      return {
        category: "required-field",
        fieldPath,
        prompt: "What stop conditions should halt, pause, or escalate this factory run?",
        rationale: "A draft cannot be admitted without deterministic stop conditions or lifecycle caps."
      };
    case "capabilityEnvelope":
      return {
        category: "required-field",
        fieldPath,
        prompt: "What capability envelope should bound repository access, tools, and budgets?",
        rationale: "A draft cannot be admitted without bounded capability authority."
      };
    case "capabilityEnvelope.repoScopes":
      return {
        category: "required-field",
        fieldPath,
        prompt: "Which target repository or workspace, concrete paths, and scope boundary may the factory access?",
        rationale: "Repository authority must name the target repository and path boundary before admission."
      };
    case "capabilityEnvelope.toolPermissions":
      return {
        category: "required-field",
        fieldPath,
        prompt: "Which tools may the factory use, why are they needed, and what risk level do they carry?",
        rationale: "Tool authority must be explicit before policy checks can run."
      };
    case "capabilityEnvelope.budget":
      return {
        category: "required-field",
        fieldPath,
        prompt: "What run budget should constrain spend, tokens, timeout, or repair loops?",
        rationale: "Autonomous work needs at least one explicit budget limit."
      };
    case "capabilityEnvelope.budget.maxUsd":
    case "capabilityEnvelope.budget.maxTokens":
    case "capabilityEnvelope.budget.timeoutMs":
    case "capabilityEnvelope.budget.maxRepairLoops":
      return budgetLimitRequiredFieldQuestion(fieldPath);
    case "context":
      return {
        category: "required-field",
        fieldPath,
        prompt: "What repository or product context should the factory preserve while making this change?",
        rationale: "Context narrows the safe operating boundary for the intent."
      };
    case "capabilityEnvelope.authorityJustification":
      return {
        category: "required-field",
        fieldPath,
        prompt: "What explicit authority justification allows this requested capability overage?",
        rationale: "Policy overage findings require operator-visible justification before override."
      };
    default:
      return {
        category: "required-field",
        fieldPath,
        prompt: `What value should be provided for ${fieldPath}?`,
        rationale: "This required draft field is missing or structurally empty."
      };
  }
}

function budgetLimitRequiredFieldQuestion(fieldPath: BudgetLimitFieldPath): ClarificationQuestionCandidate {
  const field = fieldPath.replace("capabilityEnvelope.budget.", "") as BudgetLimitField;

  return {
    category: "required-field",
    fieldPath,
    prompt: `What non-negative finite ${BUDGET_LIMIT_LABELS[field]} should constrain this run?`,
    rationale: `The ${field} budget limit must be explicit and valid when required by admission.`
  };
}

function hasAuthorityOverageSignal(draft: IntentDraft): boolean {
  const envelope = draftFieldValue(draft, "capabilityEnvelope");
  if (!isRecord(envelope)) {
    return false;
  }

  const repoScopes = envelope["repoScopes"];
  const toolPermissions = envelope["toolPermissions"];

  return (
    (Array.isArray(repoScopes) && repoScopes.some((scope) => isRecord(scope) && scope["access"] === "execute")) ||
    (Array.isArray(toolPermissions) && toolPermissions.some((grant) => isRecord(grant) && grant["risk"] === "high"))
  );
}

function dedupeQuestionCandidates(
  candidates: readonly ClarificationQuestionCandidate[]
): readonly ClarificationQuestionCandidate[] {
  const candidatesByKey = new Map<ClarificationQuestionKey, ClarificationQuestionCandidate>();

  for (const candidate of candidates) {
    const key = createClarificationQuestionKey(candidate.fieldPath);
    const existing = candidatesByKey.get(key);
    candidatesByKey.set(
      key,
      existing === undefined ? candidate : chooseCanonicalQuestionCandidate(existing, candidate)
    );
  }

  return [...candidatesByKey.values()];
}

function chooseCanonicalQuestionCandidate(
  existing: ClarificationQuestionCandidate,
  candidate: ClarificationQuestionCandidate
): ClarificationQuestionCandidate {
  const priorityComparison = compareNumber(
    canonicalQuestionContentPriority(candidate),
    canonicalQuestionContentPriority(existing)
  );

  if (priorityComparison > 0) {
    return candidate;
  }
  if (priorityComparison < 0) {
    return existing;
  }

  return compareClarificationQuestionCandidates(candidate, existing) < 0 ? candidate : existing;
}

function canonicalQuestionContentPriority(candidate: ClarificationQuestionCandidate): number {
  return candidate.category === "required-field" ? 0 : 1;
}

function toClarificationQuestion(candidate: ClarificationQuestionCandidate): ClarificationQuestion {
  const key = createClarificationQuestionKey(candidate.fieldPath);
  return {
    ...candidate,
    key,
    id: createClarificationQuestionId(key)
  };
}

function orderClarificationQuestionCandidates(
  candidates: readonly ClarificationQuestionCandidate[]
): readonly ClarificationQuestionCandidate[] {
  return [...candidates].sort(compareClarificationQuestionCandidates);
}

function compareClarificationQuestionCandidates(
  left: ClarificationQuestionCandidate,
  right: ClarificationQuestionCandidate
): number {
  return (
    compareNumber(categoryRank(left), categoryRank(right)) ||
    compareFieldPath(left.fieldPath, right.fieldPath) ||
    compareText(left.prompt, right.prompt) ||
    compareText(left.rationale, right.rationale)
  );
}

function categoryRank(candidate: ClarificationQuestionCandidate): number {
  return CLARIFICATION_QUESTION_CATEGORY_RANK[candidate.category];
}

function compareFieldPath(left: IntentDraftFieldPath, right: IntentDraftFieldPath): number {
  const leftTokens = fieldPathSortTokens(left);
  const rightTokens = fieldPathSortTokens(right);
  const tokenCount = Math.max(leftTokens.length, rightTokens.length);

  for (let index = 0; index < tokenCount; index += 1) {
    const leftToken = leftTokens[index];
    const rightToken = rightTokens[index];

    if (leftToken === undefined) {
      return -1;
    }
    if (rightToken === undefined) {
      return 1;
    }

    const comparison = compareNumber(leftToken.rank, rightToken.rank) || compareText(leftToken.value, rightToken.value);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}

function fieldPathSortTokens(fieldPath: IntentDraftFieldPath): readonly FieldPathSortToken[] {
  return fieldPath.split(".").map((segment) => {
    const numericSegment = Number(segment);
    if (Number.isInteger(numericSegment) && segment.trim() === String(numericSegment)) {
      return {
        rank: numericSegment,
        value: segment.padStart(10, "0")
      };
    }

    return {
      rank: fieldPathSegmentRank(segment),
      value: segment
    };
  });
}

interface FieldPathSortToken {
  readonly rank: number;
  readonly value: string;
}

function fieldPathSegmentRank(segment: string): number {
  switch (segment) {
    case "title":
      return 10;
    case "problem":
      return 20;
    case "requester":
      return 30;
    case "goalArchetype":
      return 40;
    case "acceptanceCriteria":
      return 50;
    case "statement":
      return 10;
    case "verification":
      return 20;
    case "justification":
      return 30;
    case "constraints":
      return 60;
    case "stopConditions":
      return 65;
    case "context":
      return 70;
    case "capabilityEnvelope":
      return 80;
    case "repoScopes":
      return 10;
    case "workspace":
      return 10;
    case "path":
      return 20;
    case "access":
      return 30;
    case "toolPermissions":
      return 20;
    case "tool":
      return 10;
    case "reason":
      return 20;
    case "risk":
      return 30;
    case "budget":
      return 30;
    case "maxUsd":
      return 10;
    case "maxTokens":
      return 20;
    case "timeoutMs":
      return 30;
    case "maxRepairLoops":
      return 40;
    case "authorityJustification":
      return 40;
    default:
      return 1_000;
  }
}

function compareNumber(left: number, right: number): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function createClarificationQuestionId(key: ClarificationQuestionKey): ClarificationQuestionId {
  return `clarify_${stableHash(key)}` as ClarificationQuestionId;
}
