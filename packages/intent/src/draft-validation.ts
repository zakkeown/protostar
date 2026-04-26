import { classifyStopConditionIssue, isAmbiguousStopCondition, isUnderspecifiedStopCondition } from "./ambiguity-scoring.js";

import type { IntentAmbiguityMode } from "./ambiguity-scoring.js";

import type { IntentDraft, IntentDraftCapabilityEnvelope } from "./models.js";

import { draftFieldValue, hasNonEmptyText, isRecord, isRepoAccess, isRiskLevel } from "./shared.js";

import { acceptanceCriterionVerificationModeMessage, analyzeAcceptanceCriterionStatement, analyzeAcceptanceCriterionVerificationMode } from "./acceptance-criteria.js";

import { BUDGET_LIMIT_FIELDS } from "./clarification.js";

import { hasBudgetLimit, isValidBudgetLimitValue } from "./capability-envelope.js";

import type { BudgetLimitField, BudgetLimitFieldPath } from "./capability-envelope.js";

export type ClarificationQuestionId = `clarify_${string}`;

export type ClarificationQuestionKey = `field:${IntentDraftFieldPath}`;

export type ClarificationQuestionCategory =
  | "goal"
  | "required-field"
  | "acceptance-criteria"
  | "capability-envelope"
  | "policy"
  | "context";

export type IntentDraftFieldPath =
  | "title"
  | "problem"
  | "requester"
  | "acceptanceCriteria"
  | `acceptanceCriteria.${number}`
  | `acceptanceCriteria.${number}.statement`
  | `acceptanceCriteria.${number}.verification`
  | `acceptanceCriteria.${number}.justification`
  | "capabilityEnvelope"
  | "capabilityEnvelope.repoScopes"
  | `capabilityEnvelope.repoScopes.${number}`
  | `capabilityEnvelope.repoScopes.${number}.workspace`
  | `capabilityEnvelope.repoScopes.${number}.path`
  | `capabilityEnvelope.repoScopes.${number}.access`
  | "capabilityEnvelope.toolPermissions"
  | `capabilityEnvelope.toolPermissions.${number}`
  | `capabilityEnvelope.toolPermissions.${number}.tool`
  | `capabilityEnvelope.toolPermissions.${number}.permission`
  | `capabilityEnvelope.toolPermissions.${number}.permissionLevel`
  | `capabilityEnvelope.toolPermissions.${number}.level`
  | `capabilityEnvelope.toolPermissions.${number}.reason`
  | `capabilityEnvelope.toolPermissions.${number}.risk`
  | "capabilityEnvelope.executeGrants"
  | `capabilityEnvelope.executeGrants.${number}`
  | `capabilityEnvelope.executeGrants.${number}.command`
  | `capabilityEnvelope.executeGrants.${number}.scope`
  | `capabilityEnvelope.executeGrants.${number}.executionScope`
  | `capabilityEnvelope.executeGrants.${number}.reason`
  | "capabilityEnvelope.budget"
  | "capabilityEnvelope.budget.maxUsd"
  | "capabilityEnvelope.budget.maxTokens"
  | "capabilityEnvelope.budget.timeoutMs"
  | "capabilityEnvelope.budget.maxRepairLoops"
  | "capabilityEnvelope.authorityJustification"
  | "constraints"
  | `constraints.${number}`
  | "stopConditions"
  | `stopConditions.${number}`
  | "context"
  | "goalArchetype";

export type IntentDraftStructuralDimensionId =
  | "goal"
  | "requester"
  | "goalArchetype"
  | "successCriteria"
  | "constraints"
  | "stopConditions"
  | "capabilityEnvelope"
  | "brownfieldContext";

export interface IntentDraftStructuralCompletenessDimension {
  readonly id: IntentDraftStructuralDimensionId;
  readonly label: string;
  readonly requiredFields: readonly IntentDraftFieldPath[];
  readonly modes: readonly IntentAmbiguityMode[];
  readonly missingMessage: string;
}

export type IntentDraftWellFormednessRuleKind =
  | "non-empty-text"
  | "non-empty-string-list"
  | "non-empty-acceptance-criteria"
  | "deterministic-stop-condition"
  | "non-empty-repo-scope-list"
  | "non-empty-tool-permission-list"
  | "at-least-one-budget-limit";

export interface IntentDraftWellFormednessRule {
  readonly kind: IntentDraftWellFormednessRuleKind;
  readonly description: string;
}

export interface IntentDraftRequiredFieldChecklistEntry {
  readonly fieldPath: IntentDraftFieldPath;
  readonly dimensionId: IntentDraftStructuralDimensionId;
  readonly label: string;
  readonly modes: readonly IntentAmbiguityMode[];
  readonly wellFormedness: IntentDraftWellFormednessRule;
  readonly failureMessage: string;
}

export type IntentDraftMalformedFieldFailureCode =
  | "malformed-text-field"
  | "malformed-string-list"
  | "malformed-stop-condition"
  | "malformed-acceptance-criteria"
  | "malformed-acceptance-criterion"
  | "missing-verification-mode"
  | "malformed-verification-mode"
  | "multiple-verification-modes"
  | "malformed-capability-envelope"
  | "malformed-repo-scope"
  | "malformed-tool-permission"
  | "malformed-budget"
  | "malformed-budget-limit";

export type IntentDraftPresenceValidationFailureCode =
  | "missing-required-field"
  | IntentDraftMalformedFieldFailureCode;

export type IntentDraftValidationFailureKind = "missing" | "malformed";

