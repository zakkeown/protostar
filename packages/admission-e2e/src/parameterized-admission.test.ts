// Parameterized fixture-driven admission e2e (Plan 01-09 Q-02 + Q-11).
//
// Loops every in-scope fixture under `examples/intents/**` and
// `examples/planning-results/**` and asserts each produces its expected
// verdict end-to-end:
//
//   * accept-side intent fixtures   → promoteIntentDraft returns ok=true
//   * reject-side intent fixtures   → promoteIntentDraft returns ok=false
//   * accept-side planning fixtures → parsePlanningPileResult ok →
//                                     admitCandidatePlans ok →
//                                     assertAdmittedPlanHandoff returns brand
//   * reject-side planning fixtures → at LEAST ONE of {parsePlanningPileResult,
//                                     admitCandidatePlans, assertAdmittedPlanHandoff}
//                                     rejects/throws
//
// Top-level intent fixtures are drafts BY CONTRACT — the confirmed-intent
// parse path is intentionally absent from this file (Plan 01-09 step 6
// guard against the silent-bypass pattern). Confirmed-shape JSON files at top-level
// or under bad/ are skipped and surfaced as Plan 03 follow-ups via the
// discovery layer.
//
// The meta-test does an independent disk walk and asserts the loop's
// discovered set equals the reference set — guards against a fixture being
// added to disk but never iterated (T-01-09-01).

import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  promoteIntentDraft,
  type IntentDraft,
  type ConfirmedIntent
} from "@protostar/intent";
import {
  admitCandidatePlans,
  assertAdmittedPlanHandoff,
  parsePlanningPileResult,
  PLANNING_ADMISSION_ARTIFACT_NAME,
  type PlanningPileResult
} from "@protostar/planning";

import { discoverFixtures, referenceWalk } from "./fixture-discovery.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// dist/parameterized-admission.test.js → ../../.. is repo root.
const repoRoot = resolve(__dirname, "../../..");
const examplesRoot = resolve(repoRoot, "examples");

async function readJson<T>(path: string): Promise<T> {
  const text = await readFile(path, "utf8");
  return JSON.parse(text) as T;
}

/**
 * Promote `examples/intents/scaffold.draft.json` once; planning fixtures pair
 * with this confirmed intent so that AC ids match for the accept-side
 * scaffold planning fixture. Reject-side planning fixtures intentionally
 * use mismatching AC ids (or other defects); they must reject regardless of
 * which intent is paired.
 */
async function promoteScaffoldIntent(): Promise<ConfirmedIntent> {
  const draft = await readJson<IntentDraft>(
    resolve(examplesRoot, "intents/scaffold.draft.json")
  );
  const result = promoteIntentDraft({ draft });
  if (!result.ok) {
    throw new Error(
      `scaffold.draft.json must promote so planning fixtures have a paired ConfirmedIntent. errors: ${result.errors.join("; ")}`
    );
  }
  return result.intent;
}

