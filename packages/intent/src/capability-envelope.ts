import type { IntentDraftCapabilityEnvelope, RiskLevel, ToolPermissionLevel } from "./models.js";

import { isRecord, isRepoAccess, isRiskLevel, isToolPermissionLevel, normalizeOptionalText, readOptionalPathString, readString } from "./shared.js";

export interface RepoScopeGrant {
  readonly workspace: string;
  readonly path: string;
  readonly access: "read" | "write" | "execute";
}

export interface ToolPermissionGrant {
  readonly tool: string;
  readonly permissionLevel?: ToolPermissionLevel;
  readonly reason: string;
  readonly risk: RiskLevel;
}

export interface ExecuteGrant {
  readonly command: string;
  readonly scope: string;
  readonly reason?: string;
}

export interface FactoryBudget {
  readonly maxUsd?: number;
  readonly maxTokens?: number;
  readonly timeoutMs?: number;
  readonly adapterRetriesPerTask?: number;
  readonly taskWallClockMs?: number;
  readonly deliveryWallClockMs?: number;
  readonly maxRepairLoops?: number;
}

export interface CapabilityEnvelopeWorkspace {
  readonly allowDirty: boolean;
}

export type CapabilityEnvelopeNetworkAllow = "none" | "loopback" | "allowlist";

export interface CapabilityEnvelopeNetwork {
  readonly allow: CapabilityEnvelopeNetworkAllow;
  readonly allowedHosts?: readonly string[];
}

export interface DeliveryTarget {
  readonly owner: string;
  readonly repo: string;
  readonly baseBranch: string;
}

export interface CapabilityEnvelopeDelivery {
  readonly target: DeliveryTarget;
}

export interface CapabilityEnvelopePnpm {
  readonly allowedAdds?: readonly string[];
}

const CAPABILITY_ENVELOPE_MECHANICAL_ALLOWED_COMMANDS = [
  "verify",
  "typecheck",
  "lint",
  "test"
] as const;

export type CapabilityEnvelopeMechanicalCommand =
  (typeof CAPABILITY_ENVELOPE_MECHANICAL_ALLOWED_COMMANDS)[number];

export interface CapabilityEnvelopeMechanical {
  readonly allowed?: readonly CapabilityEnvelopeMechanicalCommand[];
}

export const CAPABILITY_ENVELOPE_REPAIR_LOOP_COUNT_POLICY_FIELD = "repair_loop_count";

export const CAPABILITY_ENVELOPE_REPAIR_LOOP_COUNT_ADMISSION_FAILURE_CODES = [
  "repair_loop_count_unknown_archetype",
  "repair_loop_count_exceeds_cap"
] as const;

export type CapabilityEnvelopeRepairLoopCountAdmissionFailureCode =
  (typeof CAPABILITY_ENVELOPE_REPAIR_LOOP_COUNT_ADMISSION_FAILURE_CODES)[number];

export interface GoalArchetypeRepairLoopCountPolicy {
  readonly repair_loop_count?: number;
  readonly budgets?: {
    readonly repair_loop_count?: number;
  };
}

export interface ValidateCapabilityEnvelopeRepairLoopCountInput {
  readonly goalArchetype: string;
  readonly capabilityEnvelope?: IntentDraftCapabilityEnvelope;
  readonly selectedGoalArchetypePolicy?: GoalArchetypeRepairLoopCountPolicy;
}

export interface CapabilityEnvelopeRepairLoopCountAdmissionFailure {
  readonly code: CapabilityEnvelopeRepairLoopCountAdmissionFailureCode;
  readonly goalArchetype: string;
  readonly fieldPath: "goalArchetype" | "capabilityEnvelope.budget.maxRepairLoops";
  readonly severity: "block" | "ambiguity";
  readonly message: string;
  readonly requestedRepairLoopCount?: number;
  readonly allowedRepairLoopCount?: number;
  readonly policyField: typeof CAPABILITY_ENVELOPE_REPAIR_LOOP_COUNT_POLICY_FIELD;
}

export interface ValidateCapabilityEnvelopeRepairLoopCountResult {
  readonly ok: boolean;
  readonly goalArchetype: string;
  readonly failures: readonly CapabilityEnvelopeRepairLoopCountAdmissionFailure[];
}

