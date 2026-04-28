import type { IntentAmbiguityMode } from "./ambiguity-scoring.js";

export type IntentId = `intent_${string}`;

export type AcceptanceCriterionId = `ac_${string}`;

export type RiskLevel = "low" | "medium" | "high";

export type ToolPermissionLevel = "read" | "use" | "write" | "execute" | "admin";

export const TOOL_PERMISSION_LEVELS = [
  "read",
  "use",
  "write",
  "execute",
  "admin"
] as const satisfies readonly ToolPermissionLevel[];

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? {
          readonly [Key in keyof T]: DeepReadonly<T[Key]>;
        }
      : T;

export type IntentDraftId = `draft_${string}`;

export type AcceptanceCriterionVerificationMode = "test" | "evidence" | "manual";

export const ACCEPTANCE_CRITERION_VERIFICATION_MODES = [
  "test",
  "evidence",
  "manual"
] as const satisfies readonly AcceptanceCriterionVerificationMode[];

export type AcceptanceCriterionTextNormalizationRuleId =
  | "unicode-compatibility"
  | "whitespace-to-ascii-space"
  | "collapse-whitespace"
  | "trim-boundary-whitespace"
  | "empty-to-missing";

export const ACCEPTANCE_CRITERION_ID_HASH_ALGORITHM = "sha256";

export const ACCEPTANCE_CRITERION_ID_HASH_LENGTH = 16;

export interface AcceptanceCriterionTextNormalizationRule {
  readonly id: AcceptanceCriterionTextNormalizationRuleId;
  readonly description: string;
}

export const ACCEPTANCE_CRITERION_TEXT_NORMALIZATION_RULES = [
  {
    id: "unicode-compatibility",
    description: "Normalize acceptance-criterion text with Unicode NFKC compatibility normalization."
  },
  {
    id: "whitespace-to-ascii-space",
    description: "Convert every Unicode whitespace run to an ASCII space boundary."
  },
  {
    id: "collapse-whitespace",
    description: "Collapse adjacent whitespace boundaries to a single ASCII space."
  },
  {
    id: "trim-boundary-whitespace",
    description: "Remove leading and trailing whitespace after compatibility normalization."
  },
  {
    id: "empty-to-missing",
    description: "Treat text that is empty after normalization as a missing acceptance-criterion statement."
  }
] as const satisfies readonly AcceptanceCriterionTextNormalizationRule[];

export type IntentDraftAcceptanceCriterion = {
  text?: string;
  statement?: string;
  verification?: AcceptanceCriterionVerificationMode | readonly AcceptanceCriterionVerificationMode[];
  verificationMode?: AcceptanceCriterionVerificationMode;
  verificationModes?: readonly AcceptanceCriterionVerificationMode[];
  verification_mode?: AcceptanceCriterionVerificationMode;
  verification_modes?: readonly AcceptanceCriterionVerificationMode[];
  mode?: AcceptanceCriterionVerificationMode;
  modes?: readonly AcceptanceCriterionVerificationMode[];
  justification?: unknown;
};

export type NormalizeAcceptanceCriteriaInput = readonly (string | IntentDraftAcceptanceCriterion)[] | undefined;

export type IntentDraftRepoScopeGrant = {
  workspace?: string;
  path?: string;
  access?: "read" | "write" | "execute";
};

export type IntentDraftToolPermissionGrant = {
  tool?: string;
  permission?: ToolPermissionLevel | string;
  permissionLevel?: ToolPermissionLevel | string;
  level?: ToolPermissionLevel | string;
  reason?: string;
  risk?: RiskLevel;
};

export type IntentDraftExecuteGrant = {
  command?: string;
  scope?: string;
  executionScope?: string;
  reason?: string;
};

export type IntentDraftCapabilityEnvelope = {
  repoScopes?: readonly IntentDraftRepoScopeGrant[];
  toolPermissions?: readonly IntentDraftToolPermissionGrant[];
  executeGrants?: readonly IntentDraftExecuteGrant[];
  workspace?: {
    allowDirty?: boolean;
  };
  network?: {
    allow?: "none" | "loopback" | "allowlist";
    allowedHosts?: readonly string[];
  };
  budget?: {
    maxUsd?: number;
    maxTokens?: number;
    timeoutMs?: number;
    adapterRetriesPerTask?: number;
    taskWallClockMs?: number;
    deliveryWallClockMs?: number;
    maxRepairLoops?: number;
  };
  delivery?: {
    target?: {
      owner?: string;
      repo?: string;
      baseBranch?: string;
    };
  };
  authorityJustification?: string;
};

