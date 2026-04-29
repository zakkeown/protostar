import type { CapabilityEnvelope } from "./capability-envelope.js";

import type { AcceptanceCriterionId, IntentDraft, IntentDraftCapabilityEnvelope, RiskLevel, ToolPermissionLevel } from "./models.js";

import type { ConfirmedIntent } from "./confirmed-intent.js";

import type { ClarificationQuestion } from "./clarification.js";

import type { IntentAmbiguityAssessment, IntentAmbiguityDimensionScore, IntentAmbiguityMode, IntentAmbiguityWeightingProfile } from "./ambiguity-scoring.js";

import type { IntentDraftFieldPath, IntentDraftPresenceValidationFailure, IntentDraftRequiredDimensionCheck, IntentDraftRequiredFieldCheck } from "./draft-validation.js";

import { BUGFIX_GOAL_ARCHETYPE, COSMETIC_TWEAK_GOAL_ARCHETYPE, FEATURE_ADD_GOAL_ARCHETYPE, REFACTOR_GOAL_ARCHETYPE } from "./archetypes.js";

import type { GoalArchetypeCompatibilityBudgetCaps, GoalArchetypeExecutionScope, GoalArchetypePolicyEntry, GoalArchetypePolicyTable, GoalArchetypeRepoScopePolicy, IntentArchetypeAutoTagSuggestion, RepoAccessLevel } from "./archetypes.js";

export type RequiredIntentDraftFieldCheck = IntentDraftRequiredFieldCheck;

export type RequiredIntentDraftDimensionCheck = IntentDraftRequiredDimensionCheck;

export const MANUAL_UNJUSTIFIED_ACCEPTANCE_CRITERION_POLICY_CODE = "manual-without-justification";

export const DUPLICATE_ACCEPTANCE_CRITERION_POLICY_CODE = "duplicate-acceptance-criterion";

export const LOW_CONFIDENCE_GOAL_ARCHETYPE_POLICY_CODE = "low-confidence-goal-archetype";

export const INTENT_ARCHETYPE_PROPOSAL_LOW_CONFIDENCE_THRESHOLD = 0.5;

export type IntentAdmissionPolicyFindingCode =
  | typeof MANUAL_UNJUSTIFIED_ACCEPTANCE_CRITERION_POLICY_CODE
  | typeof DUPLICATE_ACCEPTANCE_CRITERION_POLICY_CODE
  | typeof LOW_CONFIDENCE_GOAL_ARCHETYPE_POLICY_CODE
  | "missing-goal-archetype"
  | "unknown-goal-archetype"
  | "unsupported-goal-archetype"
  | "repo-authority-overage"
  | "execute-authority-overage"
  | "tool-authority-overage"
  | "budget-authority-overage";

export type IntentAdmissionIssueCode =
  | IntentDraftPresenceValidationFailure["code"]
  | IntentAdmissionPolicyFindingCode;

export interface IntentAdmissionAcceptanceCriterionReference {
  readonly type: "acceptance-criterion";
  readonly id: AcceptanceCriterionId;
  readonly index: number;
  readonly fieldPath: `acceptanceCriteria.${number}`;
}

export type IntentAdmissionIssueReference = IntentAdmissionAcceptanceCriterionReference;

export type IntentAdmissionMissingFieldDetectionSource =
  | "required-field-checklist"
  | "ambiguity-assessment"
  | "policy-finding";

export interface IntentAdmissionMissingFieldDetection {
  readonly code?: IntentAdmissionIssueCode;
  readonly issueCode?: IntentAdmissionIssueCode;
  readonly checklistIndex?: number;
  readonly fieldPath: string;
  readonly dimensionId?: IntentDraftRequiredFieldCheck["dimensionId"];
  readonly label?: string;
  readonly message: string;
  readonly source: IntentAdmissionMissingFieldDetectionSource;
  readonly affectedAcceptanceCriterionIds?: readonly AcceptanceCriterionId[];
  readonly references?: readonly IntentAdmissionIssueReference[];
}

export type IntentAdmissionRequiredClarificationSource =
  | "required-dimension-checklist"
  | "missing-field-detection"
  | "clarification-question-generator"
  | "ambiguity-assessment"
  | "policy-finding";