export const CAPABILITY_ENVELOPE_BUDGET_LIMIT_FIELDS = [
  "maxUsd",
  "maxTokens",
  "timeoutMs",
  "maxRepairLoops"
] as const;

export type BudgetLimitField = (typeof CAPABILITY_ENVELOPE_BUDGET_LIMIT_FIELDS)[number];

export type BudgetLimitFieldPath = `capabilityEnvelope.budget.${BudgetLimitField}`;

export interface CapabilityEnvelope {
  readonly repoScopes: readonly RepoScopeGrant[];
  readonly toolPermissions: readonly ToolPermissionGrant[];
  readonly executeGrants?: readonly ExecuteGrant[];
  readonly pnpm?: CapabilityEnvelopePnpm;
  readonly mechanical?: CapabilityEnvelopeMechanical;
  readonly workspace?: CapabilityEnvelopeWorkspace;
  readonly network?: CapabilityEnvelopeNetwork;
  readonly budget: FactoryBudget;
  readonly delivery?: CapabilityEnvelopeDelivery;
}

export function hasBudgetLimit(budget: FactoryBudget | IntentDraftCapabilityEnvelope["budget"] | undefined): boolean {
  if (budget === undefined) {
    return false;
  }

  return [budget.maxUsd, budget.maxTokens, budget.timeoutMs, budget.maxRepairLoops].some(isValidBudgetLimitValue);
}

export function isValidBudgetLimitValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function validateCapabilityEnvelopeRepairLoopCount(
  input: ValidateCapabilityEnvelopeRepairLoopCountInput
): ValidateCapabilityEnvelopeRepairLoopCountResult {
  const goalArchetype = normalizeOptionalText(input.goalArchetype) ?? "";
  const allowedRepairLoopCount = selectedGoalArchetypeRepairLoopCount(
    input.selectedGoalArchetypePolicy
  );

  if (allowedRepairLoopCount === undefined) {
    return {
      ok: false,
      goalArchetype,
      failures: [
        {
          code: "repair_loop_count_unknown_archetype",
          goalArchetype,
          fieldPath: "goalArchetype",
          severity: "block",
          message: goalArchetype.length === 0
            ? "Repair-loop admission cannot select a policy row because goalArchetype is missing."
            : `Repair-loop admission cannot select a repair_loop_count policy cap for goalArchetype '${goalArchetype}'.`,
          policyField: CAPABILITY_ENVELOPE_REPAIR_LOOP_COUNT_POLICY_FIELD
        }
      ]
    };
  }

  const requestedRepairLoopCount = input.capabilityEnvelope?.budget?.maxRepairLoops;
  if (
    typeof requestedRepairLoopCount !== "number" ||
    !Number.isFinite(requestedRepairLoopCount) ||
    requestedRepairLoopCount <= allowedRepairLoopCount
  ) {
    return {
      ok: true,
      goalArchetype,
      failures: []
    };
  }

  return {
    ok: false,
    goalArchetype,
    failures: [
      {
        code: "repair_loop_count_exceeds_cap",
        goalArchetype,
        fieldPath: "capabilityEnvelope.budget.maxRepairLoops",
        severity: "ambiguity",
        message:
          `capabilityEnvelope.budget.maxRepairLoops requests ${requestedRepairLoopCount} repair loops above the ${goalArchetype} policy repair_loop_count cap of ${allowedRepairLoopCount}.`,
        requestedRepairLoopCount,
        allowedRepairLoopCount,
        policyField: CAPABILITY_ENVELOPE_REPAIR_LOOP_COUNT_POLICY_FIELD
      }
    ]
  };
}

export const validateIntentDraftCapabilityEnvelopeRepairLoopCount =
  validateCapabilityEnvelopeRepairLoopCount;

function selectedGoalArchetypeRepairLoopCount(
  policy: GoalArchetypeRepairLoopCountPolicy | undefined
): number | undefined {
  const directCap = policy?.repair_loop_count;
  if (isValidRepairLoopCountPolicyCap(directCap)) {
    return directCap;
  }

  const budgetCap = policy?.budgets?.repair_loop_count;
  return isValidRepairLoopCountPolicyCap(budgetCap) ? budgetCap : undefined;
}

