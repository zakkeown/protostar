/**
 * Plan 06-06 Task 1 — `ExecutionCoordinationPileResult` wire format and
 * `parseExecutionCoordinationPileResult` parser (Q-18).
 *
 * The execution-coordination pile (Q-15) is invoked at TWO trigger points
 * (work-slicing + repair-plan generation) but emits ONE wire format: an
 * envelope `{ output, source? }` mirroring `PlanningPileResult` whose
 * `output` field is a JSON-stringified discriminated union — the
 * `ExecutionCoordinationProposal`. The parser is the single ingress point
 * where pile output enters Protostar's admission pipeline (T-6-22).
 *
 * Per D-18 (Q-18): wire-format symmetry with `PlanningPileResult`. Co-located
 * in `@protostar/repair` (Claude's discretion) to avoid spinning up a new
 * package mid-phase. The owning admission validators (`admitRepairPlanProposal`
 * here, `admitWorkSlicing` in `@protostar/planning`) consume this parser's
 * output.
 *
 * Pure: no I/O, no clock reads.
 */

/**
 * `PileSource` mirrors the `source` field of `PlanningPileResult`. The exec-
 * coord pile carries the same provenance discriminator (live SDK invocation
 * vs. fixture passthrough) so refusal artifacts can attribute parse failures
 * to the correct mode.
 *
 * Aliased here rather than imported so this module compiles without depending
 * on Plan 06-05's `@protostar/review` additions, which land in parallel on a
 * disjoint file set. Phase 7 may dedupe once both plans are merged.
 */
export type PileSource = "fixture" | "dogpile";

/**
 * A single sliced task proposed by the work-slicing trigger. Structural shape
 * only — `admitWorkSlicing` (in `@protostar/planning`) is the authority that
 * binds the slice to an `AdmittedPlan` task and validates capability/target-
 * file envelope invariants.
 */
export interface ProposedTaskSlice {
  readonly taskId: string;
  readonly parentTaskId?: string;
  readonly targetFiles: readonly string[];
}

/**
 * A correction proposed by the repair-plan trigger. Each correction targets
 * an existing task in the admitted plan; it MAY declare additional required
 * capabilities, but `admitRepairPlanProposal` rejects any envelope expansion
 * (T-6-19).
 */
export interface RepairPlanCorrection {
  readonly targetTaskId: string;
  readonly summary: string;
  readonly requiredCapabilities?: {
    readonly repoScopes?: readonly string[];
    readonly toolPermissions?: readonly { readonly tool: string }[];
  };
}

/**
 * The pile-supplied repair-plan proposal. The deterministic
 * `synthesizeRepairPlan` in Phase 5 produces a `SynthesizedRepairPlan`; this
 * is the *pile's* counter-proposal. Admission decides whether it stands.
 */
export interface RepairPlanProposal {
  readonly failingTaskIds: readonly string[];
  readonly corrections: readonly RepairPlanCorrection[];
}

export type ExecutionCoordinationProposal =
  | { readonly kind: "work-slicing"; readonly slices: readonly ProposedTaskSlice[] }
  | { readonly kind: "repair-plan"; readonly repairPlan: RepairPlanProposal };

export interface ExecutionCoordinationPileResult {
  readonly output: string;
  readonly source?: PileSource;
}

export type ExecutionCoordinationPileParseResult =
  | { readonly ok: true; readonly proposal: ExecutionCoordinationProposal }
  | { readonly ok: false; readonly errors: readonly string[] };

/**
 * Parses the JSON-stringified `output` of an `ExecutionCoordinationPileResult`
 * into a typed `ExecutionCoordinationProposal`, or returns structured errors.
 *
 * Validation is intentionally minimal — structural-only. Authority decisions
 * (capability-envelope clamping, target-file subset enforcement, task-id
 * existence) live in the per-variant admission validators downstream.
 *
 * T-6-22 mitigation: malformed JSON or unknown `kind` produces `ok: false`,
 * never throws.
 */