export interface IntentAdmissionRequiredClarification {
  readonly issueCode?: IntentAdmissionIssueCode;
  readonly fieldPath: string;
  readonly prompt: string;
  readonly rationale: string;
  readonly source: IntentAdmissionRequiredClarificationSource;
  readonly questionId?: ClarificationQuestion["id"];
  readonly questionKey?: ClarificationQuestion["key"];
  readonly affectedAcceptanceCriterionIds?: readonly AcceptanceCriterionId[];
  readonly references?: readonly IntentAdmissionIssueReference[];
}

export type IntentAdmissionHardZeroReasonSource = "required-dimension-checklist" | "ambiguity-assessment";

export type IntentAdmissionHardZeroDimensionId =
  | RequiredIntentDraftDimensionCheck["dimensionId"]
  | IntentAmbiguityDimensionScore["dimension"];

export interface IntentAdmissionHardZeroReason {
  readonly dimensionId: IntentAdmissionHardZeroDimensionId;
  readonly fieldPath: `dimension:${IntentAdmissionHardZeroDimensionId}`;
  readonly score: 1;
  readonly clarity: 0;
  readonly missingFields: readonly string[];
  readonly message: string;
  readonly source: IntentAdmissionHardZeroReasonSource;
}

export interface IntentAdmissionOutputContractSections {
  readonly missingFieldDetections: readonly IntentAdmissionMissingFieldDetection[];
  readonly requiredClarifications: readonly IntentAdmissionRequiredClarification[];
  readonly hardZeroReasons: readonly IntentAdmissionHardZeroReason[];
}

export interface IntentAdmissionPolicyFinding {
  readonly code: IntentAdmissionPolicyFindingCode;
  readonly fieldPath: IntentDraftFieldPath;
  readonly severity: "block" | "ambiguity";
  readonly message: string;
  readonly overridable: boolean;
  readonly overridden: boolean;
  readonly authorityJustification?: string;
  readonly reasonCode?: RepoScopeAdmissionReasonCode;
  readonly writeGrantViolationCode?: CapabilityEnvelopeWriteGrantViolationCode;
  readonly toolPermissionViolationCode?: CapabilityEnvelopeToolPermissionViolationCode;
  readonly budgetLimitViolationCode?: CapabilityEnvelopeBudgetLimitViolationCode;
  readonly ambiguityDimension?: IntentAmbiguityDimensionScore["dimension"];
  readonly acceptanceCriterionId?: AcceptanceCriterionId;
  readonly acceptanceCriterionIndex?: number;
  readonly affectedAcceptanceCriterionIds?: readonly AcceptanceCriterionId[];
  readonly references?: readonly IntentAdmissionIssueReference[];
  readonly overage?: CapabilityEnvelopeOverageFinding;
}

export type CapabilityEnvelopeOverageKind = "repo_scope" | "execute_grant" | "tool_permission" | "budget";

export interface CapabilityEnvelopeOverageBase {
  readonly kind: CapabilityEnvelopeOverageKind;
  readonly goalArchetype: string;
  readonly fieldPath: IntentDraftFieldPath;
  readonly authorityJustificationRequired: true;
  readonly overrideFieldPath: "capabilityEnvelope.authorityJustification";
  readonly authorityJustification?: string;
}

export interface CapabilityEnvelopeRepoScopeOverage extends CapabilityEnvelopeOverageBase {
  readonly kind: "repo_scope";
  readonly scopeIndex: number;
  readonly reasonCode: RepoScopeAdmissionReasonCode;
  readonly writeGrantViolationCode?: CapabilityEnvelopeWriteGrantViolationCode;
  readonly requested: {
    readonly access: RepoAccessLevel;
    readonly workspace?: string;
    readonly path?: string;
  };
  readonly allowed: {
    readonly accessLevels: readonly RepoAccessLevel[];
    readonly maxAccess: RepoAccessLevel;
    readonly pathBoundary: GoalArchetypeRepoScopePolicy["pathBoundary"];
    readonly writeGrantAllowed: boolean;
    readonly executeGrantAllowed: boolean;
  };
}

export interface CapabilityEnvelopeExecuteGrantOverage extends CapabilityEnvelopeOverageBase {
  readonly kind: "execute_grant";
  readonly executeGrantIndex: number;
  readonly violationCode: CapabilityEnvelopeExecuteGrantViolationCode;
  readonly requested: {
    readonly command?: string;
    readonly executionScope?: string;
  };
  readonly allowed: {
    readonly executeGrantAllowed: boolean;
    readonly commands: readonly string[];
    readonly executionScopes: readonly GoalArchetypeExecutionScope[];
    readonly pathBoundary: GoalArchetypeRepoScopePolicy["pathBoundary"];
  };
}

