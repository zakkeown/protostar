import type { CapabilityEnvelope } from "./capability-envelope.js";

import type { IntentDraftFieldPath } from "./draft-validation.js";

import type { RiskLevel, ToolPermissionLevel } from "./models.js";

// Local mirror of @protostar/artifacts.FactoryStage to avoid an intent ↔ artifacts dependency cycle
// (artifacts already imports IntentId from intent). The string union must stay byte-equivalent.
type FactoryStage = "intent" | "planning" | "execution" | "review" | "release";

export interface FactoryAutonomyPolicy {
  readonly allowDarkRun: boolean;
  readonly requiredHumanCheckpoints: readonly FactoryStage[];
  readonly maxAutonomousRisk: "low" | "medium" | "high";
}

export const SUPPORTED_GOAL_ARCHETYPES = [
  "cosmetic-tweak",
  "feature-add",
  "refactor",
  "bugfix",
  "factory-scaffold"
] as const;

export type GoalArchetype = (typeof SUPPORTED_GOAL_ARCHETYPES)[number];

export const COSMETIC_TWEAK_GOAL_ARCHETYPE = "cosmetic-tweak" as const satisfies GoalArchetype;

export const FEATURE_ADD_GOAL_ARCHETYPE = "feature-add" as const satisfies GoalArchetype;

export const REFACTOR_GOAL_ARCHETYPE = "refactor" as const satisfies GoalArchetype;

export const BUGFIX_GOAL_ARCHETYPE = "bugfix" as const satisfies GoalArchetype;

export type RepoAccessLevel = CapabilityEnvelope["repoScopes"][number]["access"];

export type GoalArchetypePolicyStatus = "wired" | "stub";

export type GoalArchetypeCapabilityGrantKind =
  | "repo_scope"
  | "tool_permissions"
  | "budgets"
  | "repair_loop_count";

export const REPO_SCOPE_ACCESS_VALUES = ["read", "write", "execute"] as const satisfies readonly RepoAccessLevel[];

export interface GoalArchetypeRepoScopePolicy {
  readonly required: boolean;
  readonly allowedValues: readonly RepoAccessLevel[];
  readonly maxAccess: RepoAccessLevel;
  readonly pathBoundary: "bounded" | "workspace" | "repository";
}

export type GoalArchetypeExecutionScope = GoalArchetypeRepoScopePolicy["pathBoundary"];

export interface GoalArchetypeCapabilityGrantsPolicy {
  readonly required: readonly GoalArchetypeCapabilityGrantKind[];
  readonly optional: readonly GoalArchetypeCapabilityGrantKind[];
  readonly forbidden: readonly GoalArchetypeCapabilityGrantKind[];
}

export interface GoalArchetypeToolPermissionsPolicy {
  readonly required: boolean;
  readonly maxToolRisk: RiskLevel;
  readonly allowedRiskLevels: readonly RiskLevel[];
}

export interface GoalArchetypeWriteGrantPolicy {
  readonly access: "write";
  readonly allowed: boolean;
  readonly pathBoundary: GoalArchetypeRepoScopePolicy["pathBoundary"];
  readonly overridable: boolean;
}

export interface GoalArchetypeExecuteGrantPolicy {
  readonly access: "execute";
  readonly allowed: boolean;
  readonly pathBoundary: GoalArchetypeRepoScopePolicy["pathBoundary"];
  readonly overridable: boolean;
  readonly allowedCommands: readonly string[];
  readonly allowedExecutionScopes: readonly GoalArchetypeExecutionScope[];
}

export interface GoalArchetypeToolPermissionLimitsPolicy {
  readonly required: boolean;
  readonly maxRisk: RiskLevel;
  readonly allowedRiskLevels: readonly RiskLevel[];
}

export interface GoalArchetypeToolPermissionGrantPolicy {
  readonly allowedTools: readonly string[];
  readonly allowedPermissionLevels: readonly ToolPermissionLevel[];
  readonly maxPermissionLevel: ToolPermissionLevel;
}

export interface GoalArchetypeBudgetPolicy {
  readonly maxUsd?: number;
  readonly maxTokens?: number;
  readonly timeoutMs: number;
  readonly repair_loop_count: number;
}

