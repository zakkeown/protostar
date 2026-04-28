import { createHash } from "node:crypto";

import { canonicalizeJsonC14nV1 } from "@protostar/authority";

export interface FactoryConfig {
  readonly adapters: {
    readonly coder: LmstudioAdapterConfig;
    readonly judge?: LmstudioAdapterConfig;
  };
  // Phase 7 Q-15: operator-named CI check allowlist; absence means the
  // delivery runtime reports ciVerdict="no-checks-configured".
  readonly delivery?: DeliveryConfig;
  readonly evaluation?: EvaluationConfig;
  readonly evolution?: EvolutionConfig;
  // Phase 6 Plan 06-07 Task 1 — piles config block (Q-04). Optional; absence
  // means all piles default to mode="fixture" (Q-05).
  readonly piles?: PilesConfig;
}

export interface DeliveryConfig {
  readonly requiredChecks: readonly string[];
}

export interface EvaluationJudgeConfig {
  readonly model?: string;
  readonly baseUrl?: string;
}

export interface EvaluationConfig {
  readonly semanticJudge?: EvaluationJudgeConfig;
  readonly consensusJudge?: EvaluationJudgeConfig;
}

export interface EvolutionConfig {
  readonly lineage?: string;
  readonly codeEvolution?: "opt-in" | "disabled";
  readonly convergenceThreshold?: number;
}

export type PileMode = "fixture" | "live";

export interface PileKindConfig {
  readonly mode?: PileMode;
  readonly fixturePath?: string;
}

export interface ExecutionCoordinationPileConfig extends PileKindConfig {
  readonly workSlicing?: {
    readonly maxTargetFiles?: number;
    readonly maxEstimatedTurns?: number;
  };
}

export interface PilesConfig {
  readonly planning?: PileKindConfig;
  readonly review?: PileKindConfig;
  readonly executionCoordination?: ExecutionCoordinationPileConfig;
}

export interface LmstudioAdapterConfig {
      readonly provider: "lmstudio";
      readonly baseUrl: string;
      readonly model: string;
      readonly apiKeyEnv: string;
      readonly temperature?: number;
      readonly topP?: number;
}

export interface ResolvedFactoryConfig {
  readonly config: FactoryConfig;
  readonly configHash: string;
  readonly resolvedFromFile: boolean;
  readonly envOverridesApplied: readonly EnvOverrideName[];
}

export type EnvOverrideName = "LMSTUDIO_BASE_URL" | "LMSTUDIO_MODEL" | "LMSTUDIO_API_KEY";

export type ResolveFactoryConfigResult =
  | { readonly ok: true; readonly resolved: ResolvedFactoryConfig; readonly errors: readonly [] }
  | { readonly ok: false; readonly errors: readonly string[] };

interface PartialFactoryConfig {
  readonly adapters?: {
    readonly coder?: PartialLmstudioAdapterConfig;
    readonly judge?: PartialLmstudioAdapterConfig;
  };
  readonly delivery?: PartialDeliveryConfig;
  readonly evaluation?: EvaluationConfig;
  readonly evolution?: EvolutionConfig;
  readonly piles?: PilesConfig;
}

interface PartialDeliveryConfig {
  readonly requiredChecks?: readonly string[];
}

interface PartialLmstudioAdapterConfig {
  readonly provider?: "lmstudio";
  readonly baseUrl?: string;
  readonly model?: string;
  readonly apiKeyEnv?: string;
  readonly temperature?: number;
  readonly topP?: number;
}

const DEFAULT_FACTORY_CONFIG: FactoryConfig = Object.freeze({
  adapters: Object.freeze({
    coder: Object.freeze({
      provider: "lmstudio",
      baseUrl: "http://localhost:1234/v1",
      model: "qwen3-coder-next-mlx-4bit",
      apiKeyEnv: "LMSTUDIO_API_KEY",
      temperature: 0.2,
      topP: 0.9
    }),
    judge: Object.freeze({
      provider: "lmstudio",
      baseUrl: "http://localhost:1234/v1",
      model: "qwen3-80b-a3b-mlx-4bit",
      apiKeyEnv: "LMSTUDIO_API_KEY"
    })
  })
});

