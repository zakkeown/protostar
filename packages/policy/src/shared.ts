import { TOOL_PERMISSION_LEVELS } from "@protostar/intent";

import type { CapabilityEnvelope, IntentDraftCapabilityEnvelope, RiskLevel, ToolPermissionLevel } from "@protostar/intent";

import { SUPPORTED_GOAL_ARCHETYPES } from "./archetypes.js";

import type { GoalArchetype } from "./archetypes.js";

export function riskRank(risk: "low" | "medium" | "high"): number {
  return risk === "high" ? 3 : risk === "medium" ? 2 : 1;
}

export function formatAllowedPolicyValues(values: readonly string[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}

export function isToolPermissionLevel(value: unknown): value is ToolPermissionLevel {
  return typeof value === "string" && TOOL_PERMISSION_LEVELS.includes(value as ToolPermissionLevel);
}

export function normalizeAuthorityJustification(envelope: IntentDraftCapabilityEnvelope | undefined): string | undefined {
  return normalizeText(envelope?.authorityJustification) ??
    normalizeText((envelope as Record<string, unknown> | undefined)?.["authority_justification"]);
}

export function authorityJustificationField(
  authorityJustification: string | undefined
): { readonly authorityJustification?: string } {
  return authorityJustification === undefined ? {} : { authorityJustification };
}

export function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function hasText(value: unknown): value is string {
  return normalizeText(value) !== undefined;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isKnownGoalArchetype(value: unknown): value is GoalArchetype {
  return typeof value === "string" && SUPPORTED_GOAL_ARCHETYPES.includes(value as GoalArchetype);
}

export function isRepoAccess(value: unknown): value is CapabilityEnvelope["repoScopes"][number]["access"] {
  return value === "read" || value === "write" || value === "execute";
}

export function isRiskLevel(value: unknown): value is RiskLevel {
  return value === "low" || value === "medium" || value === "high";
}

export function uniqueOrdered<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}

export function uniqueBy<T>(values: readonly T[], keyFor: (value: T) => string): readonly T[] {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const value of values) {
    const key = keyFor(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(value);
  }

  return unique;
}

export function roundScore(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

export function formatAmbiguityScore(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : String(value);
}

export function stableHash(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return hash.toString(36).padStart(7, "0");
}
