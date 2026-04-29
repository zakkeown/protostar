import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { ExecutionAdapter } from "@protostar/execution";
import type { HostedOpenAiCompatibleCoderAdapterConfig } from "@protostar/hosted-llm-adapter";
import type { LmstudioAdapterConfig } from "@protostar/lmstudio-adapter";
import type { MockCoderAdapterConfig } from "@protostar/mock-llm-adapter";

import { selectExecutionAdapter } from "./execution-adapter.js";

describe("selectExecutionAdapter", () => {
  it("selects the existing LM Studio adapter factory for the lmstudio backend", () => {
    const adapter = inertAdapter("lmstudio-coder");
    const createLmstudioCoderAdapter = mock.fn((_config: LmstudioAdapterConfig): ExecutionAdapter => adapter);

    const selected = selectExecutionAdapter({
      backend: "lmstudio",
      lmstudio: {
        baseUrl: "http://localhost:1234/v1",
        model: "qwen3-coder-next-mlx-4bit",
        apiKey: "lm-studio",
        temperature: 0.2,
        topP: 0.9
      },
      createLmstudioCoderAdapter
    });

    assert.equal(selected, adapter);
    assert.equal(selected.id, "lmstudio-coder");
    assert.equal(createLmstudioCoderAdapter.mock.callCount(), 1);
    assert.deepEqual(createLmstudioCoderAdapter.mock.calls[0]?.arguments[0], {
      baseUrl: "http://localhost:1234/v1",
      model: "qwen3-coder-next-mlx-4bit",
      apiKey: "lm-studio",
      temperature: 0.2,
      topP: 0.9
    });
  });

  it("selects the hosted OpenAI-compatible adapter factory with env-key redaction config", () => {
    const adapter = inertAdapter("hosted-openai-compatible-coder");
    const createHostedOpenAiCompatibleCoderAdapter = mock.fn(
      (_config: HostedOpenAiCompatibleCoderAdapterConfig): ExecutionAdapter => adapter
    );

    const selected = selectExecutionAdapter({
      backend: "hosted-openai-compatible",
      hostedOpenAiCompatible: {
        baseUrl: "https://hosted.example/v1",
        model: "hosted-coder",
        apiKeyEnv: "PROTOSTAR_HOSTED_LLM_API_KEY",
        env: { PROTOSTAR_HOSTED_LLM_API_KEY: "sk-test" }
      },
      createHostedOpenAiCompatibleCoderAdapter
    });

    assert.equal(selected, adapter);
    assert.equal(selected.id, "hosted-openai-compatible-coder");
    assert.equal(createHostedOpenAiCompatibleCoderAdapter.mock.callCount(), 1);
    assert.deepEqual(createHostedOpenAiCompatibleCoderAdapter.mock.calls[0]?.arguments[0], {
      baseUrl: "https://hosted.example/v1",
      model: "hosted-coder",
      apiKeyEnv: "PROTOSTAR_HOSTED_LLM_API_KEY",
      env: { PROTOSTAR_HOSTED_LLM_API_KEY: "sk-test" }
    });
  });

  it("selects the deterministic mock adapter factory for stress", () => {
    const adapter = inertAdapter("mock-coder:network-drop");
    const createMockCoderAdapter = mock.fn((_config: MockCoderAdapterConfig): ExecutionAdapter => adapter);

    const selected = selectExecutionAdapter({
      backend: "mock",
      env: { PROTOSTAR_MOCK_LLM_MODE: "network-drop" },
      createMockCoderAdapter
    });

    assert.equal(selected, adapter);
    assert.equal(selected.id, "mock-coder:network-drop");
    assert.equal(createMockCoderAdapter.mock.callCount(), 1);
    assert.deepEqual(createMockCoderAdapter.mock.calls[0]?.arguments[0], { mode: "network-drop" });
  });
});

function inertAdapter(id: string): ExecutionAdapter {
  return {
    id,
    async *execute() {
      yield {
        kind: "final",
        result: {
          outcome: "adapter-failed",
          reason: "aborted",
          evidence: {
            model: id,
            attempts: 0,
            durationMs: 0,
            auxReads: [],
            retries: []
          }
        }
      };
    }
  };
}
