import type { DeliveryRefusal } from "@protostar/delivery";
import type { DeliveryTarget } from "./preflight-full.js";

export type OctokitDeliveryPhase = "preflight" | "push" | "pr-create" | "comment" | "poll";

export const TOKEN_PATTERN = /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59,})\b/g;
const SENSITIVE_HEADER_PATTERN = /auth|token|cookie/i;

export function mapOctokitErrorToRefusal(
  err: unknown,
  context: { readonly phase: OctokitDeliveryPhase; readonly target?: DeliveryTarget }
): DeliveryRefusal {
  const error = sanitizeError(err);

  if (error.name === "AbortError") {
    return { kind: "cancelled", evidence: { reason: "parent-abort", phase: context.phase } };
  }
  if (error.name === "TimeoutError") {
    return { kind: "cancelled", evidence: { reason: "timeout", phase: context.phase } };
  }
  if (error.status === 401) {
    return { kind: "token-invalid", evidence: { reason: "401" } };
  }
  if (context.phase === "preflight" && context.target !== undefined) {
    if (error.status === 404 && /branch/i.test(error.message)) {
      return { kind: "base-branch-missing", evidence: { baseBranch: context.target.baseBranch } };
    }
    if (error.status === 403 || error.status === 404) {
      return {
        kind: "repo-inaccessible",
        evidence: { status: error.status, owner: context.target.owner, repo: context.target.repo }
      };
    }
  }
  if (context.phase === "pr-create" && error.status === 422) {
    if (/title/i.test(error.message)) {
      return { kind: "invalid-title", evidence: { input: error.message } };
    }
    return { kind: "invalid-body", evidence: { input: error.message } };
  }

  return { kind: "cancelled", evidence: { reason: "parent-abort", phase: context.phase } };
}

function sanitizeError(err: unknown): { readonly name?: string; readonly status?: number; readonly message: string } {
  const record = isRecord(err) ? err : {};
  const headers = headerRecord(record);
  scrubSensitiveHeaders(headers);

  const sanitized: { name?: string; status?: number; message: string } = {
    message: redact(typeof record.message === "string" ? record.message : String(err))
  };
  if (typeof record.name === "string") {
    sanitized.name = record.name;
  }
  if (typeof record.status === "number") {
    sanitized.status = record.status;
  }
  return sanitized;
}

function headerRecord(record: Record<string, unknown>): Record<string, unknown> {
  const request = isRecord(record.request) ? record.request : {};
  return isRecord(request.headers) ? { ...request.headers } : {};
}

function scrubSensitiveHeaders(headers: Record<string, unknown>): void {
  for (const key of Object.keys(headers)) {
    if (SENSITIVE_HEADER_PATTERN.test(key)) {
      delete headers[key];
    } else if (typeof headers[key] === "string") {
      headers[key] = redact(headers[key]);
    }
  }
}

function redact(value: string): string {
  return value.replace(TOKEN_PATTERN, "***");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
