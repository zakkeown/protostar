/**
 * Phase 6 Plan 06-10 Task 2 — execution-coordination pile trigger module
 * (PILE-03 runtime wiring).
 *
 * Pure helpers (no fs) wrapping `runFactoryPile` + the exec-coord admission
 * seams (`admitWorkSlicing`, `admitRepairPlanProposal`,
 * `parseExecutionCoordinationPileResult`). Two trigger sites in factory-cli
 * main.ts call into this module:
 *
 *   1. After planning admission, when the work-slicing heuristic trips.
 *   2. From inside `runReviewRepairLoop` via the optional `repairPlanRefiner`
 *      hook (Plan 06-10 Task 1).
 *
 * Both triggers share `executionCoordinationPilePreset.budget` and emit one
 * mission per call. Persistence is delegated through `deps.persist` so this
 * module remains fs-free (factory-cli owns the writePileArtifacts boundary).
 *
 * Q-06 / Q-15 disposition (per `<scope_clarifications>` in the plan):
 *   - Work-slicing seam: any pile failure or admission rejection → hard fail
 *     (no deterministic alternative exists). Caller throws.
 *   - Repair-plan seam: pile failure (network/timeout/parse) → soft fallback
 *     to deterministic plan + refusal artifact + non-fatal lifecycle event.
 *     Admission rejection without authority expansion → soft fallback to
 *     deterministic plan, no refusal artifact (rejection is not a failure).
 *     Admission rejection due to AUTHORITY EXPANSION (T-6-19) → hard block:
 *     refusal artifact persisted, RefiningRefusedAuthorityExpansion thrown.
 */

import type { ConfirmedIntent } from "@protostar/intent";
import {
  admitWorkSlicing,
  type AdmittedPlanRecord,
  type PlanTask,
  type PlanTaskId,
  type WorkSlicingProposal,
  type TaskSlice
} from "@protostar/planning";
import {
  admitRepairPlanProposal,
  computeRepairSubgraph,
  parseExecutionCoordinationPileResult,
  type RepairPlanProposal,
  type ExecutionCoordinationProposal
} from "@protostar/repair";
import {
  buildExecutionCoordinationMission,
  type FactoryPileMission,
  type PileRunContext,
  type PileRunOutcome,
  runFactoryPile as defaultRunFactoryPile
} from "@protostar/dogpile-adapter";
import type {
  PlanningAdmissionAcceptedArtifactPayload,
  AdmittedPlanExecutionArtifact
} from "@protostar/planning";
import type { RepairPlan } from "@protostar/review";

// ---------- Heuristic ----------

export interface WorkSlicingHeuristicConfig {
  readonly maxTargetFiles: number;
  /**
   * Reserved for Phase 8 — `estimatedTurns` is not present on the current
   * task shape. Kept in config for forward-compatibility per Q-15 / RESEARCH §59.
   */
  readonly maxEstimatedTurns: number;
}

export const DEFAULT_WORK_SLICING_HEURISTIC: WorkSlicingHeuristicConfig = {
  maxTargetFiles: 3,
  maxEstimatedTurns: 5
};

/**
 * Returns true if any task's `targetFiles.length` exceeds
 * `config.maxTargetFiles`. Per-task (not aggregate) — the heuristic asks
 * "is any single task too coarse to benefit from slicing?".
 */
export function shouldInvokeWorkSlicing(
  admittedPlan: Pick<AdmittedPlanRecord, "tasks">,
  config: WorkSlicingHeuristicConfig
): boolean {
  for (const task of admittedPlan.tasks) {
    const fileCount = task.targetFiles?.length ?? 0;
    if (fileCount > config.maxTargetFiles) {
      return true;
    }
  }
  return false;
}

// ---------- Errors ----------

