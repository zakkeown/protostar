export type IntentId = `intent_${string}`;
export type AcceptanceCriterionId = `ac_${string}`;
export type RiskLevel = "low" | "medium" | "high";

export interface AcceptanceCriterion {
  readonly id: AcceptanceCriterionId;
  readonly statement: string;
  readonly verification: "test" | "review" | "evidence" | "manual";
}

export interface RepoScopeGrant {
  readonly workspace: string;
  readonly path: string;
  readonly access: "read" | "write" | "execute";
}

export interface ToolPermissionGrant {
  readonly tool: string;
  readonly reason: string;
  readonly risk: RiskLevel;
}

export interface FactoryBudget {
  readonly maxUsd?: number;
  readonly maxTokens?: number;
  readonly timeoutMs?: number;
  readonly maxRepairLoops?: number;
}

export interface CapabilityEnvelope {
  readonly repoScopes: readonly RepoScopeGrant[];
  readonly toolPermissions: readonly ToolPermissionGrant[];
  readonly budget: FactoryBudget;
}

export interface ConfirmedIntent {
  readonly id: IntentId;
  readonly title: string;
  readonly problem: string;
  readonly requester: string;
  readonly confirmedAt: string;
  readonly acceptanceCriteria: readonly AcceptanceCriterion[];
  readonly capabilityEnvelope: CapabilityEnvelope;
  readonly constraints: readonly string[];
}

export interface ConfirmedIntentInput {
  readonly id: IntentId;
  readonly title: string;
  readonly problem: string;
  readonly requester: string;
  readonly acceptanceCriteria: readonly AcceptanceCriterion[];
  readonly capabilityEnvelope: CapabilityEnvelope;
  readonly constraints?: readonly string[];
  readonly confirmedAt?: string;
}

export interface ConfirmedIntentParseResult {
  readonly ok: boolean;
  readonly intent?: ConfirmedIntent;
  readonly errors: readonly string[];
}

export type IntentAmbiguityMode = "greenfield" | "brownfield";
export type IntentClarityDimension = "goal" | "constraints" | "successCriteria" | "context";

export const INTENT_AMBIGUITY_THRESHOLD = 0.2;

export interface IntentClarityScore {
  readonly dimension: IntentClarityDimension;
  readonly clarity: number;
  readonly weight: number;
  readonly rationale: string;
}

export interface IntentAmbiguityAssessment {
  readonly mode: IntentAmbiguityMode;
  readonly threshold: number;
  readonly ambiguity: number;
  readonly accepted: boolean;
  readonly scores: readonly IntentClarityScore[];
}