export const INTENT_DRAFT_REQUIRED_DIMENSIONS = [
  {
    id: "goal",
    label: "Goal",
    requiredFields: ["title", "problem"],
    modes: ["greenfield", "brownfield"],
    missingMessage: "title and problem must describe the requested factory outcome."
  },
  {
    id: "requester",
    label: "Requester",
    requiredFields: ["requester"],
    modes: ["greenfield", "brownfield"],
    missingMessage: "requester must identify the accountable operator or workflow."
  },
  {
    id: "goalArchetype",
    label: "Goal Archetype",
    requiredFields: ["goalArchetype"],
    modes: ["greenfield", "brownfield"],
    missingMessage: "goalArchetype must select the policy cap table row for admission."
  },
  {
    id: "successCriteria",
    label: "Success Criteria",
    requiredFields: ["acceptanceCriteria"],
    modes: ["greenfield", "brownfield"],
    missingMessage: "acceptanceCriteria must contain at least one measurable outcome."
  },
  {
    id: "constraints",
    label: "Constraints",
    requiredFields: ["constraints"],
    modes: ["greenfield", "brownfield"],
    missingMessage: "constraints must state operator, product, policy, or safety boundaries."
  },
  {
    id: "stopConditions",
    label: "Stop Conditions",
    requiredFields: ["stopConditions"],
    modes: ["greenfield", "brownfield"],
    missingMessage: "stopConditions must define deterministic halt, pause, or escalation criteria."
  },
  {
    id: "capabilityEnvelope",
    label: "Capability Envelope",
    requiredFields: [
      "capabilityEnvelope.repoScopes",
      "capabilityEnvelope.toolPermissions",
      "capabilityEnvelope.budget"
    ],
    modes: ["greenfield", "brownfield"],
    missingMessage: "capabilityEnvelope must bound repository access, tool authority, and budget."
  },
  {
    id: "brownfieldContext",
    label: "Brownfield Context",
    requiredFields: ["context"],
    modes: ["brownfield"],
    missingMessage: "context must describe the existing repository or product state for brownfield work."
  }
] as const satisfies readonly IntentDraftStructuralCompletenessDimension[];

export const INTENT_DRAFT_REQUIRED_FIELD_CHECKLIST = [
  {
    fieldPath: "title",
    dimensionId: "goal",
    label: "Title",
    modes: ["greenfield", "brownfield"],
    wellFormedness: {
      kind: "non-empty-text",
      description: "Must be a non-empty string after whitespace normalization."
    },
    failureMessage: "title must be provided before promotion."
  },
  {
    fieldPath: "problem",
    dimensionId: "goal",
    label: "Problem",
    modes: ["greenfield", "brownfield"],
    wellFormedness: {
      kind: "non-empty-text",
      description: "Must be a non-empty string after whitespace normalization."
    },
    failureMessage: "problem must be provided before promotion."
  },
  {
    fieldPath: "requester",
    dimensionId: "requester",
    label: "Requester",
    modes: ["greenfield", "brownfield"],
    wellFormedness: {
      kind: "non-empty-text",
      description: "Must be a non-empty accountable operator or workflow identifier."
    },
    failureMessage: "requester must be provided before promotion."
  },
  {
    fieldPath: "goalArchetype",
    dimensionId: "goalArchetype",
    label: "Goal Archetype",
    modes: ["greenfield", "brownfield"],
    wellFormedness: {
      kind: "non-empty-text",
      description: "Must be a non-empty policy archetype name selected before capability caps are evaluated."
    },
    failureMessage: "goalArchetype must be provided before promotion."
  },
  {
    fieldPath: "acceptanceCriteria",
    dimensionId: "successCriteria",
    label: "Acceptance Criteria",
    modes: ["greenfield", "brownfield"],
    wellFormedness: {
      kind: "non-empty-acceptance-criteria",
      description: "Must contain at least one acceptance criterion entry before AC normalization."
    },
    failureMessage: "acceptanceCriteria must contain at least one entry before promotion."
  },
  {
    fieldPath: "constraints",
    dimensionId: "constraints",
    label: "Constraints",
    modes: ["greenfield", "brownfield"],
    wellFormedness: {
      kind: "non-empty-string-list",
      description: "Must contain at least one non-empty operator, product, policy, or safety boundary."
    },
    failureMessage: "constraints must contain at least one non-empty entry before promotion."
  },
  {
    fieldPath: "stopConditions",
    dimensionId: "stopConditions",
    label: "Stop Conditions",
    modes: ["greenfield", "brownfield"],
    wellFormedness: {
      kind: "deterministic-stop-condition",
      description: "Must define a concrete halt, pause, escalation, timeout, or repair-loop condition."
    },
    failureMessage: "stopConditions must define a deterministic halt, pause, or escalation condition before promotion."
  },
  {
    fieldPath: "capabilityEnvelope.repoScopes",
    dimensionId: "capabilityEnvelope",
    label: "Repository Scopes",
    modes: ["greenfield", "brownfield"],
    wellFormedness: {
      kind: "non-empty-repo-scope-list",
      description: "Must contain at least one repository scope before per-scope workspace, path, and access checks."
    },
    failureMessage: "capabilityEnvelope.repoScopes must contain at least one repository scope before promotion."
  },
  {
    fieldPath: "capabilityEnvelope.toolPermissions",
    dimensionId: "capabilityEnvelope",
    label: "Tool Permissions",
    modes: ["greenfield", "brownfield"],
    wellFormedness: {
      kind: "non-empty-tool-permission-list",
      description: "Must contain at least one tool grant before per-grant tool, reason, and risk checks."
    },
    failureMessage: "capabilityEnvelope.toolPermissions must contain at least one tool grant before promotion."
  },
  {
    fieldPath: "capabilityEnvelope.budget",
    dimensionId: "capabilityEnvelope",
    label: "Budget",
    modes: ["greenfield", "brownfield"],
    wellFormedness: {
      kind: "at-least-one-budget-limit",
      description: "Must contain at least one non-negative finite budget limit."
    },
    failureMessage: "capabilityEnvelope.budget must contain at least one non-negative finite limit before promotion."
  },
  {
    fieldPath: "context",
    dimensionId: "brownfieldContext",
    label: "Brownfield Context",
    modes: ["brownfield"],
    wellFormedness: {
      kind: "non-empty-text",
      description: "Must be a non-empty description of the existing repository or product state for brownfield work."
    },
    failureMessage: "context must be provided for brownfield promotion."
  }
] as const satisfies readonly IntentDraftRequiredFieldChecklistEntry[];

