import type { AcceptanceCriterion, DeepReadonly, IntentDraftId, IntentId } from "./models.js";

import type { IntentAmbiguityMode } from "./ambiguity-scoring.js";

import { parseCapabilityEnvelope } from "./capability-envelope.js";

import type { CapabilityEnvelope, FactoryBudget } from "./capability-envelope.js";

import { isRecord, normalizeOptionalText, readOptionalString, readOptionalStringArray, readString } from "./shared.js";

import { parseAcceptanceCriteria } from "./acceptance-criteria.js";

// Module-private brand. NOT exported. Foreign callers cannot name this symbol,
// so they cannot fabricate a ConfirmedIntent without going through
// mintConfirmedIntent (sibling-internal) or buildConfirmedIntentForTest
// (internal/test-builders subpath).
declare const ConfirmedIntentBrand: unique symbol;

export type CanonicalFormTag = "json-c14n@1.0";

export interface SignatureEnvelope {
  readonly algorithm: "sha256";
  readonly canonicalForm: CanonicalFormTag;
  readonly value: string;
  readonly intentHash: string;
  readonly envelopeHash: string;
  readonly policySnapshotHash: string;
}

interface ConfirmedIntentBaseShape {
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
  readonly schemaVersion: "1.4.0";
  readonly signature: SignatureEnvelope | null;
}

// Un-branded payload — the structural shape of a confirmed intent.
// parseConfirmedIntent returns this on the success branch; consumers that
// need the brand must re-promote via promoteIntentDraft.
export type ConfirmedIntentData = DeepReadonly<ConfirmedIntentBaseShape>;

// Branded ConfirmedIntent. The brand is module-private; foreign object
// literals fail type-check because they cannot supply the brand property.
export type ConfirmedIntent = ConfirmedIntentData & {
  readonly [ConfirmedIntentBrand]: true;
};

export interface ConfirmedIntentParseSuccess {
  readonly ok: true;
  readonly data: ConfirmedIntentData;
  readonly errors: readonly string[];
}

export interface ConfirmedIntentParseFailure {
  readonly ok: false;
  readonly errors: readonly string[];
}

export type ConfirmedIntentParseResult = ConfirmedIntentParseSuccess | ConfirmedIntentParseFailure;

export interface ConfirmedIntentMintInput {
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
  readonly schemaVersion?: "1.4.0";
  readonly signature?: SignatureEnvelope | null;
}

/**
 * Module-internal mint. Exported so sibling files (promote-intent-draft.ts
 * and internal/test-builders.ts) can produce ConfirmedIntent values, but
 * NOT re-exported from any public/subpath barrel — see Plan 06b Task D for
 * the contract test that pins this.
 *
 * Folds the freeze + normalization that the deleted public producer used to do.
 */
export function mintConfirmedIntent(input: ConfirmedIntentMintInput): ConfirmedIntent {
  if (input.acceptanceCriteria.length === 0) {
    throw new Error("Confirmed intent requires at least one acceptance criterion.");
  }

  const data: ConfirmedIntentBaseShape = {
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
    stopConditions: copyStringList(input.stopConditions),
    schemaVersion: "1.4.0",
    signature: input.signature ?? null
  };

  return deepFreeze(data) as ConfirmedIntent;
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
    workspace: {
      allowDirty: envelope.workspace?.allowDirty ?? false
    },
    network: {
      allow: envelope.network?.allow ?? "loopback",
      ...(envelope.network?.allowedHosts !== undefined ? { allowedHosts: envelope.network.allowedHosts.map((host) => host) } : {})
    },
    budget: copyFactoryBudget(envelope.budget)
  };
}

