/**
 * Phase 6 Plan 06-08 Task 3 — pile integration smoke (PILE-01, PILE-03).
 *
 * Source-grep contract on `apps/factory-cli/src/main.ts` asserting that the
 * three pile-trigger surfaces are wired (or explicitly deferred to a future
 * plan with a TODO marker). The actual end-to-end exercise of the planning
 * pile against `runFactory` lives in `apps/factory-cli/src/main.test.ts`
 * (test "invokes runFactoryPile in --planning-mode live and admits the parsed
 * pile output", main.test.ts:505) — that test boots the full factory-cli
 * harness, which requires fixtures and signing keys not portable to
 * admission-e2e.
 *
 * THIS file pins the wiring at the source level so that any future deletion
 * of the trigger surfaces fails the contract test, and so that the work-
 * slicing / repair-plan deferral state is explicit and reviewable.
 *
 * Per Phase 6 Plan 06-08 plan note: "exec-coord seams are deferred from Plan
 * 06-07. This plan's smoke test only exercises the planning + review pile
 * paths, so the deferral does not block you." This test pins the deferral
 * state explicitly: when work-slicing/repair-plan are wired in a later plan,
 * the corresponding `it()` block flips from "deferred" to "wired".
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

async function loadFactorySource(): Promise<string> {
  return await readFile(factoryMainPath, "utf8");
}

async function loadFactoryTestSource(): Promise<string> {
  return await readFile(factoryMainTestPath, "utf8");
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

  it("work-slicing-trigger: deferred — exec-coord work-slicing seam not wired in main.ts (Plan 06-07 deferral)", async () => {
    // Per Plan 06-08 prelude: "The exec-coord seams are deferred from Plan
    // 06-07." This test PINS the deferral so any future work-slicing wiring
    // is a deliberate plan deliverable. When the seam ships, replace this
    // assertion with positive wiring assertions (mirroring planning-pile-live).
    const source = await loadFactorySource();
    const hasWorkSlicingTrigger =
      /admitWorkSlicing\b/.test(source) ||
      /shouldInvokeWorkSlicing\b/.test(source);
    assert.equal(
      hasWorkSlicingTrigger,
      false,
      "work-slicing-trigger: when admitWorkSlicing or shouldInvokeWorkSlicing appears in main.ts, replace this deferral pin with positive wiring assertions"
    );
  });

  // ---------- C. repair-plan-trigger (PILE-03 trigger #2) ----------

  it("repair-plan-trigger: deferred — exec-coord repair-plan seam not wired in main.ts (Plan 06-07 deferral)", async () => {
    // Symmetric pin to work-slicing. When repair-plan generation hooks the
    // exec-coord pile, swap this for positive wiring assertions.
    const source = await loadFactorySource();
    const hasRepairPlanTrigger =
      /admitRepairPlanProposal\b/.test(source) ||
      /executionCoordinationPilePreset/.test(source);
    assert.equal(
      hasRepairPlanTrigger,
      false,
      "repair-plan-trigger: when admitRepairPlanProposal or executionCoordinationPilePreset appears in main.ts, replace this deferral pin with positive wiring assertions"
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