export function defineConfirmedIntent(input: ConfirmedIntentInput): ConfirmedIntent {
  if (input.acceptanceCriteria.length === 0) {
    throw new Error("Confirmed intent requires at least one acceptance criterion.");
  }

  return {
    id: input.id,
    title: input.title,
    problem: input.problem,
    requester: input.requester,
    confirmedAt: input.confirmedAt ?? new Date().toISOString(),
    acceptanceCriteria: input.acceptanceCriteria,
    capabilityEnvelope: input.capabilityEnvelope,
    constraints: input.constraints ?? []
  };
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
  const title = readString(value, "title", errors);
  const problem = readString(value, "problem", errors);
  const requester = readString(value, "requester", errors);
  const confirmedAt = readOptionalString(value, "confirmedAt", errors);
  const constraints = readOptionalStringArray(value, "constraints", errors);
  const acceptanceCriteria = parseAcceptanceCriteria(value["acceptanceCriteria"], errors);
  const capabilityEnvelope = parseCapabilityEnvelope(value["capabilityEnvelope"], errors);

  if (id !== undefined && !id.startsWith("intent_")) {
    errors.push("id must start with intent_.");
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
      title,
      problem,
      requester,
      acceptanceCriteria,
      capabilityEnvelope,
      ...(constraints !== undefined ? { constraints } : {}),
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

export function assessConfirmedIntentAmbiguity(
  intent: ConfirmedIntent,
  input?: {
    readonly mode?: IntentAmbiguityMode;
    readonly threshold?: number;
  }
): IntentAmbiguityAssessment {
  const mode = input?.mode ?? "brownfield";
  const threshold = input?.threshold ?? INTENT_AMBIGUITY_THRESHOLD;
  const scores = scoreIntentClarity(intent, mode);
  const weightedClarity = scores.reduce((total, score) => total + score.clarity * score.weight, 0);
  const ambiguity = roundScore(1 - weightedClarity);

  return {
    mode,
    threshold,
    ambiguity,
    accepted: ambiguity <= threshold,
    scores
  };
}

export function assertIntentAmbiguityAccepted(assessment: IntentAmbiguityAssessment): IntentAmbiguityAssessment {
  if (!assessment.accepted) {
    throw new Error(
      `Intent ambiguity ${assessment.ambiguity.toFixed(2)} exceeds threshold ${assessment.threshold.toFixed(2)}.`
    );
  }
  return assessment;
}

function parseAcceptanceCriteria(value: unknown, errors: string[]): readonly AcceptanceCriterion[] {
  if (!Array.isArray(value)) {
    errors.push("acceptanceCriteria must be an array.");
    return [];
  }

  return value.flatMap((entry, index): AcceptanceCriterion[] => {
    if (!isRecord(entry)) {
      errors.push(`acceptanceCriteria[${index}] must be an object.`);
      return [];
    }

    const id = readString(entry, `acceptanceCriteria[${index}].id`, errors);
    const statement = readString(entry, `acceptanceCriteria[${index}].statement`, errors);
    const verification = readString(entry, `acceptanceCriteria[${index}].verification`, errors);

    if (id !== undefined && !id.startsWith("ac_")) {
      errors.push(`acceptanceCriteria[${index}].id must start with ac_.`);
    }
    if (verification !== undefined && !isVerification(verification)) {
      errors.push(`acceptanceCriteria[${index}].verification must be test, review, evidence, or manual.`);
    }
    if (id === undefined || statement === undefined || !isVerification(verification)) {
      return [];
    }

    return [
      {
        id: id as AcceptanceCriterionId,
        statement,
        verification
      }
    ];
  });
}

function scoreIntentClarity(intent: ConfirmedIntent, mode: IntentAmbiguityMode): readonly IntentClarityScore[] {
  const weights = mode === "greenfield"
    ? {
        goal: 0.4,
        constraints: 0.3,
        successCriteria: 0.3
      }
    : {
        goal: 0.35,
        constraints: 0.25,
        successCriteria: 0.25,
        context: 0.15
      };

  return Object.entries(weights).map(([dimension, weight]) => {
    const score = scoreDimension(intent, dimension as IntentClarityDimension);
    return {
      dimension: dimension as IntentClarityDimension,
      clarity: score.clarity,
      weight,
      rationale: score.rationale
    };
  });
}

function scoreDimension(
  intent: ConfirmedIntent,
  dimension: IntentClarityDimension
): {
  readonly clarity: number;
  readonly rationale: string;
} {
  if (dimension === "goal") {
    const clarity = average([
      intent.title.trim().length >= 12 ? 1 : 0.55,
      intent.problem.trim().length >= 80 ? 1 : 0.65
    ]);
    return {
      clarity,
      rationale: "Goal clarity is estimated from title and problem specificity."
    };
  }

  if (dimension === "constraints") {
    const clarity = average([
      intent.constraints.length > 0 ? 1 : 0.45,
      intent.capabilityEnvelope.repoScopes.length > 0 ? 1 : 0.45,
      intent.capabilityEnvelope.toolPermissions.length > 0 ? 1 : 0.45,
      Object.keys(intent.capabilityEnvelope.budget).length > 0 ? 1 : 0.5
    ]);
    return {
      clarity,
      rationale: "Constraint clarity is estimated from explicit constraints, repo scope, tools, and budget."
    };
  }

  if (dimension === "successCriteria") {
    const clarity = intent.acceptanceCriteria.length === 0
      ? 0
      : average(
          intent.acceptanceCriteria.flatMap((criterion) => [
            criterion.statement.trim().length >= 24 ? 1 : 0.55,
            criterion.verification === "manual" ? 0.65 : 1
          ])
        );
    return {
      clarity,
      rationale: "Success criteria clarity is estimated from AC specificity and non-manual verification signals."
    };
  }

  return {
    clarity: intent.capabilityEnvelope.repoScopes.length > 0 ? 1 : 0.4,
    rationale: "Context clarity is estimated from whether the intent names a repo scope."
  };
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return roundScore(values.reduce((total, value) => total + value, 0) / values.length);
}

function roundScore(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

function parseCapabilityEnvelope(value: unknown, errors: string[]): CapabilityEnvelope {
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
    const reason = readString(entry, `capabilityEnvelope.toolPermissions[${index}].reason`, errors);
    const risk = readString(entry, `capabilityEnvelope.toolPermissions[${index}].risk`, errors);

    if (risk !== undefined && !isRiskLevel(risk)) {
      errors.push(`capabilityEnvelope.toolPermissions[${index}].risk must be low, medium, or high.`);
    }
    if (tool === undefined || reason === undefined || !isRiskLevel(risk)) {
      return [];
    }

    return [{ tool, reason, risk }];
  });
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

function readString(record: Record<string, unknown>, path: string, errors: string[]): string | undefined {
  const key = path.split(".").at(-1) ?? path;
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${path} must be a non-empty string.`);
    return undefined;
  }
  return value;
}

function readOptionalString(record: Record<string, unknown>, key: string, errors: string[]): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${key} must be a non-empty string when provided.`);
    return undefined;
  }
  return value;
}

function readOptionalStringArray(
  record: Record<string, unknown>,
  key: string,
  errors: string[]
): readonly string[] | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    errors.push(`${key} must be an array of strings when provided.`);
    return undefined;
  }
  return value;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVerification(value: unknown): value is AcceptanceCriterion["verification"] {
  return value === "test" || value === "review" || value === "evidence" || value === "manual";
}

function isRiskLevel(value: unknown): value is RiskLevel {
  return value === "low" || value === "medium" || value === "high";
}

function isRepoAccess(value: unknown): value is RepoScopeGrant["access"] {
  return value === "read" || value === "write" || value === "execute";
}
