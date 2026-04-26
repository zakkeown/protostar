import type { IntentDraft } from "@protostar/intent";

import type { AdmitBugfixCapabilityEnvelopeInput, AdmitBugfixCapabilityEnvelopeResult, AdmitCosmeticTweakCapabilityEnvelopeInput, AdmitCosmeticTweakCapabilityEnvelopeResult, AdmitFeatureAddCapabilityEnvelopeInput, AdmitFeatureAddCapabilityEnvelopeResult, AdmitRefactorCapabilityEnvelopeInput, AdmitRefactorCapabilityEnvelopeResult, CapabilityEnvelopeBudgetLimitViolation, CapabilityEnvelopeExecuteGrantViolation, CapabilityEnvelopeOverageDetection, CapabilityEnvelopeToolPermissionViolation, DetectCapabilityEnvelopeOveragesInput, IntentAdmissionPolicyFinding, ValidateIntentDraftCapabilityEnvelopeAdmissionInput, ValidateIntentDraftCapabilityEnvelopeAdmissionResult } from "./admission-contracts.js";

import { ARCHETYPE_POLICY_TABLE, BUGFIX_GOAL_ARCHETYPE, COSMETIC_TWEAK_GOAL_ARCHETYPE, FEATURE_ADD_GOAL_ARCHETYPE, REFACTOR_GOAL_ARCHETYPE } from "./archetypes.js";

import type { GoalArchetypePolicyEntry } from "./archetypes.js";

import { authorityJustificationField, isKnownGoalArchetype, normalizeAuthorityJustification, normalizeText, uniqueOrdered } from "./shared.js";

import { bugfixAdmissionPathFindings, bugfixWrongPathFindings, cosmeticTweakAdmissionPathFindings, createBugfixUnsupportedDecision, createFeatureAddUnsupportedDecision, createRefactorUnsupportedDecision, evaluateGoalArchetypePolicySelection, featureAddAdmissionPathFindings, featureAddWrongPathFindings, refactorAdmissionPathFindings, refactorWrongPathFindings } from "./admission-paths.js";

import { normalizeDraftCapabilityEnvelope } from "./capability-normalization.js";

import { validateCapabilityEnvelopeRepoScopes } from "./repo-scope-admission.js";

import { validateCapabilityEnvelopeBudgetLimits, validateCapabilityEnvelopeExecuteGrants, validateCapabilityEnvelopeToolPermissions } from "./capability-grant-admission.js";

export function evaluateIntentDraftPolicy(draft: IntentDraft): readonly IntentAdmissionPolicyFinding[] {
  return validateIntentDraftCapabilityEnvelopeAdmission({ draft }).findings;
}

export function validateIntentDraftCapabilityEnvelopeAdmission(
  input: ValidateIntentDraftCapabilityEnvelopeAdmissionInput
): ValidateIntentDraftCapabilityEnvelopeAdmissionResult {
  const policyTable = input.policyTable ?? ARCHETYPE_POLICY_TABLE;
  const goalArchetype = normalizeText(input.draft.goalArchetype) ?? "";
  const detection = detectCapabilityEnvelopeOverages({
    goalArchetype,
    ...(input.draft.capabilityEnvelope !== undefined ? { capabilityEnvelope: input.draft.capabilityEnvelope } : {}),
    policyTable
  });
  const findings = [
    ...featureAddAdmissionPathFindings(goalArchetype, policyTable),
    ...refactorAdmissionPathFindings(goalArchetype, policyTable),
    ...bugfixAdmissionPathFindings(goalArchetype, policyTable),
    ...detection.findings
  ];
  const blockingFindings = findings.filter((finding) => finding.severity === "block");
  const unoverriddenOverageFindings = findings.filter(
    (finding) => finding.severity === "ambiguity" && !finding.overridden
  );
  const unresolvedFindings = [...blockingFindings, ...unoverriddenOverageFindings];

  return {
    ok: unresolvedFindings.length === 0,
    goalArchetype: detection.goalArchetype,
    detection,
    findings,
    unresolvedFindings,
    blockingFindings,
    unoverriddenOverageFindings
  };
}

