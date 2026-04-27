/**
 * @protostar/dogpile-types
 *
 * In-tree minimal vendored surface of `@dogpile/sdk` consumed by
 * `@protostar/dogpile-adapter` during Phase 1. Phase 6 will replace this
 * shim with a real `@dogpile/sdk` integration (published or fully vendored).
 *
 * **Authority boundary (locked):** this module performs ZERO I/O.
 *   - no filesystem, child process, or environment access
 *   - no network, no clock-dependent randomness
 *   - all runtime helpers are pure functions returning frozen objects
 *
 * **Pre-execution surface audit (2026-04-26)** — symbols imported by
 * `packages/dogpile-adapter/src/index.ts`:
 *   - type AgentSpec       (from `@dogpile/sdk`)
 *   - type DogpileOptions  (from `@dogpile/sdk`)
 *   - function budget       (from `@dogpile/sdk`)
 *   - function convergence  (from `@dogpile/sdk`)
 *   - function firstOf      (from `@dogpile/sdk`)
 *
 * Five symbols total (well under the 10-symbol scope gate). All shapes
 * are derived from the linked sibling SDK 0.2.0 (dist/types.d.ts +
 * dist/runtime/termination.d.ts) but reduced to the indexed-access
 * properties the adapter actually consumes
 * (`protocol`, `tier`, `budget`, `terminate`).
 */

/**
 * Agent participating in a coordinated workflow.
 *
 * Mirrors `@dogpile/sdk` `AgentSpec` to the fields the adapter writes today.
 */
export interface AgentSpec {
  /** Stable id written into events, traces, and transcripts. */
  readonly id: string;
  /** Model-visible role or perspective for this agent. */
  readonly role: string;
  /** Optional per-agent instruction appended to the protocol prompt. */
  readonly instructions?: string;
}

/** Named budget/cost tier accepted by `DogpileOptions["tier"]`. */
export type BudgetTier = "fast" | "balanced" | "quality";

/** JSON-compatible scalar — kept opaque since the adapter never inspects it. */
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | { readonly [key: string]: JsonValue } | readonly JsonValue[];

/**
 * Hard budget caps layered over a selected cost/quality tier.
 *
 * Modeled to match the indexed access `DogpileOptions["budget"]` performed
 * by `dogpile-adapter` (`maxTokens`, `timeoutMs`).
 */
export interface BudgetCaps {
  readonly maxTokens?: number;
  readonly maxCostUsd?: number;
  readonly maxIterations?: number;
  readonly timeoutMs?: number;
}

/** Broadcast protocol config (one of the protocols used by the adapter). */
export interface BroadcastProtocolConfig {
  readonly kind: "broadcast";
  readonly maxRounds?: number;
}

/** Coordinator protocol config (used by the execution-coordinator preset). */
export interface CoordinatorProtocolConfig {
  readonly kind: "coordinator";
  readonly maxTurns?: number;
}

/** Sequential protocol config — included for forward-compat with adapter callers. */
export interface SequentialProtocolConfig {
  readonly kind: "sequential";
  readonly maxTurns?: number;
}

/** Shared protocol config — included for forward-compat. */
export interface SharedProtocolConfig {
  readonly kind: "shared";
  readonly maxTurns?: number;
}

/** Discriminated union of protocol configs assignable to `DogpileOptions["protocol"]`. */
export type ProtocolConfig =
  | BroadcastProtocolConfig
  | CoordinatorProtocolConfig
  | SequentialProtocolConfig
  | SharedProtocolConfig;

/** Named protocol shorthand. */
export type ProtocolName = "broadcast" | "coordinator" | "sequential" | "shared";

/** Either a named protocol or an explicit config. */
export type ProtocolSelection = ProtocolName | ProtocolConfig;

/* ------------------------------------------------------------------ *
 * Termination conditions
 * ------------------------------------------------------------------ */

/**
 * Budget termination condition produced by {@link budget}.
 *
 * Kept opaque except for the `kind` discriminator and the input fields the
 * adapter passes through (`maxTokens`, `timeoutMs`). Phase 6 will replace
 * the runtime evaluator.
 */
export interface BudgetTerminationCondition {
  readonly kind: "budget";
  readonly maxTokens?: number;
  readonly maxCostUsd?: number;
  readonly maxIterations?: number;
  readonly timeoutMs?: number;
}

/**
 * Convergence termination condition produced by {@link convergence}.
 */
export interface ConvergenceTerminationCondition {
  readonly kind: "convergence";
  readonly stableTurns: number;
  readonly minSimilarity: number;
}

/**
 * `firstOf` composite termination condition produced by {@link firstOf}.
 *
 * SDK enforces "at least one" via a non-empty tuple; we match that.
 */
export type FirstOfTerminationConditions = readonly [
  TerminationCondition,
  ...TerminationCondition[]
];

export interface FirstOfTerminationCondition {
  readonly kind: "firstOf";
  readonly conditions: FirstOfTerminationConditions;
}

/** Composable termination condition union. */
export type TerminationCondition =
  | BudgetTerminationCondition
  | ConvergenceTerminationCondition
  | FirstOfTerminationCondition;

/* ------------------------------------------------------------------ *
 * Pure runtime helpers (no I/O)
 * ------------------------------------------------------------------ */

/**
 * Create a budget termination condition.
 *
 * Returns a frozen object so downstream callers cannot mutate the shape
 * after construction. JSON-serializable.
 */
export function budget(
  options: Omit<BudgetTerminationCondition, "kind">
): BudgetTerminationCondition {
  return Object.freeze({ kind: "budget", ...options });
}

/**
 * Create a convergence termination condition.
 *
 * Returns a frozen object. JSON-serializable.
 */
export function convergence(
  options: Omit<ConvergenceTerminationCondition, "kind">
): ConvergenceTerminationCondition {
  return Object.freeze({ kind: "convergence", ...options });
}

/**
 * Compose termination conditions so whichever child fires first wins.
 *
 * SDK requires at least one condition (non-empty tuple). The composite
 * is frozen and the conditions tuple is also frozen so the resulting
 * value is fully immutable.
 */
export function firstOf(
  ...conditions: FirstOfTerminationConditions
): FirstOfTerminationCondition {
  return Object.freeze({
    kind: "firstOf",
    conditions: Object.freeze([...conditions]) as unknown as FirstOfTerminationConditions
  });
}

/* ------------------------------------------------------------------ *
 * DogpileOptions — only the slice used by `dogpile-adapter`
 * ------------------------------------------------------------------ */

/**
 * Options accepted by the high-level Dogpile workflow APIs.
 *
 * **Reduced shim:** Phase 1's adapter only references the indexed accesses
 * `DogpileOptions["protocol" | "tier" | "budget" | "terminate"]`, plus
 * `agents: readonly AgentSpec[]`. Other SDK fields (`intent`, `model`,
 * `tools`, `evaluate`, `seed`, `signal`) are intentionally omitted because
 * Phase 1 never invokes a real pile. Phase 6 owns the full shape.
 */
export interface DogpileOptions {
  readonly tier?: BudgetTier;
  readonly budget?: BudgetCaps;
  readonly protocol?: ProtocolSelection;
  readonly agents?: readonly AgentSpec[];
  readonly terminate?: TerminationCondition;
  /**
   * Forward-compat escape hatch for caller-attached metadata. Kept here so
   * adapter `intent` strings and similar can still satisfy the type if a
   * future caller chooses to nest them. Marked optional and JSON-typed so
   * Authority boundary is preserved (no functions, no closures).
   */
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}