export interface GoalArchetypeCompatibilityBudgetCaps {
  readonly maxUsd?: number;
  readonly maxTokens?: number;
  readonly timeoutMs: number;
  readonly maxRepairLoops: number;
}

export interface GoalArchetypePolicyEntry {
  readonly status: GoalArchetypePolicyStatus;
  readonly repo_scope: GoalArchetypeRepoScopePolicy;
  readonly allowedRepoScopeValues: readonly RepoAccessLevel[];
  readonly grants: GoalArchetypeCapabilityGrantsPolicy;
  readonly writeGrant: GoalArchetypeWriteGrantPolicy;
  readonly executeGrant: GoalArchetypeExecuteGrantPolicy;
  readonly tool_permissions: GoalArchetypeToolPermissionsPolicy;
  readonly toolPermissionLimits: GoalArchetypeToolPermissionLimitsPolicy;
  readonly toolPermissionGrants: GoalArchetypeToolPermissionGrantPolicy;
  readonly budgets: GoalArchetypeBudgetPolicy;
  readonly repair_loop_count: number;
  readonly maxRepoAccess: RepoAccessLevel;
  readonly maxToolRisk: RiskLevel;
  readonly budgetCaps: GoalArchetypeCompatibilityBudgetCaps;
  readonly rationale: string;
}

export type GoalArchetypePolicy = GoalArchetypePolicyEntry;

export type GoalArchetypePolicyTable = Readonly<Record<GoalArchetype, GoalArchetypePolicyEntry>>;

export const V0_0_1_INTENT_ARCHETYPE_IDS = [
  "cosmetic-tweak",
  "feature-add",
  "refactor",
  "bugfix"
] as const;

export type V001IntentArchetypeId = (typeof V0_0_1_INTENT_ARCHETYPE_IDS)[number];

export type IntentArchetypeSupportStatus = "supported" | "unsupported";

export type IntentArchetypeCapabilityCapStatus = "wired" | "stub";

export interface IntentArchetypeRegistryEntry {
  readonly id: V001IntentArchetypeId;
  readonly supportStatus: IntentArchetypeSupportStatus;
  readonly supported: boolean;
  readonly capabilityCapStatus: IntentArchetypeCapabilityCapStatus;
  readonly policy: GoalArchetypePolicyEntry;
}

export type IntentArchetypeRegistry = Readonly<Record<V001IntentArchetypeId, IntentArchetypeRegistryEntry>>;

export type IntentArchetypeAutoTagSignalSource =
  | "explicit-goal-archetype"
  | "goal-text"
  | "acceptance-criteria"
  | "constraints"
  | "context"
  | "capability-envelope";

export interface IntentArchetypeAutoTagSignal {
  readonly archetype: GoalArchetype;
  readonly source: IntentArchetypeAutoTagSignalSource;
  readonly fieldPath: IntentDraftFieldPath;
  readonly matchedText: string;
  readonly weight: number;
}

export interface IntentArchetypeAutoTagScore {
  readonly archetype: GoalArchetype;
  readonly score: number;
  readonly rawScore: number;
  readonly signals: readonly IntentArchetypeAutoTagSignal[];
}

export interface IntentArchetypeAutoTagSuggestion {
  readonly archetype: GoalArchetype;
  readonly confidence: number;
  readonly rationale: string;
  readonly scores: readonly IntentArchetypeAutoTagScore[];
  readonly signals: readonly IntentArchetypeAutoTagSignal[];
}