export function requiredIntentDraftDimensions(
  mode: IntentAmbiguityMode
): readonly IntentDraftStructuralCompletenessDimension[] {
  return INTENT_DRAFT_REQUIRED_DIMENSIONS.filter((dimension) =>
    dimension.modes.some((supportedMode) => supportedMode === mode)
  );
}

export function requiredIntentDraftFieldPaths(mode: IntentAmbiguityMode): readonly IntentDraftFieldPath[] {
  return requiredIntentDraftFieldChecklist(mode).map((entry) => entry.fieldPath);
}

export function requiredIntentDraftFieldChecklist(
  mode: IntentAmbiguityMode
): readonly IntentDraftRequiredFieldChecklistEntry[] {
  return INTENT_DRAFT_REQUIRED_FIELD_CHECKLIST.filter((entry) =>
    entry.modes.some((supportedMode) => supportedMode === mode)
  );
}

export interface IntentDraftRequiredDimensionCheck {
  readonly dimensionId: IntentDraftStructuralDimensionId;
  readonly label: string;
  readonly requiredFields: readonly IntentDraftFieldPath[];
  readonly missingFields: readonly IntentDraftFieldPath[];
  readonly passed: boolean;
  readonly message: string;
}

export interface IntentDraftPresenceValidationFailure {
  readonly code: IntentDraftPresenceValidationFailureCode;
  readonly kind: IntentDraftValidationFailureKind;
  readonly checklistIndex: number;
  readonly fieldPath: IntentDraftFieldPath;
  readonly dimensionId: IntentDraftStructuralDimensionId;
  readonly label: string;
  readonly wellFormedness: IntentDraftWellFormednessRule;
  readonly message: string;
}

export interface IntentDraftPresenceValidationCheck {
  readonly checklistIndex: number;
  readonly fieldPath: IntentDraftFieldPath;
  readonly dimensionId: IntentDraftStructuralDimensionId;
  readonly label: string;
  readonly wellFormedness: IntentDraftWellFormednessRule;
  readonly passed: boolean;
  readonly message: string;
  readonly failures: readonly IntentDraftPresenceValidationFailure[];
  readonly failure?: IntentDraftPresenceValidationFailure;
}

export interface IntentDraftPresenceValidationReport {
  readonly mode: IntentAmbiguityMode;
  readonly passed: boolean;
  readonly checklist: readonly IntentDraftRequiredFieldChecklistEntry[];
  readonly checks: readonly IntentDraftPresenceValidationCheck[];
  readonly failures: readonly IntentDraftPresenceValidationFailure[];
  readonly missingFields: readonly IntentDraftFieldPath[];
  readonly malformedFields: readonly IntentDraftFieldPath[];
}

export interface ValidateIntentDraftPresenceInput {
  readonly draft: IntentDraft;
  readonly mode?: IntentAmbiguityMode;
}

export interface ValidateIntentDraftWellFormednessInput extends ValidateIntentDraftPresenceInput {}

export type IntentDraftWellFormednessValidationReport = IntentDraftPresenceValidationReport;

export type IntentDraftRequiredFieldCheck = IntentDraftPresenceValidationCheck;

export interface IntentDraftCompletenessReport {
  readonly mode: IntentAmbiguityMode;
  readonly complete: boolean;
  readonly dimensions: readonly IntentDraftRequiredDimensionCheck[];
  readonly missingDimensions: readonly IntentDraftStructuralDimensionId[];
  readonly missingFields: readonly IntentDraftFieldPath[];
  readonly malformedFields: readonly IntentDraftFieldPath[];
  readonly fieldChecks: readonly IntentDraftRequiredFieldCheck[];
  readonly presenceValidation: IntentDraftPresenceValidationReport;
  readonly presenceFailures: readonly IntentDraftPresenceValidationFailure[];
}

export interface EvaluateIntentDraftCompletenessInput {
  readonly draft: IntentDraft;
  readonly mode?: IntentAmbiguityMode;
}

export type DetectMissingIntentDraftFieldsInput = EvaluateIntentDraftCompletenessInput;

export type DetectMissingIntentDraftFieldsOutput = IntentDraftCompletenessReport;

export function validateIntentDraftPresence(
  input: ValidateIntentDraftPresenceInput
): IntentDraftPresenceValidationReport {
  return validateIntentDraftWellFormedness(input);
}

