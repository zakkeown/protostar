import { parseSseStream } from "./sse-parser.js";

export interface LmstudioChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface LmstudioChatRequest {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey?: string;
  readonly messages: readonly LmstudioChatMessage[];
  readonly stream: boolean;
  readonly responseFormat?: "json_object" | "text";
  readonly signal: AbortSignal;
  readonly timeoutMs: number;
  readonly fetchImpl?: typeof fetch;
  readonly temperature?: number;
  readonly topP?: number;
}

export type LmstudioChatEvent =
  | { readonly kind: "token"; readonly text: string }
  | { readonly kind: "done"; readonly finishReason: string }
  | { readonly kind: "error"; readonly errorClass: string; readonly message: string };

export function callLmstudioChatStream(req: LmstudioChatRequest): AsyncIterable<LmstudioChatEvent> {
  return callLmstudioChatStreamInner(req);
}

async function* callLmstudioChatStreamInner(
  req: LmstudioChatRequest
): AsyncIterable<LmstudioChatEvent> {
  const fetchImpl = req.fetchImpl ?? fetch;
  let response: Response;

  try {
    response = await fetchImpl(chatCompletionsUrl(req.baseUrl), {
      method: "POST",
      headers: chatHeaders(req.apiKey),
      body: JSON.stringify(chatPayload(req, true)),
      signal: req.signal
    });
  } catch (error: unknown) {
    yield { kind: "error", errorClass: errorClassOf(error), message: errorMessageWithCode(error) };
    return;
  }

  if (!response.ok || response.body === null) {
    yield {
      kind: "error",
      errorClass: `HTTP_${response.status}`,
      message: await response.text().catch(() => "")
    };
    return;
  }

  for await (const ev of parseSseStream(response.body)) {
    if (ev.data === "[DONE]") {
      yield { kind: "done", finishReason: "stop" };
      return;
    }

    const parsed = parseStreamFrame(ev.data);
    if (parsed.kind === "token") {
      yield parsed;
      continue;
    }
    if (parsed.kind === "done") {
      yield parsed;
      return;
    }
  }
}

export function callLmstudioChatJson(req: LmstudioChatRequest): Promise<unknown> {
  return callLmstudioChatJsonInner(req);
}

async function callLmstudioChatJsonInner(req: LmstudioChatRequest): Promise<unknown> {
  const fetchImpl = req.fetchImpl ?? fetch;
  const response = await fetchImpl(chatCompletionsUrl(req.baseUrl), {
    method: "POST",
    headers: chatHeaders(req.apiKey),
    body: JSON.stringify(chatPayload(req, false)),
    signal: req.signal
  });

  if (!response.ok) {
    throw new LmstudioChatHttpError(response.status, await response.text().catch(() => ""));
  }

  return response.json();
}

export function preflightLmstudioModel(input: {
  readonly baseUrl: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}): Promise<{
  readonly status: "ready" | "model-not-loaded" | "unreachable" | "http-error";
  readonly detail?: string;
}> {
  return preflightLmstudioModelInner(input);
}

async function preflightLmstudioModelInner(input: {
  readonly baseUrl: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}): Promise<{
  readonly status: "ready" | "model-not-loaded" | "unreachable" | "http-error";
  readonly detail?: string;
}> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), input.timeoutMs);
  const signal = input.signal === undefined ? controller.signal : anySignal(input.signal, controller.signal);

  try {
    const response = await fetchImpl(modelsUrl(input.baseUrl), { method: "GET", signal });
    if (!response.ok) {
      return { status: "http-error", detail: `${response.status}: ${await response.text().catch(() => "")}` };
    }
    const json = await response.json().catch(() => null);
    const models = modelIdsFrom(json);
    if (!models.includes(input.model)) {
      return { status: "model-not-loaded", detail: models.join(",") };
    }
    return { status: "ready" };
  } catch (error: unknown) {
    return { status: "unreachable", detail: `${errorClassOf(error)}: ${errorMessageOf(error)}` };
  } finally {
    clearTimeout(timer);
  }
}

export class LmstudioChatHttpError extends Error {
  constructor(
    readonly status: number,
    readonly bodySnippet: string
  ) {
    super(`LM Studio chat HTTP ${status}`);
    this.name = "LmstudioChatHttpError";
  }
}

function chatPayload(req: LmstudioChatRequest, stream: boolean): Record<string, unknown> {
  return {
    model: req.model,
    messages: req.messages,
    stream,
    temperature: req.temperature ?? 0.2,
    top_p: req.topP ?? 0.9,
    ...(req.responseFormat === "json_object"
      ? { response_format: { type: "json_object" } }
      : {})
  };
}

function chatHeaders(apiKey: string | undefined): HeadersInit {
  return {
    ...(apiKey !== undefined && apiKey.length > 0 ? { authorization: `Bearer ${apiKey}` } : {}),
    "content-type": "application/json"
  };
}

function parseStreamFrame(data: string): LmstudioChatEvent {
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
    return { kind: "error", errorClass: errorClassOf(error), message: errorMessageOf(error) };
  }
}

function modelIdsFrom(value: unknown): readonly string[] {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    return [];
  }
  return value.data
    .filter(isRecord)
    .map((model) => model.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
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

function chatCompletionsUrl(baseUrl: string): string {
  return `${trimTrailingSlash(baseUrl)}/chat/completions`;
}

function modelsUrl(baseUrl: string): string {
  return `${trimTrailingSlash(baseUrl)}/models`;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
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