const TOP_LEVEL_KEYS = new Set(["adapters", "delivery", "evaluation", "evolution", "piles"]);
const ADAPTERS_KEYS = new Set(["coder", "judge"]);
const LMSTUDIO_ADAPTER_KEYS = new Set(["provider", "baseUrl", "model", "apiKeyEnv", "temperature", "topP"]);
const DELIVERY_KEYS = new Set(["requiredChecks"]);
const EVALUATION_KEYS = new Set(["semanticJudge", "consensusJudge"]);
const EVALUATION_JUDGE_KEYS = new Set(["model", "baseUrl"]);
const EVOLUTION_KEYS = new Set(["lineage", "codeEvolution", "convergenceThreshold"]);
const PILES_KEYS = new Set(["planning", "review", "executionCoordination"]);
const PILE_KIND_KEYS = new Set(["mode", "fixturePath"]);
const EXEC_COORD_KEYS = new Set(["mode", "fixturePath", "workSlicing"]);
const WORK_SLICING_KEYS = new Set(["maxTargetFiles", "maxEstimatedTurns"]);
const PILE_MODE_VALUES = new Set(["fixture", "live"]);

export function resolveFactoryConfig(input: {
  readonly fileBytes?: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}): ResolveFactoryConfigResult {
  const errors: string[] = [];
  let fileConfig: PartialFactoryConfig = {};

  if (input.fileBytes !== undefined) {
    const parsed = parseFileBytes(input.fileBytes);
    if (!parsed.ok) {
      return { ok: false, errors: parsed.errors };
    }
    fileConfig = parsed.config;
    errors.push(...validatePartialFactoryConfig(fileConfig));
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const envOverridesApplied: EnvOverrideName[] = [];
  const fileCoder = fileConfig.adapters?.coder ?? {};
  const fileJudge = fileConfig.adapters?.judge ?? {};
  const envBaseUrl = envValue(input.env, "LMSTUDIO_BASE_URL");
  const envModel = envValue(input.env, "LMSTUDIO_MODEL");
  const envApiKey = envValue(input.env, "LMSTUDIO_API_KEY");

  if (envBaseUrl !== undefined) envOverridesApplied.push("LMSTUDIO_BASE_URL");
  if (envModel !== undefined) envOverridesApplied.push("LMSTUDIO_MODEL");
  if (envApiKey !== undefined) envOverridesApplied.push("LMSTUDIO_API_KEY");

  const coder = resolveAdapterConfig({
    partial: fileCoder,
    defaults: DEFAULT_FACTORY_CONFIG.adapters.coder,
    ...(envBaseUrl !== undefined ? { envBaseUrl } : {}),
    ...(envModel !== undefined ? { envModel } : {}),
    ...(envApiKey !== undefined ? { envApiKey } : {})
  });
  const judge = resolveAdapterConfig({
    partial: fileJudge,
    defaults: DEFAULT_FACTORY_CONFIG.adapters.judge!
  });

  const config: FactoryConfig = {
    adapters: {
      coder,
      judge
    },
    ...(fileConfig.delivery !== undefined
      ? { delivery: { requiredChecks: fileConfig.delivery.requiredChecks ?? [] } }
      : {}),
    ...(fileConfig.evaluation !== undefined ? { evaluation: fileConfig.evaluation } : {}),
    ...(fileConfig.evolution !== undefined ? { evolution: fileConfig.evolution } : {}),
    ...(fileConfig.piles !== undefined ? { piles: fileConfig.piles } : {})
  };

  return {
    ok: true,
    resolved: {
      config,
      configHash: sha256Hex(canonicalizeJsonC14nV1(config)),
      resolvedFromFile: input.fileBytes !== undefined,
      envOverridesApplied
    },
    errors: []
  };
}

function parseFileBytes(fileBytes: string):
  | { readonly ok: true; readonly config: PartialFactoryConfig }
  | { readonly ok: false; readonly errors: readonly string[] } {
  try {
    const parsed: unknown = JSON.parse(fileBytes);
    if (!isPlainRecord(parsed)) {
      return { ok: false, errors: ["factory config must be a JSON object"] };
    }
    return { ok: true, config: parsed as PartialFactoryConfig };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, errors: [`invalid JSON in factory config: ${message}`] };
  }
}

