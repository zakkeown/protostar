import type { AcceptanceCriterion, DeepReadonly, IntentDraftId, IntentId } from "./models.js";

import type { IntentAmbiguityMode } from "./ambiguity-scoring.js";

import { parseCapabilityEnvelope } from "./capability-envelope.js";

import type { CapabilityEnvelope, FactoryBudget } from "./capability-envelope.js";

import { isRecord, normalizeOptionalText, readOptionalString, readOptionalStringArray, readString } from "./shared.js";

import { parseAcceptanceCriteria } from "./acceptance-criteria.js";

export interface ConfirmedIntentShape {
  readonly id: IntentId;
  readonly sourceDraftId?: IntentDraftId;
  readonly mode?: IntentAmbiguityMode;
  readonly goalArchetype?: string;
  readonly title: string;
  readonly problem: string;
  readonly requester: string;
  readonly confirmedAt: string;
  readonly context?: string;
  readonly acceptanceCriteria: readonly AcceptanceCriterion[];
  readonly capabilityEnvelope: CapabilityEnvelope;
  readonly constraints: readonly string[];
  readonly stopConditions: readonly string[];
}

export type ConfirmedIntent = DeepReadonly<ConfirmedIntentShape>;

export interface ConfirmedIntentInput {
  readonly id: IntentId;
  readonly sourceDraftId?: IntentDraftId;
  readonly mode?: IntentAmbiguityMode;
  readonly goalArchetype?: string;
  readonly title: string;
  readonly problem: string;
  readonly requester: string;
  readonly context?: string;
  readonly acceptanceCriteria: readonly AcceptanceCriterion[];
  readonly capabilityEnvelope: CapabilityEnvelope;
  readonly constraints?: readonly string[];
  readonly stopConditions?: readonly string[];
  readonly confirmedAt?: string;
}

export interface ConfirmedIntentParseResult {
  readonly ok: boolean;
  readonly intent?: ConfirmedIntent;
  readonly errors: readonly string[];
}

export function defineConfirmedIntent(input: ConfirmedIntentInput): ConfirmedIntent {
  if (input.acceptanceCriteria.length === 0) {
    throw new Error("Confirmed intent requires at least one acceptance criterion.");
  }

  return freezeConfirmedIntent({
    id: input.id,
    ...(input.sourceDraftId !== undefined ? { sourceDraftId: input.sourceDraftId } : {}),
    ...(input.mode !== undefined ? { mode: input.mode } : {}),
    ...optionalNormalizedTextProperty("goalArchetype", input.goalArchetype),
    title: input.title,
    problem: input.problem,
    requester: input.requester,
    confirmedAt: input.confirmedAt ?? new Date().toISOString(),
    ...optionalNormalizedTextProperty("context", input.context),
    acceptanceCriteria: input.acceptanceCriteria.map(copyAcceptanceCriterion),
    capabilityEnvelope: copyCapabilityEnvelope(input.capabilityEnvelope),
    constraints: copyStringList(input.constraints),
    stopConditions: copyStringList(input.stopConditions)
  });
}

function freezeConfirmedIntent(intent: ConfirmedIntentShape): ConfirmedIntent {
  return deepFreeze(intent);
}

function copyAcceptanceCriterion(criterion: AcceptanceCriterion): AcceptanceCriterion {
  const common = {
    id: criterion.id,
    statement: criterion.statement
  };
  const justification = normalizeOptionalText(criterion.justification);

  if (criterion.verification === "manual") {
    return {
      ...common,
      verification: "manual",
      justification: justification ?? ""
    };
  }

  return {
    ...common,
    verification: criterion.verification,
    ...(justification !== undefined ? { justification } : {})
  };
}

function copyCapabilityEnvelope(envelope: CapabilityEnvelope): CapabilityEnvelope {
  return {
    repoScopes: envelope.repoScopes.map((grant) => ({
      workspace: grant.workspace,
      path: grant.path,
      access: grant.access
    })),
    toolPermissions: envelope.toolPermissions.map((grant) => ({
      tool: grant.tool,
      ...(grant.permissionLevel !== undefined ? { permissionLevel: grant.permissionLevel } : {}),
      reason: grant.reason,
      risk: grant.risk
    })),
    ...(envelope.executeGrants !== undefined
      ? {
          executeGrants: envelope.executeGrants.map((grant) => ({
            command: grant.command,
            scope: grant.scope,
            ...(grant.reason !== undefined ? { reason: grant.reason } : {})
          }))
        }
      : {}),
    budget: copyFactoryBudget(envelope.budget)
  };
}