export interface CapabilityEnvelopeToolPermissionOverage extends CapabilityEnvelopeOverageBase {
  readonly kind: "tool_permission";
  readonly toolPermissionIndex: number;
  readonly violationCode?: CapabilityEnvelopeToolPermissionViolationCode;
  readonly requested: {
    readonly risk?: RiskLevel;
    readonly tool?: string;
    readonly permissionLevel?: ToolPermissionLevel | string;
  };
  readonly allowed: {
    readonly riskLevels?: readonly RiskLevel[];
    readonly maxRisk?: RiskLevel;
    readonly tools?: readonly string[];
    readonly permissionLevels?: readonly ToolPermissionLevel[];
    readonly maxPermissionLevel?: ToolPermissionLevel;
  };
}

export type CapabilityEnvelopeBudgetCapKey = keyof GoalArchetypeCompatibilityBudgetCaps;

export interface CapabilityEnvelopeBudgetOverage extends CapabilityEnvelopeOverageBase {
  readonly kind: "budget";
  readonly budgetKey: CapabilityEnvelopeBudgetCapKey;
  readonly requested: {
    readonly key: CapabilityEnvelopeBudgetCapKey;
    readonly value: number;
  };
  readonly allowed: {
    readonly key: CapabilityEnvelopeBudgetCapKey;
    readonly cap: number;
  };
}

export type CapabilityEnvelopeOverageFinding =
  | CapabilityEnvelopeRepoScopeOverage
  | CapabilityEnvelopeExecuteGrantOverage
  | CapabilityEnvelopeToolPermissionOverage
  | CapabilityEnvelopeBudgetOverage;

export interface ValidateCapabilityEnvelopeRepoScopesInput {
  readonly goalArchetype: string;
  readonly capabilityEnvelope?: IntentDraftCapabilityEnvelope;
  readonly policyTable?: GoalArchetypePolicyTable;
  readonly workspaceTrust?: Readonly<Record<string, "trusted" | "untrusted">>;
}

export interface DetectCapabilityEnvelopeOveragesInput extends ValidateCapabilityEnvelopeRepoScopesInput {}

export interface CapabilityEnvelopeOverageDetection {
  readonly ok: boolean;
  readonly goalArchetype: string;
  readonly requestedCapabilities: IntentDraftCapabilityEnvelope;
  readonly authorityJustification?: string;
  readonly allowedEnvelope?: GoalArchetypePolicyEntry;
  readonly findings: readonly IntentAdmissionPolicyFinding[];
}

export interface ValidateIntentDraftCapabilityEnvelopeAdmissionInput {
  readonly draft: IntentDraft;
  readonly policyTable?: GoalArchetypePolicyTable;
}

export interface ValidateIntentDraftCapabilityEnvelopeAdmissionResult {
  readonly ok: boolean;
  readonly goalArchetype: string;
  readonly detection: CapabilityEnvelopeOverageDetection;
  readonly findings: readonly IntentAdmissionPolicyFinding[];
  readonly unresolvedFindings: readonly IntentAdmissionPolicyFinding[];
  readonly blockingFindings: readonly IntentAdmissionPolicyFinding[];
  readonly unoverriddenOverageFindings: readonly IntentAdmissionPolicyFinding[];
}

export interface CosmeticTweakCapabilityEnvelopeGrant {
  readonly source: "cosmetic-tweak-policy-admission";
  readonly goalArchetype: typeof COSMETIC_TWEAK_GOAL_ARCHETYPE;
  readonly policy: GoalArchetypePolicyEntry;
  readonly capabilityEnvelope: CapabilityEnvelope;
}

export interface FeatureAddCapabilityEnvelopeGrant {
  readonly source: "feature-add-policy-admission";
  readonly goalArchetype: typeof FEATURE_ADD_GOAL_ARCHETYPE;
  readonly policy: GoalArchetypePolicyEntry;
  readonly capabilityEnvelope: CapabilityEnvelope;
}

