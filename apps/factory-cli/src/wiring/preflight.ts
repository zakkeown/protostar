import { preflightLmstudioModel } from "@protostar/lmstudio-adapter";

export interface PreflightOutcome {
  readonly status: "ready" | "coder-model-not-loaded" | "judge-model-not-loaded" | "unreachable" | "http-error";
  readonly detail?: string;
}

export async function preflightCoderAndJudge(input: {
  readonly coderBaseUrl: string;
  readonly judgeBaseUrl: string;
  readonly coderModel: string;
  readonly judgeModel: string;
  readonly timeoutMs: number;
  readonly fetchImpl?: typeof fetch;
}): Promise<PreflightOutcome> {
  const coder = await preflightLmstudioModel({
    baseUrl: input.coderBaseUrl,
    model: input.coderModel,
    timeoutMs: input.timeoutMs,
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {})
  });
  if (coder.status === "model-not-loaded") {
    return { status: "coder-model-not-loaded", detail: input.coderModel };
  }
  if (coder.status === "unreachable" || coder.status === "http-error") {
    return { status: coder.status, ...(coder.detail !== undefined ? { detail: coder.detail } : {}) };
  }

  const judge = await preflightLmstudioModel({
    baseUrl: input.judgeBaseUrl,
    model: input.judgeModel,
    timeoutMs: input.timeoutMs,
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {})
  });
  if (judge.status === "model-not-loaded") {
    return { status: "judge-model-not-loaded", detail: input.judgeModel };
  }
  if (judge.status === "unreachable" || judge.status === "http-error") {
    return { status: judge.status, ...(judge.detail !== undefined ? { detail: judge.detail } : {}) };
  }

  return { status: "ready" };
}
