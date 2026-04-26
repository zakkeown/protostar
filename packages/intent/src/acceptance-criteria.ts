import { createHash } from "node:crypto";

import { ACCEPTANCE_CRITERION_ID_HASH_ALGORITHM, ACCEPTANCE_CRITERION_ID_HASH_LENGTH, ACCEPTANCE_CRITERION_VERIFICATION_MODES } from "./models.js";

import type { AcceptanceCriterion, AcceptanceCriterionId, AcceptanceCriterionVerificationMode, AcceptanceCriterionWeakness, ManualAcceptanceCriterionJustificationValidation, NormalizeAcceptanceCriteriaDiagnostic, NormalizeAcceptanceCriteriaInput, NormalizeAcceptanceCriteriaOutput, NormalizedAcceptanceCriterion } from "./models.js";

import { isRecord, normalizeOptionalText, readString } from "./shared.js";

type AcceptanceCriterionVerificationModeIssueCode =
  | "missing-verification-mode"
  | "invalid-verification-mode"
  | "multiple-verification-modes";

interface AcceptanceCriterionVerificationModeIssue {
  readonly code: AcceptanceCriterionVerificationModeIssueCode;
  readonly count: number;
}

interface AcceptanceCriterionVerificationModeAnalysis {
  readonly mode?: AcceptanceCriterionVerificationMode;
  readonly issues: readonly AcceptanceCriterionVerificationModeIssue[];
}

interface AcceptanceCriterionNormalizedStatementOccurrence {
  readonly criterionId: AcceptanceCriterionId;
  readonly index: number;
}

export function normalizeAcceptanceCriterionText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function validateManualAcceptanceCriterionJustification(
  value: unknown
): ManualAcceptanceCriterionJustificationValidation {
  if (value === undefined) {
    return {
      justified: false,
      manualUnjustified: true,
      invalidReason: "missing"
    };
  }
  if (typeof value !== "string") {
    return {
      justified: false,
      manualUnjustified: true,
      invalidReason: "invalid"
    };
  }

  const normalizedJustification = normalizeOptionalText(value);
  if (normalizedJustification === undefined) {
    return {
      justified: false,
      manualUnjustified: true,
      invalidReason: "blank"
    };
  }

  return {
    justified: true,
    manualUnjustified: false,
    normalizedJustification
  };
}

export function normalizeAcceptanceCriteria(
  criteria: NormalizeAcceptanceCriteriaInput
): NormalizeAcceptanceCriteriaOutput {
  const errors: string[] = [];
  const diagnostics: NormalizeAcceptanceCriteriaDiagnostic[] = [];
  const weakAcceptanceCriteria: AcceptanceCriterionWeakness[] = [];
  const normalizedStatementOccurrences = new Map<string, AcceptanceCriterionNormalizedStatementOccurrence>();

  if (!Array.isArray(criteria) || criteria.length === 0) {
    const diagnostic: NormalizeAcceptanceCriteriaDiagnostic = {
      code: "missing-acceptance-criteria",
      severity: "error",
      fieldPath: "acceptanceCriteria",
      message: "acceptanceCriteria must contain at least one entry."
    };

    return {
      ok: false,
      acceptanceCriteria: [],
      weakAcceptanceCriteria: [],
      diagnostics: [diagnostic],
      errors: [diagnostic.message]
    };
  }

  const acceptanceCriteria = criteria.flatMap((criterion, index): NormalizedAcceptanceCriterion[] => {
    const statementAnalysis = analyzeAcceptanceCriterionStatement(criterion);
    const statement = statementAnalysis.normalizedStatement;
    const verificationAnalysis = analyzeAcceptanceCriterionVerificationMode(criterion);
    const verification = verificationAnalysis.mode;
    const justificationValidation = validateManualAcceptanceCriterionJustification(
      typeof criterion === "string" ? undefined : criterion.justification
    );
    const justification = justificationValidation.normalizedJustification;
    const verificationFieldPath = `acceptanceCriteria.${index}.verification` as const;
    let duplicateOf: AcceptanceCriterionNormalizedStatementOccurrence | undefined;

    if (statement === undefined) {
      const diagnostic: NormalizeAcceptanceCriteriaDiagnostic = {
        code: statementAnalysis.emptyAfterNormalization ? "empty-after-normalization" : "missing-statement",
        severity: "error",
        index,
        fieldPath: `acceptanceCriteria.${index}.statement`,
        message: statementAnalysis.emptyAfterNormalization
          ? `acceptanceCriteria.${index}.statement is empty after normalization.`
          : `acceptanceCriteria.${index}.statement must be provided.`,
        ...(statementAnalysis.emptyAfterNormalization ? { normalizationRuleId: "empty-to-missing" as const } : {})
      };
      diagnostics.push(diagnostic);
      errors.push(diagnostic.message);
    }
    for (const issue of verificationAnalysis.issues) {
      const diagnostic: NormalizeAcceptanceCriteriaDiagnostic = {
        code: issue.code,
        severity: "error",
        index,
        fieldPath: verificationFieldPath,
        message: acceptanceCriterionVerificationModeMessage(verificationFieldPath, issue)
      };
      diagnostics.push(diagnostic);
      errors.push(diagnostic.message);
    }
    const id = statement === undefined ? undefined : createAcceptanceCriterionId(statement, index);
    if (statement !== undefined && id !== undefined) {
      duplicateOf = normalizedStatementOccurrences.get(statement);
      if (duplicateOf === undefined) {
        normalizedStatementOccurrences.set(statement, {
          criterionId: id,
          index
        });
      } else {
        diagnostics.push({
          code: "duplicate-acceptance-criterion",
          severity: "weak",
          index,
          criterionId: id,
          fieldPath: `acceptanceCriteria.${index}.statement`,
          message: duplicateAcceptanceCriterionMessage(index, duplicateOf.index)
        });
      }
    }

    if (statement === undefined || id === undefined || verification === undefined || verificationAnalysis.issues.length > 0) {
      return [];
    }

    if (duplicateOf !== undefined) {
      return [];
    }

    const weak = verification === "manual" && justificationValidation.manualUnjustified;

    if (weak) {
      const weakness: AcceptanceCriterionWeakness = {
        criterionId: id,
        index,
        fieldPath: `acceptanceCriteria.${index}.justification`,
        reason: "manual-without-justification",
        message: `acceptanceCriteria.${index}.justification is required when verification is manual.`
      };
      weakAcceptanceCriteria.push(weakness);
      diagnostics.push({
        code: "manual-without-justification",
        severity: "weak",
        index,
        criterionId: id,
        fieldPath: weakness.fieldPath,
        message: weakness.message
      });
    }

    if (verification === "manual") {
      return [
        {
          id,
          statement,
          verification: "manual",
          justification: justification ?? "",
          weak
        }
      ];
    }

    return [
      {
        id,
        statement,
        verification,
        ...(justification !== undefined ? { justification } : {}),
        weak
      }
    ];
  });

  return {
    ok: errors.length === 0,
    acceptanceCriteria,
    weakAcceptanceCriteria,
    diagnostics,
    errors
  };
}