export interface RefactorCapabilityEnvelopeGrant {
  readonly source: "refactor-policy-admission";
  readonly goalArchetype: typeof REFACTOR_GOAL_ARCHETYPE;
  readonly policy: GoalArchetypePolicyEntry;
  readonly capabilityEnvelope: CapabilityEnvelope;
}

export interface BugfixCapabilityEnvelopeGrant {
  readonly source: "bugfix-policy-admission";
  readonly goalArchetype: typeof BUGFIX_GOAL_ARCHETYPE;
  readonly policy: GoalArchetypePolicyEntry;
  readonly capabilityEnvelope: CapabilityEnvelope;
}

export interface AdmitCosmeticTweakCapabilityEnvelopeInput {
  readonly draft: IntentDraft;
  readonly policyTable?: GoalArchetypePolicyTable;
}

export type AdmitCosmeticTweakCapabilityEnvelopeResult =
  | {
      readonly ok: true;
      readonly goalArchetype: typeof COSMETIC_TWEAK_GOAL_ARCHETYPE;
      readonly grant: CosmeticTweakCapabilityEnvelopeGrant;
      readonly admission: ValidateIntentDraftCapabilityEnvelopeAdmissionResult;
      readonly findings: readonly IntentAdmissionPolicyFinding[];
      readonly errors: readonly string[];
    }
  | {
      readonly ok: false;
      readonly goalArchetype: string;
      readonly admission: ValidateIntentDraftCapabilityEnvelopeAdmissionResult;
      readonly findings: readonly IntentAdmissionPolicyFinding[];
      readonly errors: readonly string[];
    };

export interface FeatureAddCapabilityEnvelopeUnsupportedDecision {
  readonly source: "feature-add-policy-admission";
  readonly goalArchetype: typeof FEATURE_ADD_GOAL_ARCHETYPE;
  readonly requestedGoalArchetype: string;
  readonly decision: "unsupported";
  readonly supportStatus: "unsupported";
  readonly capabilityCapStatus: "stub";
  readonly stubCap: GoalArchetypePolicyEntry;
  readonly message: string;
}

export interface AdmitFeatureAddCapabilityEnvelopeInput {
  readonly draft: IntentDraft;
  readonly policyTable?: GoalArchetypePolicyTable;
}

export type AdmitFeatureAddCapabilityEnvelopeResult =
  | {
      readonly ok: true;
      readonly goalArchetype: typeof FEATURE_ADD_GOAL_ARCHETYPE;
      readonly grant: FeatureAddCapabilityEnvelopeGrant;
      readonly admission: ValidateIntentDraftCapabilityEnvelopeAdmissionResult;
      readonly findings: readonly IntentAdmissionPolicyFinding[];
      readonly errors: readonly string[];
    }
  | {
      readonly ok: false;
      readonly goalArchetype: string;
      readonly decision?: FeatureAddCapabilityEnvelopeUnsupportedDecision;
      readonly admission: ValidateIntentDraftCapabilityEnvelopeAdmissionResult;
      readonly findings: readonly IntentAdmissionPolicyFinding[];
      readonly errors: readonly string[];
    };

export interface RefactorCapabilityEnvelopeUnsupportedDecision {
  readonly source: "refactor-policy-admission";
  readonly goalArchetype: typeof REFACTOR_GOAL_ARCHETYPE;
  readonly requestedGoalArchetype: string;
  readonly decision: "unsupported";
  readonly supportStatus: "unsupported";
  readonly capabilityCapStatus: "stub";
  readonly stubCap: GoalArchetypePolicyEntry;
  readonly message: string;
}

export interface AdmitRefactorCapabilityEnvelopeInput {
  readonly draft: IntentDraft;
  readonly policyTable?: GoalArchetypePolicyTable;
}

export type AdmitRefactorCapabilityEnvelopeResult =
  | {
      readonly ok: true;
      readonly goalArchetype: typeof REFACTOR_GOAL_ARCHETYPE;
      readonly grant: RefactorCapabilityEnvelopeGrant;
      readonly admission: ValidateIntentDraftCapabilityEnvelopeAdmissionResult;
      readonly findings: readonly IntentAdmissionPolicyFinding[];
      readonly errors: readonly string[];
    }
  | {
      readonly ok: false;
      readonly goalArchetype: string;
      readonly decision?: RefactorCapabilityEnvelopeUnsupportedDecision;
      readonly admission: ValidateIntentDraftCapabilityEnvelopeAdmissionResult;
      readonly findings: readonly IntentAdmissionPolicyFinding[];
      readonly errors: readonly string[];
    };

