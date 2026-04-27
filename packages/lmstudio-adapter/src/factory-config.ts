import { createHash } from "node:crypto";

import { canonicalizeJsonC14nV1 } from "@protostar/authority";

export interface FactoryConfig {
  readonly adapters: {
    readonly coder: {
      readonly provider: "lmstudio";
      readonly baseUrl: string;
      readonly model: string;
      readonly apiKeyEnv: string;
      readonly temperature?: number;
      readonly topP?: number;
    };
  };
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
    readonly coder?: {
      readonly provider?: "lmstudio";
      readonly baseUrl?: string;
      readonly model?: string;
      readonly apiKeyEnv?: string;
      readonly temperature?: number;
      readonly topP?: number;
    };
  };
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
    })
  })
});

const TOP_LEVEL_KEYS = new Set(["adapters"]);
const ADAPTERS_KEYS = new Set(["coder"]);
const CODER_KEYS = new Set(["provider", "baseUrl", "model", "apiKeyEnv", "temperature", "topP"]);

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
  const envBaseUrl = envValue(input.env, "LMSTUDIO_BASE_URL");
  const envModel = envValue(input.env, "LMSTUDIO_MODEL");
  const envApiKey = envValue(input.env, "LMSTUDIO_API_KEY");

  if (envBaseUrl !== undefined) envOverridesApplied.push("LMSTUDIO_BASE_URL");
  if (envModel !== undefined) envOverridesApplied.push("LMSTUDIO_MODEL");
  if (envApiKey !== undefined) envOverridesApplied.push("LMSTUDIO_API_KEY");

  const coder: FactoryConfig["adapters"]["coder"] = {
    provider: "lmstudio",
    baseUrl: envBaseUrl ?? fileCoder.baseUrl ?? DEFAULT_FACTORY_CONFIG.adapters.coder.baseUrl,
    model: envModel ?? fileCoder.model ?? DEFAULT_FACTORY_CONFIG.adapters.coder.model,
    apiKeyEnv:
      envApiKey !== undefined
        ? "LMSTUDIO_API_KEY"
        : fileCoder.apiKeyEnv ?? DEFAULT_FACTORY_CONFIG.adapters.coder.apiKeyEnv
  };
  const temperature = fileCoder.temperature ?? DEFAULT_FACTORY_CONFIG.adapters.coder.temperature;
  const topP = fileCoder.topP ?? DEFAULT_FACTORY_CONFIG.adapters.coder.topP;
  if (temperature !== undefined) {
    Object.assign(coder, { temperature });
  }
  if (topP !== undefined) {
    Object.assign(coder, { topP });
  }

  const config: FactoryConfig = {
    adapters: {
      coder
    }
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
        validateCoder(config.adapters.coder, errors);
      }
    }
  }

  return errors;
}

function validateCoder(coder: unknown, errors: string[]): void {
  if (!isPlainRecord(coder)) {
    errors.push("$.adapters.coder must be an object");
    return;
  }

  errors.push(...unknownKeyErrors("$.adapters.coder", coder, CODER_KEYS));
  if (coder.provider !== undefined && coder.provider !== "lmstudio") {
    errors.push('$.adapters.coder.provider must be "lmstudio"');
  }
  for (const key of ["baseUrl", "model", "apiKeyEnv"] as const) {
    if (coder[key] !== undefined && typeof coder[key] !== "string") {
      errors.push(`$.adapters.coder.${key} must be a string`);
    }
  }
  for (const key of ["temperature", "topP"] as const) {
    if (coder[key] !== undefined && typeof coder[key] !== "number") {
      errors.push(`$.adapters.coder.${key} must be a number`);
    }
  }
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

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
