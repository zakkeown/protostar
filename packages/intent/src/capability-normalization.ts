import type { CapabilityEnvelope, CapabilityEnvelopeNetwork } from "./capability-envelope.js";

import type { IntentDraft, IntentDraftCapabilityEnvelope } from "./models.js";

import { explicitToolPermissionLevelValue, isRepoAccess, isRiskLevel, normalizeText, normalizeToolPermissionLevel, toolPermissionLevelFieldPath } from "./admission-shared.js";

export function normalizeDraftCapabilityEnvelope(
  envelope: IntentDraft["capabilityEnvelope"]
):
  | {
      readonly envelope: CapabilityEnvelope;
      readonly errors: readonly string[];
    }
  | {
      readonly envelope?: undefined;
      readonly errors: readonly string[];
    } {
  const errors: string[] = [];

  if (envelope === undefined) {
    return {
      errors: ["capabilityEnvelope must be provided before promotion."]
    };
  }

  const repoScopes = (envelope.repoScopes ?? []).flatMap((scope, index): CapabilityEnvelope["repoScopes"][number][] => {
    const workspace = normalizeText(scope.workspace);
    const path = normalizeText(scope.path);

    if (workspace === undefined) {
      errors.push(`capabilityEnvelope.repoScopes.${index}.workspace must be non-empty.`);
    }
    if (path === undefined) {
      errors.push(`capabilityEnvelope.repoScopes.${index}.path must be non-empty.`);
    }
    if (!isRepoAccess(scope.access)) {
      errors.push(`capabilityEnvelope.repoScopes.${index}.access must be read, write, or execute.`);
    }
    if (workspace === undefined || path === undefined || !isRepoAccess(scope.access)) {
      return [];
    }

    return [{ workspace, path, access: scope.access }];
  });

  const toolPermissions = (envelope.toolPermissions ?? []).flatMap(
    (grant, index): CapabilityEnvelope["toolPermissions"][number][] => {
      const tool = normalizeText(grant.tool);
      const reason = normalizeText(grant.reason);
      const providedPermissionLevel = explicitToolPermissionLevelValue(grant);
      const permissionLevel = providedPermissionLevel === undefined
        ? undefined
        : normalizeToolPermissionLevel(providedPermissionLevel);

      if (tool === undefined) {
        errors.push(`capabilityEnvelope.toolPermissions.${index}.tool must be non-empty.`);
      }
      if (reason === undefined) {
        errors.push(`capabilityEnvelope.toolPermissions.${index}.reason must be non-empty.`);
      }
      if (providedPermissionLevel !== undefined && permissionLevel === undefined) {
        errors.push(
          `${toolPermissionLevelFieldPath(grant, index)} must be read, use, write, execute, or admin.`
        );
      }
      if (!isRiskLevel(grant.risk)) {
        errors.push(`capabilityEnvelope.toolPermissions.${index}.risk must be low, medium, or high.`);
      }
      if (
        tool === undefined ||
        reason === undefined ||
        !isRiskLevel(grant.risk) ||
        (providedPermissionLevel !== undefined && permissionLevel === undefined)
      ) {
        return [];
      }

      return [
        {
          tool,
          ...(permissionLevel !== undefined ? { permissionLevel } : {}),
          reason,
          risk: grant.risk
        }
      ];
    }
  );
  const executeGrants = normalizeDraftExecuteGrants(envelope.executeGrants, errors);

  const budget = normalizeBudget(envelope.budget);
  if (!hasBudgetLimit(budget)) {
    errors.push("capabilityEnvelope.budget must contain at least one non-negative finite limit.");
  }

  if (errors.length > 0) {
    return {
      errors
    };
  }

  return {
    envelope: {
      repoScopes,
      toolPermissions,
      ...(executeGrants !== undefined ? { executeGrants } : {}),
      workspace: { allowDirty: envelope.workspace?.allowDirty ?? false },
      network: normalizeNetwork(envelope.network),
      budget,
      ...(envelope.delivery?.target !== undefined
        ? {
            delivery: {
              target: {
                owner: envelope.delivery.target.owner ?? "",
                repo: envelope.delivery.target.repo ?? "",
                baseBranch: envelope.delivery.target.baseBranch ?? ""
              }
            }
          }
        : {})
    },
    errors: []
  };
}