function isValidRepairLoopCountPolicyCap(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function parseCapabilityEnvelope(value: unknown, errors: string[]): CapabilityEnvelope {
  if (!isRecord(value)) {
    errors.push("capabilityEnvelope must be an object.");
    return {
      repoScopes: [],
      toolPermissions: [],
      workspace: { allowDirty: false },
      network: { allow: "loopback" },
      budget: defaultExecutionBudget()
    };
  }

  rejectUnknownKeys(
    value,
    ["repoScopes", "toolPermissions", "executeGrants", "pnpm", "mechanical", "workspace", "network", "budget", "delivery"],
    "capabilityEnvelope",
    errors
  );

  return {
    repoScopes: parseRepoScopes(value["repoScopes"], errors),
    toolPermissions: parseToolPermissions(value["toolPermissions"], errors),
    ...optionalExecuteGrants(value["executeGrants"], errors),
    ...optionalPnpm(value["pnpm"], errors),
    ...optionalMechanical(value["mechanical"], errors),
    workspace: parseWorkspace(value["workspace"], errors),
    network: parseNetwork(value["network"], errors),
    budget: parseBudget(value["budget"], errors),
    ...optionalDelivery(value["delivery"], errors)
  };
}

function optionalMechanical(
  value: unknown,
  errors: string[]
): Pick<CapabilityEnvelope, "mechanical"> | Record<string, never> {
  if (value === undefined) {
    return {};
  }

  return {
    mechanical: parseMechanical(value, errors)
  };
}

function parseMechanical(value: unknown, errors: string[]): CapabilityEnvelopeMechanical {
  if (!isRecord(value)) {
    errors.push("capabilityEnvelope.mechanical must be an object.");
    return {};
  }

  rejectUnknownKeys(value, ["allowed"], "capabilityEnvelope.mechanical", errors);
  const allowed = readMechanicalAllowed(value["allowed"], errors);
  return allowed === undefined ? {} : { allowed };
}

function readMechanicalAllowed(
  value: unknown,
  errors: string[]
): readonly CapabilityEnvelopeMechanicalCommand[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    errors.push("capabilityEnvelope.mechanical.allowed must be an array.");
    return undefined;
  }

  const allowedSet = new Set<string>(CAPABILITY_ENVELOPE_MECHANICAL_ALLOWED_COMMANDS);
  const seen = new Set<string>();
  const commands: CapabilityEnvelopeMechanicalCommand[] = [];
  let invalid = false;
  for (const [index, command] of value.entries()) {
    if (typeof command !== "string" || !allowedSet.has(command)) {
      errors.push(
        `capabilityEnvelope.mechanical.allowed[${index}] must be one of ${CAPABILITY_ENVELOPE_MECHANICAL_ALLOWED_COMMANDS.join(", ")}.`
      );
      invalid = true;
      continue;
    }
    if (seen.has(command)) {
      errors.push(`capabilityEnvelope.mechanical.allowed[${index}] is a duplicate of an earlier entry.`);
      invalid = true;
      continue;
    }
    seen.add(command);
    commands.push(command as CapabilityEnvelopeMechanicalCommand);
  }
  return invalid ? undefined : commands;
}

function optionalPnpm(
  value: unknown,
  errors: string[]
): Pick<CapabilityEnvelope, "pnpm"> | Record<string, never> {
  if (value === undefined) {
    return {};
  }

  return {
    pnpm: parsePnpm(value, errors)
  };
}

function parsePnpm(value: unknown, errors: string[]): CapabilityEnvelopePnpm {
  if (!isRecord(value)) {
    errors.push("capabilityEnvelope.pnpm must be an object.");
    return {};
  }

  rejectUnknownKeys(value, ["allowedAdds"], "capabilityEnvelope.pnpm", errors);
  const allowedAdds = readAllowedAdds(value["allowedAdds"], errors);
  return allowedAdds === undefined ? {} : { allowedAdds };
}

function readAllowedAdds(value: unknown, errors: string[]): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    errors.push("capabilityEnvelope.pnpm.allowedAdds must be a string array.");
    return undefined;
  }

  const adds: string[] = [];
  for (const [index, add] of value.entries()) {
    if (typeof add !== "string" || add.trim().length === 0) {
      errors.push(`capabilityEnvelope.pnpm.allowedAdds[${index}] must be a non-empty string.`);
      continue;
    }
    adds.push(add);
  }
  return adds.length === value.length ? adds : undefined;
}