describe("parameterized admission e2e (directory-as-manifest)", () => {
  it("meta: every in-scope fixture on disk is iterated by discoverFixtures", async () => {
    const { fixtures } = await discoverFixtures(examplesRoot);
    const referenceSet = await referenceWalk(examplesRoot);
    const discoveredSet = fixtures.map((f) => f.relativePath).sort();
    assert.deepEqual(
      discoveredSet,
      [...referenceSet].sort(),
      "discoverFixtures must reach every in-scope file produced by the reference walk"
    );
  });

  it("admits feature-add, bugfix, and refactor intent fixtures without unsupported-goal-archetype", async () => {
    const cases = [
      {
        relativePath: "intents/feature-add.draft.json",
        goalArchetype: "feature-add"
      },
      {
        relativePath: "intents/bugfix.draft.json",
        goalArchetype: "bugfix"
      },
      {
        relativePath: "intents/refactor.draft.json",
        goalArchetype: "refactor"
      }
    ] as const;

    for (const fixtureCase of cases) {
      const draft = await readJson<IntentDraft>(
        resolve(examplesRoot, fixtureCase.relativePath)
      );
      const result = promoteIntentDraft({ draft });

      if (!result.ok) {
        assert.fail(
          `${fixtureCase.relativePath} should be admitted: ${result.errors.join("; ")}`
        );
      }
      assert.equal(
        result.intent.goalArchetype,
        fixtureCase.goalArchetype,
        fixtureCase.relativePath
      );
      assert.ok(
        result.policyFindings.every((finding) => finding.code !== "unsupported-goal-archetype"),
        `${fixtureCase.relativePath} must not emit unsupported-goal-archetype.`
      );
    }
  });

  it("loops every fixture and asserts expected verdict end-to-end", async () => {
    const { fixtures, confirmedShapeIntentFollowups } = await discoverFixtures(examplesRoot);
    if (confirmedShapeIntentFollowups.length > 0) {
      // Surface as a soft warning in test output. Plan 03 follow-up.
      // eslint-disable-next-line no-console
      console.warn(
        `[admission-e2e] confirmed-shape intent fixtures skipped (Plan 03 follow-up): ${confirmedShapeIntentFollowups.join(", ")}`
      );
    }
    assert.ok(
      fixtures.length > 0,
      "discoverFixtures returned zero fixtures — examples/ layout regression"
    );

    const scaffoldIntent = await promoteScaffoldIntent();

    let intentAccept = 0;
    let intentReject = 0;
    let planningAccept = 0;
    let planningReject = 0;

    for (const fixture of fixtures) {
      if (fixture.kind === "intent") {
        const draft = await readJson<IntentDraft>(fixture.absolutePath);
        const result = promoteIntentDraft({ draft });
        if (fixture.expectedVerdict === "accept") {
          if (!result.ok) {
            assert.fail(
              `Intent fixture ${fixture.relativePath} expected to be admitted but rejected: ${result.errors.join("; ")}`
            );
          }
          // Ambiguity gate (Q-13: ≤ 0.2 threshold). Accept-side fixtures must
          // pass the threshold — read it from the assessment included in the
          // success branch.
          assert.ok(
            result.ambiguityAssessment.ambiguity <= 0.2,
            `Intent fixture ${fixture.relativePath} promoted but ambiguity ${result.ambiguityAssessment.ambiguity} exceeds 0.2`
          );
          intentAccept += 1;
        } else {
          if (result.ok) {
            assert.fail(
              `Intent fixture ${fixture.relativePath} expected to reject but was admitted as ConfirmedIntent.`
            );
          }
          intentReject += 1;
        }
        continue;
      }

      // Planning fixture flow.
      const planningResult = await readJson<PlanningPileResult>(fixture.absolutePath);
      let parsed;
      try {
        parsed = parsePlanningPileResult(planningResult, {
          intent: scaffoldIntent,
          defaultPlanId: "plan_admission_e2e_fixture"
        });
      } catch (error) {
        if (fixture.expectedVerdict === "reject") {
          planningReject += 1;
          continue;
        }
        assert.fail(
          `Planning fixture ${fixture.relativePath} expected to admit but parsePlanningPileResult threw: ${(error as Error).message}`
        );
      }

      if (!parsed.ok) {
        if (fixture.expectedVerdict === "reject") {
          planningReject += 1;
          continue;
        }
        assert.fail(
          `Planning fixture ${fixture.relativePath} expected to admit but parsePlanningPileResult rejected: ${parsed.errors.join("; ")}`
        );
      }

      const admission = admitCandidatePlans({
        candidatePlans: [parsed.candidatePlan],
        intent: scaffoldIntent,
        planGraphUri: "plan.json"
      });

      if (!admission.ok) {
        if (fixture.expectedVerdict === "reject") {
          planningReject += 1;
          continue;
        }
        assert.fail(
          `Planning fixture ${fixture.relativePath} expected to admit but admitCandidatePlans rejected: ${admission.errors.join("; ")}`
        );
      }

      try {
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
        if (fixture.expectedVerdict === "reject") {
          assert.fail(
            `Planning fixture ${fixture.relativePath} expected to reject but assertAdmittedPlanHandoff produced a branded plan ${handoff.plan.planId}`
          );
        }
        planningAccept += 1;
      } catch (error) {
        if (fixture.expectedVerdict === "reject") {
          planningReject += 1;
          continue;
        }
        assert.fail(
          `Planning fixture ${fixture.relativePath} expected to admit but assertAdmittedPlanHandoff threw: ${(error as Error).message}`
        );
      }
    }

    // Sanity: at least one of each kind/verdict was exercised.
    assert.ok(intentAccept > 0, "expected at least one accept-side intent fixture");
    assert.ok(planningAccept > 0, "expected at least one accept-side planning fixture");
    assert.ok(planningReject > 0, "expected at least one reject-side planning fixture");
    // Intent reject side may be 0 today (Plan 03 follow-up — bad/ intent
    // fixtures are confirmed-shape and skipped). Do not assert > 0 here; the
    // confirmedShapeIntentFollowups warning above surfaces the gap.
    void intentReject;
  });
});
