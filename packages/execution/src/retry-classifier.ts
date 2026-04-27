export const TRANSIENT_HTTP_STATUSES: ReadonlySet<number> = new Set([
  408,
  429,
  500,
  502,
  503,
  504
]);

const TRANSIENT_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EPIPE"
]);

export function isTransientFailure(
  input:
    | { readonly kind: "http"; readonly status: number }
    | { readonly kind: "error"; readonly error: unknown }
): boolean {
  if (input.kind === "http") {
    return TRANSIENT_HTTP_STATUSES.has(input.status);
  }

  const error = input.error;
  if (isAbortError(error)) {
    return false;
  }

  const code = getErrorCode(error);
  if (code !== undefined && TRANSIENT_ERROR_CODES.has(code)) {
    return true;
  }

  return error instanceof Error && /timeout/i.test(error.message);
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    String(error.name) === "AbortError"
  );
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  if ("code" in error && error.code !== undefined) {
    return String(error.code);
  }
  if ("cause" in error) {
    return getErrorCode(error.cause);
  }
  return undefined;
}
