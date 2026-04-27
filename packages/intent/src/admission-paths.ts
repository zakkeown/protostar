import type { IntentDraft } from "./models.js";

import type { BugfixCapabilityEnvelopeUnsupportedDecision, FeatureAddCapabilityEnvelopeUnsupportedDecision, IntentAdmissionPolicyFinding, RefactorCapabilityEnvelopeUnsupportedDecision } from "./promotion-contracts.js";

import { hasText, isKnownGoalArchetype } from "./admission-shared.js";

import { ARCHETYPE_POLICY_TABLE, BUGFIX_GOAL_ARCHETYPE, COSMETIC_TWEAK_GOAL_ARCHETYPE, FEATURE_ADD_GOAL_ARCHETYPE, INTENT_ARCHETYPE_REGISTRY, REFACTOR_GOAL_ARCHETYPE } from "./archetypes.js";

import type { GoalArchetypePolicyTable } from "./archetypes.js";

export function evaluateGoalArchetypePolicySelection(draft: IntentDraft): readonly IntentAdmissionPolicyFinding[] {
  const archetype = draft.goalArchetype;

  if (!hasText(archetype)) {
    return [
      {
        code: "missing-goal-archetype",
        fieldPath: "goalArchetype",
        severity: "block",
        message: "goalArchetype is structurally missing, so capability caps cannot be selected.",
        overridable: false,
        overridden: false
      }
    ];
  }

  if (!isKnownGoalArchetype(archetype)) {
    return [
      {
        code: "unknown-goal-archetype",
        fieldPath: "goalArchetype",
        severity: "block",
        message: `goalArchetype '${archetype}' is not present in the policy table.`,
        overridable: false,
        overridden: false
      }
    ];
  }

  return [];
}

export function cosmeticTweakAdmissionPathFindings(goalArchetype: string): readonly IntentAdmissionPolicyFinding[] {
  if (goalArchetype.length === 0 || !isKnownGoalArchetype(goalArchetype)) {
    return [];
  }

  if (goalArchetype === COSMETIC_TWEAK_GOAL_ARCHETYPE) {
    return [];
  }

  return [
    {
      code: "unsupported-goal-archetype",
      fieldPath: "goalArchetype",
      severity: "block",
      message:
        `The cosmetic-tweak admission path cannot grant a capability envelope for goalArchetype '${goalArchetype}'.`,
      overridable: false,
      overridden: false
    }
  ];
}

export function featureAddAdmissionPathFindings(
  goalArchetype: string,
  policyTable: GoalArchetypePolicyTable = ARCHETYPE_POLICY_TABLE
): readonly IntentAdmissionPolicyFinding[] {
  if (goalArchetype !== FEATURE_ADD_GOAL_ARCHETYPE) {
    return [];
  }

  const decision = createFeatureAddUnsupportedDecision(goalArchetype, policyTable);

  return [
    {
      code: "unsupported-goal-archetype",
      fieldPath: "goalArchetype",
      severity: "block",
      message: decision.message,
      overridable: false,
      overridden: false
    }
  ];
}

export function refactorAdmissionPathFindings(
  goalArchetype: string,
  policyTable: GoalArchetypePolicyTable = ARCHETYPE_POLICY_TABLE
): readonly IntentAdmissionPolicyFinding[] {
  if (goalArchetype !== REFACTOR_GOAL_ARCHETYPE) {
    return [];
  }

  const decision = createRefactorUnsupportedDecision(goalArchetype, policyTable);

  return [
    {
      code: "unsupported-goal-archetype",
      fieldPath: "goalArchetype",
      severity: "block",
      message: decision.message,
      overridable: false,
      overridden: false
    }
  ];
}

export function bugfixAdmissionPathFindings(
  goalArchetype: string,
  policyTable: GoalArchetypePolicyTable = ARCHETYPE_POLICY_TABLE
): readonly IntentAdmissionPolicyFinding[] {
  if (goalArchetype !== BUGFIX_GOAL_ARCHETYPE) {
    return [];
  }

  const decision = createBugfixUnsupportedDecision(goalArchetype, policyTable);

  return [
    {
      code: "unsupported-goal-archetype",
      fieldPath: "goalArchetype",
      severity: "block",
      message: decision.message,
      overridable: false,
      overridden: false
    }
  ];
}