export function admitCosmeticTweakCapabilityEnvelope(
  input: AdmitCosmeticTweakCapabilityEnvelopeInput
): AdmitCosmeticTweakCapabilityEnvelopeResult {
  const policyTable = input.policyTable ?? ARCHETYPE_POLICY_TABLE;
  const goalArchetype = normalizeText(input.draft.goalArchetype) ?? "";
  const admission = validateIntentDraftCapabilityEnvelopeAdmission({
    draft: input.draft,
    policyTable
  });
  const admissionPathFindings = cosmeticTweakAdmissionPathFindings(goalArchetype);
  const normalization = normalizeDraftCapabilityEnvelope(input.draft.capabilityEnvelope);
  const findings = [...admissionPathFindings, ...admission.findings];
  const errors = uniqueOrdered([
    ...admissionPathFindings.map((finding) => finding.message),
    ...admission.unresolvedFindings.map((finding) => finding.message),
    ...normalization.errors
  ]);

  if (
    goalArchetype !== COSMETIC_TWEAK_GOAL_ARCHETYPE ||
    admission.unresolvedFindings.length > 0 ||
    normalization.envelope === undefined
  ) {
    return {
      ok: false,
      goalArchetype,
      admission,
      findings,
      errors
    };
  }

  return {
    ok: true,
    goalArchetype: COSMETIC_TWEAK_GOAL_ARCHETYPE,
    grant: {
      source: "cosmetic-tweak-policy-admission",
      goalArchetype: COSMETIC_TWEAK_GOAL_ARCHETYPE,
      policy: policyTable[COSMETIC_TWEAK_GOAL_ARCHETYPE],
      capabilityEnvelope: normalization.envelope
    },
    admission,
    findings,
    errors: []
  };
}

export function admitFeatureAddCapabilityEnvelope(
  input: AdmitFeatureAddCapabilityEnvelopeInput
): AdmitFeatureAddCapabilityEnvelopeResult {
  const policyTable = input.policyTable ?? ARCHETYPE_POLICY_TABLE;
  const requestedGoalArchetype = normalizeText(input.draft.goalArchetype) ?? "";
  const admission = validateIntentDraftCapabilityEnvelopeAdmission({
    draft: input.draft,
    policyTable
  });
  const wrongPathFindings = requestedGoalArchetype === FEATURE_ADD_GOAL_ARCHETYPE
    ? []
    : featureAddWrongPathFindings(requestedGoalArchetype);
  const findings = [...wrongPathFindings, ...admission.findings];
  const decision = createFeatureAddUnsupportedDecision(requestedGoalArchetype, policyTable);

  return {
    ok: false,
    goalArchetype: requestedGoalArchetype,
    decision,
    admission,
    findings,
    errors: uniqueOrdered([
      decision.message,
      ...wrongPathFindings.map((finding) => finding.message),
      ...admission.unresolvedFindings.map((finding) => finding.message)
    ])
  };
}

export function admitRefactorCapabilityEnvelope(
  input: AdmitRefactorCapabilityEnvelopeInput
): AdmitRefactorCapabilityEnvelopeResult {
  const policyTable = input.policyTable ?? ARCHETYPE_POLICY_TABLE;
  const requestedGoalArchetype = normalizeText(input.draft.goalArchetype) ?? "";
  const admission = validateIntentDraftCapabilityEnvelopeAdmission({
    draft: input.draft,
    policyTable
  });
  const wrongPathFindings = requestedGoalArchetype === REFACTOR_GOAL_ARCHETYPE
    ? []
    : refactorWrongPathFindings(requestedGoalArchetype);
  const findings = [...wrongPathFindings, ...admission.findings];
  const decision = createRefactorUnsupportedDecision(requestedGoalArchetype, policyTable);

  return {
    ok: false,
    goalArchetype: requestedGoalArchetype,
    decision,
    admission,
    findings,
    errors: uniqueOrdered([
      decision.message,
      ...wrongPathFindings.map((finding) => finding.message),
      ...admission.unresolvedFindings.map((finding) => finding.message)
    ])
  };
}

