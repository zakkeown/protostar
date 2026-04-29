import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { ExecutionAdapter } from "@protostar/execution";
import type { LmstudioAdapterConfig } from "@protostar/lmstudio-adapter";

import { LlmBackendUnavailableError, selectExecutionAdapter } from "./execution-adapter.js";

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

  it("returns typed unavailable errors for backends that land in later Phase 11 plans", () => {
    assert.throws(
      () => selectExecutionAdapter({ backend: "hosted-openai-compatible" }),
      (error: unknown) => isUnavailableCode(error, "hosted-backend-package-missing")
    );

    assert.throws(
      () => selectExecutionAdapter({ backend: "mock" }),
      (error: unknown) => isUnavailableCode(error, "mock-backend-package-missing")
    );
  });
});

function isUnavailableCode(error: unknown, code: string): boolean {
  return error instanceof LlmBackendUnavailableError && (error as { readonly code?: unknown }).code === code;
}

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