export type IntentDraft = {
  draftId?: IntentDraftId;
  title?: string;
  problem?: string;
  requester?: string;
  mode?: IntentAmbiguityMode;
  goalArchetype?: string;
  context?: string;
  constraints?: string[];
  stopConditions?: string[];
  acceptanceCriteria?: Array<string | IntentDraftAcceptanceCriterion>;
  capabilityEnvelope?: IntentDraftCapabilityEnvelope;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
};

export type NonManualAcceptanceCriterionVerificationMode = Exclude<
  AcceptanceCriterionVerificationMode,
  "manual"
>;

export interface AcceptanceCriterionBase {
  readonly id: AcceptanceCriterionId;
  readonly statement: string;
}

export interface NonManualAcceptanceCriterion extends AcceptanceCriterionBase {
  readonly verification: NonManualAcceptanceCriterionVerificationMode;
  readonly justification?: string;
}

export interface ManualAcceptanceCriterion extends AcceptanceCriterionBase {
  readonly verification: "manual";
  readonly justification: string;
}

export type AcceptanceCriterion = NonManualAcceptanceCriterion | ManualAcceptanceCriterion;

export type NormalizedAcceptanceCriterion = AcceptanceCriterion & {
  readonly weak: boolean;
};

export interface AcceptanceCriterionWeakness {
  readonly criterionId: AcceptanceCriterionId;
  readonly index: number;
  readonly fieldPath: `acceptanceCriteria.${number}.justification`;
  readonly reason: "manual-without-justification";
  readonly message: string;
}

export type ManualAcceptanceCriterionJustificationInvalidReason = "missing" | "blank" | "invalid";

export type ManualAcceptanceCriterionJustificationValidation =
  | {
      readonly justified: true;
      readonly manualUnjustified: false;
      readonly normalizedJustification: string;
    }
  | {
      readonly justified: false;
      readonly manualUnjustified: true;
      readonly invalidReason: ManualAcceptanceCriterionJustificationInvalidReason;
      readonly normalizedJustification?: never;
    };

export type NormalizeAcceptanceCriteriaDiagnosticSeverity = "error" | "weak";

export type NormalizeAcceptanceCriteriaDiagnosticCode =
  | "missing-acceptance-criteria"
  | "missing-statement"
  | "empty-after-normalization"
  | "duplicate-acceptance-criterion"
  | "missing-verification-mode"
  | "invalid-verification-mode"
  | "multiple-verification-modes"
  | "manual-without-justification";

export type NormalizeAcceptanceCriteriaFieldPath =
  | "acceptanceCriteria"
  | `acceptanceCriteria.${number}.statement`
  | `acceptanceCriteria.${number}.verification`
  | `acceptanceCriteria.${number}.justification`;

export interface NormalizeAcceptanceCriteriaDiagnostic {
  readonly code: NormalizeAcceptanceCriteriaDiagnosticCode;
  readonly severity: NormalizeAcceptanceCriteriaDiagnosticSeverity;
  readonly fieldPath: NormalizeAcceptanceCriteriaFieldPath;
  readonly message: string;
  readonly index?: number;
  readonly criterionId?: AcceptanceCriterionId;
  readonly normalizationRuleId?: AcceptanceCriterionTextNormalizationRuleId;
}

export type AcceptanceCriterionDiagnostic = NormalizeAcceptanceCriteriaDiagnostic;

export interface NormalizeAcceptanceCriteriaOutput {
  readonly ok: boolean;
  readonly acceptanceCriteria: readonly NormalizedAcceptanceCriterion[];
  readonly weakAcceptanceCriteria: readonly AcceptanceCriterionWeakness[];
  readonly diagnostics: readonly NormalizeAcceptanceCriteriaDiagnostic[];
  readonly errors: readonly string[];
}

export type NormalizedAcceptanceCriteriaResult = NormalizeAcceptanceCriteriaOutput;