export function admitBugfixCapabilityEnvelope(
  input: AdmitBugfixCapabilityEnvelopeInput
): AdmitBugfixCapabilityEnvelopeResult {
  const policyTable = input.policyTable ?? ARCHETYPE_POLICY_TABLE;
  const requestedGoalArchetype = normalizeText(input.draft.goalArchetype) ?? "";
  const admission = validateIntentDraftCapabilityEnvelopeAdmission({
    draft: input.draft,
    policyTable
  });
  const wrongPathFindings = requestedGoalArchetype === BUGFIX_GOAL_ARCHETYPE
    ? []
    : bugfixWrongPathFindings(requestedGoalArchetype);
  const findings = [...wrongPathFindings, ...admission.findings];
  const decision = createBugfixUnsupportedDecision(requestedGoalArchetype, policyTable);

  return {
    ok: false,
    goalArchetype: requestedGoalArchetype,
    decision,
    admission,
    findings,
    errors: uniqueOrdered([
      decision.message,
      ...wrongPathFindings.map((finding) => finding.message),
      ...admission.unresolvedFindings.map((finding) => finding.message)
    ])
  };
}

export function detectCapabilityEnvelopeOverages(
  input: DetectCapabilityEnvelopeOveragesInput
): CapabilityEnvelopeOverageDetection {
  const policyTable = input.policyTable ?? ARCHETYPE_POLICY_TABLE;
  const goalArchetype = normalizeText(input.goalArchetype) ?? "";
  const requestedCapabilities = input.capabilityEnvelope ?? {};
  const archetypeSelectionFindings = evaluateGoalArchetypePolicySelection({
    goalArchetype
  });

  if (archetypeSelectionFindings.length > 0 || !isKnownGoalArchetype(goalArchetype)) {
    return {
      ok: false,
      goalArchetype,
      requestedCapabilities,
      findings: archetypeSelectionFindings
    };
  }

  const policy: GoalArchetypePolicyEntry = policyTable[goalArchetype];
  const authorityJustification = normalizeAuthorityJustification(requestedCapabilities);
  const findings: IntentAdmissionPolicyFinding[] = [
    ...validateCapabilityEnvelopeRepoScopes({
      goalArchetype,
      capabilityEnvelope: requestedCapabilities,
      policyTable
    }),
    ...validateCapabilityEnvelopeExecuteGrants({
      goalArchetype,
      capabilityEnvelope: requestedCapabilities,
      policyTable
    }).violations.map(executeGrantPolicyFinding),
    ...validateCapabilityEnvelopeToolPermissions({
      goalArchetype,
      capabilityEnvelope: requestedCapabilities,
      policyTable
    }).violations.map(toolPermissionPolicyFinding),
    ...validateCapabilityEnvelopeBudgetLimits({
      goalArchetype,
      capabilityEnvelope: requestedCapabilities,
      policyTable
    }).violations.map(budgetLimitPolicyFinding)
  ];

  return {
    ok: findings.length === 0,
    goalArchetype,
    requestedCapabilities,
    ...authorityJustificationField(authorityJustification),
    allowedEnvelope: policy,
    findings
  };
}

function executeGrantPolicyFinding(
  violation: CapabilityEnvelopeExecuteGrantViolation
): IntentAdmissionPolicyFinding {
  return {
    code: "execute-authority-overage",
    fieldPath: violation.fieldPath,
    severity: violation.severity,
    message: violation.message,
    overridable: violation.overridable,
    overridden: violation.overridden,
    ...authorityJustificationField(violation.authorityJustification),
    ambiguityDimension: "constraints",
    ...(violation.overage !== undefined ? { overage: violation.overage } : {})
  };
}

function toolPermissionPolicyFinding(
  violation: CapabilityEnvelopeToolPermissionViolation
): IntentAdmissionPolicyFinding {
  return {
    code: "tool-authority-overage",
    fieldPath: violation.fieldPath,
    severity: violation.severity,
    message: violation.message,
    overridable: violation.overridable,
    overridden: violation.overridden,
    ...authorityJustificationField(violation.authorityJustification),
    ambiguityDimension: "constraints",
    toolPermissionViolationCode: violation.code,
    ...(violation.overage !== undefined ? { overage: violation.overage } : {})
  };
}

function budgetLimitPolicyFinding(
  violation: CapabilityEnvelopeBudgetLimitViolation
): IntentAdmissionPolicyFinding {
  return {
    code: "budget-authority-overage",
    fieldPath: violation.fieldPath,
    severity: violation.severity,
    message: violation.message,
    overridable: violation.overridable,
    overridden: violation.overridden,
    ...authorityJustificationField(violation.authorityJustification),
    ambiguityDimension: "constraints",
    budgetLimitViolationCode: violation.code,
    ...(violation.overage !== undefined ? { overage: violation.overage } : {})
  };
}