export function featureAddWrongPathFindings(goalArchetype: string): readonly IntentAdmissionPolicyFinding[] {
  if (goalArchetype.length === 0 || !isKnownGoalArchetype(goalArchetype)) {
    return [];
  }

  return [
    {
      code: "unsupported-goal-archetype",
      fieldPath: "goalArchetype",
      severity: "block",
      message:
        `The feature-add admission path cannot grant a capability envelope for goalArchetype '${goalArchetype}'.`,
      overridable: false,
      overridden: false
    }
  ];
}

export function refactorWrongPathFindings(goalArchetype: string): readonly IntentAdmissionPolicyFinding[] {
  if (goalArchetype.length === 0 || !isKnownGoalArchetype(goalArchetype)) {
    return [];
  }

  return [
    {
      code: "unsupported-goal-archetype",
      fieldPath: "goalArchetype",
      severity: "block",
      message:
        `The refactor admission path cannot grant a capability envelope for goalArchetype '${goalArchetype}'.`,
      overridable: false,
      overridden: false
    }
  ];
}

export function bugfixWrongPathFindings(goalArchetype: string): readonly IntentAdmissionPolicyFinding[] {
  if (goalArchetype.length === 0 || !isKnownGoalArchetype(goalArchetype)) {
    return [];
  }

  return [
    {
      code: "unsupported-goal-archetype",
      fieldPath: "goalArchetype",
      severity: "block",
      message:
        `The bugfix admission path cannot grant a capability envelope for goalArchetype '${goalArchetype}'.`,
      overridable: false,
      overridden: false
    }
  ];
}

export function createFeatureAddUnsupportedDecision(
  requestedGoalArchetype: string,
  policyTable: GoalArchetypePolicyTable
): FeatureAddCapabilityEnvelopeUnsupportedDecision {
  const registryEntry = INTENT_ARCHETYPE_REGISTRY[FEATURE_ADD_GOAL_ARCHETYPE];
  const policy = policyTable[FEATURE_ADD_GOAL_ARCHETYPE];

  return {
    source: "feature-add-policy-admission",
    goalArchetype: FEATURE_ADD_GOAL_ARCHETYPE,
    requestedGoalArchetype,
    decision: "unsupported",
    supportStatus: registryEntry.supportStatus,
    capabilityCapStatus: registryEntry.capabilityCapStatus,
    stubCap: policy,
    message:
      "Feature-add admission path is unsupported in v0.0.1: " +
      "the feature-add policy row exposes stub capability caps but cannot grant a ConfirmedIntent until the row is wired."
  };
}

export function createRefactorUnsupportedDecision(
  requestedGoalArchetype: string,
  policyTable: GoalArchetypePolicyTable
): RefactorCapabilityEnvelopeUnsupportedDecision {
  const registryEntry = INTENT_ARCHETYPE_REGISTRY[REFACTOR_GOAL_ARCHETYPE];
  const policy = policyTable[REFACTOR_GOAL_ARCHETYPE];

  return {
    source: "refactor-policy-admission",
    goalArchetype: REFACTOR_GOAL_ARCHETYPE,
    requestedGoalArchetype,
    decision: "unsupported",
    supportStatus: registryEntry.supportStatus,
    capabilityCapStatus: registryEntry.capabilityCapStatus,
    stubCap: policy,
    message:
      "Refactor admission path is unsupported in v0.0.1: " +
      "the refactor policy row exposes stub capability caps but cannot grant a ConfirmedIntent until the row is wired."
  };
}

export function createBugfixUnsupportedDecision(
  requestedGoalArchetype: string,
  policyTable: GoalArchetypePolicyTable
): BugfixCapabilityEnvelopeUnsupportedDecision {
  const registryEntry = INTENT_ARCHETYPE_REGISTRY[BUGFIX_GOAL_ARCHETYPE];
  const policy = policyTable[BUGFIX_GOAL_ARCHETYPE];

  return {
    source: "bugfix-policy-admission",
    goalArchetype: BUGFIX_GOAL_ARCHETYPE,
    requestedGoalArchetype,
    decision: "unsupported",
    supportStatus: registryEntry.supportStatus,
    capabilityCapStatus: registryEntry.capabilityCapStatus,
    stubCap: policy,
    message:
      "Bugfix admission path is unsupported in v0.0.1: " +
      "the bugfix policy row exposes stub capability caps but cannot grant a ConfirmedIntent until the row is wired."
  };
}