export function parseExecutionCoordinationPileResult(
  input: ExecutionCoordinationPileResult
): ExecutionCoordinationPileParseResult {
  let body: unknown;
  try {
    body = JSON.parse(input.output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, errors: [`exec-coord-parser: output is not valid JSON (${message})`] };
  }

  if (body === null || typeof body !== "object") {
    return { ok: false, errors: ["exec-coord-parser: output must be a JSON object"] };
  }

  const record = body as { readonly kind?: unknown };
  const kind = record.kind;

  if (kind === "work-slicing") {
    return parseWorkSlicing(body);
  }
  if (kind === "repair-plan") {
    return parseRepairPlan(body);
  }
  return {
    ok: false,
    errors: [`exec-coord-parser: unknown kind ${JSON.stringify(kind)}`]
  };
}

function parseWorkSlicing(body: object): ExecutionCoordinationPileParseResult {
  const record = body as { readonly slices?: unknown };
  const rawSlices = record.slices;
  if (!Array.isArray(rawSlices)) {
    return { ok: false, errors: ["exec-coord-parser: work-slicing requires `slices` array"] };
  }

  const errors: string[] = [];
  const slices: ProposedTaskSlice[] = [];
  for (const [index, raw] of rawSlices.entries()) {
    if (raw === null || typeof raw !== "object") {
      errors.push(`exec-coord-parser: slices[${index}] must be an object`);
      continue;
    }
    const slice = raw as {
      readonly taskId?: unknown;
      readonly parentTaskId?: unknown;
      readonly targetFiles?: unknown;
    };
    if (typeof slice.taskId !== "string" || slice.taskId.length === 0) {
      errors.push(`exec-coord-parser: slices[${index}].taskId must be a non-empty string`);
      continue;
    }
    if (!Array.isArray(slice.targetFiles) || slice.targetFiles.some((f) => typeof f !== "string")) {
      errors.push(`exec-coord-parser: slices[${index}].targetFiles must be string[]`);
      continue;
    }
    slices.push({
      taskId: slice.taskId,
      ...(typeof slice.parentTaskId === "string" ? { parentTaskId: slice.parentTaskId } : {}),
      targetFiles: slice.targetFiles as readonly string[]
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, proposal: { kind: "work-slicing", slices } };
}

function parseRepairPlan(body: object): ExecutionCoordinationPileParseResult {
  const record = body as { readonly repairPlan?: unknown };
  const raw = record.repairPlan;
  if (raw === null || typeof raw !== "object") {
    return { ok: false, errors: ["exec-coord-parser: repair-plan requires `repairPlan` object"] };
  }
  const repairPlan = raw as { readonly failingTaskIds?: unknown; readonly corrections?: unknown };

  const errors: string[] = [];
  if (
    !Array.isArray(repairPlan.failingTaskIds) ||
    repairPlan.failingTaskIds.some((id) => typeof id !== "string")
  ) {
    errors.push("exec-coord-parser: repairPlan.failingTaskIds must be string[]");
  }
  if (!Array.isArray(repairPlan.corrections)) {
    errors.push("exec-coord-parser: repairPlan.corrections must be an array");
  } else {
    for (const [index, correction] of repairPlan.corrections.entries()) {
      if (correction === null || typeof correction !== "object") {
        errors.push(`exec-coord-parser: repairPlan.corrections[${index}] must be an object`);
        continue;
      }
      const c = correction as { readonly targetTaskId?: unknown; readonly summary?: unknown };
      if (typeof c.targetTaskId !== "string" || c.targetTaskId.length === 0) {
        errors.push(
          `exec-coord-parser: repairPlan.corrections[${index}].targetTaskId must be a non-empty string`
        );
      }
      if (typeof c.summary !== "string") {
        errors.push(`exec-coord-parser: repairPlan.corrections[${index}].summary must be a string`);
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    proposal: {
      kind: "repair-plan",
      repairPlan: {
        failingTaskIds: repairPlan.failingTaskIds as readonly string[],
        corrections: repairPlan.corrections as readonly RepairPlanCorrection[]
      }
    }
  };
}
