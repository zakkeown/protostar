import type { IntentDraft } from "./models.js";

import type { AdmitBugfixCapabilityEnvelopeInput, AdmitBugfixCapabilityEnvelopeResult, AdmitCosmeticTweakCapabilityEnvelopeInput, AdmitCosmeticTweakCapabilityEnvelopeResult, AdmitFeatureAddCapabilityEnvelopeInput, AdmitFeatureAddCapabilityEnvelopeResult, AdmitRefactorCapabilityEnvelopeInput, AdmitRefactorCapabilityEnvelopeResult, CapabilityEnvelopeBudgetLimitViolation, CapabilityEnvelopeExecuteGrantViolation, CapabilityEnvelopeOverageDetection, CapabilityEnvelopeToolPermissionViolation, DetectCapabilityEnvelopeOveragesInput, IntentAdmissionPolicyFinding, ValidateIntentDraftCapabilityEnvelopeAdmissionInput, ValidateIntentDraftCapabilityEnvelopeAdmissionResult } from "./promotion-contracts.js";

import { ARCHETYPE_POLICY_TABLE, BUGFIX_GOAL_ARCHETYPE, COSMETIC_TWEAK_GOAL_ARCHETYPE, FEATURE_ADD_GOAL_ARCHETYPE, REFACTOR_GOAL_ARCHETYPE } from "./archetypes.js";

import type { GoalArchetypePolicyEntry } from "./archetypes.js";

import { authorityJustificationField, isKnownGoalArchetype, normalizeAuthorityJustification, normalizeText, uniqueOrdered } from "./admission-shared.js";

import { bugfixAdmissionPathFindings, bugfixWrongPathFindings, cosmeticTweakAdmissionPathFindings, createBugfixUnsupportedDecision, createFeatureAddUnsupportedDecision, createRefactorUnsupportedDecision, evaluateGoalArchetypePolicySelection, featureAddAdmissionPathFindings, featureAddWrongPathFindings, refactorAdmissionPathFindings, refactorWrongPathFindings, stubGoalArchetypeAdmissionPathFindings } from "./admission-paths.js";

import { normalizeDraftCapabilityEnvelope } from "./capability-normalization.js";

import { validateCapabilityEnvelopeRepoScopes } from "./repo-scope-admission.js";

import { validateCapabilityEnvelopeBudgetLimits, validateCapabilityEnvelopeExecuteGrants, validateCapabilityEnvelopeToolPermissions } from "./capability-grant-admission.js";

const FEATURE_ADD_ALLOWED_PNPM_ADDS = Object.freeze([
  "@playwright/test@^1.59.1 -D",
  "fast-check@^4.7.0 -D",
  "clsx@^2.1.1",
  "zustand@^5.0.8",
  "react-aria-components@^1.13.0"
] as const);

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
    ...stubGoalArchetypeAdmissionPathFindings(goalArchetype, policyTable),
    ...validateFeatureAddPnpmAllowedAdds(goalArchetype, input.draft.capabilityEnvelope),
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

function validateFeatureAddPnpmAllowedAdds(
  goalArchetype: string,
  capabilityEnvelope: IntentDraft["capabilityEnvelope"]
): readonly IntentAdmissionPolicyFinding[] {
  const pnpm = capabilityEnvelope?.pnpm;
  if (pnpm === undefined) {
    return [];
  }

  if (goalArchetype !== FEATURE_ADD_GOAL_ARCHETYPE) {
    return [
      unallowlistedPnpmAddFinding({
        fieldPath: "capabilityEnvelope.pnpm",
        message: "unallowlisted-pnpm-add: capabilityEnvelope.pnpm.allowedAdds is only admitted for feature-add."
      })
    ];
  }

  if (pnpm.allowedAdds === undefined) {
    return [];
  }
  if (!Array.isArray(pnpm.allowedAdds)) {
    return [
      unallowlistedPnpmAddFinding({
        fieldPath: "capabilityEnvelope.pnpm.allowedAdds",
        message: "unallowlisted-pnpm-add: capabilityEnvelope.pnpm.allowedAdds must be an array of exact specs."
      })
    ];
  }

  return pnpm.allowedAdds.flatMap((requestedAdd, index): IntentAdmissionPolicyFinding[] => {
    if (
      typeof requestedAdd === "string" &&
      FEATURE_ADD_ALLOWED_PNPM_ADDS.includes(requestedAdd as typeof FEATURE_ADD_ALLOWED_PNPM_ADDS[number])
    ) {
      return [];
    }

    return [
      unallowlistedPnpmAddFinding({
        fieldPath: `capabilityEnvelope.pnpm.allowedAdds.${index}`,
        message:
          `unallowlisted-pnpm-add: capabilityEnvelope.pnpm.allowedAdds.${index} '${String(requestedAdd)}' is not an exact curated feature-add dependency spec.`
      })
    ];
  });
}