function parseWorkspace(value: unknown, errors: string[]): CapabilityEnvelopeWorkspace {
  if (value === undefined) {
    errors.push("capabilityEnvelope.workspace must be an object.");
    return { allowDirty: false };
  }
  if (!isRecord(value)) {
    errors.push("capabilityEnvelope.workspace must be an object.");
    return { allowDirty: false };
  }

  rejectUnknownKeys(value, ["allowDirty"], "capabilityEnvelope.workspace", errors);

  const allowDirty = value["allowDirty"];
  if (typeof allowDirty !== "boolean") {
    errors.push("capabilityEnvelope.workspace.allowDirty must be a boolean.");
    return { allowDirty: false };
  }

  return { allowDirty };
}

function parseNetwork(value: unknown, errors: string[]): CapabilityEnvelopeNetwork {
  if (value === undefined) {
    errors.push("capabilityEnvelope.network must be an object.");
    return { allow: "loopback" };
  }
  if (!isRecord(value)) {
    errors.push("capabilityEnvelope.network must be an object.");
    return { allow: "loopback" };
  }

  rejectUnknownKeys(value, ["allow", "allowedHosts"], "capabilityEnvelope.network", errors);

  const allow = value["allow"];
  if (!isNetworkAllow(allow)) {
    errors.push("capabilityEnvelope.network.allow must be none, loopback, or allowlist.");
    return { allow: "loopback" };
  }

  const allowedHosts = readAllowedHosts(value["allowedHosts"], errors);
  if (allow === "allowlist" && allowedHosts === undefined) {
    errors.push("capabilityEnvelope.network.allowedHosts is required when network.allow is allowlist.");
  }
  if (allow !== "allowlist" && allowedHosts !== undefined) {
    return { allow, allowedHosts };
  }
  return allowedHosts === undefined ? { allow } : { allow, allowedHosts };
}

function isNetworkAllow(value: unknown): value is CapabilityEnvelopeNetworkAllow {
  return value === "none" || value === "loopback" || value === "allowlist";
}

function readAllowedHosts(value: unknown, errors: string[]): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    errors.push("capabilityEnvelope.network.allowedHosts must be a non-empty string array.");
    return undefined;
  }
  if (value.length === 0) {
    errors.push("capabilityEnvelope.network.allowedHosts must contain at least one host.");
    return undefined;
  }
  const hosts: string[] = [];
  for (const [index, host] of value.entries()) {
    if (typeof host !== "string" || host.trim().length === 0) {
      errors.push(`capabilityEnvelope.network.allowedHosts[${index}] must be a non-empty string.`);
      continue;
    }
    hosts.push(host);
  }
  return hosts.length === value.length ? hosts : undefined;
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
  errors: string[]
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      errors.push(`${path}.${key} is not allowed.`);
    }
  }
}

function parseRepoScopes(value: unknown, errors: string[]): readonly RepoScopeGrant[] {
  if (!Array.isArray(value)) {
    errors.push("capabilityEnvelope.repoScopes must be an array.");
    return [];
  }

  return value.flatMap((entry, index): RepoScopeGrant[] => {
    if (!isRecord(entry)) {
      errors.push(`capabilityEnvelope.repoScopes[${index}] must be an object.`);
      return [];
    }

    const workspace = readString(entry, `capabilityEnvelope.repoScopes[${index}].workspace`, errors);
    const path = readString(entry, `capabilityEnvelope.repoScopes[${index}].path`, errors);
    const access = readString(entry, `capabilityEnvelope.repoScopes[${index}].access`, errors);

    if (access !== undefined && !isRepoAccess(access)) {
      errors.push(`capabilityEnvelope.repoScopes[${index}].access must be read, write, or execute.`);
    }
    if (workspace === undefined || path === undefined || !isRepoAccess(access)) {
      return [];
    }

    return [{ workspace, path, access }];
  });
}

