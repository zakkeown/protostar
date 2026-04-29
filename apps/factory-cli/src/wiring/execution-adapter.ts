import type { ExecutionAdapter } from "@protostar/execution";
import {
  createHostedOpenAiCompatibleCoderAdapter as defaultCreateHostedOpenAiCompatibleCoderAdapter,
  type HostedOpenAiCompatibleCoderAdapterConfig
} from "@protostar/hosted-llm-adapter";
import {
  createLmstudioCoderAdapter as defaultCreateLmstudioCoderAdapter,
  type LlmBackend,
  type LmstudioAdapterConfig
} from "@protostar/lmstudio-adapter";
import {
  createMockCoderAdapter as defaultCreateMockCoderAdapter,
  parseMockCoderMode,
  type MockCoderAdapterConfig
} from "@protostar/mock-llm-adapter";

export interface SelectExecutionAdapterInput {
  readonly backend: LlmBackend;
  readonly lmstudio?: LmstudioAdapterConfig;
  readonly hostedOpenAiCompatible?: HostedOpenAiCompatibleCoderAdapterConfig;
  readonly mock?: MockCoderAdapterConfig;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly createLmstudioCoderAdapter?: (config: LmstudioAdapterConfig) => ExecutionAdapter;
  readonly createHostedOpenAiCompatibleCoderAdapter?: (
    config: HostedOpenAiCompatibleCoderAdapterConfig
  ) => ExecutionAdapter;
  readonly createMockCoderAdapter?: (config: MockCoderAdapterConfig) => ExecutionAdapter;
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
    case "hosted-openai-compatible": {
      if (input.hostedOpenAiCompatible === undefined) {
        throw new Error("Hosted OpenAI-compatible backend selection requires hosted adapter config.");
      }
      const createAdapter =
        input.createHostedOpenAiCompatibleCoderAdapter ?? defaultCreateHostedOpenAiCompatibleCoderAdapter;
      return createAdapter(input.hostedOpenAiCompatible);
    }
    case "mock": {
      const createAdapter = input.createMockCoderAdapter ?? defaultCreateMockCoderAdapter;
      const mode =
        input.mock?.mode ??
        parseMockCoderMode(input.env?.PROTOSTAR_MOCK_LLM_MODE ?? process.env.PROTOSTAR_MOCK_LLM_MODE);
      return createAdapter({ mode });
    }
  }
}
