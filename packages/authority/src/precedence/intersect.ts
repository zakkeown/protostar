import type {
  CapabilityEnvelope,
  ExecuteGrant,
  FactoryBudget,
  RepoScopeGrant,
  ToolPermissionGrant
} from "@protostar/intent";

import { mintPrecedenceDecision, type PrecedenceDecision, type PrecedenceDecisionDeniedAxis } from "./precedence-decision.js";
import type { TierConstraint } from "./tiers.js";

const BUDGET_FIELDS = ["maxUsd", "maxTokens", "timeoutMs", "maxRepairLoops"] as const;

type BudgetField = (typeof BUDGET_FIELDS)[number];

export function intersectEnvelopes(tiers: readonly TierConstraint[]): PrecedenceDecision {
  if (tiers.length === 0) {
    return mintPrecedenceDecision({
      schemaVersion: "1.0.0",
      status: "no-conflict",
      resolvedEnvelope: buildOpenEnvelope(),
      tiers,
      blockedBy: []
    });
  }

  const blockedBy: PrecedenceDecisionDeniedAxis[] = [
    ...collectEmptyAxisDenials(tiers, "repoScopes"),
    ...collectEmptyAxisDenials(tiers, "toolPermissions"),
    ...collectEmptyAxisDenials(tiers, "executeGrants"),
    ...collectDeniedToolEntries(tiers),
    ...collectUntrustedEntries(tiers)
  ];
  const resolvedEnvelope: CapabilityEnvelope = {
    repoScopes: intersectRepoScopes(tiers),
    toolPermissions: subtractDeniedTools(intersectToolPermissions(tiers), tiers),
    ...optionalExecuteGrants(intersectExecuteGrants(tiers)),
    budget: intersectBudgets(tiers)
  };

  return mintPrecedenceDecision({
    schemaVersion: "1.0.0",
    status: blockedBy.length > 0 ? "blocked-by-tier" : statusForResolvedEnvelope(tiers, resolvedEnvelope),
    resolvedEnvelope,
    tiers,
    blockedBy
  });
}

function buildOpenEnvelope(): CapabilityEnvelope {
  return {
    repoScopes: [],
    toolPermissions: [],
    budget: {}
  };
}

function statusForResolvedEnvelope(
  tiers: readonly TierConstraint[],
  resolvedEnvelope: CapabilityEnvelope
): "no-conflict" | "resolved" {
  const first = tiers[0]?.envelope;
  if (first === undefined) {
    return "no-conflict";
  }

  return tiers.every((tier) => sameEnvelopeForPrecedence(tier.envelope, resolvedEnvelope)) ? "no-conflict" : "resolved";
}

function intersectRepoScopes(tiers: readonly TierConstraint[]): readonly RepoScopeGrant[] {
  return intersectByKey(tiers.map(repoScopesForTier), repoScopeKey);
}

function intersectToolPermissions(tiers: readonly TierConstraint[]): readonly ToolPermissionGrant[] {
  return intersectByKey(tiers.map((tier) => tier.envelope.toolPermissions ?? []), toolPermissionKey);
}

function intersectExecuteGrants(tiers: readonly TierConstraint[]): readonly ExecuteGrant[] | undefined {
  if (tiers.every((tier) => tier.envelope.executeGrants === undefined)) {
    return undefined;
  }

  return intersectByKey(tiers.map((tier) => tier.envelope.executeGrants ?? []), executeGrantKey);
}

function optionalExecuteGrants(grants: readonly ExecuteGrant[] | undefined): Pick<CapabilityEnvelope, "executeGrants"> | object {
  return grants === undefined ? {} : { executeGrants: grants };
}

function intersectBudgets(tiers: readonly TierConstraint[]): FactoryBudget {
  const budget: Partial<Record<BudgetField, number>> = {};

  for (const field of BUDGET_FIELDS) {
    const values = tiers
      .map((tier) => (tier.envelope.budgetCaps ?? tier.envelope.budget ?? {})[field])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (values.length > 0) {
      budget[field] = Math.min(...values);
    }
  }

  return budget;
}

