/**
 * Phase 8 Plan 08-08 Task 4 — PriorGenerationSummary mission text (Q-16/Q-17).
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { buildPlanningMission, type PriorGenerationSummary } from "@protostar/dogpile-adapter";
import type { ConfirmedIntent } from "@protostar/intent";

describe("planning-mission-prior-summary (Q-16 / Q-17)", () => {
  it("omits Previous Generation Summary when no prior summary is supplied", () => {
    const mission = buildPlanningMission(intentFixture);
    assert.equal(mission.intent.includes("## Previous Generation Summary"), false);
  });

  it("includes prior verdicts, reason, and snapshot field names while code hints are disabled", () => {
    const mission = buildPlanningMission(intentFixture, priorSummary({ includePriorCodeHints: false }));
    assert.match(mission.intent, /## Previous Generation Summary/);
    assert.match(mission.intent, /Prior verdict: pass/);
    assert.match(mission.intent, /Prior evaluation verdict: pass/);
    assert.match(mission.intent, /AC-1/);
    assert.match(mission.intent, /first run/);
    assert.equal(mission.intent.includes("Prior diff:"), false);
  });

  it("includes Prior diff when includePriorCodeHints is true", () => {
    const mission = buildPlanningMission(
      intentFixture,
      priorSummary({
        includePriorCodeHints: true,
        priorDiffNameOnly: ["src/Button.tsx"]
      })
    );
    assert.match(mission.intent, /## Previous Generation Summary/);
    assert.match(mission.intent, /Prior diff:/);
    assert.match(mission.intent, /src\/Button\.tsx/);
  });

  it("includes failing prior verdict text verbatim", () => {
    const mission = buildPlanningMission(
      intentFixture,
      priorSummary({
        priorVerdict: "fail",
        includePriorCodeHints: false
      })
    );
    assert.match(mission.intent, /Prior verdict: fail/);
    assert.equal(mission.intent.includes("Prior diff:"), false);
  });
});

function priorSummary(
  overrides: Partial<PriorGenerationSummary> = {}
): PriorGenerationSummary {
  return {
    generation: 1,
    snapshotFields: [{ name: "AC-1", type: "smoke" }],
    evolutionReason: "first run",
    priorVerdict: "pass",
    priorEvaluationVerdict: "pass",
    includePriorCodeHints: false,
    ...overrides
  };
}

const intentFixture = {
  id: "intent_prior_summary",
  title: "Plan with prior generation context",
  problem: "Planning missions should see prior spec evolution summaries.",
  requester: "admission-e2e",
  confirmedAt: "2026-04-28T00:00:00.000Z",
  acceptanceCriteria: [
    { id: "AC-1", statement: "Prior summaries are included in planning missions.", verification: "contract" }
  ],
  capabilityEnvelope: { repoScopes: [], toolPermissions: [], mechanical: { allowed: ["verify", "lint"] }, budget: {} },
  constraints: [],
  stopConditions: [],
  schemaVersion: "1.6.0",
  signature: null
} as unknown as ConfirmedIntent;
