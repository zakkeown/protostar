/**
 * Plan 06-06 Task 3 — `admitWorkSlicing` (Q-15 work-slicing re-admission).
 *
 * The execution-coordination pile MAY emit a `WorkSlicingProposal` BEFORE
 * execution begins, recommending finer task subdivision. This validator is
 * the PILE-03 re-admission seam: a sliced plan flows BACK through the
 * Phase 1 candidate-plan admission path so the same admission discipline
 * applies (intent match, capability admission, dependency-cycle detection,
 * acceptance-criterion coverage, etc.).
 *
 * Validation in this layer is structural — capability-envelope clamping
 * (T-6-19) and target-file subset enforcement (T-6-20) are surfaced here
 * as immediate rejections so the pile cannot widen the envelope by
 * smuggling a "split". Beyond those, we hand off to
 * `admitCandidatePlan` so all existing admission validators run.
 *
 * Pure: no I/O.
 */

import type { ConfirmedIntent } from "@protostar/intent";

import { admitCandidatePlan } from "./index.js";
import type {
  AdmittedPlanRecord,
  CandidatePlan,
  PlanGraph,
  PlanTask,
  PlanTaskId,
  PlanTaskRequiredCapabilities
} from "./index.js";

/**
 * A proposed slice replacing (part of) an existing admitted-plan task.
 *
 * `parentTaskId` MUST reference an existing admitted-plan task. Multiple
 * slices may share the same parent; collectively they replace the parent
 * in the reconstructed plan. Each slice inherits the parent's covers /
 * acceptanceTestRefs / kind / risk unless explicitly overridden by the
 * proposal — the proposal's authority is bounded to splitting work, not
 * reshaping the plan's coverage envelope.
 */
export interface TaskSlice {
  readonly id: PlanTaskId;
  readonly parentTaskId: PlanTaskId;
  readonly title: string;
  readonly targetFiles: readonly string[];
  /**
   * Optional additional dependencies BEYOND the chain implied by slice
   * order within the parent. Useful for cross-parent coordination but
   * the most common path is a simple intra-parent chain.
   */
  readonly extraDependsOn?: readonly PlanTaskId[];
  /**
   * Optional capability narrowing. If supplied MUST be a strict subset of
   * the parent task's capabilities (T-6-19 mitigation).
   */
  readonly requiredCapabilities?: PlanTaskRequiredCapabilities;
}

export interface WorkSlicingProposal {
  readonly slices: readonly TaskSlice[];
}

export interface AdmitWorkSlicingContext {
  readonly admittedPlan: Pick<AdmittedPlanRecord, "tasks" | "planId" | "intentId" | "createdAt" | "strategy" | "acceptanceCriteria">;
  readonly confirmedIntent: ConfirmedIntent;
  readonly allowedAdapters?: readonly string[];
}

export type AdmitWorkSlicingResult =
  | { readonly ok: true; readonly admittedPlan: AdmittedPlanRecord }
  | { readonly ok: false; readonly errors: readonly string[] };

