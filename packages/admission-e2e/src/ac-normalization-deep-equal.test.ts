// AC normalization cross-package deep-equal e2e (Plan 01-09 Q-10, INTENT-03).
//
// SPIKE OUTCOME (recorded in SUMMARY): The `AdmittedPlan` exposes an
// `acceptanceCriteria` field of type `PlanAcceptanceCriterion[]` whose shape
// is `{ id, statement, verification }` — a documented PROJECTION of the full
// `AcceptanceCriterion` (which adds `justification?` for non-manual /
// `justification` for manual). The planning package's `copyPlanAcceptanceCriterion`
// performs this projection deterministically. Scope drift = zero on the
// projected fields (id, statement, verification); the dropped field is
// `justification`, which is documented as not flowing past the planning
// boundary in v0.0.1. (Phase 2 GOV-06 may revisit this as part of signing.)
//
// The test pins:
//   1. Cross-stage deep-equal of the projected AC array (id, statement,
//      verification) between the ConfirmedIntent and the AdmittedPlan.
//   2. Determinism: re-running the full pipeline on the same input produces
//      a byte-equal AC array on both sides.
//   3. The full ConfirmedIntent.acceptanceCriteria array is byte-equal between
//      runs (Phase 1 INTENT-03 determinism — pairs with the contract test).

import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  promoteIntentDraft,
  type AcceptanceCriterion,
  type ConfirmedIntent,
  type IntentDraft
} from "@protostar/intent";
import {
  admitCandidatePlans,
  assertAdmittedPlanHandoff,
  parsePlanningPileResult,
  PLANNING_ADMISSION_ARTIFACT_NAME,
  type AdmittedPlan,
  type PlanAcceptanceCriterion,
  type PlanningPileResult
} from "@protostar/planning";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const examplesRoot = resolve(repoRoot, "examples");

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

interface PipelineRun {
  readonly confirmedIntent: ConfirmedIntent;
  readonly admittedPlan: AdmittedPlan;
}

async function runPipeline(): Promise<PipelineRun> {
  const draft = await readJson<IntentDraft>(
    resolve(examplesRoot, "intents/scaffold.draft.json")
  );
  const promoted = promoteIntentDraft({ draft });
  if (!promoted.ok) {
    throw new Error(`scaffold.draft.json failed to promote: ${promoted.errors.join("; ")}`);
  }
  const confirmedIntent = promoted.intent;

  const planningResult = await readJson<PlanningPileResult>(
    resolve(examplesRoot, "planning-results/scaffold.json")
  );
  const parsed = parsePlanningPileResult(planningResult, {
    intent: confirmedIntent,
    defaultPlanId: "plan_admission_e2e_ac_deep_equal"
  });
  if (!parsed.ok) {
    throw new Error(`scaffold planning-result parse failed: ${parsed.errors.join("; ")}`);
  }

  const admission = admitCandidatePlans({
    candidatePlans: [parsed.candidatePlan],
    intent: confirmedIntent,
    planGraphUri: "plan.json"
  });
  if (!admission.ok) {
    throw new Error(`scaffold candidate plan admission failed: ${admission.errors.join("; ")}`);
  }

  const handoff = assertAdmittedPlanHandoff({
    plan: admission.admittedPlan,
    planningAdmission: admission.planningAdmission,
    planningAdmissionArtifact: {
      artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
      uri: PLANNING_ADMISSION_ARTIFACT_NAME,
      persisted: true
    },
    planGraphUri: "plan.json"
  });

  return { confirmedIntent, admittedPlan: handoff.plan };
}

/** Project a ConfirmedIntent AC down to the {id, statement, verification}
 * shape that flows past the planning boundary. */
function projectIntentAc(criteria: readonly AcceptanceCriterion[]): readonly PlanAcceptanceCriterion[] {
  return criteria.map((criterion) => ({
    id: criterion.id,
    statement: criterion.statement,
    verification: criterion.verification
  }));
}

describe("AC normalization e2e: cross-package deep-equal pin", () => {
  it("AdmittedPlan.acceptanceCriteria deep-equals projected ConfirmedIntent.acceptanceCriteria", async () => {
    const { confirmedIntent, admittedPlan } = await runPipeline();
    const expected = projectIntentAc(confirmedIntent.acceptanceCriteria);
    assert.deepEqual(
      admittedPlan.acceptanceCriteria,
      expected,
      "AC array must be byte-identical post-handoff (projected to {id, statement, verification})"
    );
  });

  it("pipeline is deterministic: two runs produce byte-equal AC arrays on both sides", async () => {
    const first = await runPipeline();
    const second = await runPipeline();
    assert.deepEqual(
      first.confirmedIntent.acceptanceCriteria,
      second.confirmedIntent.acceptanceCriteria,
      "ConfirmedIntent.acceptanceCriteria must be deterministic across runs (INTENT-03)"
    );
    assert.deepEqual(
      first.admittedPlan.acceptanceCriteria,
      second.admittedPlan.acceptanceCriteria,
      "AdmittedPlan.acceptanceCriteria must be deterministic across runs"
    );
  });

  it("AC ids on the AdmittedPlan are stableHash-derived and stable across runs", async () => {
    const first = await runPipeline();
    const second = await runPipeline();
    const firstIds = first.admittedPlan.acceptanceCriteria.map((c) => c.id);
    const secondIds = second.admittedPlan.acceptanceCriteria.map((c) => c.id);
    assert.deepEqual(firstIds, secondIds, "AC ids must be byte-equal across pipeline runs");
    for (const id of firstIds) {
      assert.match(id, /^ac_[0-9a-f]{16}$/, `AC id ${id} must follow stableHash format`);
    }
  });
});
