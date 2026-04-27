import type { CapabilityEnvelopeWorkspace, ExecuteGrant, FactoryBudget, RepoScopeGrant, ToolPermissionGrant } from "@protostar/intent";

export type TierName = "confirmed-intent" | "policy" | "repo-policy" | "operator-settings";

export const TIER_PRECEDENCE_ORDER: readonly TierName[] = [
  "confirmed-intent",
  "policy",
  "repo-policy",
  "operator-settings"
] as const;

export type TrustOverride = "trusted" | "untrusted";

export interface TierEnvelope {
  readonly repoScopes?: readonly RepoScopeGrant[];
  readonly toolPermissions?: readonly ToolPermissionGrant[];
  readonly executeGrants?: readonly ExecuteGrant[];
  readonly workspace?: CapabilityEnvelopeWorkspace;
  readonly budget?: FactoryBudget;
  readonly allowedScopes?: readonly string[];
  readonly budgetCaps?: FactoryBudget;
  readonly deniedTools?: readonly string[];
  readonly trustOverride?: TrustOverride;
}

export interface TierConstraint {
  readonly tier: TierName;
  readonly envelope: TierEnvelope;
  readonly source: string;
}
