/**
 * Plan 06-04 Task 2 — buildExecutionCoordinationMission contract tests (Q-15).
 *
 * The execution-coordination pile has two trigger modes (work-slicing,
 * repair-plan-generation) that share one preset. The mission text must
 * carry a deterministic discriminator token so downstream parsing can
 * branch on it (Q-15, T-6-16).
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { ConfirmedIntent } from "@protostar/intent";
import type { PlanningAdmissionAcceptedArtifactPayload } from "@protostar/planning";

import {
  buildExecutionCoordinationMission,
  type ExecutionCoordinationMissionInput
} from "./execution-coordination-mission.js";
import { executionCoordinationPilePreset } from "./index.js";

const stubIntent: ConfirmedIntent = {
  title: "Cosmetic tweak: button colour",
  problem: "Demo button is too pale",
  acceptanceCriteria: [{ id: "AC-1", statement: "Button is visible" }]
} as unknown as ConfirmedIntent;

const stubAdmittedPlan = {
  planId: "plan-123",
  artifact: "planning-admission",
  decision: "allow",
  admissionStatus: "plan-admitted"
} as unknown as PlanningAdmissionAcceptedArtifactPayload;

describe("execution-coordination-mission (Q-15) — buildExecutionCoordinationMission", () => {
  it("work-slicing mode: intent text carries MODE: work-slicing and preset is execution-coordination", () => {
    const input: ExecutionCoordinationMissionInput = {
      kind: "work-slicing",
      admittedPlan: stubAdmittedPlan
    };
    const mission = buildExecutionCoordinationMission(stubIntent, "work-slicing", input);
    assert.match(mission.intent, /MODE: work-slicing/);
    assert.equal(mission.preset.kind, "execution-coordination");
    assert.match(mission.intent, /Confirmed intent: Cosmetic tweak: button colour/);
  });

  it("repair-plan-generation mode: each failingTaskId appears in mission text", () => {
    const input: ExecutionCoordinationMissionInput = {
      kind: "repair-plan-generation",
      failingTaskIds: ["t-1", "t-2"],
      mechanicalCritique: "lint failed"
    };
    const mission = buildExecutionCoordinationMission(stubIntent, "repair-plan-generation", input);
    assert.match(mission.intent, /MODE: repair-plan-generation/);
    assert.match(mission.intent, /t-1/);
    assert.match(mission.intent, /t-2/);
  });

  it("mode/input.kind mismatch throws (T-6-16 mitigation)", () => {
    const wrongInput: ExecutionCoordinationMissionInput = {
      kind: "repair-plan-generation",
      failingTaskIds: ["t-1"]
    };
    assert.throws(
      () =>
        buildExecutionCoordinationMission(
          stubIntent,
          "work-slicing",
          wrongInput
        ),
      /buildExecutionCoordinationMission: mode\/input\.kind mismatch/
    );
  });

  it("preset reference is the renamed executionCoordinationPilePreset (Q-16)", () => {
    const input: ExecutionCoordinationMissionInput = {
      kind: "work-slicing",
      admittedPlan: stubAdmittedPlan
    };
    const mission = buildExecutionCoordinationMission(stubIntent, "work-slicing", input);
    assert.equal(mission.preset, executionCoordinationPilePreset);
  });
});