function subtractDeniedTools(
  toolPermissions: readonly ToolPermissionGrant[],
  tiers: readonly TierConstraint[]
): readonly ToolPermissionGrant[] {
  const deniedTools = new Set(tiers.flatMap((tier) => tier.envelope.deniedTools ?? []));
  if (deniedTools.size === 0) {
    return toolPermissions;
  }

  return toolPermissions.filter((grant) => !deniedTools.has(grant.tool));
}

function collectEmptyAxisDenials(
  tiers: readonly TierConstraint[],
  axis: "repoScopes" | "toolPermissions" | "executeGrants"
): readonly PrecedenceDecisionDeniedAxis[] {
  const anyOtherTierHasValues = tiers.some((tier) => axisValues(tier, axis).length > 0);
  if (!anyOtherTierHasValues) {
    return [];
  }

  return tiers.flatMap((tier) => {
    const values = axisValues(tier, axis);
    return values.length === 0
      ? [{
          tier: tier.tier,
          axis,
          message: `${tier.tier} denies ${axis} by contributing an empty allowlist from ${tier.source}.`
        }]
      : [];
  });
}

function collectDeniedToolEntries(tiers: readonly TierConstraint[]): readonly PrecedenceDecisionDeniedAxis[] {
  return tiers.flatMap((tier) =>
    (tier.envelope.deniedTools ?? []).map((tool) => ({
      tier: tier.tier,
      axis: "deniedTools",
      message: `${tier.tier} denies tool '${tool}' from ${tier.source}.`
    }))
  );
}

function collectUntrustedEntries(tiers: readonly TierConstraint[]): readonly PrecedenceDecisionDeniedAxis[] {
  return tiers.flatMap((tier) =>
    tier.envelope.trustOverride === "untrusted"
      ? [{
          tier: tier.tier,
          axis: "trustOverride",
          message: `${tier.tier} marks the workspace untrusted from ${tier.source}.`
        }]
      : []
  );
}

function axisValues(
  tier: TierConstraint,
  axis: "repoScopes" | "toolPermissions" | "executeGrants"
): readonly unknown[] {
  if (axis === "executeGrants") {
    return tier.envelope.executeGrants ?? [];
  }
  if (axis === "repoScopes") {
    return repoScopesForTier(tier);
  }

  return tier.envelope[axis] ?? [];
}

function intersectByKey<Item>(
  lists: readonly (readonly Item[])[],
  keyOf: (item: Item) => string
): readonly Item[] {
  const [first = [], ...rest] = lists;
  return first
    .filter((item) => rest.every((list) => list.some((candidate) => keyOf(candidate) === keyOf(item))))
    .map((item) => ({ ...item }));
}

function sameEnvelopeForPrecedence(left: TierConstraint["envelope"], right: CapabilityEnvelope): boolean {
  return (
    sameKeys(left.repoScopes ?? [], right.repoScopes, repoScopeKey) &&
    sameKeys(left.toolPermissions ?? [], right.toolPermissions, toolPermissionKey) &&
    sameKeys(left.executeGrants ?? [], right.executeGrants ?? [], executeGrantKey) &&
    BUDGET_FIELDS.every((field) => (left.budgetCaps ?? left.budget ?? {})[field] === right.budget[field])
  );
}

function sameKeys<Item>(
  left: readonly Item[],
  right: readonly Item[],
  keyOf: (item: Item) => string
): boolean {
  const leftKeys = left.map(keyOf).sort();
  const rightKeys = right.map(keyOf).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index]);
}

function repoScopeKey(grant: RepoScopeGrant): string {
  return `${grant.workspace}\u0000${grant.path}\u0000${grant.access}`;
}

function toolPermissionKey(grant: ToolPermissionGrant): string {
  return `${grant.tool}\u0000${grant.permissionLevel ?? ""}`;
}

function executeGrantKey(grant: ExecuteGrant): string {
  return `${grant.command}\u0000${grant.scope}`;
}

function repoScopesForTier(tier: TierConstraint): readonly RepoScopeGrant[] {
  if (tier.envelope.repoScopes !== undefined) {
    return tier.envelope.repoScopes;
  }
  if (tier.envelope.allowedScopes === undefined) {
    return [];
  }

  return tier.envelope.allowedScopes.map((scope) => ({
    workspace: "*",
    path: scope,
    access: "read"
  }));
}