function validatePartialFactoryConfig(config: PartialFactoryConfig): readonly string[] {
  const errors: string[] = [];

  errors.push(...unknownKeyErrors("$", config as unknown as Readonly<Record<string, unknown>>, TOP_LEVEL_KEYS));
  if (config.adapters !== undefined) {
    if (!isPlainRecord(config.adapters)) {
      errors.push("$.adapters must be an object");
    } else {
      errors.push(...unknownKeyErrors("$.adapters", config.adapters, ADAPTERS_KEYS));
      if (config.adapters.coder !== undefined) {
        validateLmstudioAdapter("$.adapters.coder", config.adapters.coder, errors);
      }
      if (config.adapters.judge !== undefined) {
        validateLmstudioAdapter("$.adapters.judge", config.adapters.judge, errors);
      }
    }
  }

  if (config.delivery !== undefined) {
    if (!isPlainRecord(config.delivery)) {
      errors.push("$.delivery must be an object");
    } else {
      errors.push(...unknownKeyErrors("$.delivery", config.delivery, DELIVERY_KEYS));
      if (config.delivery.requiredChecks !== undefined) {
        if (!Array.isArray(config.delivery.requiredChecks)) {
          errors.push("$.delivery.requiredChecks must be an array");
        } else {
          for (const [index, checkName] of config.delivery.requiredChecks.entries()) {
            if (typeof checkName !== "string" || checkName.length === 0) {
              errors.push(`$.delivery.requiredChecks[${index}] must be a non-empty string`);
            }
          }
        }
      }
    }
  }

  if (config.evaluation !== undefined) {
    if (!isPlainRecord(config.evaluation)) {
      errors.push("$.evaluation must be an object");
    } else {
      errors.push(...unknownKeyErrors("$.evaluation", config.evaluation, EVALUATION_KEYS));
      validateEvaluationJudge("$.evaluation.semanticJudge", config.evaluation.semanticJudge, errors);
      validateEvaluationJudge("$.evaluation.consensusJudge", config.evaluation.consensusJudge, errors);
    }
  }

  if (config.evolution !== undefined) {
    if (!isPlainRecord(config.evolution)) {
      errors.push("$.evolution must be an object");
    } else {
      errors.push(...unknownKeyErrors("$.evolution", config.evolution, EVOLUTION_KEYS));
      if (config.evolution.lineage !== undefined && !isNonEmptyString(config.evolution.lineage)) {
        errors.push("$.evolution.lineage must be a non-empty string");
      }
      if (
        config.evolution.codeEvolution !== undefined &&
        config.evolution.codeEvolution !== "opt-in" &&
        config.evolution.codeEvolution !== "disabled"
      ) {
        errors.push("$.evolution.codeEvolution must be one of opt-in|disabled");
      }
      if (
        config.evolution.convergenceThreshold !== undefined &&
        (typeof config.evolution.convergenceThreshold !== "number" ||
          config.evolution.convergenceThreshold < 0 ||
          config.evolution.convergenceThreshold > 1)
      ) {
        errors.push("$.evolution.convergenceThreshold must be a number between 0 and 1");
      }
    }
  }

  if (config.piles !== undefined) {
    if (!isPlainRecord(config.piles)) {
      errors.push("$.piles must be an object");
    } else {
      errors.push(...unknownKeyErrors("$.piles", config.piles, PILES_KEYS));
      validatePileKind("$.piles.planning", config.piles.planning, PILE_KIND_KEYS, errors);
      validatePileKind("$.piles.review", config.piles.review, PILE_KIND_KEYS, errors);
      validatePileKind("$.piles.executionCoordination", config.piles.executionCoordination, EXEC_COORD_KEYS, errors);
      if (
        config.piles.executionCoordination !== undefined &&
        isPlainRecord(config.piles.executionCoordination) &&
        config.piles.executionCoordination.workSlicing !== undefined
      ) {
        const ws = config.piles.executionCoordination.workSlicing;
        if (!isPlainRecord(ws)) {
          errors.push("$.piles.executionCoordination.workSlicing must be an object");
        } else {
          errors.push(...unknownKeyErrors("$.piles.executionCoordination.workSlicing", ws, WORK_SLICING_KEYS));
          for (const key of ["maxTargetFiles", "maxEstimatedTurns"] as const) {
            if (ws[key] !== undefined && typeof ws[key] !== "number") {
              errors.push(`$.piles.executionCoordination.workSlicing.${key} must be a number`);
            }
          }
        }
      }
    }
  }

  return errors;
}