export interface BugfixCapabilityEnvelopeUnsupportedDecision {
  readonly source: "bugfix-policy-admission";
  readonly goalArchetype: typeof BUGFIX_GOAL_ARCHETYPE;
  readonly requestedGoalArchetype: string;
  readonly decision: "unsupported";
  readonly supportStatus: "unsupported";
  readonly capabilityCapStatus: "stub";
  readonly stubCap: GoalArchetypePolicyEntry;
  readonly message: string;
}

export interface AdmitBugfixCapabilityEnvelopeInput {
  readonly draft: IntentDraft;
  readonly policyTable?: GoalArchetypePolicyTable;
}

export type AdmitBugfixCapabilityEnvelopeResult =
  | {
      readonly ok: true;
      readonly goalArchetype: typeof BUGFIX_GOAL_ARCHETYPE;
      readonly grant: BugfixCapabilityEnvelopeGrant;
      readonly admission: ValidateIntentDraftCapabilityEnvelopeAdmissionResult;
      readonly findings: readonly IntentAdmissionPolicyFinding[];
      readonly errors: readonly string[];
    }
  | {
      readonly ok: false;
      readonly goalArchetype: string;
      readonly decision?: BugfixCapabilityEnvelopeUnsupportedDecision;
      readonly admission: ValidateIntentDraftCapabilityEnvelopeAdmissionResult;
      readonly findings: readonly IntentAdmissionPolicyFinding[];
      readonly errors: readonly string[];
    };

export const REPO_SCOPE_ADMISSION_REASON_CODES = [
  "repo_scope_allowed",
  "repo_scope_missing",
  "repo_scope_unknown_archetype",
  "repo_scope_unknown_access",
  "repo_scope_disallowed_access",
  "repo_scope_disallowed_path_boundary",
  "repo_scope_workspace_trust_refused"
] as const;

export type RepoScopeAdmissionReasonCode = (typeof REPO_SCOPE_ADMISSION_REASON_CODES)[number];

export type RepoScopeAdmissionVerdict = "allow" | "deny";

export type RepoScopeAdmissionResultKind = "allowed" | "missing" | "unknown" | "disallowed";

export type RepoScopeAdmissionResultSeverity = "allow" | "block" | "ambiguity";

export interface RepoScopeAdmissionResult {
  readonly decision: RepoScopeAdmissionVerdict;
  readonly kind: RepoScopeAdmissionResultKind;
  readonly reasonCode: RepoScopeAdmissionReasonCode;
  readonly writeGrantViolationCode?: CapabilityEnvelopeWriteGrantViolationCode;
  readonly fieldPath: IntentDraftFieldPath;
  readonly message: string;
  readonly severity: RepoScopeAdmissionResultSeverity;
  readonly overridable: boolean;
  readonly overridden: boolean;
  readonly authorityJustification?: string;
  readonly scopeIndex?: number;
  readonly overage?: CapabilityEnvelopeRepoScopeOverage;
}

export interface RepoScopeAdmissionDecision {
  readonly decision: RepoScopeAdmissionVerdict;
  readonly allowed: boolean;
  readonly goalArchetype: string;
  readonly reasonCodes: readonly RepoScopeAdmissionReasonCode[];
  readonly results: readonly RepoScopeAdmissionResult[];
}

export type EvaluateRepoScopeAdmissionInput = ValidateCapabilityEnvelopeRepoScopesInput;

export const CAPABILITY_ENVELOPE_WRITE_GRANT_VIOLATION_CODES = [
  "write_grant_unknown_archetype",
  "write_grant_disallowed_scope",
  "write_grant_disallowed_path"
] as const;

export type CapabilityEnvelopeWriteGrantViolationCode =
  (typeof CAPABILITY_ENVELOPE_WRITE_GRANT_VIOLATION_CODES)[number];