export function admitWorkSlicing(
  proposal: WorkSlicingProposal,
  ctx: AdmitWorkSlicingContext
): AdmitWorkSlicingResult {
  const errors: string[] = [];

  const tasksById = new Map<PlanTaskId, PlanTask>();
  for (const task of ctx.admittedPlan.tasks) {
    tasksById.set(task.id, task);
  }

  // Group slices by parent and validate per-slice envelope invariants.
  const slicesByParent = new Map<PlanTaskId, TaskSlice[]>();
  for (const [index, slice] of proposal.slices.entries()) {
    const parent = tasksById.get(slice.parentTaskId);
    if (parent === undefined) {
      errors.push(
        `admit-work-slicing: slices[${index}] references unknown parentTaskId ${JSON.stringify(
          slice.parentTaskId
        )}`
      );
      continue;
    }

    const targetFilesError = validateTargetFilesSubset(slice, parent, index);
    if (targetFilesError !== undefined) {
      errors.push(targetFilesError);
    }

    const capabilityErrors = validateCapabilityEnvelope(slice, parent, index);
    errors.push(...capabilityErrors);

    const bucket = slicesByParent.get(slice.parentTaskId) ?? [];
    bucket.push(slice);
    slicesByParent.set(slice.parentTaskId, bucket);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Build the reconstructed task list: parents replaced by their slices,
  // dependencies pointing at a sliced parent re-pointed at the LAST slice
  // of that parent (so downstream consumers wait for the full split to
  // complete).
  const lastSliceForParent = new Map<PlanTaskId, PlanTaskId>();
  for (const [parentId, slices] of slicesByParent) {
    const last = slices[slices.length - 1];
    if (last !== undefined) {
      lastSliceForParent.set(parentId, last.id);
    }
  }

  const replacedTasks: PlanTask[] = [];
  for (const task of ctx.admittedPlan.tasks) {
    const slices = slicesByParent.get(task.id);
    if (slices === undefined) {
      replacedTasks.push(rewriteDependencies(task, lastSliceForParent));
      continue;
    }
    replacedTasks.push(...buildSliceTasks(task, slices, lastSliceForParent));
  }

  const candidate: CandidatePlan = {
    planId: `${ctx.admittedPlan.planId}-sliced`,
    intentId: ctx.admittedPlan.intentId,
    createdAt: ctx.admittedPlan.createdAt,
    strategy: `${ctx.admittedPlan.strategy} (work-sliced)`,
    acceptanceCriteria: ctx.admittedPlan.acceptanceCriteria,
    tasks: replacedTasks,
    __protostarPlanAdmissionState: "candidate-plan"
  };

  const admission = admitCandidatePlan({
    graph: candidate,
    intent: ctx.confirmedIntent,
    ...(ctx.allowedAdapters !== undefined ? { allowedAdapters: ctx.allowedAdapters } : {})
  });

  if (!admission.ok) {
    return {
      ok: false,
      errors: [
        "admit-work-slicing: reconstructed plan failed admission",
        ...admission.rejectionReasons.map(
          (reason) => `  - ${reason.code} @ ${reason.path}: ${reason.message}`
        )
      ]
    };
  }

  return { ok: true, admittedPlan: admission.admittedPlan };
}

function validateTargetFilesSubset(
  slice: TaskSlice,
  parent: PlanTask,
  index: number
): string | undefined {
  const parentTargetFiles = new Set(parent.targetFiles ?? []);
  if (parentTargetFiles.size === 0) {
    // Parent declared no targetFiles; any slice targetFiles count as expansion.
    if (slice.targetFiles.length > 0) {
      return `admit-work-slicing: slices[${index}] targetFiles expansion — parent declared no targetFiles`;
    }
    return undefined;
  }
  for (const file of slice.targetFiles) {
    if (!parentTargetFiles.has(file)) {
      return `admit-work-slicing: slices[${index}] targetFiles expansion — ${JSON.stringify(
        file
      )} not in parent ${JSON.stringify(parent.id)} targetFiles`;
    }
  }
  return undefined;
}

function validateCapabilityEnvelope(
  slice: TaskSlice,
  parent: PlanTask,
  index: number
): readonly string[] {
  const declared = slice.requiredCapabilities;
  if (declared === undefined) {
    return [];
  }

  const errors: string[] = [];
  const parentCaps = parent.requiredCapabilities;

  const allowedScopes = new Set(parentCaps.repoScopes.map((scope) => scope.path));
  for (const scope of declared.repoScopes) {
    if (!allowedScopes.has(scope.path)) {
      errors.push(
        `admit-work-slicing: slices[${index}] capability expansion — repoScope ${JSON.stringify(
          scope.path
        )} not on parent ${JSON.stringify(parent.id)}`
      );
    }
  }

  const allowedTools = new Set(parentCaps.toolPermissions.map((perm) => perm.tool));
  for (const perm of declared.toolPermissions) {
    if (!allowedTools.has(perm.tool)) {
      errors.push(
        `admit-work-slicing: slices[${index}] capability expansion — tool ${JSON.stringify(
          perm.tool
        )} not on parent ${JSON.stringify(parent.id)}`
      );
    }
  }

  return errors;
}

function buildSliceTasks(
  parent: PlanTask,
  slices: readonly TaskSlice[],
  lastSliceForParent: ReadonlyMap<PlanTaskId, PlanTaskId>
): PlanTask[] {
  const inheritedDeps = parent.dependsOn.map((dep) => lastSliceForParent.get(dep) ?? dep);
  const result: PlanTask[] = [];
  for (const [index, slice] of slices.entries()) {
    const previousSliceId = index === 0 ? undefined : slices[index - 1]?.id;
    const baseDeps = previousSliceId === undefined ? inheritedDeps : [previousSliceId];
    const extraDeps = slice.extraDependsOn?.map((dep) => lastSliceForParent.get(dep) ?? dep) ?? [];
    const dependsOn = [...baseDeps, ...extraDeps];

    const isLast = index === slices.length - 1;
    result.push({
      id: slice.id,
      title: slice.title,
      kind: parent.kind,
      dependsOn,
      // Every slice carries the parent's coverage — each plan task must
      // cover at least one acceptance criterion under existing admission
      // rules. AC coverage is a set property (not multiplicity), so
      // duplication across slices is admissible.
      covers: parent.covers,
      targetFiles: slice.targetFiles,
      ...(isLast && parent.acceptanceTestRefs !== undefined
        ? { acceptanceTestRefs: parent.acceptanceTestRefs }
        : {}),
      ...(parent.adapterRef !== undefined ? { adapterRef: parent.adapterRef } : {}),
      requiredCapabilities: slice.requiredCapabilities ?? parent.requiredCapabilities,
      risk: parent.risk
    });
  }
  return result;
}

function rewriteDependencies(
  task: PlanTask,
  lastSliceForParent: ReadonlyMap<PlanTaskId, PlanTaskId>
): PlanTask {
  if (task.dependsOn.length === 0) return task;
  let changed = false;
  const dependsOn = task.dependsOn.map((dep) => {
    const replacement = lastSliceForParent.get(dep);
    if (replacement !== undefined && replacement !== dep) {
      changed = true;
      return replacement;
    }
    return dep;
  });
  if (!changed) return task;
  return { ...task, dependsOn };
}

// Kept for downstream compatibility — re-export PlanGraph for type narrowing.
export type { PlanGraph };
