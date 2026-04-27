import type { AuthorizedNetworkOp } from "@protostar/authority";

export type PreflightResult =
  | { readonly outcome: "ok"; readonly availableModels: readonly string[] }
  | { readonly outcome: "unreachable"; readonly errorClass: string; readonly errorMessage: string }
  | { readonly outcome: "model-not-loaded"; readonly model: string; readonly availableModels: readonly string[] }
  | { readonly outcome: "empty-models"; readonly availableModels: readonly [] }
  | { readonly outcome: "http-error"; readonly status: number; readonly bodySnippet: string };

export interface PreflightInput {
  readonly authorizedOp: AuthorizedNetworkOp;
  readonly model: string;
  readonly signal: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}

export async function preflightLmstudio(input: PreflightInput): Promise<PreflightResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;

  try {
    response = await fetchImpl(input.authorizedOp.url, { method: "GET", signal: input.signal });
  } catch (error: unknown) {
    return {
      outcome: "unreachable",
      errorClass: errorClassOf(error),
      errorMessage: errorMessageOf(error)
    };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return { outcome: "http-error", status: response.status, bodySnippet: body.slice(0, 500) };
  }

  const json = await response.json().catch(() => null);
  const data = modelDataFrom(json);
  if (data === null) {
    return { outcome: "http-error", status: response.status, bodySnippet: "missing data[]" };
  }

  const availableModels = data
    .map((model) => String(model.id ?? ""))
    .filter((id) => id.length > 0);
  const truncated = availableModels.slice(0, 20);

  if (availableModels.length === 0) {
    return { outcome: "empty-models", availableModels: [] };
  }

  if (!availableModels.includes(input.model)) {
    return { outcome: "model-not-loaded", model: input.model, availableModels: truncated };
  }

  return { outcome: "ok", availableModels: truncated };
}

function modelDataFrom(value: unknown): ReadonlyArray<{ readonly id?: unknown }> | null {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    return null;
  }
  return value.data.filter(isRecord);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