export interface CapabilityEnvelopeWriteGrantViolation {
  readonly code: CapabilityEnvelopeWriteGrantViolationCode;
  readonly reasonCode: RepoScopeAdmissionReasonCode;
  readonly goalArchetype: string;
  readonly fieldPath: IntentDraftFieldPath;
  readonly severity: "block" | "ambiguity";
  readonly message: string;
  readonly overridable: boolean;
  readonly overridden: boolean;
  readonly authorityJustification?: string;
  readonly scopeIndex?: number;
  readonly workspace?: string;
  readonly path?: string;
  readonly requestedAccess: "write";
  readonly allowedAccess: readonly RepoAccessLevel[];
  readonly pathBoundary?: GoalArchetypeRepoScopePolicy["pathBoundary"];
  readonly overage?: CapabilityEnvelopeRepoScopeOverage;
}

export interface ValidateCapabilityEnvelopeWriteGrantsInput extends ValidateCapabilityEnvelopeRepoScopesInput {}

export interface ValidateCapabilityEnvelopeWriteGrantsResult {
  readonly ok: boolean;
  readonly goalArchetype: string;
  readonly violations: readonly CapabilityEnvelopeWriteGrantViolation[];
}

export const CAPABILITY_ENVELOPE_EXECUTE_GRANT_VIOLATION_CODES = [
  "execute_grant_unknown_archetype",
  "execute_grant_disallowed_command",
  "execute_grant_disallowed_scope"
] as const;

export type CapabilityEnvelopeExecuteGrantViolationCode =
  (typeof CAPABILITY_ENVELOPE_EXECUTE_GRANT_VIOLATION_CODES)[number];

export interface CapabilityEnvelopeExecuteGrantViolation {
  readonly code: CapabilityEnvelopeExecuteGrantViolationCode;
  readonly goalArchetype: string;
  readonly fieldPath: IntentDraftFieldPath;
  readonly severity: "block" | "ambiguity";
  readonly message: string;
  readonly overridable: boolean;
  readonly overridden: boolean;
  readonly authorityJustification?: string;
  readonly executeGrantIndex?: number;
  readonly command?: string;
  readonly executionScope?: string;
  readonly allowedCommands: readonly string[];
  readonly allowedExecutionScopes: readonly GoalArchetypeExecutionScope[];
  readonly executeGrantAllowed: boolean;
  readonly pathBoundary?: GoalArchetypeRepoScopePolicy["pathBoundary"];
  readonly overage?: CapabilityEnvelopeExecuteGrantOverage;
}

export interface ValidateCapabilityEnvelopeExecuteGrantsInput extends ValidateCapabilityEnvelopeRepoScopesInput {}

export interface ValidateCapabilityEnvelopeExecuteGrantsResult {
  readonly ok: boolean;
  readonly goalArchetype: string;
  readonly violations: readonly CapabilityEnvelopeExecuteGrantViolation[];
}

export const CAPABILITY_ENVELOPE_TOOL_PERMISSION_VIOLATION_CODES = [
  "tool_permission_unknown_archetype",
  "tool_permission_disallowed_tool",
  "tool_permission_disallowed_risk",
  "tool_permission_disallowed_level"
] as const;

export type CapabilityEnvelopeToolPermissionViolationCode =
  (typeof CAPABILITY_ENVELOPE_TOOL_PERMISSION_VIOLATION_CODES)[number];

export interface CapabilityEnvelopeToolPermissionViolation {
  readonly code: CapabilityEnvelopeToolPermissionViolationCode;
  readonly goalArchetype: string;
  readonly fieldPath: IntentDraftFieldPath;
  readonly severity: "block" | "ambiguity";
  readonly message: string;
  readonly overridable: boolean;
  readonly overridden: boolean;
  readonly authorityJustification?: string;
  readonly toolPermissionIndex?: number;
  readonly requestedTool?: string;
  readonly requestedRisk?: RiskLevel;
  readonly requestedPermissionLevel?: ToolPermissionLevel | string;
  readonly allowedTools: readonly string[];
  readonly allowedRiskLevels: readonly RiskLevel[];
  readonly maxRisk: RiskLevel;
  readonly allowedPermissionLevels: readonly ToolPermissionLevel[];
  readonly maxPermissionLevel: ToolPermissionLevel;
  readonly overage?: CapabilityEnvelopeToolPermissionOverage;
}

export interface ValidateCapabilityEnvelopeToolPermissionsInput extends ValidateCapabilityEnvelopeRepoScopesInput {}

export interface ValidateCapabilityEnvelopeToolPermissionsResult {
  readonly ok: boolean;
  readonly goalArchetype: string;
  readonly violations: readonly CapabilityEnvelopeToolPermissionViolation[];
}