export function validateIntentDraftWellFormedness(
  input: ValidateIntentDraftWellFormednessInput
): IntentDraftWellFormednessValidationReport {
  const mode = input.mode ?? input.draft.mode ?? "brownfield";
  const fieldChecklist = requiredIntentDraftFieldChecklist(mode);
  const checks = fieldChecklist.map((entry, checklistIndex): IntentDraftPresenceValidationCheck => {
    const failures = validateRequiredIntentDraftField({
      draft: input.draft,
      entry,
      checklistIndex,
      mode
    });
    const passed = failures.length === 0;
    const common = {
      checklistIndex,
      fieldPath: entry.fieldPath,
      dimensionId: entry.dimensionId,
      label: entry.label,
      wellFormedness: entry.wellFormedness
    };

    if (passed) {
      return {
        ...common,
        passed: true,
        message: `${entry.fieldPath} is well-formed: ${entry.wellFormedness.description}`,
        failures
      };
    }

    const [failure] = failures;
    if (failure === undefined) {
      throw new Error(`${entry.fieldPath} failed validation without a deterministic failure.`);
    }

    return {
      ...common,
      passed: false,
      message: failure.message,
      failures,
      failure
    };
  });
  const failures = checks.flatMap((check) => check.failures);

  return {
    mode,
    passed: failures.length === 0,
    checklist: fieldChecklist,
    checks,
    failures,
    missingFields: failures.filter((failure) => failure.kind === "missing").map((failure) => failure.fieldPath),
    malformedFields: failures.filter((failure) => failure.kind === "malformed").map((failure) => failure.fieldPath)
  };
}

interface ValidateRequiredIntentDraftFieldInput {
  readonly draft: IntentDraft;
  readonly entry: IntentDraftRequiredFieldChecklistEntry;
  readonly checklistIndex: number;
  readonly mode: IntentAmbiguityMode;
}

interface IntentDraftValidationFailureCommon {
  readonly entry: IntentDraftRequiredFieldChecklistEntry;
  readonly checklistIndex: number;
}

function validateRequiredIntentDraftField(
  input: ValidateRequiredIntentDraftFieldInput
): readonly IntentDraftPresenceValidationFailure[] {
  const { draft, entry, checklistIndex, mode } = input;

  switch (entry.fieldPath) {
    case "title":
    case "problem":
    case "requester":
    case "goalArchetype":
    case "context":
      return validateRequiredTextField(draftFieldValue(draft, entry.fieldPath), {
        entry,
        checklistIndex
      }, mode);
    case "constraints":
      return validateRequiredStringListField(draftFieldValue(draft, "constraints"), {
        entry,
        checklistIndex
      }, mode, "constraints");
    case "stopConditions":
      return validateRequiredStopConditionsField(draft, {
        entry,
        checklistIndex
      }, mode);
    case "acceptanceCriteria":
      return validateRequiredAcceptanceCriteriaField(draftFieldValue(draft, "acceptanceCriteria"), {
        entry,
        checklistIndex
      }, mode);
    case "capabilityEnvelope.repoScopes":
      return validateRequiredRepoScopesField(draftFieldValue(draft, "capabilityEnvelope"), {
        entry,
        checklistIndex
      }, mode);
    case "capabilityEnvelope.toolPermissions":
      return validateRequiredToolPermissionsField(draftFieldValue(draft, "capabilityEnvelope"), {
        entry,
        checklistIndex
      }, mode);
    case "capabilityEnvelope.budget":
      return validateRequiredBudgetField(draftFieldValue(draft, "capabilityEnvelope"), {
        entry,
        checklistIndex
      }, mode);
    default:
      return isDraftFieldMissing(draft, entry.fieldPath)
        ? [missingIntentDraftFieldFailure({ entry, checklistIndex }, entry.fieldPath, mode)]
        : [];
  }
}

function validateRequiredTextField(
  value: unknown,
  common: IntentDraftValidationFailureCommon,
  mode: IntentAmbiguityMode
): readonly IntentDraftPresenceValidationFailure[] {
  if (value === undefined) {
    return [missingIntentDraftFieldFailure(common, common.entry.fieldPath, mode)];
  }

  if (!hasNonEmptyText(value)) {
    return [
      malformedIntentDraftFieldFailure(common, {
        code: "malformed-text-field",
        fieldPath: common.entry.fieldPath,
        message: `${common.entry.fieldPath} must be a non-empty string after whitespace normalization.`
      })
    ];
  }

  return [];
}

function validateRequiredStringListField(
  value: unknown,
  common: IntentDraftValidationFailureCommon,
  mode: IntentAmbiguityMode,
  fieldPath: "constraints"
): readonly IntentDraftPresenceValidationFailure[] {
  if (value === undefined) {
    return [missingIntentDraftFieldFailure(common, fieldPath, mode)];
  }

  if (!Array.isArray(value)) {
    return [
      malformedIntentDraftFieldFailure(common, {
        code: "malformed-string-list",
        fieldPath,
        message: `${fieldPath} must be an array of non-empty strings.`
      })
    ];
  }

  if (value.length === 0) {
    return [missingIntentDraftFieldFailure(common, fieldPath, mode)];
  }

  return value.flatMap((entry, index): IntentDraftPresenceValidationFailure[] =>
    hasNonEmptyText(entry)
      ? []
      : [
          malformedIntentDraftFieldFailure(common, {
            code: "malformed-string-list",
            fieldPath: `${fieldPath}.${index}` as IntentDraftFieldPath,
            message: `${fieldPath}.${index} must be a non-empty string.`
          })
        ]
  );
}

