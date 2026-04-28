/**
 * Plan 06-06 Task 2 — `admitRepairPlanProposal` (Q-15 repair-plan trigger).
 *
 * The execution-coordination pile MAY emit a `RepairPlanProposal` after the
 * deterministic `synthesizeRepairPlan` has produced a baseline. This validator
 * decides whether the pile's proposal stands. If admission rejects, callers
 * fall back to the deterministic RepairPlan (per D-15 / Q-15).
 *
 * Validation is structural and deterministic — NOT model-judged:
 *   1. Every `proposal.failingTaskIds` entry MUST appear in
 *      `ctx.failingTaskIds` (T-6-21: pile cannot claim repair for a task that
 *      wasn't actually failing).
 *   2. Every correction's `targetTaskId` MUST appear in
 *      `ctx.admittedPlan.tasks` (no repair invents new tasks).
 *   3. Corrections cannot expand the capability envelope (T-6-19): any
 *      `requiredCapabilities` declared on a correction must be a subset of
 *      the original task's `requiredCapabilities`.
 *
 * Pure: no I/O.
 */

import type { AdmittedPlanRecord, PlanTask } from "@protostar/planning";

import type {
  RepairPlanCorrection,
  RepairPlanProposal
} from "./execution-coordination-pile-result.js";

export interface AdmitRepairPlanProposalContext {
  readonly admittedPlan: Pick<AdmittedPlanRecord, "tasks">;
  readonly failingTaskIds: readonly string[];
}

/**
 * The admitted RepairPlan returned on a successful admission. Structural
 * shape only — concrete repair execution lives in Phase 5's review/repair
 * loop. This shape is the wire-level contract between pile output and the
 * repair-loop seam.
 */
export interface AdmittedRepairPlan {
  readonly failingTaskIds: readonly string[];
  readonly corrections: readonly RepairPlanCorrection[];
}

export type AdmitRepairPlanProposalResult =
  | { readonly ok: true; readonly repairPlan: AdmittedRepairPlan }
  | { readonly ok: false; readonly errors: readonly string[] };

export function admitRepairPlanProposal(
  proposal: RepairPlanProposal,
  ctx: AdmitRepairPlanProposalContext
): AdmitRepairPlanProposalResult {
  const errors: string[] = [];

  const failingSet = new Set(ctx.failingTaskIds);
  for (const id of proposal.failingTaskIds) {
    if (!failingSet.has(id)) {
      errors.push(`admit-repair-plan: unknown failing task ${JSON.stringify(id)}`);
    }
  }

  const tasksById = new Map<string, PlanTask>();
  for (const task of ctx.admittedPlan.tasks) {
    tasksById.set(task.id, task);
  }

  for (const [index, correction] of proposal.corrections.entries()) {
    const targetTask = tasksById.get(correction.targetTaskId);
    if (targetTask === undefined) {
      errors.push(
        `admit-repair-plan: corrections[${index}] references unknown target task ${JSON.stringify(
          correction.targetTaskId
        )}`
      );
      continue;
    }

    const expansionErrors = detectCapabilityExpansion(correction, targetTask, index);
    errors.push(...expansionErrors);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    repairPlan: {
      failingTaskIds: proposal.failingTaskIds,
      corrections: proposal.corrections
    }
  };
}

function detectCapabilityExpansion(
  correction: RepairPlanCorrection,
  task: PlanTask,
  index: number
): readonly string[] {
  const required = correction.requiredCapabilities;
  if (required === undefined) {
    return [];
  }

  const errors: string[] = [];
  const taskCaps = task.requiredCapabilities;

  if (required.repoScopes !== undefined) {
    const allowedScopes = new Set(taskCaps.repoScopes.map((scope) => scope.path));
    for (const scopePath of required.repoScopes) {
      if (!allowedScopes.has(scopePath)) {
        errors.push(
          `admit-repair-plan: corrections[${index}] capability expansion — repoScope ${JSON.stringify(
            scopePath
          )} not present on target task ${JSON.stringify(task.id)}`
        );
      }
    }
  }

  if (required.toolPermissions !== undefined) {
    const allowedTools = new Set(taskCaps.toolPermissions.map((perm) => perm.tool));
    for (const perm of required.toolPermissions) {
      if (!allowedTools.has(perm.tool)) {
        errors.push(
          `admit-repair-plan: corrections[${index}] capability expansion — tool ${JSON.stringify(
            perm.tool
          )} not present on target task ${JSON.stringify(task.id)}`
        );
      }
    }
  }

  return errors;
}
