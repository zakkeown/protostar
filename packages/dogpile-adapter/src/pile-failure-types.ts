/**
 * @protostar/dogpile-adapter — pile failure taxonomy + resolved budget types
 *
 * Per Phase 6 D-13 (Q-13): six-variant `PileFailure` discriminated union with
 * `class` discriminator. Each variant carries its own evidence shape — fields
 * are NOT collapsed across variants.
 *
 * Per Phase 6 D-10 (Q-10): `ResolvedPileBudget` is the per-field-min intersect of
 * a developer-proposed `PresetBudget` and an operator-authoritative
 * `EnvelopeBudget` (envelope is a CAP, not a FLOOR).
 *
 * Pure type definitions — no runtime, no I/O.
 */

export type PileKind = "planning" | "review" | "execution-coordination";

export type PileSourceOfTruth =
  | "PlanningPileResult"
  | "ReviewPileResult"
  | "ExecutionCoordinationPileResult";

export interface JudgeDecisionRef {
  readonly judgeId: string;
  readonly decision: "accepted" | "rejected";
  readonly reason?: string;
}

export type PileFailure =
  | {
      readonly kind: PileKind;
      readonly class: "pile-timeout";
      readonly elapsedMs: number;
      readonly configuredTimeoutMs: number;
    }
  | {
      readonly kind: PileKind;
      readonly class: "pile-budget-exhausted";
      readonly dimension: "tokens" | "calls";
      readonly consumed: number;
      readonly cap: number;
    }
  | {
      readonly kind: PileKind;
      readonly class: "pile-schema-parse";
      readonly sourceOfTruth: PileSourceOfTruth;
      readonly parseErrors: readonly string[];
    }
  | {
      readonly kind: PileKind;
      readonly class: "pile-all-rejected";
      readonly candidatesEvaluated: number;
      readonly judgeDecisions: readonly JudgeDecisionRef[];
    }
  | {
      readonly kind: PileKind;
      readonly class: "pile-network";
      readonly attempt: number;
      readonly lastError: { readonly code: string; readonly message: string };
    }
  | {
      readonly kind: PileKind;
      readonly class: "pile-cancelled";
      readonly reason: "sigint" | "parent-abort" | "sentinel";
    };

export interface PresetBudget {
  readonly maxTokens?: number;
  readonly timeoutMs?: number;
  readonly maxCalls?: number;
}

export interface EnvelopeBudget {
  readonly maxTokens?: number;
  readonly timeoutMs?: number;
  readonly maxCalls?: number;
}

export interface ResolvedPileBudget {
  readonly maxTokens: number;
  readonly timeoutMs: number;
  readonly maxCalls?: number;
}