export const CAPABILITY_ENVELOPE_BUDGET_LIMIT_VIOLATION_CODES = [
  "budget_limit_unknown_archetype",
  "budget_limit_exceeds_cap"
] as const;

export type CapabilityEnvelopeBudgetLimitViolationCode =
  (typeof CAPABILITY_ENVELOPE_BUDGET_LIMIT_VIOLATION_CODES)[number];

export interface CapabilityEnvelopeBudgetLimitViolation {
  readonly code: CapabilityEnvelopeBudgetLimitViolationCode;
  readonly goalArchetype: string;
  readonly fieldPath: IntentDraftFieldPath;
  readonly severity: "block" | "ambiguity";
  readonly message: string;
  readonly overridable: boolean;
  readonly overridden: boolean;
  readonly authorityJustification?: string;
  readonly budgetKey?: CapabilityEnvelopeBudgetCapKey;
  readonly requestedValue?: number;
  readonly allowedCap?: number;
  readonly overage?: CapabilityEnvelopeBudgetOverage;
}

export interface ValidateCapabilityEnvelopeBudgetLimitsInput extends ValidateCapabilityEnvelopeRepoScopesInput {}

export interface ValidateCapabilityEnvelopeBudgetLimitsResult {
  readonly ok: boolean;
  readonly goalArchetype: string;
  readonly violations: readonly CapabilityEnvelopeBudgetLimitViolation[];
}

export interface IntentAmbiguityAdmissionDecision {
  readonly accepted: boolean;
  readonly ambiguity: number;
  readonly admissionThreshold: number;
  readonly configuredThreshold: number;
  readonly finite: boolean;
  readonly errors: readonly string[];
}

export type IntentPromotionFailureState = "ambiguity-only" | "checklist-only" | "combined";

export interface IntentPromotionFailureDetails {
  readonly state: IntentPromotionFailureState;
  readonly checklistFailed: boolean;
  readonly ambiguityFailed: boolean;
  readonly confirmedIntentCreated: false;
  readonly checklistErrors: readonly string[];
  readonly ambiguityErrors: readonly string[];
}

export interface PromoteIntentDraftInput {
  readonly draft: IntentDraft;
  readonly mode?: IntentAmbiguityMode;
  readonly confirmedAt?: string;
  readonly threshold?: number;
}

export type PromoteIntentDraftResult =
  | {
      readonly ok: true;
      readonly intent: ConfirmedIntent;
      readonly weightingProfile: IntentAmbiguityWeightingProfile;
      readonly ambiguityAssessment: IntentAmbiguityAssessment;
      readonly requiredDimensionChecklist: readonly RequiredIntentDraftDimensionCheck[];
      readonly requiredFieldChecklist: readonly RequiredIntentDraftFieldCheck[];
      readonly missingFieldDetections: readonly IntentAdmissionMissingFieldDetection[];
      readonly requiredClarifications: readonly IntentAdmissionRequiredClarification[];
      readonly hardZeroReasons: readonly IntentAdmissionHardZeroReason[];
      readonly questions: readonly ClarificationQuestion[];
      readonly policyFindings: readonly IntentAdmissionPolicyFinding[];
      readonly archetypeSuggestion: IntentArchetypeAutoTagSuggestion;
      readonly errors: readonly string[];
      readonly failureState?: never;
      readonly failureDetails?: never;
    }
  | {
      readonly ok: false;
      readonly failureState: IntentPromotionFailureState;
      readonly failureDetails: IntentPromotionFailureDetails;
      readonly weightingProfile: IntentAmbiguityWeightingProfile;
      readonly ambiguityAssessment: IntentAmbiguityAssessment;
      readonly requiredDimensionChecklist: readonly RequiredIntentDraftDimensionCheck[];
      readonly requiredFieldChecklist: readonly RequiredIntentDraftFieldCheck[];
      readonly missingFieldDetections: readonly IntentAdmissionMissingFieldDetection[];
      readonly requiredClarifications: readonly IntentAdmissionRequiredClarification[];
      readonly hardZeroReasons: readonly IntentAdmissionHardZeroReason[];
      readonly questions: readonly ClarificationQuestion[];
      readonly policyFindings: readonly IntentAdmissionPolicyFinding[];
      readonly archetypeSuggestion: IntentArchetypeAutoTagSuggestion;
      readonly errors: readonly string[];
    };
