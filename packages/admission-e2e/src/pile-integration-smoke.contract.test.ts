/**
 * Phase 6 Plan 06-08 Task 3 — pile integration smoke (PILE-01, PILE-03).
 *
 * Source-grep contract on `apps/factory-cli/src/main.ts` AND
 * `apps/factory-cli/src/exec-coord-trigger.ts` asserting that all three
 * pile-trigger surfaces are wired. The actual end-to-end exercise of the
 * planning pile against `runFactory` lives in
 * `apps/factory-cli/src/main.test.ts` (test "invokes runFactoryPile in
 * --planning-mode live and admits the parsed pile output", main.test.ts:505).
 *
 * Plan 06-10 flipped the work-slicing/repair-plan deferral pins to positive
 * wiring assertions; the exec-coord pile is now invoked from main.ts via
 * the trigger module at both seams (work-slicing post-admission and
 * repair-plan-refinement inside runReviewRepairLoop).
 */

import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const factoryMainPath = resolve(repoRoot, "apps/factory-cli/src/main.ts");
const factoryMainTestPath = resolve(repoRoot, "apps/factory-cli/src/main.test.ts");
const execCoordTriggerPath = resolve(repoRoot, "apps/factory-cli/src/exec-coord-trigger.ts");

async function loadFactorySource(): Promise<string> {
  return await readFile(factoryMainPath, "utf8");
}

async function loadFactoryTestSource(): Promise<string> {
  return await readFile(factoryMainTestPath, "utf8");
}

async function loadExecCoordTriggerSource(): Promise<string> {
  return await readFile(execCoordTriggerPath, "utf8");
}

describe("pile-integration-smoke (PILE-01 / PILE-03 trigger surfaces)", () => {
  // ---------- A. planning-pile-live (PILE-01) ----------

  it("planning-pile-live: factory-cli main.ts wires --planning-mode live to runFactoryPile", async () => {
    const source = await loadFactorySource();
    // The Plan 06-07 Task 3a wiring: live mode invokes runFactoryPile and
    // persists via writePileArtifacts.
    assert.match(
      source,
      /pileModes\.planning\s*===\s*"fixture"/,
      "planning-pile-live: planning-mode dispatch must check pileModes.planning"
    );
    assert.match(
      source,
      /dependencies\.runFactoryPile\(planningMission/,
      "planning-pile-live: live mode must invoke dependencies.runFactoryPile with planningMission"
    );
    // The planning-pile writePileArtifacts call sits in the live branch and
    // sets `kind: "planning"`. We verify both signals appear in main.ts.
    assert.match(
      source,
      /writePileArtifacts\(/,
      "planning-pile-live: planning pile outcome must be persisted via writePileArtifacts"
    );
    assert.match(
      source,
      /kind:\s*"planning"/,
      "planning-pile-live: writePileArtifacts must be invoked with kind: \"planning\""
    );
    assert.match(
      source,
      /stage:\s*"pile-planning"/,
      "planning-pile-live: refusal stage must be pile-planning"
    );
  });

  it("planning-pile-live: end-to-end exercise lives in factory-cli main.test.ts (admitted-plan output assertion)", async () => {
    // The actual admittance assertion (admitted-plan.json + terminal-status
    // status==="admitted") cannot be exercised from admission-e2e because
    // runFactory requires factory-cli's local fixture/key bootstrap. This
    // test pins the existence of that exercise in the right home.
    const testSource = await loadFactoryTestSource();
    assert.match(
      testSource,
      /invokes runFactoryPile in --planning-mode live and admits the parsed pile output/,
      "planning-pile-live: factory-cli main.test.ts must own the end-to-end admitted-plan exercise"
    );
    assert.match(
      testSource,
      /piles.*planning.*iter-0.*result\.json/s,
      "planning-pile-live: end-to-end test must assert pile result.json persistence"
    );
  });

  // ---------- B. work-slicing-trigger (PILE-03 trigger #1) ----------

  it("work-slicing-trigger: factory-cli main.ts wires admitted-plan work-slicing through admitWorkSlicing", async () => {
    const source = await loadFactorySource();
    const trigger = await loadExecCoordTriggerSource();
    assert.match(
      source,
      /shouldInvokeWorkSlicing\(/,
      "work-slicing-trigger: heuristic gate must be invoked from main.ts"
    );
    assert.match(
      source,
      /invokeWorkSlicingPile\(/,
      "work-slicing-trigger: pile invocation wrapper must be called from main.ts"
    );
    assert.match(
      trigger,
      /admitWorkSlicing\b/,
      "work-slicing-trigger: admission helper must be referenced via the exec-coord-trigger module"
    );
    assert.match(
      source,
      /kind:\s*"execution-coordination"/,
      "work-slicing-trigger: writePileArtifacts must be invoked with kind: \"execution-coordination\""
    );
    assert.match(
      source,
      /stage:\s*"pile-execution-coordination"/,
      "work-slicing-trigger: refusal stage must be pile-execution-coordination"
    );
  });

  // ---------- C. repair-plan-trigger (PILE-03 trigger #2) ----------

  it("repair-plan-trigger: factory-cli main.ts threads repairPlanRefiner into runReviewRepairLoop calling executionCoordinationPilePreset", async () => {
    const source = await loadFactorySource();
    const trigger = await loadExecCoordTriggerSource();
    assert.match(
      source,
      /repairPlanRefiner/,
      "repair-plan-trigger: refiner closure must be constructed in main.ts"
    );
    assert.match(
      source,
      /invokeRepairPlanRefinementPile\(/,
      "repair-plan-trigger: refinement-pile wrapper must be called from main.ts"
    );
    assert.match(
      source,
      /executionCoordinationPilePreset|buildExecutionCoordinationMission/,
      "repair-plan-trigger: exec-coord preset or mission builder must be referenced in main.ts"
    );
    assert.match(
      trigger,
      /admitRepairPlanProposal\b/,
      "repair-plan-trigger: admission helper must be referenced via the exec-coord-trigger module"
    );
    assert.match(
      trigger,
      /buildExecutionCoordinationMission\b/,
      "repair-plan-trigger: mission builder must be referenced via the exec-coord-trigger module"
    );
  });

  // ---------- shared invariants ----------

  it("pile-integration-smoke: review pile seam (PILE-02) is wired alongside planning (defense against partial wiring)", async () => {
    const source = await loadFactorySource();
    assert.match(source, /createReviewPileModelReviewer/);
    assert.match(source, /kind:\s*"review"/);
    assert.match(source, /stage:\s*"pile-review"/);
  });

  it("pile-integration-smoke: refusal stages enumerate all three pile kinds in refusals-index", async () => {
    const refusalsIndexPath = resolve(repoRoot, "apps/factory-cli/src/refusals-index.ts");
    const source = await readFile(refusalsIndexPath, "utf8");
    assert.match(source, /"pile-planning"/);
    assert.match(source, /"pile-review"/);
    assert.match(source, /"pile-execution-coordination"/);
  });
});
