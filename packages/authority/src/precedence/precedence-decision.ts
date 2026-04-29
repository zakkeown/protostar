import type { CapabilityEnvelope } from "@protostar/intent";

import type { TierConstraint, TierName } from "./tiers.js";

declare const PrecedenceDecisionBrand: unique symbol;

export interface PrecedenceDecisionDeniedAxis {
  readonly tier: TierName;
  readonly axis: string;
  readonly message: string;
}

export interface PrecedenceDecisionData {
  readonly schemaVersion: "1.0.0";
  readonly status: "no-conflict" | "resolved" | "blocked-by-tier";
  readonly resolvedEnvelope: CapabilityEnvelope;
  readonly tiers: readonly TierConstraint[];
  readonly blockedBy: readonly PrecedenceDecisionDeniedAxis[];
}

export type PrecedenceDecision = PrecedenceDecisionData & {
  readonly [PrecedenceDecisionBrand]: true;
};

export type PrecedenceDecisionBrandWitness = PrecedenceDecision;

export function mintPrecedenceDecision(data: PrecedenceDecisionData): PrecedenceDecision {
  return deepFreeze({
    ...data,
    resolvedEnvelope: copyCapabilityEnvelope(data.resolvedEnvelope),
    tiers: data.tiers.map((tier) => ({
      ...tier,
      envelope: copyTierEnvelope(tier.envelope)
    })),
    blockedBy: data.blockedBy.map((entry) => ({ ...entry }))
  }) as unknown as PrecedenceDecision;
}

function copyTierEnvelope(envelope: TierConstraint["envelope"]): TierConstraint["envelope"] {
  return {
    ...(envelope.repoScopes !== undefined ? { repoScopes: envelope.repoScopes.map((grant) => ({ ...grant })) } : {}),
    ...(envelope.toolPermissions !== undefined
      ? { toolPermissions: envelope.toolPermissions.map((grant) => ({ ...grant })) }
      : {}),
    ...(envelope.executeGrants !== undefined ? { executeGrants: envelope.executeGrants.map((grant) => ({ ...grant })) } : {}),
    ...(envelope.workspace !== undefined ? { workspace: { allowDirty: envelope.workspace.allowDirty } } : {}),
    ...(envelope.network !== undefined
      ? {
          network: {
            allow: envelope.network.allow,
            ...(envelope.network.allowedHosts !== undefined ? { allowedHosts: [...envelope.network.allowedHosts] } : {})
          }
        }
      : {}),
    ...(envelope.budget !== undefined ? { budget: { ...envelope.budget } } : {}),
    ...(envelope.allowedScopes !== undefined ? { allowedScopes: [...envelope.allowedScopes] } : {}),
    ...(envelope.budgetCaps !== undefined ? { budgetCaps: { ...envelope.budgetCaps } } : {}),
    ...(envelope.deniedTools !== undefined ? { deniedTools: [...envelope.deniedTools] } : {}),
    ...(envelope.trustOverride !== undefined ? { trustOverride: envelope.trustOverride } : {})
  };
}

function copyCapabilityEnvelope(envelope: CapabilityEnvelope): CapabilityEnvelope {
  return {
    repoScopes: envelope.repoScopes.map((grant) => ({ ...grant })),
    toolPermissions: envelope.toolPermissions.map((grant) => ({ ...grant })),
    ...(envelope.executeGrants !== undefined ? { executeGrants: envelope.executeGrants.map((grant) => ({ ...grant })) } : {}),
    workspace: { allowDirty: envelope.workspace?.allowDirty ?? false },
    ...(envelope.network !== undefined
      ? {
          network: {
            allow: envelope.network.allow,
            ...(envelope.network.allowedHosts !== undefined ? { allowedHosts: [...envelope.network.allowedHosts] } : {})
          }
        }
      : {}),
    budget: { ...envelope.budget }
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const propertyValue of Object.values(value)) {
    deepFreeze(propertyValue);
  }

  return Object.freeze(value);
}