interface AcceptanceCriterionStatementAnalysis {
  readonly normalizedStatement?: string;
  readonly emptyAfterNormalization: boolean;
}

export function analyzeAcceptanceCriterionStatement(criterion: unknown): AcceptanceCriterionStatementAnalysis {
  if (typeof criterion === "string") {
    return analyzeAcceptanceCriterionStatementText(criterion);
  }

  if (!isRecord(criterion)) {
    return {
      emptyAfterNormalization: false
    };
  }

  const statement = criterion["statement"];
  if (typeof statement === "string") {
    const statementAnalysis = analyzeAcceptanceCriterionStatementText(statement);
    if (statementAnalysis.normalizedStatement !== undefined) {
      return statementAnalysis;
    }
  }

  const text = criterion["text"];
  if (typeof text === "string") {
    const textAnalysis = analyzeAcceptanceCriterionStatementText(text);
    if (textAnalysis.normalizedStatement !== undefined || typeof statement !== "string") {
      return textAnalysis;
    }
  }

  return {
    emptyAfterNormalization: typeof statement === "string"
  };
}

function analyzeAcceptanceCriterionStatementText(value: string): AcceptanceCriterionStatementAnalysis {
  const normalizedStatement = normalizeAcceptanceCriterionStatement(value);
  return {
    ...(normalizedStatement !== undefined ? { normalizedStatement } : {}),
    emptyAfterNormalization: normalizedStatement === undefined
  };
}

const ACCEPTANCE_CRITERION_SCALAR_VERIFICATION_FIELDS = [
  "verification",
  "verificationMode",
  "verification_mode",
  "mode"
] as const;

const ACCEPTANCE_CRITERION_LIST_VERIFICATION_FIELDS = [
  "verificationModes",
  "verification_modes",
  "modes"
] as const;

export function analyzeAcceptanceCriterionVerificationMode(
  criterion: unknown
): AcceptanceCriterionVerificationModeAnalysis {
  const values = acceptanceCriterionVerificationModeValues(criterion);
  const issues: AcceptanceCriterionVerificationModeIssue[] = [];
  const invalidCount = values.filter((value) => !isDraftVerification(value)).length;

  if (values.length === 0) {
    issues.push({
      code: "missing-verification-mode",
      count: 0
    });
  }
  if (values.length > 1) {
    issues.push({
      code: "multiple-verification-modes",
      count: values.length
    });
  }
  if (invalidCount > 0) {
    issues.push({
      code: "invalid-verification-mode",
      count: invalidCount
    });
  }

  if (issues.length > 0 || values.length !== 1 || !isDraftVerification(values[0])) {
    return {
      issues
    };
  }

  return {
    mode: values[0],
    issues: []
  };
}

