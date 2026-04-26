import { TOOL_PERMISSION_LEVELS } from "./models.js";

import type { IntentDraft, RiskLevel, ToolPermissionLevel } from "./models.js";

import type { RepoScopeGrant } from "./capability-envelope.js";

export function draftFieldValue(draft: IntentDraft, field: string): unknown {
  return isRecord(draft) ? (draft as Record<string, unknown>)[field] : undefined;
}

export function hasNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function stableHash(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return hash.toString(36).padStart(7, "0");
}

export function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return roundScore(values.reduce((total, value) => total + value, 0) / values.length);
}

export function roundScore(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

export function uniqueOrdered(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

export function readString(record: Record<string, unknown>, path: string, errors: string[]): string | undefined {
  const key = path.split(".").at(-1) ?? path;
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${path} must be a non-empty string.`);
    return undefined;
  }
  return value;
}

export function readOptionalString(record: Record<string, unknown>, key: string, errors: string[]): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${key} must be a non-empty string when provided.`);
    return undefined;
  }
  return value;
}

export function readOptionalPathString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[]
): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${path} must be a non-empty string when provided.`);
    return undefined;
  }
  return value;
}

export function readOptionalStringArray(
  record: Record<string, unknown>,
  key: string,
  errors: string[]
): readonly string[] | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    errors.push(`${key} must be an array of strings when provided.`);
    return undefined;
  }
  return value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isRiskLevel(value: unknown): value is RiskLevel {
  return value === "low" || value === "medium" || value === "high";
}

export function isToolPermissionLevel(value: unknown): value is ToolPermissionLevel {
  return typeof value === "string" && TOOL_PERMISSION_LEVELS.includes(value as ToolPermissionLevel);
}

export function isRepoAccess(value: unknown): value is RepoScopeGrant["access"] {
  return value === "read" || value === "write" || value === "execute";
}