export class RefiningRefusedAuthorityExpansion extends Error {
  readonly errors: readonly string[];
  constructor(errors: readonly string[]) {
    super(
      `repair-plan refinement rejected: authority expansion (${errors.join("; ")})`
    );
    this.name = "RefiningRefusedAuthorityExpansion";
    this.errors = errors;
  }
}

// Heuristic for distinguishing "authority-expansion" rejections (T-6-19) from
// no-op / redundant rejections. `admitRepairPlanProposal` returns errors as
// strings; capability-expansion errors all contain the substring
// "capability expansion" (see admit-repair-plan-proposal.ts:111,124).
function isAuthorityExpansionRejection(errors: readonly string[]): boolean {
  return errors.some((err) => err.includes("capability expansion"));
}

// ---------- Persistence ----------

export interface InvokeExecCoordPersistInput {
  readonly outcome: PileRunOutcome;
  readonly iteration: number;
  readonly refusal?: { readonly reason: string };
}

export interface InvokeExecCoordPileDeps {
  readonly runFactoryPile: typeof defaultRunFactoryPile;
  readonly buildContext: () => PileRunContext;
  readonly persist: (input: InvokeExecCoordPersistInput) => Promise<void>;
}

// ---------- Work-slicing trigger ----------

export interface InvokeWorkSlicingResult {
  readonly ok: true;
  readonly admittedPlan: AdmittedPlanRecord;
}

export interface InvokeWorkSlicingFailure {
  readonly ok: false;
  readonly reason: string;
}

export async function invokeWorkSlicingPile(
  intent: ConfirmedIntent,
  admittedPlan: AdmittedPlanRecord,
  planningAdmission: PlanningAdmissionAcceptedArtifactPayload,
  iteration: number,
  deps: InvokeExecCoordPileDeps
): Promise<InvokeWorkSlicingResult | InvokeWorkSlicingFailure> {
  const mission: FactoryPileMission = buildExecutionCoordinationMission(
    intent,
    "work-slicing",
    { kind: "work-slicing", admittedPlan: planningAdmission }
  );
  const ctx = deps.buildContext();
  const outcome = await deps.runFactoryPile(mission, ctx);

  if (!outcome.ok) {
    const reason = formatPileFailureReason(outcome);
    await deps.persist({ outcome, iteration, refusal: { reason } });
    return { ok: false, reason: outcome.failure.class };
  }

  const parsed = parseExecutionCoordinationPileResult({
    output: outcome.result.output ?? ""
  });
  if (!parsed.ok) {
    const reason = `parse-error: ${parsed.errors.join("; ")}`;
    await deps.persist({ outcome, iteration, refusal: { reason } });
    return { ok: false, reason: "parse-error" };
  }
  if (parsed.proposal.kind !== "work-slicing") {
    const reason = `wrong-kind: expected work-slicing, got ${parsed.proposal.kind}`;
    await deps.persist({ outcome, iteration, refusal: { reason } });
    return { ok: false, reason: "wrong-kind" };
  }

  const proposal = liftWorkSlicingProposal(parsed.proposal.slices, admittedPlan);
  if (!proposal.ok) {
    const reason = `proposal-build-error: ${proposal.errors.join("; ")}`;
    await deps.persist({ outcome, iteration, refusal: { reason } });
    return { ok: false, reason: "proposal-build-error" };
  }

  const admission = admitWorkSlicing(proposal.proposal, {
    admittedPlan,
    confirmedIntent: intent
  });
  if (!admission.ok) {
    const reason = `admission-rejected: ${admission.errors.join("; ")}`;
    await deps.persist({ outcome, iteration, refusal: { reason } });
    return { ok: false, reason: "admission-rejected" };
  }

  await deps.persist({ outcome, iteration });
  return { ok: true, admittedPlan: admission.admittedPlan };
}

