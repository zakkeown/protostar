import type {
  ACCEPTANCE_CRITERION_ID_HASH_ALGORITHM,
  ACCEPTANCE_CRITERION_ID_HASH_LENGTH,
  AcceptanceCriterion,
  AcceptanceCriterionTextNormalizationRule,
  AcceptanceCriterionTextNormalizationRuleId,
  AcceptanceCriterionDiagnostic,
  AcceptanceCriterionId,
  ManualAcceptanceCriterion,
  NonManualAcceptanceCriterion,
  NonManualAcceptanceCriterionVerificationMode,
  createAcceptanceCriterionId,
  createAcceptanceCriterionIdHashInput,
  IntentDraftAcceptanceCriterion,
  NormalizeAcceptanceCriteriaInput,
  NormalizeAcceptanceCriteriaDiagnostic,
  NormalizeAcceptanceCriteriaDiagnosticCode,
  NormalizeAcceptanceCriteriaDiagnosticSeverity,
  NormalizeAcceptanceCriteriaFieldPath,
  NormalizeAcceptanceCriteriaOutput,
  NormalizedAcceptanceCriteriaResult,
  NormalizedAcceptanceCriterion,
  normalizeAcceptanceCriterionText,
  normalizeAcceptanceCriteria
} from "./index.js";

type Assert<T extends true> = T;

type IfEquals<X, Y, Then = true, Else = false> = (<T>() => T extends X ? 1 : 2) extends <
  T
>() => T extends Y ? 1 : 2
  ? Then
  : Else;

type KeysEqual<T, Expected extends PropertyKey> = IfEquals<keyof T, Expected>;

type IsOptionalKey<T, Key extends keyof T> = Record<string, never> extends Pick<T, Key> ? true : false;

export type NormalizedAcceptanceCriteriaResultAliasContract = Assert<
  IfEquals<NormalizedAcceptanceCriteriaResult, NormalizeAcceptanceCriteriaOutput>
>;

export type NormalizeAcceptanceCriteriaInputContract = Assert<
  IfEquals<NormalizeAcceptanceCriteriaInput, readonly (string | IntentDraftAcceptanceCriterion)[] | undefined>
>;

export type AcceptanceCriterionTextNormalizationRuleContract = Assert<
  IfEquals<
    AcceptanceCriterionTextNormalizationRule,
    {
      readonly id: AcceptanceCriterionTextNormalizationRuleId;
      readonly description: string;
    }
  >
>;

export type AcceptanceCriterionTextNormalizationRuleIdContract = Assert<
  IfEquals<
    AcceptanceCriterionTextNormalizationRuleId,
    | "unicode-compatibility"
    | "whitespace-to-ascii-space"
    | "collapse-whitespace"
    | "trim-boundary-whitespace"
    | "empty-to-missing"
  >
>;

export type NormalizeAcceptanceCriterionTextFunctionContract = Assert<
  IfEquals<typeof normalizeAcceptanceCriterionText, (value: string | undefined) => string | undefined>
>;

export type CreateAcceptanceCriterionIdFunctionContract = Assert<
  IfEquals<typeof createAcceptanceCriterionId, (statement: string, ordinalIndex: number) => AcceptanceCriterionId>
>;

export type CreateAcceptanceCriterionIdHashInputFunctionContract = Assert<
  IfEquals<typeof createAcceptanceCriterionIdHashInput, (statement: string, ordinalIndex: number) => string>
>;

export type AcceptanceCriterionIdHashAlgorithmContract = Assert<
  IfEquals<typeof ACCEPTANCE_CRITERION_ID_HASH_ALGORITHM, "sha256">
>;

export type AcceptanceCriterionIdHashLengthContract = Assert<
  IfEquals<typeof ACCEPTANCE_CRITERION_ID_HASH_LENGTH, 16>
>;

export type NonManualAcceptanceCriterionVerificationModeContract = Assert<
  IfEquals<NonManualAcceptanceCriterionVerificationMode, "test" | "evidence">
>;