function parseToolPermissions(value: unknown, errors: string[]): readonly ToolPermissionGrant[] {
  if (!Array.isArray(value)) {
    errors.push("capabilityEnvelope.toolPermissions must be an array.");
    return [];
  }

  return value.flatMap((entry, index): ToolPermissionGrant[] => {
    if (!isRecord(entry)) {
      errors.push(`capabilityEnvelope.toolPermissions[${index}] must be an object.`);
      return [];
    }

    const tool = readString(entry, `capabilityEnvelope.toolPermissions[${index}].tool`, errors);
    const permissionLevelPath = `capabilityEnvelope.toolPermissions[${index}].permissionLevel`;
    const rawPermissionLevel = entry["permissionLevel"];
    const permissionLevel = rawPermissionLevel === undefined
      ? undefined
      : typeof rawPermissionLevel === "string" && rawPermissionLevel.trim().length > 0
        ? rawPermissionLevel
        : undefined;
    const normalizedPermissionLevel = isToolPermissionLevel(permissionLevel) ? permissionLevel : undefined;
    const reason = readString(entry, `capabilityEnvelope.toolPermissions[${index}].reason`, errors);
    const risk = readString(entry, `capabilityEnvelope.toolPermissions[${index}].risk`, errors);

    if (rawPermissionLevel !== undefined && permissionLevel === undefined) {
      errors.push(`${permissionLevelPath} must be a non-empty string when provided.`);
    } else if (permissionLevel !== undefined && normalizedPermissionLevel === undefined) {
      errors.push(`${permissionLevelPath} must be read, use, write, execute, or admin.`);
    }
    if (risk !== undefined && !isRiskLevel(risk)) {
      errors.push(`capabilityEnvelope.toolPermissions[${index}].risk must be low, medium, or high.`);
    }
    if (
      tool === undefined ||
      reason === undefined ||
      !isRiskLevel(risk) ||
      (permissionLevel !== undefined && normalizedPermissionLevel === undefined)
    ) {
      return [];
    }

    return [
      {
        tool,
        ...(normalizedPermissionLevel !== undefined ? { permissionLevel: normalizedPermissionLevel } : {}),
        reason,
        risk
      }
    ];
  });
}

function optionalExecuteGrants(
  value: unknown,
  errors: string[]
): Pick<CapabilityEnvelope, "executeGrants"> | Record<string, never> {
  if (value === undefined) {
    return {};
  }

  return {
    executeGrants: parseExecuteGrants(value, errors)
  };
}