function validateEvaluationJudge(path: string, judge: unknown, errors: string[]): void {
  if (judge === undefined) return;
  if (!isPlainRecord(judge)) {
    errors.push(`${path} must be an object`);
    return;
  }
  errors.push(...unknownKeyErrors(path, judge, EVALUATION_JUDGE_KEYS));
  if (judge["model"] !== undefined && !isNonEmptyString(judge["model"])) {
    errors.push(`${path}.model must be a non-empty string`);
  }
  if (judge["baseUrl"] !== undefined && !isNonEmptyString(judge["baseUrl"])) {
    errors.push(`${path}.baseUrl must be a non-empty string`);
  }
}

function validatePileKind(
  path: string,
  pileKind: unknown,
  allowedKeys: ReadonlySet<string>,
  errors: string[]
): void {
  if (pileKind === undefined) return;
  if (!isPlainRecord(pileKind)) {
    errors.push(`${path} must be an object`);
    return;
  }
  errors.push(...unknownKeyErrors(path, pileKind, allowedKeys));
  if (pileKind["mode"] !== undefined && !PILE_MODE_VALUES.has(pileKind["mode"] as string)) {
    errors.push(`${path}.mode must be one of fixture|live`);
  }
  if (pileKind["fixturePath"] !== undefined && typeof pileKind["fixturePath"] !== "string") {
    errors.push(`${path}.fixturePath must be a string`);
  }
}

function validateLmstudioAdapter(path: string, adapter: unknown, errors: string[]): void {
  if (!isPlainRecord(adapter)) {
    errors.push(`${path} must be an object`);
    return;
  }

  errors.push(...unknownKeyErrors(path, adapter, LMSTUDIO_ADAPTER_KEYS));
  if (adapter.provider !== undefined && adapter.provider !== "lmstudio") {
    errors.push(`${path}.provider must be "lmstudio"`);
  }
  for (const key of ["baseUrl", "model", "apiKeyEnv"] as const) {
    if (adapter[key] !== undefined && typeof adapter[key] !== "string") {
      errors.push(`${path}.${key} must be a string`);
    }
  }
  for (const key of ["temperature", "topP"] as const) {
    if (adapter[key] !== undefined && typeof adapter[key] !== "number") {
      errors.push(`${path}.${key} must be a number`);
    }
  }
}

function resolveAdapterConfig(input: {
  readonly partial: PartialLmstudioAdapterConfig;
  readonly defaults: LmstudioAdapterConfig;
  readonly envBaseUrl?: string;
  readonly envModel?: string;
  readonly envApiKey?: string;
}): LmstudioAdapterConfig {
  const adapter: LmstudioAdapterConfig = {
    provider: "lmstudio",
    baseUrl: input.envBaseUrl ?? input.partial.baseUrl ?? input.defaults.baseUrl,
    model: input.envModel ?? input.partial.model ?? input.defaults.model,
    apiKeyEnv:
      input.envApiKey !== undefined ? "LMSTUDIO_API_KEY" : input.partial.apiKeyEnv ?? input.defaults.apiKeyEnv
  };
  const temperature = input.partial.temperature ?? input.defaults.temperature;
  const topP = input.partial.topP ?? input.defaults.topP;
  if (temperature !== undefined) {
    Object.assign(adapter, { temperature });
  }
  if (topP !== undefined) {
    Object.assign(adapter, { topP });
  }
  return adapter;
}

function unknownKeyErrors(
  path: string,
  value: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>
): readonly string[] {
  return Object.keys(value)
    .filter((key) => !allowed.has(key))
    .map((key) => `${path}.${key} violates additionalProperties: false`);
}

function envValue(
  env: Readonly<Record<string, string | undefined>>,
  name: EnvOverrideName
): string | undefined {
  const value = env[name];
  return value === undefined || value === "" ? undefined : value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
