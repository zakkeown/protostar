export type Outcome =
  | "accepted"
  | "ambiguous"
  | "bad-plan"
  | "failed-execution"
  | "repaired-execution"
  | "blocked-review"
  | "pr-ready";

export type MatrixTrigger = "synthetic-intent" | "envelope-tweak" | "real-seed";

export interface MatrixRow {
  readonly outcome: Outcome;
  readonly archetype: "cosmetic-tweak";
  readonly triggeredBy: MatrixTrigger;
  readonly expected: {
    readonly manifestStatus: string;
    readonly reviewVerdict?: string;
    readonly hasPrUrl?: boolean;
    readonly refusalKind?: string;
    readonly repairIterations?: number;
  };
}

const outcomes = Object.freeze([
  "accepted",
  "ambiguous",
  "bad-plan",
  "failed-execution",
  "repaired-execution",
  "blocked-review",
  "pr-ready"
] as const);

const matrixRows = Object.freeze({
  accepted: row("accepted", "real-seed", {
    manifestStatus: "ready-to-release",
    reviewVerdict: "pass",
    hasPrUrl: false
  }),
  ambiguous: row("ambiguous", "synthetic-intent", {
    manifestStatus: "blocked",
    refusalKind: "intent-ambiguous"
  }),
  "bad-plan": row("bad-plan", "synthetic-intent", {
    manifestStatus: "blocked",
    refusalKind: "planning-refusal"
  }),
  "failed-execution": row("failed-execution", "envelope-tweak", {
    manifestStatus: "blocked",
    reviewVerdict: "block"
  }),
  "repaired-execution": row("repaired-execution", "envelope-tweak", {
    manifestStatus: "ready-to-release",
    reviewVerdict: "pass",
    repairIterations: 1
  }),
  "blocked-review": row("blocked-review", "synthetic-intent", {
    manifestStatus: "blocked",
    reviewVerdict: "block"
  }),
  "pr-ready": row("pr-ready", "real-seed", {
    manifestStatus: "ready-to-release",
    reviewVerdict: "pass",
    hasPrUrl: true
  })
} satisfies Record<Outcome, MatrixRow>);

export function listOutcomes(): readonly Outcome[] {
  return outcomes;
}

export function getMatrixRow(outcome: string): MatrixRow {
  if (!isOutcome(outcome)) {
    throw new TypeError(`unknown outcome: ${outcome}`);
  }
  return matrixRows[outcome];
}

function isOutcome(value: string): value is Outcome {
  return outcomes.includes(value as Outcome);
}

function row(
  outcome: Outcome,
  triggeredBy: MatrixTrigger,
  expected: MatrixRow["expected"]
): MatrixRow {
  return Object.freeze({
    outcome,
    archetype: "cosmetic-tweak",
    triggeredBy,
    expected: Object.freeze({ ...expected })
  });
}
