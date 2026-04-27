import type { RepoScopeGrant, ToolPermissionGrant } from "@protostar/intent";

import type { TierEnvelope, TrustOverride } from "../precedence/index.js";

export interface RepoPolicy extends TierEnvelope {
  readonly schemaVersion: "1.0.0";
  readonly allowedScopes?: readonly string[];
  readonly repoScopes?: readonly RepoScopeGrant[];
  readonly toolPermissions?: readonly ToolPermissionGrant[];
  readonly deniedTools?: readonly string[];
  readonly budgetCaps?: {
    readonly maxUsd?: number;
    readonly maxTokens?: number;
    readonly timeoutMs?: number;
    readonly maxRepairLoops?: number;
  };
  readonly trustOverride?: TrustOverride;
}

export type ParseRepoPolicyResult =
  | { readonly ok: true; readonly policy: RepoPolicy; readonly errors: readonly string[] }
  | { readonly ok: false; readonly errors: readonly string[] };

/**
 * A3 lock — see .planning/phases/02-authority-governance-kernel/02-CONTEXT.md and
 * the planning_context A3 directive: when `.protostar/repo-policy.json` is absent,
 * the factory-cli loader (Plan 07) supplies THIS constant as the repo-policy tier
 * contribution to `intersectEnvelopes`. Default DENY matches dark-factory posture.
 *
 * Research recommended default-permissive; the orchestrator inverted to
 * default-DENY in planning_context for Phase 2.
 */
export const DENY_ALL_REPO_POLICY: RepoPolicy = deepFreeze({
  schemaVersion: "1.0.0",
  allowedScopes: [],
  deniedTools: [],
  trustOverride: "untrusted"
});

const TOP_LEVEL_KEYS = new Set(["schemaVersion", "allowedScopes", "repoScopes", "toolPermissions", "deniedTools", "budgetCaps", "trustOverride"]);
const BUDGET_CAP_KEYS = new Set(["maxUsd", "maxTokens", "timeoutMs", "maxRepairLoops"]);

export function parseRepoPolicy(input: unknown): ParseRepoPolicyResult {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: ["Repo policy must be an object."] };
  }

  rejectUnknownKeys(input, TOP_LEVEL_KEYS, "", errors);

  if (input["schemaVersion"] !== "1.0.0") {
    errors.push("schemaVersion must be 1.0.0.");
  }

  const allowedScopes = readOptionalStringArray(input, "allowedScopes", errors);
  const repoScopes = readOptionalRepoScopes(input["repoScopes"], errors);
  const toolPermissions = readOptionalToolPermissions(input["toolPermissions"], errors);
  const deniedTools = readOptionalStringArray(input, "deniedTools", errors);
  const budgetCaps = readOptionalBudgetCaps(input["budgetCaps"], errors);
  const trustOverride = readOptionalTrustOverride(input["trustOverride"], errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    policy: deepFreeze({
      schemaVersion: "1.0.0",
      ...(allowedScopes !== undefined ? { allowedScopes } : {}),
      ...(repoScopes !== undefined ? { repoScopes } : {}),
      ...(toolPermissions !== undefined ? { toolPermissions } : {}),
      ...(deniedTools !== undefined ? { deniedTools } : {}),
      ...(budgetCaps !== undefined ? { budgetCaps } : {}),
      ...(trustOverride !== undefined ? { trustOverride } : {})
    }),
    errors: []
  };
}

function readOptionalRepoScopes(value: unknown, errors: string[]): RepoScopeGrant[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    errors.push("repoScopes must be an array of repo scope grant objects.");
    return undefined;
  }

  const scopes: RepoScopeGrant[] = [];
  value.forEach((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      errors.push(`repoScopes[${index}] must be an object.`);
      return;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record["workspace"] !== "string") {
      errors.push(`repoScopes[${index}].workspace must be a string.`);
      return;
    }
    if (typeof record["path"] !== "string") {
      errors.push(`repoScopes[${index}].path must be a string.`);
      return;
    }
    const access = record["access"];
    if (access !== "read" && access !== "write" && access !== "execute") {
      errors.push(`repoScopes[${index}].access must be read, write, or execute.`);
      return;
    }
    scopes.push({ workspace: record["workspace"], path: record["path"], access } as RepoScopeGrant);
  });

  return scopes;
}

function readOptionalToolPermissions(value: unknown, errors: string[]): ToolPermissionGrant[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    errors.push("toolPermissions must be an array of tool permission grant objects.");
    return undefined;
  }

  const permissions: ToolPermissionGrant[] = [];
  value.forEach((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      errors.push(`toolPermissions[${index}] must be an object.`);
      return;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record["tool"] !== "string") {
      errors.push(`toolPermissions[${index}].tool must be a string.`);
      return;
    }
    permissions.push({ tool: record["tool"], ...(typeof record["permissionLevel"] === "string" ? { permissionLevel: record["permissionLevel"] } : {}) } as ToolPermissionGrant);
  });

  return permissions;
}

function readOptionalStringArray(
  record: Record<string, unknown>,
  key: "allowedScopes" | "deniedTools",
  errors: string[]
): readonly string[] | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    errors.push(`${key} must be an array of strings.`);
    return undefined;
  }

  const strings: string[] = [];
  value.forEach((entry, index) => {
    if (typeof entry !== "string") {
      errors.push(`${key}[${index}] must be a string.`);
      return;
    }
    strings.push(entry);
  });

  return strings;
}

function readOptionalBudgetCaps(value: unknown, errors: string[]): RepoPolicy["budgetCaps"] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    errors.push("budgetCaps must be an object.");
    return undefined;
  }

  rejectUnknownKeys(value, BUDGET_CAP_KEYS, "budgetCaps.", errors);
  const caps: Record<string, number> = {};
  for (const key of BUDGET_CAP_KEYS) {
    const cap = value[key];
    if (cap === undefined) {
      continue;
    }
    if (typeof cap !== "number" || !Number.isFinite(cap) || cap < 0) {
      errors.push(`budgetCaps.${key} must be a non-negative finite number.`);
      continue;
    }
    caps[key] = cap;
  }

  return caps;
}

function readOptionalTrustOverride(value: unknown, errors: string[]): TrustOverride | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "trusted" || value === "untrusted") {
    return value;
  }

  errors.push("trustOverride must be trusted or untrusted.");
  return undefined;
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  prefix: string,
  errors: string[]
): void {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      errors.push(`${prefix}${key} is not allowed.`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
