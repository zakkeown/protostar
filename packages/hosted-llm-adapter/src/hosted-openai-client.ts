import { parseSseStream } from "@protostar/lmstudio-adapter";

export const DEFAULT_HOSTED_OPENAI_API_KEY_ENV = "PROTOSTAR_HOSTED_LLM_API_KEY";

export interface HostedOpenAiCompatibleChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface HostedOpenAiCompatibleChatRequest {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
  readonly apiKeyEnv: string;
  readonly messages: readonly HostedOpenAiCompatibleChatMessage[];
  readonly signal: AbortSignal;
  readonly timeoutMs: number;
  readonly fetchImpl?: typeof fetch;
  readonly temperature?: number;
  readonly topP?: number;
}

export type HostedOpenAiCompatibleChatEvent =
  | { readonly kind: "token"; readonly text: string }
  | { readonly kind: "done"; readonly finishReason: string }
  | { readonly kind: "error"; readonly errorClass: string; readonly message: string };

export function callHostedOpenAiCompatibleChatStream(
  req: HostedOpenAiCompatibleChatRequest
): AsyncIterable<HostedOpenAiCompatibleChatEvent> {
  return callHostedOpenAiCompatibleChatStreamInner(req);
}

export function redactHostedSecret(value: string, apiKey: string, apiKeyEnv: string): string {
  if (apiKey.length === 0) return value;
  return value.split(apiKey).join(redactionToken(apiKeyEnv));
}

export function redactionToken(apiKeyEnv: string): string {
  return `<redacted:${apiKeyEnv}>`;
}

async function* callHostedOpenAiCompatibleChatStreamInner(
  req: HostedOpenAiCompatibleChatRequest
): AsyncIterable<HostedOpenAiCompatibleChatEvent> {
  const fetchImpl = req.fetchImpl ?? fetch;
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort("timeout"), req.timeoutMs);
  const signal = anySignal(req.signal, timeout.signal);
  let response: Response;

  try {
    try {
      response = await fetchImpl(chatCompletionsUrl(req.baseUrl), {
        method: "POST",
        headers: chatHeaders(req.apiKey),
        body: JSON.stringify(chatPayload(req)),
        signal
      });
    } catch (error: unknown) {
      const timedOut = timeout.signal.aborted && timeout.signal.reason === "timeout";
      yield {
        kind: "error",
        errorClass: timedOut ? "TimeoutError" : errorClassOf(error),
        message: redactHostedSecret(
          timedOut
            ? `Hosted OpenAI-compatible chat timed out after ${req.timeoutMs}ms (${req.apiKey})`
            : errorMessageWithCode(error),
          req.apiKey,
          req.apiKeyEnv
        )
      };
      return;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      yield {
        kind: "error",
        errorClass: `HTTP_${response.status}`,
        message: redactHostedSecret(`HTTP ${response.status}: ${body}`, req.apiKey, req.apiKeyEnv)
      };
      return;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream")) {
      if (response.body === null) {
        yield malformedResponse("missing response body", req);
        return;
      }
      yield* parseStreamBody(response.body, req);
      return;
    }

    const json = await response.json().catch((error: unknown) => error);
    if (json instanceof Error) {
      yield malformedResponse(json.message, req);
      return;
    }
    const content = completionContentFrom(json);
    if (content === undefined) {
      yield malformedResponse("missing choices[0].message.content", req);
      return;
    }
    if (content.length > 0) {
      yield { kind: "token", text: content };
    }
    yield { kind: "done", finishReason: "stop" };
  } finally {
    clearTimeout(timer);
  }
}

async function* parseStreamBody(
  body: ReadableStream<Uint8Array>,
  req: HostedOpenAiCompatibleChatRequest
): AsyncIterable<HostedOpenAiCompatibleChatEvent> {
  for await (const ev of parseSseStream(body)) {
    if (ev.data === "[DONE]") {
      yield { kind: "done", finishReason: "stop" };
      return;
    }

    const parsed = parseStreamFrame(ev.data, req);
    yield parsed;
    if (parsed.kind === "done" || parsed.kind === "error") return;
  }
}

function parseStreamFrame(
  data: string,
  req: HostedOpenAiCompatibleChatRequest
): HostedOpenAiCompatibleChatEvent {
  try {
    const chunk = JSON.parse(data) as {
      readonly choices?: readonly {
        readonly delta?: { readonly content?: unknown };
        readonly finish_reason?: unknown;
      }[];
    };
    const choice = chunk.choices?.[0];
    const content = choice?.delta?.content;
    if (typeof content === "string" && content.length > 0) {
      return { kind: "token", text: content };
    }
    if (typeof choice?.finish_reason === "string") {
      return { kind: "done", finishReason: choice.finish_reason };
    }
    return { kind: "token", text: "" };
  } catch (error: unknown) {
    return malformedResponse(errorMessageOf(error), req);
  }
}

function completionContentFrom(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value.choices)) return undefined;
  const choice = value.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) return undefined;
  return typeof choice.message.content === "string" ? choice.message.content : undefined;
}

function malformedResponse(
  message: string,
  req: HostedOpenAiCompatibleChatRequest
): HostedOpenAiCompatibleChatEvent {
  return {
    kind: "error",
    errorClass: "MalformedResponse",
    message: redactHostedSecret(`Malformed hosted chat response: ${message}`, req.apiKey, req.apiKeyEnv)
  };
}

function chatPayload(req: HostedOpenAiCompatibleChatRequest): Record<string, unknown> {
  return {
    model: req.model,
    messages: req.messages,
    stream: true,
    temperature: req.temperature ?? 0.2,
    top_p: req.topP ?? 0.9
  };
}

function chatHeaders(apiKey: string): HeadersInit {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json"
  };
}

function chatCompletionsUrl(baseUrl: string): string {
  return `${trimTrailingSlash(baseUrl)}/chat/completions`;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function anySignal(a: AbortSignal, b: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const forward = (signal: AbortSignal) => {
    if (!controller.signal.aborted) {
      controller.abort(signal.reason);
    }
  };
  if (a.aborted) forward(a);
  if (b.aborted) forward(b);
  a.addEventListener("abort", () => forward(a), { once: true });
  b.addEventListener("abort", () => forward(b), { once: true });
  return controller.signal;
}

function errorClassOf(error: unknown): string {
  if (isRecord(error) && typeof error.name === "string") {
    return error.name;
  }
  return "Error";
}

function errorMessageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function errorMessageWithCode(error: unknown): string {
  const code = errorCodeOf(error);
  return code === undefined ? errorMessageOf(error) : `${errorMessageOf(error)} ${code}`;
}

function errorCodeOf(error: unknown): string | undefined {
  if (isRecord(error) && typeof error.code === "string") {
    return error.code;
  }
  if (isRecord(error) && "cause" in error) {
    return errorCodeOf(error.cause);
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