export const GOAL_ARCHETYPE_POLICY_TABLE = {
  "cosmetic-tweak": {
    status: "wired",
    repo_scope: {
      required: true,
      allowedValues: ["read", "write"],
      maxAccess: "write",
      pathBoundary: "bounded"
    },
    allowedRepoScopeValues: ["read", "write"],
    grants: {
      required: ["repo_scope", "tool_permissions", "budgets", "repair_loop_count"],
      optional: [],
      forbidden: []
    },
    writeGrant: {
      access: "write",
      allowed: true,
      pathBoundary: "bounded",
      overridable: false
    },
    executeGrant: {
      access: "execute",
      allowed: false,
      pathBoundary: "bounded",
      overridable: true,
      allowedCommands: [],
      allowedExecutionScopes: []
    },
    tool_permissions: {
      required: true,
      maxToolRisk: "low",
      allowedRiskLevels: ["low"]
    },
    toolPermissionLimits: {
      required: true,
      maxRisk: "low",
      allowedRiskLevels: ["low"]
    },
    toolPermissionGrants: {
      allowedTools: ["node:test", "typescript", "shell", "network"],
      allowedPermissionLevels: ["read", "use"],
      maxPermissionLevel: "use"
    },
    budgets: {
      timeoutMs: 300_000,
      repair_loop_count: 1
    },
    repair_loop_count: 1,
    maxRepoAccess: "write",
    maxToolRisk: "low",
    budgetCaps: {
      timeoutMs: 300_000,
      maxRepairLoops: 1
    },
    rationale: "Cosmetic tweaks may edit bounded repository paths with low-risk tools and one repair loop."
  },
  "feature-add": {
    status: "stub",
    repo_scope: {
      required: true,
      allowedValues: ["read", "write"],
      maxAccess: "write",
      pathBoundary: "bounded"
    },
    allowedRepoScopeValues: ["read", "write"],
    grants: {
      required: ["repo_scope", "tool_permissions", "budgets"],
      optional: ["repair_loop_count"],
      forbidden: []
    },
    writeGrant: {
      access: "write",
      allowed: true,
      pathBoundary: "bounded",
      overridable: false
    },
    executeGrant: {
      access: "execute",
      allowed: false,
      pathBoundary: "bounded",
      overridable: true,
      allowedCommands: [],
      allowedExecutionScopes: []
    },
    tool_permissions: {
      required: true,
      maxToolRisk: "medium",
      allowedRiskLevels: ["low", "medium"]
    },
    toolPermissionLimits: {
      required: true,
      maxRisk: "medium",
      allowedRiskLevels: ["low", "medium"]
    },
    toolPermissionGrants: {
      allowedTools: ["*"],
      allowedPermissionLevels: ["read", "use", "write"],
      maxPermissionLevel: "write"
    },
    budgets: {
      timeoutMs: 900_000,
      repair_loop_count: 2
    },
    repair_loop_count: 2,
    maxRepoAccess: "write",
    maxToolRisk: "medium",
    budgetCaps: {
      timeoutMs: 900_000,
      maxRepairLoops: 2
    },
    rationale: "Feature-add caps are unsupported v0.0.1 stub admission limits reserved for a later policy wiring pass."
  },
  refactor: {
    status: "stub",
    repo_scope: {
      required: true,
      allowedValues: ["read", "write"],
      maxAccess: "write",
      pathBoundary: "bounded"
    },
    allowedRepoScopeValues: ["read", "write"],
    grants: {
      required: ["repo_scope", "tool_permissions", "budgets"],
      optional: ["repair_loop_count"],
      forbidden: []
    },
    writeGrant: {
      access: "write",
      allowed: true,
      pathBoundary: "bounded",
      overridable: false
    },
    executeGrant: {
      access: "execute",
      allowed: false,
      pathBoundary: "bounded",
      overridable: true,
      allowedCommands: [],
      allowedExecutionScopes: []
    },
    tool_permissions: {
      required: true,
      maxToolRisk: "medium",
      allowedRiskLevels: ["low", "medium"]
    },
    toolPermissionLimits: {
      required: true,
      maxRisk: "medium",
      allowedRiskLevels: ["low", "medium"]
    },
    toolPermissionGrants: {
      allowedTools: ["*"],
      allowedPermissionLevels: ["read", "use", "write"],
      maxPermissionLevel: "write"
    },
    budgets: {
      timeoutMs: 900_000,
      repair_loop_count: 2
    },
    repair_loop_count: 2,
    maxRepoAccess: "write",
    maxToolRisk: "medium",
    budgetCaps: {
      timeoutMs: 900_000,
      maxRepairLoops: 2
    },
    rationale: "Refactor caps are unsupported v0.0.1 stub admission limits reserved for a later policy wiring pass."
  },
  bugfix: {
    status: "stub",
    repo_scope: {
      required: true,
      allowedValues: ["read", "write"],
      maxAccess: "write",
      pathBoundary: "bounded"
    },
    allowedRepoScopeValues: ["read", "write"],
    grants: {
      required: ["repo_scope", "tool_permissions", "budgets"],
      optional: ["repair_loop_count"],
      forbidden: []
    },
    writeGrant: {
      access: "write",
      allowed: true,
      pathBoundary: "bounded",
      overridable: false
    },
    executeGrant: {
      access: "execute",
      allowed: false,
      pathBoundary: "bounded",
      overridable: true,
      allowedCommands: [],
      allowedExecutionScopes: []
    },
    tool_permissions: {
      required: true,
      maxToolRisk: "medium",
      allowedRiskLevels: ["low", "medium"]
    },
    toolPermissionLimits: {
      required: true,
      maxRisk: "medium",
      allowedRiskLevels: ["low", "medium"]
    },
    toolPermissionGrants: {
      allowedTools: ["*"],
      allowedPermissionLevels: ["read", "use", "write"],
      maxPermissionLevel: "write"
    },
    budgets: {
      timeoutMs: 600_000,
      repair_loop_count: 2
    },
    repair_loop_count: 2,
    maxRepoAccess: "write",
    maxToolRisk: "medium",
    budgetCaps: {
      timeoutMs: 600_000,
      maxRepairLoops: 2
    },
    rationale: "Bugfix caps are unsupported v0.0.1 stub admission limits reserved for a later policy wiring pass."
  },
  "factory-scaffold": {
    status: "stub",
    repo_scope: {
      required: true,
      allowedValues: ["read", "write"],
      maxAccess: "write",
      pathBoundary: "repository"
    },
    allowedRepoScopeValues: ["read", "write"],
    grants: {
      required: ["repo_scope", "tool_permissions", "budgets"],
      optional: ["repair_loop_count"],
      forbidden: []
    },
    writeGrant: {
      access: "write",
      allowed: true,
      pathBoundary: "repository",
      overridable: false
    },
    executeGrant: {
      access: "execute",
      allowed: false,
      pathBoundary: "repository",
      overridable: true,
      allowedCommands: [],
      allowedExecutionScopes: []
    },
    tool_permissions: {
      required: true,
      maxToolRisk: "medium",
      allowedRiskLevels: ["low", "medium"]
    },
    toolPermissionLimits: {
      required: true,
      maxRisk: "medium",
      allowedRiskLevels: ["low", "medium"]
    },
    toolPermissionGrants: {
      allowedTools: ["*"],
      allowedPermissionLevels: ["read", "use", "write"],
      maxPermissionLevel: "write"
    },
    budgets: {
      timeoutMs: 1_200_000,
      repair_loop_count: 2
    },
    repair_loop_count: 2,
    maxRepoAccess: "write",
    maxToolRisk: "medium",
    budgetCaps: {
      timeoutMs: 1_200_000,
      maxRepairLoops: 2
    },
    rationale: "Factory-scaffold caps are placeholder admission limits reserved for a later policy wiring pass."
  }
} as const satisfies GoalArchetypePolicyTable;