// Adapt the parser's `ProposedTaskSlice {taskId, parentTaskId?, targetFiles}`
// into admit-work-slicing's `TaskSlice {id, parentTaskId, title, targetFiles}`.
// `parentTaskId` is required by admission; the pile MUST set it. `title` is
// synthesized from the parent task title so admission has something
// non-empty to work with.
function liftWorkSlicingProposal(
  slices: ReadonlyArray<{
    readonly taskId: string;
    readonly parentTaskId?: string;
    readonly targetFiles: readonly string[];
  }>,
  admittedPlan: Pick<AdmittedPlanRecord, "tasks">
):
  | { readonly ok: true; readonly proposal: WorkSlicingProposal }
  | { readonly ok: false; readonly errors: readonly string[] } {
  const tasksById = new Map<PlanTaskId, PlanTask>();
  for (const task of admittedPlan.tasks) tasksById.set(task.id, task);

  const errors: string[] = [];
  const lifted: TaskSlice[] = [];
  let sliceIndex = 0;
  for (const slice of slices) {
    const parentId = slice.parentTaskId;
    if (parentId === undefined) {
      errors.push(
        `slice ${slice.taskId} missing parentTaskId (required by admit-work-slicing)`
      );
      sliceIndex += 1;
      continue;
    }
    const parent = tasksById.get(parentId as PlanTaskId);
    if (parent === undefined) {
      errors.push(
        `slice ${slice.taskId} references unknown parentTaskId ${parentId}`
      );
      sliceIndex += 1;
      continue;
    }
    lifted.push({
      id: slice.taskId as PlanTaskId,
      parentTaskId: parentId as PlanTaskId,
      title: `${parent.title} (slice ${sliceIndex + 1})`,
      targetFiles: slice.targetFiles
    });
    sliceIndex += 1;
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, proposal: { slices: lifted } };
}

// ---------- Repair-plan refinement trigger ----------

/**
 * Invoke the execution-coordination pile in repair-plan-generation mode.
 *
 * Per Q-15 (and the plan's `<scope_clarifications>`):
 *   - Pile failure (ok=false / parse error / wrong-kind) → SOFT fallback.
 *     Returns the deterministic plan; a refusal artifact is persisted so the
 *     substitution is operator-visible.
 *   - Admission accepted → returns the refined plan (deterministic plan with
 *     `repairs` rewritten to one repair per accepted failingTaskId, retaining
 *     mechanicalCritiques/modelCritiques from the deterministic plan when
 *     the failing task ids match). `dependentTaskIds` is recomputed via
 *     `computeRepairSubgraph`.
 *   - Admission rejected for non-authority-expansion reasons → soft fallback
 *     (no refusal artifact — rejection is not a pile failure).
 *   - Admission rejected with AUTHORITY EXPANSION → throws
 *     `RefiningRefusedAuthorityExpansion` AFTER persisting a refusal
 *     artifact. Caller surfaces as block.
 */
