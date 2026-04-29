import type { ExecutionAdapter } from "@protostar/execution";
import type { HostedOpenAiCompatibleCoderAdapterConfig } from "@protostar/hosted-llm-adapter";
import {
  createLmstudioCoderAdapter as defaultCreateLmstudioCoderAdapter,
  type LlmBackend,
  type LmstudioAdapterConfig
} from "@protostar/lmstudio-adapter";

export type LlmBackendUnavailableCode =
  | "hosted-backend-package-missing"
  | "mock-backend-package-missing";

export class LlmBackendUnavailableError extends Error {
  constructor(
    public readonly backend: Exclude<LlmBackend, "lmstudio">,
    public readonly code: LlmBackendUnavailableCode
  ) {
    super(`LLM backend "${backend}" is not available yet: ${code}.`);
    this.name = "LlmBackendUnavailableError";
  }
}

export interface SelectExecutionAdapterInput {
  readonly backend: LlmBackend;
  readonly lmstudio?: LmstudioAdapterConfig;
  readonly hostedOpenAiCompatible?: HostedOpenAiCompatibleCoderAdapterConfig;
  readonly createLmstudioCoderAdapter?: (config: LmstudioAdapterConfig) => ExecutionAdapter;
}

export function selectExecutionAdapter(input: SelectExecutionAdapterInput): ExecutionAdapter {
  switch (input.backend) {
    case "lmstudio": {
      if (input.lmstudio === undefined) {
        throw new Error("LM Studio backend selection requires lmstudio adapter config.");
      }
      const createAdapter = input.createLmstudioCoderAdapter ?? defaultCreateLmstudioCoderAdapter;
      return createAdapter(input.lmstudio);
    }
    case "hosted-openai-compatible":
      throw new LlmBackendUnavailableError(input.backend, "hosted-backend-package-missing");
    case "mock":
      throw new LlmBackendUnavailableError(input.backend, "mock-backend-package-missing");
  }
}
