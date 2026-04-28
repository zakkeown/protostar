import type {
  JudgeCritique,
  ModelReviewer,
  ModelReviewInput,
  ModelReviewResult,
  ReviewVerdict
} from "@protostar/review";

import {
  callLmstudioChatJson,
  preflightLmstudioModel,
  type LmstudioChatMessage
} from "./lmstudio-client.js";

export interface LmstudioJudgeAdapterConfig {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKeyEnv?: string;
  readonly judgeId: string;
  readonly timeoutMs: number;
  readonly fetchImpl?: typeof fetch;
}

export class LmstudioJudgeParseError extends Error {
  constructor(readonly rawContent: string) {
    super("LM Studio judge returned malformed JSON");
    this.name = "LmstudioJudgeParseError";
    this.cause = rawContent;
  }
}

export class LmstudioJudgePreflightError extends Error {
  constructor(
    readonly status: "model-not-loaded" | "unreachable" | "http-error",
    detail: string | undefined
  ) {
    super(`LM Studio judge preflight failed: ${status}${detail === undefined ? "" : ` (${detail})`}`);
    this.name = "LmstudioJudgePreflightError";
  }
}

/**
 * v0.1 judge reviews the whole admitted plan as a panel of one, so taskRefs are
 * every admitted task id. Phase 8 owns granular task attribution and N-judge consensus.
 */
export function createLmstudioJudgeAdapter(config: LmstudioJudgeAdapterConfig): ModelReviewer {
  return async (input) => {
    const signal = timeoutSignal(config.timeoutMs);
    try {
      const preflight = await preflightLmstudioModel({
        baseUrl: config.baseUrl,
        model: config.model,
        timeoutMs: config.timeoutMs,
        signal,
        ...(config.fetchImpl !== undefined ? { fetchImpl: config.fetchImpl } : {})
      });
      if (preflight.status !== "ready") {
        throw new LmstudioJudgePreflightError(preflight.status, preflight.detail);
      }

      const apiKey = apiKeyFromEnv(config.apiKeyEnv);
      const response = await callLmstudioChatJson({
        baseUrl: config.baseUrl,
        model: config.model,
        messages: buildJudgeMessages(input),
        stream: false,
        responseFormat: "json_object",
        signal,
        timeoutMs: config.timeoutMs,
        ...(apiKey !== undefined ? { apiKey } : {}),
        ...(config.fetchImpl !== undefined ? { fetchImpl: config.fetchImpl } : {})
      });
      const parsed = parseJudgeResponse(response);
      const critique: JudgeCritique = {
        judgeId: config.judgeId,
        model: config.model,
        rubric: parsed.rubric,
        verdict: parsed.verdict,
        rationale: parsed.rationale,
        taskRefs: input.admittedPlan.tasks.map((task) => task.planTaskId)
      };

      return { verdict: parsed.verdict, critiques: [critique] } satisfies ModelReviewResult;
    } finally {
      signal.clear();
    }
  };
}

function buildJudgeMessages(input: ModelReviewInput): readonly LmstudioChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are a code review judge for the cosmetic-tweak archetype.",
        "Return only JSON matching {\"rubric\":{...},\"verdict\":\"pass|repair|block\",\"rationale\":\"...\"}."
      ].join("\n")
    },
    {
      role: "user",
      content: [
        "Plan summary:",
        JSON.stringify(
          {
            planId: input.admittedPlan.planId,
            intentId: input.admittedPlan.intentId,
            tasks: input.admittedPlan.tasks.map((task) => ({
              id: task.planTaskId,
              title: task.title,
              targetFiles: task.targetFiles ?? []
            }))
          },
          null,
          2
        ),
        "",
        "Mechanical gate:",
        JSON.stringify(input.mechanicalGate, null, 2),
        "",
        "Unified diff:",
        input.diff.unifiedDiff,
        ...(input.repairContext === undefined
          ? []
          : [
              "",
              "Previous attempt failed — critiques attached:",
              JSON.stringify(input.repairContext, null, 2)
            ])
      ].join("\n")
    }
  ];
}

function parseJudgeResponse(response: unknown): {
  readonly rubric: Readonly<Record<string, number>>;
  readonly verdict: ReviewVerdict;
  readonly rationale: string;
} {
  const content = messageContentFrom(response);
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new LmstudioJudgeParseError(content);
  }

  if (!isRecord(parsed)) {
    throw new LmstudioJudgeParseError(content);
  }
  const { rubric, verdict, rationale } = parsed;
  if (!isNumberRecord(rubric) || !isReviewVerdict(verdict) || typeof rationale !== "string") {
    throw new LmstudioJudgeParseError(content);
  }
  return { rubric, verdict, rationale };
}

function messageContentFrom(response: unknown): string {
  if (!isRecord(response) || !Array.isArray(response.choices)) {
    throw new LmstudioJudgeParseError(JSON.stringify(response));
  }
  const first = response.choices[0];
  if (!isRecord(first) || !isRecord(first.message) || typeof first.message.content !== "string") {
    throw new LmstudioJudgeParseError(JSON.stringify(response));
  }
  return first.message.content;
}

function isReviewVerdict(value: unknown): value is ReviewVerdict {
  return value === "pass" || value === "repair" || value === "block";
}

function isNumberRecord(value: unknown): value is Readonly<Record<string, number>> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "number");
}

function apiKeyFromEnv(apiKeyEnv: string | undefined): string | undefined {
  const name = apiKeyEnv ?? "LMSTUDIO_API_KEY";
  return process.env[name];
}

function timeoutSignal(timeoutMs: number): AbortSignal & { clear(): void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  return Object.assign(controller.signal, {
    clear() {
      clearTimeout(timer);
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