export async function invokeRepairPlanRefinementPile(
  intent: ConfirmedIntent,
  admittedPlan: AdmittedPlanExecutionArtifact,
  admittedPlanRecord: AdmittedPlanRecord,
  deterministicRepairPlan: RepairPlan,
  attempt: number,
  deps: InvokeExecCoordPileDeps
): Promise<RepairPlan> {
  const failingTaskIds = deterministicRepairPlan.repairs.map((r) => r.planTaskId);
  const mission: FactoryPileMission = buildExecutionCoordinationMission(
    intent,
    "repair-plan-generation",
    { kind: "repair-plan-generation", failingTaskIds }
  );
  const ctx = deps.buildContext();
  const outcome = await deps.runFactoryPile(mission, ctx);

  if (!outcome.ok) {
    const reason = formatPileFailureReason(outcome);
    await deps.persist({ outcome, iteration: attempt, refusal: { reason } });
    return deterministicRepairPlan;
  }

  const parsed = parseExecutionCoordinationPileResult({
    output: outcome.result.output ?? ""
  });
  if (!parsed.ok) {
    const reason = `parse-error: ${parsed.errors.join("; ")}`;
    await deps.persist({ outcome, iteration: attempt, refusal: { reason } });
    return deterministicRepairPlan;
  }
  if (parsed.proposal.kind !== "repair-plan") {
    const reason = `wrong-kind: expected repair-plan, got ${parsed.proposal.kind}`;
    await deps.persist({ outcome, iteration: attempt, refusal: { reason } });
    return deterministicRepairPlan;
  }

  const proposal = parsed.proposal.repairPlan;
  const admission = admitRepairPlanProposal(proposal, {
    admittedPlan: admittedPlanRecord,
    failingTaskIds
  });
  if (!admission.ok) {
    if (isAuthorityExpansionRejection(admission.errors)) {
      const reason = `admission-rejected-authority-expansion: ${admission.errors.join("; ")}`;
      await deps.persist({ outcome, iteration: attempt, refusal: { reason } });
      throw new RefiningRefusedAuthorityExpansion(admission.errors);
    }
    // Non-authority-expansion rejection — admission says the proposal is a
    // no-op or redundant. Soft fallback to deterministic plan; admission
    // rejection is not a pile failure so no refusal artifact (Q-15 nuance).
    await deps.persist({ outcome, iteration: attempt });
    return deterministicRepairPlan;
  }

  // Persist the successful pile outcome (no refusal).
  await deps.persist({ outcome, iteration: attempt });

  return liftAdmittedRepairPlanToReviewPlan({
    deterministic: deterministicRepairPlan,
    admittedFailingTaskIds: admission.repairPlan.failingTaskIds,
    admittedPlanArtifact: admittedPlan
  });
}

function liftAdmittedRepairPlanToReviewPlan(input: {
  readonly deterministic: RepairPlan;
  readonly admittedFailingTaskIds: readonly string[];
  readonly admittedPlanArtifact: AdmittedPlanExecutionArtifact;
}): RepairPlan {
  const deterministicByTaskId = new Map(
    input.deterministic.repairs.map((r) => [r.planTaskId, r])
  );
  const repairs = input.admittedFailingTaskIds.map((taskId) => {
    const inherited = deterministicByTaskId.get(taskId);
    if (inherited !== undefined) return inherited;
    return {
      planTaskId: taskId,
      mechanicalCritiques: [],
      modelCritiques: []
    };
  });
  // Recompute dependentTaskIds from the new repair seeds. Pass the
  // AdmittedPlanExecutionArtifact through directly — computeRepairSubgraph
  // only reads `tasks[].{planTaskId,dependsOn}`.
  const dependentTaskIds = computeRepairSubgraph({
    plan: input.admittedPlanArtifact,
    repairTaskIds: input.admittedFailingTaskIds
  });
  return {
    runId: input.deterministic.runId,
    attempt: input.deterministic.attempt,
    repairs,
    dependentTaskIds
  };
}

function formatPileFailureReason(outcome: PileRunOutcome): string {
  if (outcome.ok) return "";
  const failure = outcome.failure;
  switch (failure.class) {
    case "pile-timeout":
      return `pile-timeout: ${failure.kind} elapsed ${failure.elapsedMs}ms`;
    case "pile-budget-exhausted":
      return `pile-budget-exhausted: ${failure.kind} consumed ${failure.consumed}/${failure.cap} ${failure.dimension}`;
    case "pile-schema-parse":
      return `pile-schema-parse: ${failure.parseErrors.join("; ")}`;
    case "pile-all-rejected":
      return `pile-all-rejected: ${failure.kind} evaluated ${failure.candidatesEvaluated} candidates`;
    case "pile-network":
      return `pile-network: ${failure.lastError.code} ${failure.lastError.message}`;
    case "pile-cancelled":
      return `pile-cancelled: ${failure.kind} (${failure.reason})`;
    case "eval-consensus-block":
      return `eval-consensus-block: ${failure.thresholdsHit.join(", ")}`;
  }
}