export type ManualAcceptanceCriterionContract = Assert<
  IfEquals<
    ManualAcceptanceCriterion,
    {
      readonly id: AcceptanceCriterionId;
      readonly statement: string;
      readonly verification: "manual";
      readonly justification: string;
    }
  >
>;

export type NonManualAcceptanceCriterionJustificationContract = Assert<
  IsOptionalKey<NonManualAcceptanceCriterion, "justification">
>;

export type AcceptanceCriterionContract = Assert<
  IfEquals<AcceptanceCriterion, NonManualAcceptanceCriterion | ManualAcceptanceCriterion>
>;

export type NormalizeAcceptanceCriteriaFunctionContract = Assert<
  IfEquals<
    typeof normalizeAcceptanceCriteria,
    (criteria: NormalizeAcceptanceCriteriaInput) => NormalizeAcceptanceCriteriaOutput
  >
>;

export type NormalizeAcceptanceCriteriaOutputShapeContract = Assert<
  KeysEqual<
    NormalizeAcceptanceCriteriaOutput,
    "ok" | "acceptanceCriteria" | "weakAcceptanceCriteria" | "diagnostics" | "errors"
  >
>;

export type NormalizeAcceptanceCriteriaOutputCoreContract = Assert<
  IfEquals<
    Pick<NormalizeAcceptanceCriteriaOutput, "ok" | "acceptanceCriteria" | "diagnostics" | "errors">,
    {
      readonly ok: boolean;
      readonly acceptanceCriteria: readonly NormalizedAcceptanceCriterion[];
      readonly diagnostics: readonly NormalizeAcceptanceCriteriaDiagnostic[];
      readonly errors: readonly string[];
    }
  >
>;

export type AcceptanceCriterionDiagnosticAliasContract = Assert<
  IfEquals<AcceptanceCriterionDiagnostic, NormalizeAcceptanceCriteriaDiagnostic>
>;

export type NormalizeAcceptanceCriteriaDiagnosticShapeContract = Assert<
  KeysEqual<
    NormalizeAcceptanceCriteriaDiagnostic,
    "code" | "severity" | "fieldPath" | "message" | "index" | "criterionId" | "normalizationRuleId"
  >
>;

export type NormalizeAcceptanceCriteriaDiagnosticCoreContract = Assert<
  IfEquals<
    Pick<NormalizeAcceptanceCriteriaDiagnostic, "code" | "severity" | "fieldPath" | "message">,
    {
      readonly code: NormalizeAcceptanceCriteriaDiagnosticCode;
      readonly severity: NormalizeAcceptanceCriteriaDiagnosticSeverity;
      readonly fieldPath: NormalizeAcceptanceCriteriaFieldPath;
      readonly message: string;
    }
  >
>;

export type NormalizeAcceptanceCriteriaDiagnosticOptionalContract = Assert<
  IfEquals<
    Pick<NormalizeAcceptanceCriteriaDiagnostic, "index" | "criterionId" | "normalizationRuleId">,
    {
      readonly index?: number;
      readonly criterionId?: AcceptanceCriterionId;
      readonly normalizationRuleId?: AcceptanceCriterionTextNormalizationRuleId;
    }
  >
>;

export type NormalizeAcceptanceCriteriaDiagnosticCodeContract = Assert<
  IfEquals<
    NormalizeAcceptanceCriteriaDiagnosticCode,
    | "missing-acceptance-criteria"
    | "missing-statement"
    | "empty-after-normalization"
    | "duplicate-acceptance-criterion"
    | "missing-verification-mode"
    | "invalid-verification-mode"
    | "multiple-verification-modes"
    | "manual-without-justification"
  >
>;

export type NormalizeAcceptanceCriteriaDiagnosticSeverityContract = Assert<
  IfEquals<NormalizeAcceptanceCriteriaDiagnosticSeverity, "error" | "weak">
>;

export type NormalizeAcceptanceCriteriaFieldPathContract = Assert<
  IfEquals<
    NormalizeAcceptanceCriteriaFieldPath,
    | "acceptanceCriteria"
    | `acceptanceCriteria.${number}.statement`
    | `acceptanceCriteria.${number}.verification`
    | `acceptanceCriteria.${number}.justification`
  >
>;
