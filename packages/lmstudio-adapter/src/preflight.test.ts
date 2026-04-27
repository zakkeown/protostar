import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AuthorizedNetworkOp } from "@protostar/authority";

import { startStubLmstudio } from "../internal/test-fixtures/stub-lmstudio-server.js";
import { preflightLmstudio } from "./preflight.js";

const TARGET_MODEL = "qwen3-coder-next-mlx-4bit";

describe("preflightLmstudio", () => {
  it("returns ok with available models when the configured model is loaded", async (t) => {
    const server = await startStubLmstudio({ models: [TARGET_MODEL, "other"] });
    t.after(() => void server.close());

    const result = await preflightLmstudio({
      authorizedOp: authorizedGet(`${server.baseUrl}/models`),
      model: TARGET_MODEL,
      signal: new AbortController().signal
    });

    assert.deepEqual(result, { outcome: "ok", availableModels: [TARGET_MODEL, "other"] });
  });

  it("returns model-not-loaded with a truncated model list when the target model is absent", async (t) => {
    const models = Array.from({ length: 25 }, (_, index) => `other-${index}`);
    const server = await startStubLmstudio({ models });
    t.after(() => void server.close());

    const result = await preflightLmstudio({
      authorizedOp: authorizedGet(`${server.baseUrl}/models`),
      model: TARGET_MODEL,
      signal: new AbortController().signal
    });

    assert.equal(result.outcome, "model-not-loaded");
    if (result.outcome !== "model-not-loaded") throw new Error("expected model-not-loaded");
    assert.equal(result.model, TARGET_MODEL);
    assert.deepEqual(result.availableModels, models.slice(0, 20));
  });

  it("returns empty-models for a 200 response with no model ids", async (t) => {
    const server = await startStubLmstudio({ models: [] });
    t.after(() => void server.close());

    const result = await preflightLmstudio({
      authorizedOp: authorizedGet(`${server.baseUrl}/models`),
      model: TARGET_MODEL,
      signal: new AbortController().signal
    });

    assert.deepEqual(result, { outcome: "empty-models", availableModels: [] });
  });

  it("returns unreachable for a closed loopback port", async (t) => {
    const server = await startStubLmstudio();
    const url = `${server.baseUrl}/models`;
    await server.close();
    t.after(() => void server.close().catch(() => undefined));

    const result = await preflightLmstudio({
      authorizedOp: authorizedGet(url),
      model: TARGET_MODEL,
      signal: new AbortController().signal
    });

    assert.equal(result.outcome, "unreachable");
    if (result.outcome !== "unreachable") throw new Error("expected unreachable");
    assert.match(result.errorClass, /TypeError|Error/);
    assert.equal(typeof result.errorMessage, "string");
  });

  it("returns http-error with a bounded body snippet for non-2xx preflight responses", async (t) => {
    const server = await startStubLmstudio({ preflightStatus: 500 });
    t.after(() => void server.close());

    const result = await preflightLmstudio({
      authorizedOp: authorizedGet(`${server.baseUrl}/models`),
      model: TARGET_MODEL,
      signal: new AbortController().signal
    });

    assert.equal(result.outcome, "http-error");
    if (result.outcome !== "http-error") throw new Error("expected http-error");
    assert.equal(result.status, 500);
    assert.match(result.bodySnippet, /stub lmstudio preflight failure: 500/);
    assert.ok(result.bodySnippet.length <= 500);
  });

  it("classifies aborted fetches as unreachable AbortError", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await preflightLmstudio({
      authorizedOp: authorizedGet("http://127.0.0.1:1/v1/models"),
      model: TARGET_MODEL,
      signal: controller.signal,
      fetchImpl: async () => {
        throw new DOMException("The operation was aborted", "AbortError");
      }
    });

    assert.equal(result.outcome, "unreachable");
    if (result.outcome !== "unreachable") throw new Error("expected unreachable");
    assert.equal(result.errorClass, "AbortError");
    assert.match(result.errorMessage, /aborted/i);
  });

  it("uses the injectable fetch implementation", async () => {
    const calls: string[] = [];
    const result = await preflightLmstudio({
      authorizedOp: authorizedGet("http://127.0.0.1:1234/v1/models"),
      model: TARGET_MODEL,
      signal: new AbortController().signal,
      fetchImpl: async (input: Parameters<typeof fetch>[0]) => {
        calls.push(String(input));
        return new Response(
          JSON.stringify({
            object: "list",
            data: [{ id: TARGET_MODEL, object: "model", owned_by: "organization_owner" }]
          }),
          { status: 200 }
        );
      }
    });

    assert.deepEqual(calls, ["http://127.0.0.1:1234/v1/models"]);
    assert.deepEqual(result, { outcome: "ok", availableModels: [TARGET_MODEL] });
  });
});

function authorizedGet(url: string): AuthorizedNetworkOp {
  return Object.freeze({
    method: "GET",
    url,
    resolvedEnvelope: {}
  }) as AuthorizedNetworkOp;
}