function copyFactoryBudget(budget: FactoryBudget): FactoryBudget {
  return {
    ...(budget.maxUsd !== undefined ? { maxUsd: budget.maxUsd } : {}),
    ...(budget.maxTokens !== undefined ? { maxTokens: budget.maxTokens } : {}),
    ...(budget.timeoutMs !== undefined ? { timeoutMs: budget.timeoutMs } : {}),
    ...(budget.maxRepairLoops !== undefined ? { maxRepairLoops: budget.maxRepairLoops } : {})
  };
}

function optionalNormalizedTextProperty<Key extends string>(
  key: Key,
  value: unknown
): Partial<Record<Key, string>> {
  const normalized = normalizeOptionalText(value);
  return normalized === undefined ? {} : { [key]: normalized } as Partial<Record<Key, string>>;
}

function copyStringList(values: readonly string[] | undefined): readonly string[] {
  return values?.map((value) => normalizeOptionalText(value)).filter((value): value is string => value !== undefined) ?? [];
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (!isFreezable(value) || Object.isFrozen(value)) {
    return value as DeepReadonly<T>;
  }

  for (const propertyValue of Object.values(value)) {
    deepFreeze(propertyValue);
  }

  return Object.freeze(value) as DeepReadonly<T>;
}

function isFreezable(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseConfirmedIntent(value: unknown): ConfirmedIntentParseResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return {
      ok: false,
      errors: ["Intent file must contain a JSON object."]
    };
  }

  const id = readString(value, "id", errors);
  const sourceDraftId = readOptionalString(value, "sourceDraftId", errors);
  const mode = readOptionalIntentAmbiguityMode(value, "mode", errors);
  const goalArchetype = readOptionalString(value, "goalArchetype", errors);
  const title = readString(value, "title", errors);
  const problem = readString(value, "problem", errors);
  const requester = readString(value, "requester", errors);
  const confirmedAt = readOptionalString(value, "confirmedAt", errors);
  const context = readOptionalString(value, "context", errors);
  const constraints = readOptionalStringArray(value, "constraints", errors);
  const stopConditions = readOptionalStringArray(value, "stopConditions", errors);
  const acceptanceCriteria = parseAcceptanceCriteria(value["acceptanceCriteria"], errors);
  const capabilityEnvelope = parseCapabilityEnvelope(value["capabilityEnvelope"], errors);

  if (id !== undefined && !id.startsWith("intent_")) {
    errors.push("id must start with intent_.");
  }
  if (sourceDraftId !== undefined && !sourceDraftId.startsWith("draft_")) {
    errors.push("sourceDraftId must start with draft_.");
  }
  if (acceptanceCriteria.length === 0) {
    errors.push("acceptanceCriteria must contain at least one entry.");
  }

  if (errors.length > 0 || id === undefined || title === undefined || problem === undefined || requester === undefined) {
    return {
      ok: false,
      errors
    };
  }

  return {
    ok: true,
    errors: [],
    intent: defineConfirmedIntent({
      id: id as IntentId,
      ...(sourceDraftId !== undefined ? { sourceDraftId: sourceDraftId as IntentDraftId } : {}),
      ...(mode !== undefined ? { mode } : {}),
      ...(goalArchetype !== undefined ? { goalArchetype } : {}),
      title,
      problem,
      requester,
      acceptanceCriteria,
      capabilityEnvelope,
      ...(context !== undefined ? { context } : {}),
      ...(constraints !== undefined ? { constraints } : {}),
      ...(stopConditions !== undefined ? { stopConditions } : {}),
      ...(confirmedAt !== undefined ? { confirmedAt } : {})
    })
  };
}

export function assertConfirmedIntent(value: unknown): ConfirmedIntent {
  const result = parseConfirmedIntent(value);
  if (!result.ok || !result.intent) {
    throw new Error(`Invalid confirmed intent: ${result.errors.join("; ")}`);
  }
  return result.intent;
}

function readOptionalIntentAmbiguityMode(
  record: Record<string, unknown>,
  key: string,
  errors: string[]
): IntentAmbiguityMode | undefined {
  const value = readOptionalString(record, key, errors);
  if (value === undefined) {
    return undefined;
  }
  if (value === "greenfield" || value === "brownfield") {
    return value;
  }

  errors.push(`${key} must be greenfield or brownfield when provided.`);
  return undefined;
}
