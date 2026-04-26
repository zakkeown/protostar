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
  readonly maxRepairLoops?: number;
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

export type BudgetLimitField = keyof FactoryBudget;

export type BudgetLimitFieldPath = `capabilityEnvelope.budget.${BudgetLimitField}`;

export const CAPABILITY_ENVELOPE_BUDGET_LIMIT_FIELDS = [
  "maxUsd",
  "maxTokens",
  "timeoutMs",
  "maxRepairLoops"
] as const satisfies readonly BudgetLimitField[];

export interface CapabilityEnvelope {
  readonly repoScopes: readonly RepoScopeGrant[];
  readonly toolPermissions: readonly ToolPermissionGrant[];
  readonly executeGrants?: readonly ExecuteGrant[];
  readonly budget: FactoryBudget;
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
      budget: {}
    };
  }

  return {
    repoScopes: parseRepoScopes(value["repoScopes"], errors),
    toolPermissions: parseToolPermissions(value["toolPermissions"], errors),
    ...optionalExecuteGrants(value["executeGrants"], errors),
    budget: parseBudget(value["budget"], errors)
  };
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
    return {};
  }
  if (!isRecord(value)) {
    errors.push("capabilityEnvelope.budget must be an object.");
    return {};
  }

  return {
    ...readOptionalNumberObject(value, "maxUsd", "capabilityEnvelope.budget.maxUsd", errors),
    ...readOptionalNumberObject(value, "maxTokens", "capabilityEnvelope.budget.maxTokens", errors),
    ...readOptionalNumberObject(value, "timeoutMs", "capabilityEnvelope.budget.timeoutMs", errors),
    ...readOptionalNumberObject(value, "maxRepairLoops", "capabilityEnvelope.budget.maxRepairLoops", errors)
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