export const ARCHETYPE_POLICY_TABLE: GoalArchetypePolicyTable = GOAL_ARCHETYPE_POLICY_TABLE;

export const INTENT_ARCHETYPE_REGISTRY = {
  "cosmetic-tweak": {
    id: "cosmetic-tweak",
    supportStatus: "supported",
    supported: true,
    capabilityCapStatus: "wired",
    policy: GOAL_ARCHETYPE_POLICY_TABLE["cosmetic-tweak"]
  },
  "feature-add": {
    id: "feature-add",
    supportStatus: "unsupported",
    supported: false,
    capabilityCapStatus: "stub",
    policy: GOAL_ARCHETYPE_POLICY_TABLE["feature-add"]
  },
  refactor: {
    id: "refactor",
    supportStatus: "unsupported",
    supported: false,
    capabilityCapStatus: "stub",
    policy: GOAL_ARCHETYPE_POLICY_TABLE.refactor
  },
  bugfix: {
    id: "bugfix",
    supportStatus: "unsupported",
    supported: false,
    capabilityCapStatus: "stub",
    policy: GOAL_ARCHETYPE_POLICY_TABLE.bugfix
  }
} as const satisfies IntentArchetypeRegistry;

export const V0_0_1_INTENT_ARCHETYPE_REGISTRY = INTENT_ARCHETYPE_REGISTRY;
