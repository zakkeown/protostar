// Plan 06a: capability-admission, capability-normalization, capability-grant-admission,
// repo-scope-admission, and the overage/violation type families relocated to
// @protostar/intent. This subbarrel preserves the @protostar/policy/capability-envelope
// import surface byte-equivalent.
export {
  CAPABILITY_ENVELOPE_BUDGET_LIMIT_FIELDS,
  CAPABILITY_ENVELOPE_REPAIR_LOOP_COUNT_ADMISSION_FAILURE_CODES,
  CAPABILITY_ENVELOPE_REPAIR_LOOP_COUNT_POLICY_FIELD,
  TOOL_PERMISSION_LEVELS,
  validateCapabilityEnvelopeRepairLoopCount,
  validateIntentDraftCapabilityEnvelopeRepairLoopCount
} from "@protostar/intent";
export type {
  BudgetLimitField,
  BudgetLimitFieldPath,
  CapabilityEnvelope,
  CapabilityEnvelopeRepairLoopCountAdmissionFailure,
  CapabilityEnvelopeRepairLoopCountAdmissionFailureCode,
  ExecuteGrant,
  FactoryBudget,
  GoalArchetypeRepairLoopCountPolicy,
  IntentDraftCapabilityEnvelope,
  IntentDraftExecuteGrant,
  IntentDraftRepoScopeGrant,
  IntentDraftToolPermissionGrant,
  RepoScopeGrant,
  RiskLevel,
  ToolPermissionGrant,
  ToolPermissionLevel,
  ValidateCapabilityEnvelopeRepairLoopCountInput,
  ValidateCapabilityEnvelopeRepairLoopCountResult
} from "@protostar/intent";
export {
  CAPABILITY_ENVELOPE_BUDGET_LIMIT_VIOLATION_CODES,
  CAPABILITY_ENVELOPE_EXECUTE_GRANT_VIOLATION_CODES,
  CAPABILITY_ENVELOPE_TOOL_PERMISSION_VIOLATION_CODES,
  CAPABILITY_ENVELOPE_WRITE_GRANT_VIOLATION_CODES,
  REPO_SCOPE_ADMISSION_REASON_CODES
} from "@protostar/intent";
export type {
  AdmitBugfixCapabilityEnvelopeInput,
  AdmitBugfixCapabilityEnvelopeResult,
  AdmitCosmeticTweakCapabilityEnvelopeInput,
  AdmitCosmeticTweakCapabilityEnvelopeResult,
  AdmitFeatureAddCapabilityEnvelopeInput,
  AdmitFeatureAddCapabilityEnvelopeResult,
  AdmitRefactorCapabilityEnvelopeInput,
  AdmitRefactorCapabilityEnvelopeResult,
  BugfixCapabilityEnvelopeUnsupportedDecision,
  CapabilityEnvelopeBudgetCapKey,
  CapabilityEnvelopeBudgetLimitViolation,
  CapabilityEnvelopeBudgetLimitViolationCode,
  CapabilityEnvelopeBudgetOverage,
  CapabilityEnvelopeExecuteGrantOverage,
  CapabilityEnvelopeExecuteGrantViolation,
  CapabilityEnvelopeExecuteGrantViolationCode,
  CapabilityEnvelopeOverageBase,
  CapabilityEnvelopeOverageDetection,
  CapabilityEnvelopeOverageFinding,
  CapabilityEnvelopeOverageKind,
  CapabilityEnvelopeRepoScopeOverage,
  CapabilityEnvelopeToolPermissionOverage,
  CapabilityEnvelopeToolPermissionViolation,
  CapabilityEnvelopeToolPermissionViolationCode,
  CapabilityEnvelopeWriteGrantViolation,
  CapabilityEnvelopeWriteGrantViolationCode,
  CosmeticTweakCapabilityEnvelopeGrant,
  DetectCapabilityEnvelopeOveragesInput,
  EvaluateRepoScopeAdmissionInput,
  FeatureAddCapabilityEnvelopeUnsupportedDecision,
  IntentAdmissionPolicyFinding,
  RefactorCapabilityEnvelopeUnsupportedDecision,
  RepoScopeAdmissionDecision,
  RepoScopeAdmissionReasonCode,
  RepoScopeAdmissionResult,
  RepoScopeAdmissionResultKind,
  RepoScopeAdmissionResultSeverity,
  RepoScopeAdmissionVerdict,
  ValidateCapabilityEnvelopeBudgetLimitsInput,
  ValidateCapabilityEnvelopeBudgetLimitsResult,
  ValidateCapabilityEnvelopeExecuteGrantsInput,
  ValidateCapabilityEnvelopeExecuteGrantsResult,
  ValidateCapabilityEnvelopeRepoScopesInput,
  ValidateCapabilityEnvelopeToolPermissionsInput,
  ValidateCapabilityEnvelopeToolPermissionsResult,
  ValidateCapabilityEnvelopeWriteGrantsInput,
  ValidateCapabilityEnvelopeWriteGrantsResult,
  ValidateIntentDraftCapabilityEnvelopeAdmissionInput,
  ValidateIntentDraftCapabilityEnvelopeAdmissionResult
} from "@protostar/intent";
export {
  admitBugfixCapabilityEnvelope,
  admitCosmeticTweakCapabilityEnvelope,
  admitFeatureAddCapabilityEnvelope,
  admitRefactorCapabilityEnvelope,
  detectCapabilityEnvelopeOverages,
  evaluateIntentDraftPolicy,
  validateIntentDraftCapabilityEnvelopeAdmission
} from "@protostar/intent";
export { normalizeDraftCapabilityEnvelope } from "@protostar/intent";
export {
  validateCapabilityEnvelopeBudgetLimits,
  validateCapabilityEnvelopeExecuteGrants,
  validateCapabilityEnvelopeToolPermissions
} from "@protostar/intent";
export {
  evaluateRepoScopeAdmission,
  validateCapabilityEnvelopeRepoScopes,
  validateCapabilityEnvelopeWriteGrants
} from "@protostar/intent";
