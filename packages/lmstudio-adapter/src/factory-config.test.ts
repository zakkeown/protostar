import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveFactoryConfig, type FactoryConfig } from "./factory-config.js";

describe("resolveFactoryConfig", () => {
  it("returns LM Studio defaults when no file or env is provided", () => {
    const result = resolveFactoryConfig({ env: {} });

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error(result.errors.join("\n"));

    assert.deepEqual(result.resolved.config, {
      adapters: {
        coder: {
          provider: "lmstudio",
          baseUrl: "http://localhost:1234/v1",
          model: "qwen3-coder-next-mlx-4bit",
          apiKeyEnv: "LMSTUDIO_API_KEY",
          temperature: 0.2,
          topP: 0.9
        }
      }
    });
    assert.equal(result.resolved.resolvedFromFile, false);
    assert.deepEqual(result.resolved.envOverridesApplied, []);
  });

  it("merges file values over defaults and preserves missing default fields", () => {
    const result = resolveFactoryConfig({
      fileBytes: JSON.stringify({ adapters: { coder: { baseUrl: "http://other:5555/v1" } } }),
      env: {}
    });

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error(result.errors.join("\n"));

    assert.equal(result.resolved.config.adapters.coder.baseUrl, "http://other:5555/v1");
    assert.equal(result.resolved.config.adapters.coder.provider, "lmstudio");
    assert.equal(result.resolved.config.adapters.coder.model, "qwen3-coder-next-mlx-4bit");
    assert.equal(result.resolved.config.adapters.coder.apiKeyEnv, "LMSTUDIO_API_KEY");
    assert.equal(result.resolved.config.adapters.coder.temperature, 0.2);
    assert.equal(result.resolved.config.adapters.coder.topP, 0.9);
    assert.equal(result.resolved.resolvedFromFile, true);
  });

  it("applies LMSTUDIO_BASE_URL env over file values", () => {
    const result = resolveFactoryConfig({
      fileBytes: JSON.stringify({ adapters: { coder: { baseUrl: "http://filehost:5555/v1" } } }),
      env: { LMSTUDIO_BASE_URL: "http://envhost:9999/v1" }
    });

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error(result.errors.join("\n"));

    assert.equal(result.resolved.config.adapters.coder.baseUrl, "http://envhost:9999/v1");
    assert.deepEqual(result.resolved.envOverridesApplied, ["LMSTUDIO_BASE_URL"]);
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

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(third.ok, true);
    if (!first.ok || !second.ok || !third.ok) throw new Error("expected config resolution to pass");

    assert.equal(first.resolved.configHash, second.resolved.configHash);
    assert.notEqual(first.resolved.configHash, third.resolved.configHash);
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

  it("ships a schema matching the resolved config structure", () => {
    const schema = JSON.parse(
      readFileSync(new URL("../../src/factory-config.schema.json", import.meta.url), "utf8")
    ) as FactoryConfigSchema;
    const result = resolveFactoryConfig({ env: {} });

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error(result.errors.join("\n"));

    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.$id, "https://protostar.local/schema/factory-config.schema.json");
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, ["adapters"]);
    assertConfigSatisfiesSchemaShape(result.resolved.config, schema);
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
          readonly additionalProperties: boolean;
          readonly required: readonly string[];
          readonly properties: Record<string, unknown>;
        };
      };
    };
  };
}

function assertConfigSatisfiesSchemaShape(config: FactoryConfig, schema: FactoryConfigSchema): void {
  const coder = config.adapters.coder;
  const coderSchema = schema.properties.adapters.properties.coder;

  assert.equal(schema.properties.adapters.additionalProperties, false);
  assert.deepEqual(schema.properties.adapters.required, ["coder"]);
  assert.equal(coderSchema.additionalProperties, false);
  assert.deepEqual(coderSchema.required, ["provider", "baseUrl", "model", "apiKeyEnv"]);
  for (const key of Object.keys(coder)) {
    assert.ok(key in coderSchema.properties, `schema is missing coder.${key}`);
  }
}