function validateRequiredStopConditionsField(
  draft: IntentDraft,
  common: IntentDraftValidationFailureCommon,
  mode: IntentAmbiguityMode
): readonly IntentDraftPresenceValidationFailure[] {
  const value = draftFieldValue(draft, "stopConditions");
  const fieldPath = "stopConditions";
  const issue = classifyStopConditionIssue(draft);

  if (value === undefined) {
    return issue === "missing" ? [missingIntentDraftFieldFailure(common, fieldPath, mode)] : [];
  }

  if (!Array.isArray(value)) {
    return [
      malformedIntentDraftFieldFailure(common, {
        code: "malformed-stop-condition",
        fieldPath,
        message: "stopConditions must be an array of deterministic non-empty strings."
      })
    ];
  }

  if (value.length === 0) {
    return issue === "missing" ? [missingIntentDraftFieldFailure(common, fieldPath, mode)] : [];
  }

  const entryFailures = value.flatMap((entry, index): IntentDraftPresenceValidationFailure[] => {
    const entryPath = `${fieldPath}.${index}` as IntentDraftFieldPath;
    if (!hasNonEmptyText(entry)) {
      return [
        malformedIntentDraftFieldFailure(common, {
          code: "malformed-stop-condition",
          fieldPath: entryPath,
          message: `${entryPath} must be a non-empty deterministic stop condition.`
        })
      ];
    }

    if (isUnderspecifiedStopCondition(entry) || isAmbiguousStopCondition(entry)) {
      return [
        malformedIntentDraftFieldFailure(common, {
          code: "malformed-stop-condition",
          fieldPath: entryPath,
          message:
            `${entryPath} must name a concrete timeout, budget, repair cap, policy gate, human checkpoint, verification failure, or escalation condition.`
        })
      ];
    }

    return [];
  });

  return entryFailures.length > 0 ? entryFailures : issue === "missing" ? [missingIntentDraftFieldFailure(common, fieldPath, mode)] : [];
}

function validateRequiredAcceptanceCriteriaField(
  value: unknown,
  common: IntentDraftValidationFailureCommon,
  mode: IntentAmbiguityMode
): readonly IntentDraftPresenceValidationFailure[] {
  const fieldPath = "acceptanceCriteria";

  if (value === undefined) {
    return [missingIntentDraftFieldFailure(common, fieldPath, mode)];
  }

  if (!Array.isArray(value)) {
    return [
      malformedIntentDraftFieldFailure(common, {
        code: "malformed-acceptance-criteria",
        fieldPath,
        message: "acceptanceCriteria must be an array of acceptance criterion objects."
      })
    ];
  }

  if (value.length === 0) {
    return [missingIntentDraftFieldFailure(common, fieldPath, mode)];
  }

  return value.flatMap((criterion, index): readonly IntentDraftPresenceValidationFailure[] =>
    validateAcceptanceCriterionEntry(criterion, index, common)
  );
}

function validateAcceptanceCriterionEntry(
  criterion: unknown,
  index: number,
  common: IntentDraftValidationFailureCommon
): readonly IntentDraftPresenceValidationFailure[] {
  const criterionPath = `acceptanceCriteria.${index}` as IntentDraftFieldPath;
  const verificationFieldPath = `${criterionPath}.verification` as `acceptanceCriteria.${number}.verification`;
  const statementAnalysis = analyzeAcceptanceCriterionStatement(criterion);

  if (typeof criterion === "string") {
    const verificationAnalysis = analyzeAcceptanceCriterionVerificationMode(criterion);
    return [
      ...(statementAnalysis.normalizedStatement === undefined
        ? [
            malformedIntentDraftFieldFailure(common, {
              code: "malformed-acceptance-criterion",
              fieldPath: `${criterionPath}.statement` as IntentDraftFieldPath,
              message: statementAnalysis.emptyAfterNormalization
                ? `${criterionPath}.statement is empty after normalization.`
                : `${criterionPath}.statement must be a non-empty string.`
            })
          ]
        : []),
      ...verificationAnalysis.issues.map((issue) =>
        malformedIntentDraftFieldFailure(common, {
          code: issue.code === "invalid-verification-mode" ? "malformed-verification-mode" : issue.code,
          fieldPath: verificationFieldPath,
          message: acceptanceCriterionVerificationModeMessage(verificationFieldPath, issue)
        })
      )
    ];
  }

  if (!isRecord(criterion)) {
    return [
      malformedIntentDraftFieldFailure(common, {
        code: "malformed-acceptance-criterion",
        fieldPath: criterionPath,
        message: `${criterionPath} must be an object with statement and verification fields.`
      })
    ];
  }

  const failures: IntentDraftPresenceValidationFailure[] = [];
  const verificationAnalysis = analyzeAcceptanceCriterionVerificationMode(criterion);
  if (statementAnalysis.normalizedStatement === undefined) {
    failures.push(
      malformedIntentDraftFieldFailure(common, {
        code: "malformed-acceptance-criterion",
        fieldPath: `${criterionPath}.statement` as IntentDraftFieldPath,
        message: statementAnalysis.emptyAfterNormalization
          ? `${criterionPath}.statement is empty after normalization.`
          : `${criterionPath}.statement must be a non-empty string.`
      })
    );
  }

  failures.push(
    ...verificationAnalysis.issues.map((issue) =>
      malformedIntentDraftFieldFailure(common, {
        code: issue.code === "invalid-verification-mode" ? "malformed-verification-mode" : issue.code,
        fieldPath: verificationFieldPath,
        message: acceptanceCriterionVerificationModeMessage(verificationFieldPath, issue)
      })
    )
  );

  if (
    criterion["justification"] !== undefined &&
    verificationAnalysis.mode !== "manual" &&
    typeof criterion["justification"] !== "string"
  ) {
    failures.push(
      malformedIntentDraftFieldFailure(common, {
        code: "malformed-acceptance-criterion",
        fieldPath: `${criterionPath}.justification` as IntentDraftFieldPath,
        message: `${criterionPath}.justification must be a string when provided.`
      })
    );
  }

  return failures;
}