function parseExecuteGrants(value: unknown, errors: string[]): readonly ExecuteGrant[] {
  if (!Array.isArray(value)) {
    errors.push("capabilityEnvelope.executeGrants must be an array.");
    return [];
  }

  return value.flatMap((entry, index): ExecuteGrant[] => {
    if (!isRecord(entry)) {
      errors.push(`capabilityEnvelope.executeGrants[${index}] must be an object.`);
      return [];
    }

    const command = readString(entry, `capabilityEnvelope.executeGrants[${index}].command`, errors);
    const scope = readExecuteGrantScope(entry, index, errors);
    const reason = readOptionalPathString(
      entry,
      "reason",
      `capabilityEnvelope.executeGrants[${index}].reason`,
      errors
    );

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

function readExecuteGrantScope(
  record: Record<string, unknown>,
  index: number,
  errors: string[]
): string | undefined {
  const scope = record["scope"];
  const executionScope = record["executionScope"];

  if (typeof scope === "string" && scope.trim().length > 0) {
    return scope;
  }
  if (typeof executionScope === "string" && executionScope.trim().length > 0) {
    return executionScope;
  }

  errors.push(`capabilityEnvelope.executeGrants[${index}].scope must be a non-empty string.`);
  return undefined;
}

function parseBudget(value: unknown, errors: string[]): FactoryBudget {
  if (value === undefined) {
    errors.push("capabilityEnvelope.budget must be an object.");
    return defaultExecutionBudget();
  }
  if (!isRecord(value)) {
    errors.push("capabilityEnvelope.budget must be an object.");
    return defaultExecutionBudget();
  }

  rejectUnknownKeys(
    value,
    ["maxUsd", "maxTokens", "timeoutMs", "adapterRetriesPerTask", "taskWallClockMs", "deliveryWallClockMs", "maxRepairLoops"],
    "capabilityEnvelope.budget",
    errors
  );

  return {
    ...readOptionalNumberObject(value, "maxUsd", "capabilityEnvelope.budget.maxUsd", errors),
    ...readOptionalNumberObject(value, "maxTokens", "capabilityEnvelope.budget.maxTokens", errors),
    ...readOptionalNumberObject(value, "timeoutMs", "capabilityEnvelope.budget.timeoutMs", errors),
    adapterRetriesPerTask: readRequiredInteger(
      value,
      "adapterRetriesPerTask",
      "capabilityEnvelope.budget.adapterRetriesPerTask",
      1,
      10,
      errors
    ),
    taskWallClockMs: readRequiredInteger(
      value,
      "taskWallClockMs",
      "capabilityEnvelope.budget.taskWallClockMs",
      1_000,
      1_800_000,
      errors
    ),
    deliveryWallClockMs: readIntegerWithDefault(
      value,
      "deliveryWallClockMs",
      "capabilityEnvelope.budget.deliveryWallClockMs",
      30_000,
      3_600_000,
      600_000,
      errors
    ),
    maxRepairLoops: readIntegerWithDefault(
      value,
      "maxRepairLoops",
      "capabilityEnvelope.budget.maxRepairLoops",
      1,
      10,
      3,
      errors
    )
  };
}

function readOptionalNumberObject(
  record: Record<string, unknown>,
  key: keyof FactoryBudget,
  path: string,
  errors: string[]
): Partial<FactoryBudget> {
  const value = record[key];
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    errors.push(`${path} must be a non-negative finite number when provided.`);
    return {};
  }
  return { [key]: value };
}

function optionalDelivery(
  value: unknown,
  errors: string[]
): Pick<CapabilityEnvelope, "delivery"> | Record<string, never> {
  if (value === undefined) {
    return {};
  }

  return {
    delivery: parseDelivery(value, errors)
  };
}

function parseDelivery(value: unknown, errors: string[]): CapabilityEnvelopeDelivery {
  if (!isRecord(value)) {
    errors.push("capabilityEnvelope.delivery must be an object.");
    return { target: { owner: "", repo: "", baseBranch: "" } };
  }

  rejectUnknownKeys(value, ["target"], "capabilityEnvelope.delivery", errors);

  return { target: parseDeliveryTarget(value["target"], errors) };
}

function parseDeliveryTarget(value: unknown, errors: string[]): DeliveryTarget {
  if (!isRecord(value)) {
    errors.push("capabilityEnvelope.delivery.target must be an object.");
    return { owner: "", repo: "", baseBranch: "" };
  }

  rejectUnknownKeys(value, ["owner", "repo", "baseBranch"], "capabilityEnvelope.delivery.target", errors);

  const owner = readString(value, "capabilityEnvelope.delivery.target.owner", errors);
  const repo = readString(value, "capabilityEnvelope.delivery.target.repo", errors);
  const baseBranch = readString(value, "capabilityEnvelope.delivery.target.baseBranch", errors);

  if (owner !== undefined && !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38}[a-zA-Z0-9])?$/.test(owner)) {
    errors.push("capabilityEnvelope.delivery.target.owner must be a GitHub owner name.");
  }
  if (repo !== undefined && !/^[a-zA-Z0-9._-]{1,100}$/.test(repo)) {
    errors.push("capabilityEnvelope.delivery.target.repo must be a GitHub repository name.");
  }
  if (baseBranch !== undefined && (!/^[a-zA-Z0-9._/-]+$/.test(baseBranch) || baseBranch.length > 244)) {
    errors.push("capabilityEnvelope.delivery.target.baseBranch must be a valid branch name up to 244 characters.");
  }

  return {
    owner: owner ?? "",
    repo: repo ?? "",
    baseBranch: baseBranch ?? ""
  };
}

function readRequiredInteger(
  record: Record<string, unknown>,
  key: keyof Pick<FactoryBudget, "adapterRetriesPerTask" | "taskWallClockMs" | "deliveryWallClockMs" | "maxRepairLoops">,
  path: string,
  minimum: number,
  maximum: number,
  errors: string[]
): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    errors.push(`${path} must be an integer from ${minimum} to ${maximum}.`);
    return minimum;
  }
  return value;
}

function readIntegerWithDefault(
  record: Record<string, unknown>,
  key: keyof Pick<FactoryBudget, "adapterRetriesPerTask" | "taskWallClockMs" | "deliveryWallClockMs" | "maxRepairLoops">,
  path: string,
  minimum: number,
  maximum: number,
  defaultValue: number,
  errors: string[]
): number {
  const value = record[key];
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    errors.push(`${path} must be an integer from ${minimum} to ${maximum}.`);
    return defaultValue;
  }
  return value;
}

function defaultExecutionBudget(): FactoryBudget {
  return {
    adapterRetriesPerTask: 4,
    taskWallClockMs: 180_000,
    maxRepairLoops: 3
  };
}
