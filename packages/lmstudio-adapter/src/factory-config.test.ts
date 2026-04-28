import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveFactoryConfig, type FactoryConfig } from "./factory-config.js";

describe("resolveFactoryConfig", () => {
  it("returns LM Studio defaults when no file or env is provided", () => {
    const result = resolveFactoryConfig({ env: {} });

    const resolved = unwrapResolved(result);

    assert.deepEqual(resolved.config, {
      adapters: {
        coder: {
          provider: "lmstudio",
          baseUrl: "http://localhost:1234/v1",
          model: "qwen3-coder-next-mlx-4bit",
          apiKeyEnv: "LMSTUDIO_API_KEY",
          temperature: 0.2,
          topP: 0.9
        },
        judge: {
          provider: "lmstudio",
          baseUrl: "http://localhost:1234/v1",
          model: "qwen3-80b-a3b-mlx-4bit",
          apiKeyEnv: "LMSTUDIO_API_KEY"
        }
      }
    });
    assert.equal(resolved.resolvedFromFile, false);
    assert.deepEqual(resolved.envOverridesApplied, []);
  });

  it("merges file values over defaults and preserves missing default fields", () => {
    const result = resolveFactoryConfig({
      fileBytes: JSON.stringify({ adapters: { coder: { baseUrl: "http://other:5555/v1" } } }),
      env: {}
    });

    const resolved = unwrapResolved(result);

    assert.equal(resolved.config.adapters.coder.baseUrl, "http://other:5555/v1");
    assert.equal(resolved.config.adapters.coder.provider, "lmstudio");
    assert.equal(resolved.config.adapters.coder.model, "qwen3-coder-next-mlx-4bit");
    assert.equal(resolved.config.adapters.coder.apiKeyEnv, "LMSTUDIO_API_KEY");
    assert.equal(resolved.config.adapters.coder.temperature, 0.2);
    assert.equal(resolved.config.adapters.coder.topP, 0.9);
    assert.equal(resolved.resolvedFromFile, true);
  });

  it("applies LMSTUDIO_BASE_URL env over file values", () => {
    const result = resolveFactoryConfig({
      fileBytes: JSON.stringify({ adapters: { coder: { baseUrl: "http://filehost:5555/v1" } } }),
      env: { LMSTUDIO_BASE_URL: "http://envhost:9999/v1" }
    });

    const resolved = unwrapResolved(result);

    assert.equal(resolved.config.adapters.coder.baseUrl, "http://envhost:9999/v1");
    assert.deepEqual(resolved.envOverridesApplied, ["LMSTUDIO_BASE_URL"]);
  });

  it("hashes equivalent resolved configs identically and changed models differently", () => {
    const first = resolveFactoryConfig({
      fileBytes: JSON.stringify({
        adapters: {
          coder: {
            model: "same-model",
            baseUrl: "http://same:1234/v1"
          }
        }
      }),
      env: {}
    });
    const second = resolveFactoryConfig({
      fileBytes: JSON.stringify({
        adapters: {
          coder: {
            baseUrl: "http://same:1234/v1",
            model: "same-model"
          }
        }
      }),
      env: {}
    });
    const third = resolveFactoryConfig({
      fileBytes: JSON.stringify({
        adapters: {
          coder: {
            baseUrl: "http://same:1234/v1",
            model: "different-model"
          }
        }
      }),
      env: {}
    });

    const firstResolved = unwrapResolved(first);
    const secondResolved = unwrapResolved(second);
    const thirdResolved = unwrapResolved(third);

    assert.equal(firstResolved.configHash, secondResolved.configHash);
    assert.notEqual(firstResolved.configHash, thirdResolved.configHash);
  });

  it("returns errors for malformed JSON file bytes", () => {
    const result = resolveFactoryConfig({ fileBytes: "{not json", env: {} });

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /invalid JSON/i);
  });

  it("rejects unknown top-level keys with an additionalProperties error", () => {
    const result = resolveFactoryConfig({
      fileBytes: JSON.stringify({ adapters: { coder: {} }, surprise: true }),
      env: {}
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /additionalProperties/);
  });

  it("accepts delivery requiredChecks from file config", () => {
    const result = resolveFactoryConfig({
      fileBytes: JSON.stringify({
        adapters: { coder: {}, judge: {} },
        delivery: { requiredChecks: ["build", "test"] }
      }),
      env: {}
    });

    const resolved = unwrapResolved(result);

    assert.deepEqual(resolved.config.delivery?.requiredChecks, ["build", "test"]);
  });

  it("accepts delivery.mode gated from file config", () => {
    const result = resolveFactoryConfig({
      fileBytes: JSON.stringify({
        adapters: { coder: {}, judge: {} },
        delivery: { mode: "gated" }
      }),
      env: {}
    });

    const resolved = unwrapResolved(result);

    assert.equal(resolved.config.delivery?.mode, "gated");
  });

  it("rejects invalid delivery.mode values", () => {
    const result = resolveFactoryConfig({
      fileBytes: JSON.stringify({
        adapters: { coder: {}, judge: {} },
        delivery: { mode: "BAD" }
      }),
      env: {}
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /delivery\.mode/);
  });

  it("rejects empty delivery requiredChecks entries", () => {
    const result = resolveFactoryConfig({
      fileBytes: JSON.stringify({
        adapters: { coder: {}, judge: {} },
        delivery: { requiredChecks: [""] }
      }),
      env: {}
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /requiredChecks/);
  });

  it("leaves delivery undefined when omitted", () => {
    const result = resolveFactoryConfig({
      fileBytes: JSON.stringify({ adapters: { coder: {}, judge: {} } }),
      env: {}
    });

    const resolved = unwrapResolved(result);

    assert.equal(resolved.config.delivery, undefined);
  });

  it("accepts operator.livenessThresholdMs from file config", () => {
    const result = resolveFactoryConfig({
      fileBytes: JSON.stringify({
        adapters: { coder: {}, judge: {} },
        operator: { livenessThresholdMs: 30_000 }
      }),
      env: {}
    });

    const resolved = unwrapResolved(result);

    assert.equal(resolved.config.operator?.livenessThresholdMs, 30_000);
  });

  it("rejects non-number operator.livenessThresholdMs values", () => {
    const result = resolveFactoryConfig({
      fileBytes: JSON.stringify({
        adapters: { coder: {}, judge: {} },
        operator: { livenessThresholdMs: "soon" }
      }),
      env: {}
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /operator\.livenessThresholdMs/);
  });

  it("preserves evaluation judge overrides and evolution config from file config", () => {
    const result = resolveFactoryConfig({
      fileBytes: JSON.stringify({
        adapters: { coder: {}, judge: {} },
        evaluation: {
          semanticJudge: {
            model: "Qwen3-Next-80B-A3B-MLX-4bit",
            baseUrl: "http://localhost:1234/v1"
          },
          consensusJudge: {
            model: "DeepSeek-Coder-V2-Lite-Instruct"
          }
        },
        evolution: {
          lineage: "cosmetic-tweak-button-color",
          codeEvolution: "opt-in",
          convergenceThreshold: 0.9
        }
      }),
      env: {}
    });

    const resolved = unwrapResolved(result);

    assert.deepEqual(resolved.config.evaluation, {
      semanticJudge: {
        model: "Qwen3-Next-80B-A3B-MLX-4bit",
        baseUrl: "http://localhost:1234/v1"
      },
      consensusJudge: {
        model: "DeepSeek-Coder-V2-Lite-Instruct"
      }
    });
    assert.deepEqual(resolved.config.evolution, {
      lineage: "cosmetic-tweak-button-color",
      codeEvolution: "opt-in",
      convergenceThreshold: 0.9
    });
  });

  it("leaves evaluation and evolution undefined when omitted", () => {
    const result = resolveFactoryConfig({
      fileBytes: JSON.stringify({}),
      env: {}
    });

    const resolved = unwrapResolved(result);

    assert.equal(resolved.config.evaluation, undefined);
    assert.equal(resolved.config.evolution, undefined);
  });

  it("rejects invalid evolution codeEvolution values", () => {
    const result = resolveFactoryConfig({
      fileBytes: JSON.stringify({
        adapters: { coder: {}, judge: {} },
        evolution: { codeEvolution: "invalid" }
      }),
      env: {}
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /codeEvolution/);
    assert.match(result.errors.join("\n"), /opt-in\|disabled/);
  });

  it("rejects unknown delivery keys with an additionalProperties error", () => {
    const result = resolveFactoryConfig({
      fileBytes: JSON.stringify({
        adapters: { coder: {}, judge: {} },
        delivery: { unknownKey: 1 }
      }),
      env: {}
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /additionalProperties/);
  });

  it("ships a schema matching the resolved config structure", () => {
    const schema = JSON.parse(
      readFileSync(new URL("../../src/factory-config.schema.json", import.meta.url), "utf8")
    ) as FactoryConfigSchema;
    const result = resolveFactoryConfig({ env: {} });

    const resolved = unwrapResolved(result);

    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.$id, "https://protostar.local/schema/factory-config.schema.json");
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, ["adapters"]);
    assertConfigSatisfiesSchemaShape(resolved.config, schema);
  });

  it("ships a schema requiring both coder and judge adapters", () => {
    const schema = JSON.parse(
      readFileSync(new URL("../../src/factory-config.schema.json", import.meta.url), "utf8")
    ) as FactoryConfigSchema;

    assert.deepEqual(schema.properties.adapters.required, ["coder", "judge"]);
    assert.ok("judge" in schema.properties.adapters.properties);
    assert.deepEqual(adapterSchemaFor(schema, "judge").required, ["provider", "baseUrl", "model", "apiKeyEnv"]);
  });
});

interface FactoryConfigSchema {
  readonly $schema: string;
  readonly $id: string;
  readonly additionalProperties: boolean;
  readonly required: readonly string[];
  readonly properties: {
    readonly adapters: {
      readonly additionalProperties: boolean;
      readonly required: readonly string[];
      readonly properties: {
        readonly coder: {
          readonly $ref?: string;
          readonly additionalProperties: boolean;
          readonly required: readonly string[];
          readonly properties: Record<string, unknown>;
        };
        readonly judge: {
          readonly $ref?: string;
          readonly additionalProperties: boolean;
          readonly required: readonly string[];
          readonly properties: Record<string, unknown>;
        };
      };
    };
  };
  readonly definitions: {
    readonly lmstudioAdapterConfig: {
      readonly additionalProperties: boolean;
      readonly required: readonly string[];
      readonly properties: Record<string, unknown>;
    };
  };
}

function assertConfigSatisfiesSchemaShape(config: FactoryConfig, schema: FactoryConfigSchema): void {
  const coder = config.adapters.coder;
  const judge = config.adapters.judge;
  assert.ok(judge, "resolved config must include adapters.judge");
  const coderSchema = adapterSchemaFor(schema, "coder");
  const judgeSchema = adapterSchemaFor(schema, "judge");

  assert.equal(schema.properties.adapters.additionalProperties, false);
  assert.deepEqual(schema.properties.adapters.required, ["coder", "judge"]);
  assert.equal(coderSchema.additionalProperties, false);
  assert.deepEqual(coderSchema.required, ["provider", "baseUrl", "model", "apiKeyEnv"]);
  for (const key of Object.keys(coder)) {
    assert.ok(key in coderSchema.properties, `schema is missing coder.${key}`);
  }
  for (const key of Object.keys(judge)) {
    assert.ok(key in judgeSchema.properties, `schema is missing judge.${key}`);
  }
}

function adapterSchemaFor(schema: FactoryConfigSchema, key: "coder" | "judge") {
  const adapter = schema.properties.adapters.properties[key];
  if (adapter.$ref === "#/definitions/lmstudioAdapterConfig") {
    return schema.definitions.lmstudioAdapterConfig;
  }
  return adapter;
}

function unwrapResolved(result: ReturnType<typeof resolveFactoryConfig>) {
  if (!result.ok) {
    assert.fail(result.errors.join("\n"));
  }
  return result.resolved;
}