function validateRequiredRepoScopesField(
  envelope: unknown,
  common: IntentDraftValidationFailureCommon,
  mode: IntentAmbiguityMode
): readonly IntentDraftPresenceValidationFailure[] {
  const fieldPath = "capabilityEnvelope.repoScopes";
  if (envelope === undefined) {
    return [missingIntentDraftFieldFailure(common, fieldPath, mode)];
  }
  if (!isRecord(envelope)) {
    return [malformedCapabilityEnvelopeFailure(common, fieldPath)];
  }

  const value = envelope["repoScopes"];
  if (value === undefined) {
    return [missingIntentDraftFieldFailure(common, fieldPath, mode)];
  }
  if (!Array.isArray(value)) {
    return [
      malformedIntentDraftFieldFailure(common, {
        code: "malformed-repo-scope",
        fieldPath,
        message: "capabilityEnvelope.repoScopes must be an array of repository scope grants."
      })
    ];
  }
  if (value.length === 0) {
    return [missingIntentDraftFieldFailure(common, fieldPath, mode)];
  }

  return value.flatMap((scope, index): readonly IntentDraftPresenceValidationFailure[] =>
    validateRepoScopeEntry(scope, index, common)
  );
}

function validateRepoScopeEntry(
  scope: unknown,
  index: number,
  common: IntentDraftValidationFailureCommon
): readonly IntentDraftPresenceValidationFailure[] {
  const scopePath = `capabilityEnvelope.repoScopes.${index}` as IntentDraftFieldPath;
  if (!isRecord(scope)) {
    return [
      malformedIntentDraftFieldFailure(common, {
        code: "malformed-repo-scope",
        fieldPath: scopePath,
        message: `${scopePath} must be an object with workspace, path, and access fields.`
      })
    ];
  }

  const failures: IntentDraftPresenceValidationFailure[] = [];
  if (!hasNonEmptyText(scope["workspace"])) {
    failures.push(
      malformedIntentDraftFieldFailure(common, {
        code: "malformed-repo-scope",
        fieldPath: `${scopePath}.workspace` as IntentDraftFieldPath,
        message: `${scopePath}.workspace must be a non-empty string.`
      })
    );
  }
  if (!hasNonEmptyText(scope["path"])) {
    failures.push(
      malformedIntentDraftFieldFailure(common, {
        code: "malformed-repo-scope",
        fieldPath: `${scopePath}.path` as IntentDraftFieldPath,
        message: `${scopePath}.path must be a non-empty string.`
      })
    );
  }
  if (!isRepoAccess(scope["access"])) {
    failures.push(
      malformedIntentDraftFieldFailure(common, {
        code: "malformed-repo-scope",
        fieldPath: `${scopePath}.access` as IntentDraftFieldPath,
        message: `${scopePath}.access must be read, write, or execute.`
      })
    );
  }

  return failures;
}

function validateRequiredToolPermissionsField(
  envelope: unknown,
  common: IntentDraftValidationFailureCommon,
  mode: IntentAmbiguityMode
): readonly IntentDraftPresenceValidationFailure[] {
  const fieldPath = "capabilityEnvelope.toolPermissions";
  if (envelope === undefined) {
    return [missingIntentDraftFieldFailure(common, fieldPath, mode)];
  }
  if (!isRecord(envelope)) {
    return [malformedCapabilityEnvelopeFailure(common, fieldPath)];
  }

  const value = envelope["toolPermissions"];
  if (value === undefined) {
    return [missingIntentDraftFieldFailure(common, fieldPath, mode)];
  }
  if (!Array.isArray(value)) {
    return [
      malformedIntentDraftFieldFailure(common, {
        code: "malformed-tool-permission",
        fieldPath,
        message: "capabilityEnvelope.toolPermissions must be an array of tool permission grants."
      })
    ];
  }
  if (value.length === 0) {
    return [missingIntentDraftFieldFailure(common, fieldPath, mode)];
  }

  return value.flatMap((grant, index): readonly IntentDraftPresenceValidationFailure[] =>
    validateToolPermissionEntry(grant, index, common)
  );
}

function validateToolPermissionEntry(
  grant: unknown,
  index: number,
  common: IntentDraftValidationFailureCommon
): readonly IntentDraftPresenceValidationFailure[] {
  const grantPath = `capabilityEnvelope.toolPermissions.${index}` as IntentDraftFieldPath;
  if (!isRecord(grant)) {
    return [
      malformedIntentDraftFieldFailure(common, {
        code: "malformed-tool-permission",
        fieldPath: grantPath,
        message: `${grantPath} must be an object with tool, reason, and risk fields.`
      })
    ];
  }

  const failures: IntentDraftPresenceValidationFailure[] = [];
  if (!hasNonEmptyText(grant["tool"])) {
    failures.push(
      malformedIntentDraftFieldFailure(common, {
        code: "malformed-tool-permission",
        fieldPath: `${grantPath}.tool` as IntentDraftFieldPath,
        message: `${grantPath}.tool must be a non-empty string.`
      })
    );
  }
  if (!hasNonEmptyText(grant["reason"])) {
    failures.push(
      malformedIntentDraftFieldFailure(common, {
        code: "malformed-tool-permission",
        fieldPath: `${grantPath}.reason` as IntentDraftFieldPath,
        message: `${grantPath}.reason must be a non-empty string.`
      })
    );
  }
  if (!isRiskLevel(grant["risk"])) {
    failures.push(
      malformedIntentDraftFieldFailure(common, {
        code: "malformed-tool-permission",
        fieldPath: `${grantPath}.risk` as IntentDraftFieldPath,
        message: `${grantPath}.risk must be low, medium, or high.`
      })
    );
  }

  return failures;
}