function normalizeDraftExecuteGrants(
  grants: IntentDraftCapabilityEnvelope["executeGrants"],
  errors: string[]
): CapabilityEnvelope["executeGrants"] | undefined {
  if (grants === undefined) {
    return undefined;
  }
  if (!Array.isArray(grants)) {
    errors.push("capabilityEnvelope.executeGrants must be an array.");
    return undefined;
  }

  return grants.flatMap((grant, index): NonNullable<CapabilityEnvelope["executeGrants"]>[number][] => {
    const command = normalizeText(grant.command);
    const scope = normalizeText(grant.scope) ?? normalizeText(grant.executionScope);
    const reason = normalizeText(grant.reason);

    if (command === undefined) {
      errors.push(`capabilityEnvelope.executeGrants.${index}.command must be non-empty.`);
    }
    if (scope === undefined) {
      errors.push(`capabilityEnvelope.executeGrants.${index}.scope must be non-empty.`);
    }
    if (command === undefined || scope === undefined) {
      return [];
    }

    return [
      {
        command,
        scope,
        ...(reason !== undefined ? { reason } : {})
      }
    ];
  });
}

type DraftBudget = NonNullable<IntentDraft["capabilityEnvelope"]>["budget"];

function normalizeBudget(budget: DraftBudget | undefined): CapabilityEnvelope["budget"] {
  if (budget === undefined) {
    return defaultBudget();
  }

  return {
    ...numberField("maxUsd", budget.maxUsd),
    ...numberField("maxTokens", budget.maxTokens),
    ...numberField("timeoutMs", budget.timeoutMs),
    adapterRetriesPerTask: integerField(budget.adapterRetriesPerTask, 4),
    taskWallClockMs: integerField(budget.taskWallClockMs, 180_000),
    deliveryWallClockMs: integerField(budget.deliveryWallClockMs, 600_000),
    maxRepairLoops: integerField(budget.maxRepairLoops, 3)
  } satisfies CapabilityEnvelope["budget"];
}

function normalizeNetwork(
  network: NonNullable<IntentDraftCapabilityEnvelope["network"]> | undefined
): CapabilityEnvelopeNetwork {
  if (network?.allow === "allowlist") {
    return {
      allow: "allowlist",
      ...(network.allowedHosts !== undefined ? { allowedHosts: network.allowedHosts } : {})
    };
  }

  if (network?.allow === "none" || network?.allow === "loopback") {
    return { allow: network.allow };
  }

  return { allow: "loopback" };
}

function defaultBudget(): CapabilityEnvelope["budget"] {
  return {
    adapterRetriesPerTask: 4,
    taskWallClockMs: 180_000,
    deliveryWallClockMs: 600_000,
    maxRepairLoops: 3
  };
}

function numberField<Key extends keyof CapabilityEnvelope["budget"]>(
  key: Key,
  value: unknown
): Partial<CapabilityEnvelope["budget"]> {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? { [key]: value }
    : {};
}

function integerField(value: unknown, defaultValue: number): number {
  return typeof value === "number" && Number.isInteger(value) ? value : defaultValue;
}

function hasBudgetLimit(budget: DraftBudget | CapabilityEnvelope["budget"] | undefined): boolean {
  if (budget === undefined) {
    return false;
  }

  return [budget.maxUsd, budget.maxTokens, budget.timeoutMs, budget.maxRepairLoops].some(
    (value) => typeof value === "number" && Number.isFinite(value) && value >= 0
  );
}
