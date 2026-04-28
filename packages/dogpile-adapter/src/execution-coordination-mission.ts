/**
 * Plan 06-04 Task 2 — `buildExecutionCoordinationMission` (Q-15).
 *
 * The execution-coordination pile is invoked at TWO trigger points (work
 * slicing + repair plan generation) but shares ONE preset. This builder is
 * the single source for mission text — it stamps a deterministic
 * `MODE: <discriminator>` token so the pile's prompt and Plan 06's downstream
 * parser can branch reliably.
 *
 * Per D-15 (Q-15): two-trigger seam wired now; cosmetic-tweak v0.1 fixtures
 * default to a no-op proposal but the seam is exercised end-to-end.
 * Per D-16 (Q-16): preset reference is `executionCoordinationPilePreset`.
 * Per T-6-16: mode/input.kind disagreement throws — this builder is the
 * single source of mission text, so we fail closed if the caller supplies
 * inconsistent inputs.
 *
 * Pure: no I/O, no clock reads.
 */

import type { ConfirmedIntent } from "@protostar/intent";
import type { PlanningAdmissionAcceptedArtifactPayload } from "@protostar/planning";

import {
  executionCoordinationPilePreset,
  type FactoryPileMission
} from "./index.js";

export type ExecutionCoordinationMode =
  | "work-slicing"
  | "repair-plan-generation";

export type ExecutionCoordinationMissionInput =
  | {
      readonly kind: "work-slicing";
      readonly admittedPlan: PlanningAdmissionAcceptedArtifactPayload;
    }
  | {
      readonly kind: "repair-plan-generation";
      readonly failingTaskIds: readonly string[];
      readonly mechanicalCritique?: string;
    };

const RETURN_INSTRUCTION =
  "Return JSON only matching ExecutionCoordinationProposal; do not include explanatory prose.";

export function buildExecutionCoordinationMission(
  intent: ConfirmedIntent,
  mode: ExecutionCoordinationMode,
  input: ExecutionCoordinationMissionInput
): FactoryPileMission {
  if (mode !== input.kind) {
    throw new Error(
      `buildExecutionCoordinationMission: mode/input.kind mismatch (mode=${mode}, input.kind=${input.kind})`
    );
  }

  const header = [
    `Confirmed intent: ${intent.title}`,
    "",
    intent.problem,
    "",
    `MODE: ${mode}`,
    ""
  ];

  let body: readonly string[];
  if (input.kind === "work-slicing") {
    body = [
      "Work-slicing trigger: propose finer-grained subdivision of the admitted plan.",
      "",
      "Admitted plan summary:",
      JSON.stringify({
        planId: input.admittedPlan.planId,
        artifact: input.admittedPlan.artifact,
        decision: input.admittedPlan.decision,
        admissionStatus: input.admittedPlan.admissionStatus
      })
    ];
  } else {
    body = [
      "Repair-plan trigger: propose a refined repair plan for the failing tasks below.",
      "",
      "Failing task ids:",
      ...input.failingTaskIds.map((id) => `- ${id}`),
      ...(input.mechanicalCritique
        ? ["", `Mechanical critique: ${input.mechanicalCritique}`]
        : [])
    ];
  }

  return {
    preset: executionCoordinationPilePreset,
    intent: [...header, ...body, "", RETURN_INSTRUCTION].join("\n")
  };
}