function unallowlistedPnpmAddFinding(input: {
  readonly fieldPath: IntentAdmissionPolicyFinding["fieldPath"];
  readonly message: string;
}): IntentAdmissionPolicyFinding {
  return {
    code: "unallowlisted-pnpm-add",
    fieldPath: input.fieldPath,
    severity: "block",
    message: input.message,
    overridable: false,
    overridden: false,
    ambiguityDimension: "constraints"
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
  const normalization = normalizeDraftCapabilityEnvelope(input.draft.capabilityEnvelope);
  const findings = [...wrongPathFindings, ...admission.findings];
  const decision = policyTable[FEATURE_ADD_GOAL_ARCHETYPE].status === "wired"
    ? undefined
    : createFeatureAddUnsupportedDecision(requestedGoalArchetype, policyTable);
  const errors = uniqueOrdered([
    ...(decision === undefined ? [] : [decision.message]),
    ...wrongPathFindings.map((finding) => finding.message),
    ...admission.unresolvedFindings.map((finding) => finding.message),
    ...normalization.errors
  ]);

  if (
    requestedGoalArchetype !== FEATURE_ADD_GOAL_ARCHETYPE ||
    policyTable[FEATURE_ADD_GOAL_ARCHETYPE].status !== "wired" ||
    admission.unresolvedFindings.length > 0 ||
    normalization.envelope === undefined
  ) {
    return {
      ok: false,
      goalArchetype: requestedGoalArchetype,
      ...(decision === undefined ? {} : { decision }),
      admission,
      findings,
      errors
    };
  }

  return {
    ok: true,
    goalArchetype: FEATURE_ADD_GOAL_ARCHETYPE,
    grant: {
      source: "feature-add-policy-admission",
      goalArchetype: FEATURE_ADD_GOAL_ARCHETYPE,
      policy: policyTable[FEATURE_ADD_GOAL_ARCHETYPE],
      capabilityEnvelope: normalization.envelope
    },
    admission,
    findings,
    errors: []
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
  const normalization = normalizeDraftCapabilityEnvelope(input.draft.capabilityEnvelope);
  const findings = [...wrongPathFindings, ...admission.findings];
  const decision = policyTable[REFACTOR_GOAL_ARCHETYPE].status === "wired"
    ? undefined
    : createRefactorUnsupportedDecision(requestedGoalArchetype, policyTable);
  const errors = uniqueOrdered([
    ...(decision === undefined ? [] : [decision.message]),
    ...wrongPathFindings.map((finding) => finding.message),
    ...admission.unresolvedFindings.map((finding) => finding.message),
    ...normalization.errors
  ]);

  if (
    requestedGoalArchetype !== REFACTOR_GOAL_ARCHETYPE ||
    policyTable[REFACTOR_GOAL_ARCHETYPE].status !== "wired" ||
    admission.unresolvedFindings.length > 0 ||
    normalization.envelope === undefined
  ) {
    return {
      ok: false,
      goalArchetype: requestedGoalArchetype,
      ...(decision === undefined ? {} : { decision }),
      admission,
      findings,
      errors
    };
  }

  return {
    ok: true,
    goalArchetype: REFACTOR_GOAL_ARCHETYPE,
    grant: {
      source: "refactor-policy-admission",
      goalArchetype: REFACTOR_GOAL_ARCHETYPE,
      policy: policyTable[REFACTOR_GOAL_ARCHETYPE],
      capabilityEnvelope: normalization.envelope
    },
    admission,
    findings,
    errors: []
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
  const normalization = normalizeDraftCapabilityEnvelope(input.draft.capabilityEnvelope);
  const findings = [...wrongPathFindings, ...admission.findings];
  const decision = policyTable[BUGFIX_GOAL_ARCHETYPE].status === "wired"
    ? undefined
    : createBugfixUnsupportedDecision(requestedGoalArchetype, policyTable);
  const errors = uniqueOrdered([
    ...(decision === undefined ? [] : [decision.message]),
    ...wrongPathFindings.map((finding) => finding.message),
    ...admission.unresolvedFindings.map((finding) => finding.message),
    ...normalization.errors
  ]);

  if (
    requestedGoalArchetype !== BUGFIX_GOAL_ARCHETYPE ||
    policyTable[BUGFIX_GOAL_ARCHETYPE].status !== "wired" ||
    admission.unresolvedFindings.length > 0 ||
    normalization.envelope === undefined
  ) {
    return {
      ok: false,
      goalArchetype: requestedGoalArchetype,
      ...(decision === undefined ? {} : { decision }),
      admission,
      findings,
      errors
    };
  }

  return {
    ok: true,
    goalArchetype: BUGFIX_GOAL_ARCHETYPE,
    grant: {
      source: "bugfix-policy-admission",
      goalArchetype: BUGFIX_GOAL_ARCHETYPE,
      policy: policyTable[BUGFIX_GOAL_ARCHETYPE],
      capabilityEnvelope: normalization.envelope
    },
    admission,
    findings,
    errors: []
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