function acceptanceCriterionVerificationModeValues(criterion: unknown): readonly unknown[] {
  if (!isRecord(criterion)) {
    return [];
  }

  const values: unknown[] = [];

  for (const field of ACCEPTANCE_CRITERION_SCALAR_VERIFICATION_FIELDS) {
    const value = criterion[field];
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      values.push(...value);
    } else {
      values.push(value);
    }
  }

  for (const field of ACCEPTANCE_CRITERION_LIST_VERIFICATION_FIELDS) {
    const value = criterion[field];
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      values.push(...value);
    } else {
      values.push(value);
    }
  }

  return values;
}

export function acceptanceCriterionVerificationModeMessage(
  fieldPath: `acceptanceCriteria.${number}.verification`,
  issue: AcceptanceCriterionVerificationModeIssue
): string {
  switch (issue.code) {
    case "missing-verification-mode":
      return `${fieldPath} must choose exactly one mode: ${formatAcceptanceCriterionVerificationModes()}.`;
    case "invalid-verification-mode":
      return `${fieldPath} must be ${formatAcceptanceCriterionVerificationModes()}.`;
    case "multiple-verification-modes":
      return `${fieldPath} must choose exactly one verification mode; received ${issue.count}.`;
  }
}

function duplicateAcceptanceCriterionMessage(index: number, duplicateOfIndex: number): string {
  return `acceptanceCriteria.${index}.statement duplicates acceptanceCriteria.${duplicateOfIndex}.statement after normalization.`;
}

function isDraftVerification(value: unknown): value is AcceptanceCriterionVerificationMode {
  return ACCEPTANCE_CRITERION_VERIFICATION_MODES.some((mode) => mode === value);
}

function formatAcceptanceCriterionVerificationModes(): string {
  const [first, second, third] = ACCEPTANCE_CRITERION_VERIFICATION_MODES;
  return `${first}, ${second}, or ${third}`;
}

export function createAcceptanceCriterionId(statement: string, ordinalIndex: number): AcceptanceCriterionId {
  const hashInput = createAcceptanceCriterionIdHashInput(statement, ordinalIndex);
  const digest = createHash(ACCEPTANCE_CRITERION_ID_HASH_ALGORITHM)
    .update(hashInput, "utf8")
    .digest("hex")
    .slice(0, ACCEPTANCE_CRITERION_ID_HASH_LENGTH);

  return `ac_${digest}` as AcceptanceCriterionId;
}

export function createAcceptanceCriterionIdHashInput(statement: string, ordinalIndex: number): string {
  const normalizedText = normalizeAcceptanceCriterionText(statement) ?? "";
  return JSON.stringify({
    normalizedText,
    ordinalIndex
  });
}

function normalizeAcceptanceCriterionStatement(value: string | undefined): string | undefined {
  return normalizeAcceptanceCriterionText(value);
}

export function parseAcceptanceCriteria(value: unknown, errors: string[]): readonly AcceptanceCriterion[] {
  if (!Array.isArray(value)) {
    errors.push("acceptanceCriteria must be an array.");
    return [];
  }

  return value.flatMap((entry, index): AcceptanceCriterion[] => {
    if (!isRecord(entry)) {
      errors.push(`acceptanceCriteria[${index}] must be an object.`);
      return [];
    }

    const id = readString(entry, `acceptanceCriteria[${index}].id`, errors);
    const statement = readString(entry, `acceptanceCriteria[${index}].statement`, errors);
    const verification = readString(entry, `acceptanceCriteria[${index}].verification`, errors);
    const justification = readAcceptanceCriterionJustification(entry, index, errors);

    if (id !== undefined && !id.startsWith("ac_")) {
      errors.push(`acceptanceCriteria[${index}].id must start with ac_.`);
    }
    if (verification !== undefined && !isVerification(verification)) {
      errors.push(`acceptanceCriteria[${index}].verification must be ${formatAcceptanceCriterionVerificationModes()}.`);
    }
    if (verification === "manual" && justification === undefined && entry["justification"] === undefined) {
      errors.push(`acceptanceCriteria[${index}].justification is required when verification is manual.`);
    }
    if (id === undefined || statement === undefined || !isVerification(verification)) {
      return [];
    }

    if (verification === "manual") {
      if (justification === undefined) {
        return [];
      }

      return [
        {
          id: id as AcceptanceCriterionId,
          statement,
          verification: "manual",
          justification
        }
      ];
    }

    return [
      {
        id: id as AcceptanceCriterionId,
        statement,
        verification,
        ...(justification !== undefined ? { justification } : {})
      }
    ];
  });
}

function readAcceptanceCriterionJustification(
  entry: Record<string, unknown>,
  index: number,
  errors: string[]
): string | undefined {
  const value = entry["justification"];
  if (value === undefined) {
    return undefined;
  }
  const normalized = normalizeOptionalText(value);
  if (normalized === undefined) {
    errors.push(`acceptanceCriteria[${index}].justification must be a non-empty string when provided.`);
    return undefined;
  }
  return normalized;
}

function isVerification(value: unknown): value is AcceptanceCriterionVerificationMode {
  return value === "test" || value === "evidence" || value === "manual";
}