function validateRequiredBudgetField(
  envelope: unknown,
  common: IntentDraftValidationFailureCommon,
  mode: IntentAmbiguityMode
): readonly IntentDraftPresenceValidationFailure[] {
  const fieldPath = "capabilityEnvelope.budget";
  if (envelope === undefined) {
    return [missingIntentDraftFieldFailure(common, fieldPath, mode)];
  }
  if (!isRecord(envelope)) {
    return [malformedCapabilityEnvelopeFailure(common, fieldPath)];
  }

  const value = envelope["budget"];
  if (value === undefined) {
    return [missingIntentDraftFieldFailure(common, fieldPath, mode)];
  }
  if (!isRecord(value)) {
    return [
      malformedIntentDraftFieldFailure(common, {
        code: "malformed-budget",
        fieldPath,
        message: "capabilityEnvelope.budget must be an object with non-negative finite budget limits."
      })
    ];
  }

  const fieldFailures = BUDGET_LIMIT_FIELDS.flatMap((field): IntentDraftPresenceValidationFailure[] => {
    const budgetValue = value[field];
    if (budgetValue === undefined || isValidBudgetLimitValue(budgetValue)) {
      return [];
    }

    return [
      malformedIntentDraftFieldFailure(common, {
        code: "malformed-budget-limit",
        fieldPath: `capabilityEnvelope.budget.${field}` as BudgetLimitFieldPath,
        message: `capabilityEnvelope.budget.${field} must be a non-negative finite number.`
      })
    ];
  });

  if (hasBudgetLimit(value as IntentDraftCapabilityEnvelope["budget"])) {
    return fieldFailures;
  }

  return fieldFailures.length > 0
    ? fieldFailures
    : [
        malformedIntentDraftFieldFailure(common, {
          code: "malformed-budget-limit",
          fieldPath,
          message: "capabilityEnvelope.budget must contain at least one non-negative finite limit."
        })
      ];
}

function missingIntentDraftFieldFailure(
  common: IntentDraftValidationFailureCommon,
  fieldPath: IntentDraftFieldPath,
  mode: IntentAmbiguityMode
): IntentDraftPresenceValidationFailure {
  return {
    code: "missing-required-field",
    kind: "missing",
    checklistIndex: common.checklistIndex,
    fieldPath,
    dimensionId: common.entry.dimensionId,
    label: common.entry.label,
    wellFormedness: common.entry.wellFormedness,
    message: requiredIntentDraftFieldMessage(fieldPath, mode)
  };
}

function malformedCapabilityEnvelopeFailure(
  common: IntentDraftValidationFailureCommon,
  fieldPath: IntentDraftFieldPath
): IntentDraftPresenceValidationFailure {
  return malformedIntentDraftFieldFailure(common, {
    code: "malformed-capability-envelope",
    fieldPath,
    message: "capabilityEnvelope must be an object before capability envelope fields can be validated."
  });
}

function malformedIntentDraftFieldFailure(
  common: IntentDraftValidationFailureCommon,
  failure: {
    readonly code: IntentDraftMalformedFieldFailureCode;
    readonly fieldPath: IntentDraftFieldPath;
    readonly message: string;
  }
): IntentDraftPresenceValidationFailure {
  return {
    code: failure.code,
    kind: "malformed",
    checklistIndex: common.checklistIndex,
    fieldPath: failure.fieldPath,
    dimensionId: common.entry.dimensionId,
    label: common.entry.label,
    wellFormedness: common.entry.wellFormedness,
    message: failure.message
  };
}

export function evaluateIntentDraftCompleteness(
  input: EvaluateIntentDraftCompletenessInput
): IntentDraftCompletenessReport {
  const mode = input.mode ?? input.draft.mode ?? "brownfield";
  const presenceValidation = validateIntentDraftPresence({ draft: input.draft, mode });
  const fieldChecks = presenceValidation.checks;
  const fieldCheckByPath = new Map(fieldChecks.map((check) => [check.fieldPath, check]));
  const dimensions = requiredIntentDraftDimensions(mode).map((dimension): IntentDraftRequiredDimensionCheck => {
    const missingFields = dimension.requiredFields.filter(
      (fieldPath) => fieldCheckByPath.get(fieldPath)?.passed !== true
    );

    return {
      dimensionId: dimension.id,
      label: dimension.label,
      requiredFields: dimension.requiredFields,
      missingFields,
      passed: missingFields.length === 0,
      message: missingFields.length === 0 ? `${dimension.label} dimension is complete.` : dimension.missingMessage
    };
  });
  const missingDimensions = dimensions
    .filter((dimension) => !dimension.passed)
    .map((dimension) => dimension.dimensionId);
  const missingFields = fieldChecks
    .filter((check) => !check.passed)
    .map((check) => check.fieldPath);

  return {
    mode,
    complete: missingDimensions.length === 0,
    dimensions,
    missingDimensions,
    missingFields,
    malformedFields: presenceValidation.malformedFields,
    fieldChecks,
    presenceValidation,
    presenceFailures: presenceValidation.failures
  };
}

export function detectMissingIntentDraftFields(
  input: DetectMissingIntentDraftFieldsInput
): DetectMissingIntentDraftFieldsOutput {
  return evaluateIntentDraftCompleteness(input);
}