function copyFactoryBudget(budget: FactoryBudget): FactoryBudget {
  return {
    ...(budget.maxUsd !== undefined ? { maxUsd: budget.maxUsd } : {}),
    ...(budget.maxTokens !== undefined ? { maxTokens: budget.maxTokens } : {}),
    ...(budget.timeoutMs !== undefined ? { timeoutMs: budget.timeoutMs } : {}),
    ...(budget.adapterRetriesPerTask !== undefined ? { adapterRetriesPerTask: budget.adapterRetriesPerTask } : {}),
    ...(budget.taskWallClockMs !== undefined ? { taskWallClockMs: budget.taskWallClockMs } : {}),
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

function isFreezable(value: unknown): value is object {
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
  const schemaVersion = readOptionalSchemaVersion(value, errors);
  const signature = readOptionalSignature(value, errors);

  if (id !== undefined && !id.startsWith("intent_")) {
    errors.push("id must start with intent_.");
  }
  if (sourceDraftId !== undefined && !sourceDraftId.startsWith("draft_")) {
    errors.push("sourceDraftId must start with draft_.");
  }
  if (acceptanceCriteria.length === 0) {
    errors.push("acceptanceCriteria must contain at least one entry.");
  }

  if (
    errors.length > 0 ||
    id === undefined ||
    title === undefined ||
    problem === undefined ||
    requester === undefined
  ) {
    return {
      ok: false,
      errors
    };
  }

  // Build the un-branded ConfirmedIntentData value. The brand is intentionally
  // NOT applied here — parseConfirmedIntent reads external JSON; consumers
  // that need a branded ConfirmedIntent must re-promote via promoteIntentDraft.
  const data: ConfirmedIntentBaseShape = {
    id: id as IntentId,
    ...(sourceDraftId !== undefined ? { sourceDraftId: sourceDraftId as IntentDraftId } : {}),
    ...(mode !== undefined ? { mode } : {}),
    ...(goalArchetype !== undefined ? { goalArchetype } : {}),
    title,
    problem,
    requester,
    confirmedAt: confirmedAt ?? new Date(0).toISOString(),
    ...(context !== undefined ? { context } : {}),
    acceptanceCriteria: acceptanceCriteria.map(copyAcceptanceCriterion),
    capabilityEnvelope: copyCapabilityEnvelope(capabilityEnvelope),
    constraints: copyStringList(constraints),
    stopConditions: copyStringList(stopConditions),
    schemaVersion: schemaVersion ?? "1.4.0",
    signature: signature ?? null
  };

  return {
    ok: true,
    errors: [],
    data: deepFreeze(data) as ConfirmedIntentData
  };
}

function readOptionalSchemaVersion(record: Record<string, unknown>, errors: string[]): "1.4.0" | undefined {
  const value = record["schemaVersion"];
  if (value === undefined) {
    return undefined;
  }
  if (value === "1.4.0") {
    return value;
  }
  errors.push("schemaVersion must be \"1.4.0\" when provided.");
  return undefined;
}

function readOptionalSignature(record: Record<string, unknown>, errors: string[]): SignatureEnvelope | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, "signature")) {
    return undefined;
  }
  const value = record["signature"];
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    errors.push("signature must be null or an object with algorithm, canonicalForm, and SHA-256 hash strings.");
    return undefined;
  }
  const algorithm = value["algorithm"];
  const canonicalForm = value["canonicalForm"];
  const sigValue = value["value"];
  const intentHash = value["intentHash"];
  const envelopeHash = value["envelopeHash"];
  const policySnapshotHash = value["policySnapshotHash"];
  if (
    algorithm !== "sha256" ||
    canonicalForm !== "json-c14n@1.0" ||
    typeof sigValue !== "string" ||
    typeof intentHash !== "string" ||
    typeof envelopeHash !== "string" ||
    typeof policySnapshotHash !== "string"
  ) {
    errors.push("signature must be null or an object with algorithm sha256, canonicalForm json-c14n@1.0, and SHA-256 hash strings.");
    return undefined;
  }
  for (const [field, hash] of [
    ["value", sigValue],
    ["intentHash", intentHash],
    ["envelopeHash", envelopeHash],
    ["policySnapshotHash", policySnapshotHash]
  ] as const) {
    if (!/^[0-9a-f]{64}$/.test(hash)) {
      errors.push(`signature.${field} must be a 64-character lowercase hex SHA-256 digest.`);
    }
  }
  if (errors.length > 0) {
    return undefined;
  }
  return {
    algorithm,
    canonicalForm,
    value: sigValue,
    intentHash,
    envelopeHash,
    policySnapshotHash
  };
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