function requiredIntentDraftFieldMessage(fieldPath: IntentDraftFieldPath, mode: IntentAmbiguityMode): string {
  const checklistEntry = requiredIntentDraftFieldChecklist(mode).find((entry) => entry.fieldPath === fieldPath);
  if (checklistEntry !== undefined) {
    return checklistEntry.failureMessage;
  }

  switch (fieldPath) {
    case "title":
      return "title must be provided before promotion.";
    case "problem":
      return "problem must be provided before promotion.";
    case "requester":
      return "requester must be provided before promotion.";
    case "goalArchetype":
      return "goalArchetype must be provided before promotion.";
    case "acceptanceCriteria":
      return "acceptanceCriteria must contain at least one entry before promotion.";
    case "constraints":
      return "constraints must contain at least one non-empty entry before promotion.";
    case "stopConditions":
      return "stopConditions must define a deterministic halt, pause, or escalation condition before promotion.";
    case "capabilityEnvelope.repoScopes":
      return "capabilityEnvelope.repoScopes must contain at least one repository scope before promotion.";
    case "capabilityEnvelope.toolPermissions":
      return "capabilityEnvelope.toolPermissions must contain at least one tool grant before promotion.";
    case "capabilityEnvelope.budget":
      return "capabilityEnvelope.budget must contain at least one non-negative finite limit before promotion.";
    case "capabilityEnvelope.budget.maxUsd":
    case "capabilityEnvelope.budget.maxTokens":
    case "capabilityEnvelope.budget.timeoutMs":
    case "capabilityEnvelope.budget.maxRepairLoops":
      return `${fieldPath} must be a non-negative finite number before promotion.`;
    case "context":
      return mode === "brownfield"
        ? "context must be provided for brownfield promotion."
        : "context must be provided before promotion.";
    default:
      return `${fieldPath} must be provided before promotion.`;
  }
}

export function isDraftFieldMissing(draft: IntentDraft, fieldPath: IntentDraftFieldPath): boolean {
  switch (fieldPath) {
    case "title":
      return !hasNonEmptyText(draft.title);
    case "problem":
      return !hasNonEmptyText(draft.problem);
    case "requester":
      return !hasNonEmptyText(draft.requester);
    case "goalArchetype":
      return !hasNonEmptyText(draft.goalArchetype);
    case "context":
      return !hasNonEmptyText(draft.context);
    case "constraints":
      return !Array.isArray(draft.constraints) || !draft.constraints.some(hasNonEmptyText);
    case "stopConditions":
      return classifyStopConditionIssue(draft) === "missing";
    case "acceptanceCriteria":
      return !Array.isArray(draft.acceptanceCriteria) || draft.acceptanceCriteria.length === 0;
    case "capabilityEnvelope":
      return draft.capabilityEnvelope === undefined;
    case "capabilityEnvelope.repoScopes":
      return !Array.isArray(draft.capabilityEnvelope?.repoScopes) || draft.capabilityEnvelope.repoScopes.length === 0;
    case "capabilityEnvelope.toolPermissions":
      return (
        !Array.isArray(draft.capabilityEnvelope?.toolPermissions) ||
        draft.capabilityEnvelope.toolPermissions.length === 0
      );
    case "capabilityEnvelope.budget":
      return !hasBudgetLimit(draft.capabilityEnvelope?.budget);
    case "capabilityEnvelope.authorityJustification":
      return !hasNonEmptyText(draft.capabilityEnvelope?.authorityJustification);
    default:
      return isDynamicDraftFieldMissing(draft, fieldPath);
  }
}

function isDynamicDraftFieldMissing(draft: IntentDraft, fieldPath: IntentDraftFieldPath): boolean {
  const parts = fieldPath.split(".");

  if (parts[0] === "acceptanceCriteria") {
    const index = Number(parts[1]);
    if (!Number.isInteger(index) || index < 0) {
      return false;
    }

    const criterion = draft.acceptanceCriteria?.[index];
    if (criterion === undefined) {
      return true;
    }

    if (parts[2] === "statement") {
      return analyzeAcceptanceCriterionStatement(criterion).normalizedStatement === undefined;
    }
    if (parts[2] === "verification") {
      return analyzeAcceptanceCriterionVerificationMode(criterion).issues.length > 0;
    }
    if (parts[2] === "justification") {
      return typeof criterion === "string" || !hasNonEmptyText(criterion.justification);
    }
  }

  if (parts[0] === "stopConditions") {
    const index = Number(parts[1]);
    if (!Number.isInteger(index) || index < 0) {
      return false;
    }

    const stopCondition = draft.stopConditions?.[index];
    return !hasNonEmptyText(stopCondition);
  }

  if (parts[0] === "capabilityEnvelope" && parts[1] === "repoScopes") {
    const scopeIndex = Number(parts[2]);
    if (!Number.isInteger(scopeIndex) || scopeIndex < 0) {
      return false;
    }

    const scope = draft.capabilityEnvelope?.repoScopes?.[scopeIndex];
    if (scope === undefined) {
      return true;
    }
    if (parts[3] === "workspace") {
      return !hasNonEmptyText(scope.workspace);
    }
    if (parts[3] === "path") {
      return !hasNonEmptyText(scope.path);
    }
    if (parts[3] === "access") {
      return !isRepoAccess(scope.access);
    }
  }

  if (parts[0] === "capabilityEnvelope" && parts[1] === "toolPermissions") {
    const grantIndex = Number(parts[2]);
    if (!Number.isInteger(grantIndex) || grantIndex < 0) {
      return false;
    }

    const grant = draft.capabilityEnvelope?.toolPermissions?.[grantIndex];
    if (grant === undefined) {
      return true;
    }
    if (parts[3] === "tool") {
      return !hasNonEmptyText(grant.tool);
    }
    if (parts[3] === "reason") {
      return !hasNonEmptyText(grant.reason);
    }
    if (parts[3] === "risk") {
      return !isRiskLevel(grant.risk);
    }
  }

  if (parts[0] === "capabilityEnvelope" && parts[1] === "budget") {
    const budget = draft.capabilityEnvelope?.budget;
    const field = parts[2];
    if (budget === undefined || !isBudgetLimitField(field)) {
      return false;
    }

    return !isValidBudgetLimitValue(budget[field]);
  }

  return false;
}

function isBudgetLimitField(value: string | undefined): value is BudgetLimitField {
  return BUDGET_LIMIT_FIELDS.some((field) => field === value);
}
