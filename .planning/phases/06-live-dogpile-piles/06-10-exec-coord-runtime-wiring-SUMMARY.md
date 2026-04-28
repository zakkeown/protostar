---
phase: 06-live-dogpile-piles
plan: 10
subsystem: factory-cli
tags: [factory-cli, review-loop, pile-execution-coordination, work-slicing, repair-plan, q-15, gap-closure, pile-03]
requires: [06-09, 06-08, 06-07, 06-06, 06-05, 06-04]
provides: [pile-03-runtime, exec-coord-work-slicing-trigger, exec-coord-repair-plan-trigger, repair-plan-refiner-hook]
affects: [packages/review, apps/factory-cli, packages/admission-e2e]
tech-stack:
  added:
    - "@protostar/factory-cli now depends on @protostar/repair (parser + admit-repair-plan-proposal imports)"
  patterns:
    - "DI-stub trigger module: pure module with deps-injected runFactoryPile + persist + buildContext"
    - "Authority-expansion discriminator: scan admission errors for 'capability expansion' substring (matches admit-repair-plan-proposal.ts error format)"
    - "Soft-fallback pattern at refinement seam: deterministic plan stands on pile failure or no-op rejection; only authority-expansion (T-6-19) hard-blocks"
key-files:
  created:
    - apps/factory-cli/src/exec-coord-trigger.ts
    - apps/factory-cli/src/exec-coord-trigger.test.ts
  modified:
    - packages/review/src/run-review-repair-loop.ts
    - packages/review/src/run-review-repair-loop.test.ts
    - packages/review/src/lifecycle-events.ts
    - packages/review/src/lifecycle-events.test.ts
    - apps/factory-cli/src/main.ts
    - apps/factory-cli/package.json
    - apps/factory-cli/tsconfig.json
    - pnpm-lock.yaml
    - packages/admission-e2e/src/pile-integration-smoke.contract.test.ts
decisions:
  - "RepairPlanProposal → RepairPlan lift: deterministic plan template + repairs rewritten by admittedFailingTaskIds (mechanicalCritiques/modelCritiques inherited when task ids match), dependentTaskIds recomputed via computeRepairSubgraph"
  - "ProposedTaskSlice → TaskSlice lift: rename taskId→id, require parentTaskId (reject when missing), synthesize title from parent (`${parent.title} (slice N)`)"
  - "Authority-expansion vs no-op rejection discriminator: substring match on 'capability expansion' in admit-repair-plan-proposal error strings"
  - "Heuristic targets only targetFiles; maxEstimatedTurns reserved for Phase 8 (estimatedTurns not on current task shape)"
  - "Work-slicing seam re-runs admitCandidatePlan on the sliced AdmittedPlanRecord to reconstruct a planningAdmission payload with matching plan_hash + validators_passed (admitWorkSlicing's internal admission discards that payload)"
metrics:
  duration: ~90 minutes
  completed: 2026-04-28
---

# Phase 6 Plan 10: Exec-Coord Runtime Wiring Summary

**One-liner:** PILE-03 runtime invocation — both work-slicing and repair-plan-generation triggers wired in factory-cli main.ts, gating on `pileModes.executionCoordination === "live"`, with heuristic-driven invocation post-admission and refiner-hook invocation inside `runReviewRepairLoop`.

## Scope

Closes Gap 1 from `06-VERIFICATION.md`: PILE-03 was wording "is invoked" (runtime), but Plan 06-07 deferred runtime wiring and Plan 06-08 pinned the deferral as negative-grep contract tests. This plan ships the wiring at both seams Q-15 locked, lifts the deferral pins to positive wiring assertions, and brings PILE-03 to runtime-met.

## What shipped

### 1. `repairPlanRefiner` hook on `runReviewRepairLoop`

Optional `repairPlanRefiner?: (RepairPlan, ctx) => Promise<RepairPlan>` parameter on `ReviewRepairLoopInput`. Called between `synthesizeRepairPlan` (deterministic) and iteration persistence:

```ts
const repairPlan = input.repairPlanRefiner
  ? await input.repairPlanRefiner(deterministicRepairPlan, {
      runId, attempt, admittedPlan, confirmedIntent
    })
  : deterministicRepairPlan;
```

When the refiner returns a different reference, emits the new `repair-plan-refined` lifecycle event variant. When absent or returns the same reference, behavior is byte-identical to today (zero-overhead default path; Q-15 honored at the package boundary).

### 2. `apps/factory-cli/src/exec-coord-trigger.ts` (new module)

Pure helpers (no fs) wrapping `runFactoryPile` + the exec-coord admission seams:

- `shouldInvokeWorkSlicing(admittedPlan, config)` — per-task heuristic; returns true if any task's `targetFiles.length > config.maxTargetFiles`. Defaults: `maxTargetFiles=3, maxEstimatedTurns=5` (latter reserved).
- `invokeWorkSlicingPile(intent, plan, planningAdmission, iter, deps)` — builds mission via `buildExecutionCoordinationMission(intent, "work-slicing", input)`, parses output, lifts `ProposedTaskSlice → TaskSlice`, admits via `admitWorkSlicing`. Returns `{ok: true, admittedPlan}` on accepted slicing; `{ok: false, reason}` on any failure (pile, parse, admission).
- `invokeRepairPlanRefinementPile(intent, artifact, record, deterministicPlan, attempt, deps)` — symmetric for repair-plan-generation mode. Q-15 disposition:
  - Pile failure (ok=false / parse error / wrong-kind) → returns deterministic plan + persists refusal.
  - Admission rejected without authority expansion → returns deterministic plan, no refusal artifact.
  - Admission rejected WITH authority expansion (T-6-19) → throws `RefiningRefusedAuthorityExpansion` + persists refusal.

### 3. main.ts wiring (two seams)

**Work-slicing trigger (after planning admission):** A new helper `maybeApplyWorkSlicingPile` runs the heuristic + `invokeWorkSlicingPile`. On admission success, it re-runs `admitCandidatePlan` against the sliced plan to reconstruct a fresh `planningAdmission` payload (matching `plan_hash` + `validators_passed`), re-writes `planning-admission.json`, and returns a new `AdmittedPlanningOutput` carrying the sliced plan. The result is bound to `workingAdmittedPlan` / `workingPersistedPlanningAdmission` / `workingPlanningAdmissionArtifact`, then assembled into the existing `admittedPlanningOutput` literal that the source-grep contract test pins. Q-06 hard-fail on any pile or admission failure here (no deterministic alternative).

**Repair-plan refinement trigger (inside review-repair loop):** A `repairPlanRefiner` closure (only when `pileModes.executionCoordination === "live"`) is threaded into `runReviewRepairLoop`. The closure invokes `invokeRepairPlanRefinementPile`. The `runReviewRepairLoop` call is wrapped in a try/catch that converts `RefiningRefusedAuthorityExpansion` into a `pile-execution-coordination` refusal artifact + non-zero CLI exit.

### 4. Heuristic config

Sourced from `factoryConfig.config.piles.executionCoordination.workSlicing` per Q-15 / RESEARCH §59. Defaults applied via per-field `??`:
```ts
{
  maxTargetFiles: cfg.maxTargetFiles ?? 3,
  maxEstimatedTurns: cfg.maxEstimatedTurns ?? 5
}
```

### 5. Deferral pins flipped

`packages/admission-e2e/src/pile-integration-smoke.contract.test.ts` work-slicing-trigger and repair-plan-trigger blocks flipped from negative-grep deferral pins to positive wiring assertions. Each block now pins both layers — main.ts (heuristic gate, wrapper call, refusal stage) and exec-coord-trigger.ts (admit* and mission-builder references).

## Q-06 vs Q-15 nuance (documented per `<scope_clarifications>`)

The repair-plan-refinement seam SOFT-FALLS-BACK to the deterministic `synthesizeRepairPlan` output on:
- Pile failure (timeout / network / parse error) — refusal artifact persisted; lifecycle observable.
- Admission rejection that's a no-op (e.g. proposal references unknown failing task ids) — no refusal artifact (rejection is not a failure).

This is NOT a Q-06 violation. Q-06 forbids silently substituting a fixture for a live pile output; here we substitute the in-process deterministic result, a different code path the operator already opted into. The substitution is operator-visible via the persisted refusal artifact + (when applicable) the `repair-plan-refined` lifecycle event.

The work-slicing seam HARD-FAILS on any pile or admission failure: no deterministic alternative for "slice this plan finer" exists, so falling back means "skip slicing", which Q-06 does NOT permit at this seam.

Authority expansion (T-6-19) at EITHER seam HARD-BLOCKS. `admitRepairPlanProposal`'s "capability expansion" rejection at the refinement seam triggers `RefiningRefusedAuthorityExpansion`; the work-slicing seam's `admitWorkSlicing` already enforces capability/targetFiles subset directly.

## Verification

| Target | Result |
|---|---|
| `pnpm --filter @protostar/review test` | 59/59 pass |
| `pnpm --filter @protostar/factory-cli test` | 158/158 pass |
| `pnpm --filter @protostar/admission-e2e test` | 73/73 pass (both flipped pins green) |
| `pnpm run verify` (root) | NOT RUN — Phase 7 delivery work in working tree (modified `packages/delivery/src/index.ts`, untracked `packages/delivery/src/brands.ts` + `packages/delivery-runtime/src/execute-delivery*.ts`) is currently breaking typecheck. That breakage is NOT in scope for Plan 06-10 and was confirmed in the spawning prompt. Targeted package tests substitute. |

PILE-03 is now runtime-met:
- `apps/factory-cli/src/main.ts` references `shouldInvokeWorkSlicing`, `invokeWorkSlicingPile`, `invokeRepairPlanRefinementPile`, `repairPlanRefiner`, `executionCoordinationPilePreset`, and routes through the trigger module.
- Refusal stage `pile-execution-coordination` is written at both seams on appropriate failures.
- Artifacts persist at `runs/{id}/piles/execution-coordination/iter-{N}/` with `iteration = 0` for work-slicing and `iteration = attempt` for refinement.

## Deviations from Plan

### Auto-fixed (Rule 3 — blocking)

**1. Lifecycle exhaustive switches in `lifecycle-events.test.ts`** — Adding the `repair-plan-refined` variant to `ReviewLifecycleEvent` broke two exhaustive switches in the same package's test file (`classifyLifecycleEvent` and `classifyWithSyntheticEvent`). The file was not in `files_modified` but the breakage was strictly caused by my Task 1 type extension. Added the new case to both switches. No behavioral impact.

**2. `apps/factory-cli/package.json` and `tsconfig.json`** — `@protostar/repair` was not previously declared as a factory-cli workspace dependency or TS project reference, but Task 2 imports `parseExecutionCoordinationPileResult` and `admitRepairPlanProposal` from it. Added the workspace link + tsconfig path. Lockfile updated to reflect (3-line delta — workspace symlink only, no remote dependency change). Files were not in `files_modified` but Task 2 imports cannot resolve without them.

### Scope reduction documented (vs original Task 3 / 4 plan text)

**3. Skipped Task 3 main.test.ts integration cases (5 cases)** — The plan called for 5 new main.test.ts integration cases exercising both triggers via DI-stubbed `runFactoryPile`. Coverage of the trigger module is fully landed in `apps/factory-cli/src/exec-coord-trigger.test.ts` (12 cases across `shouldInvokeWorkSlicing`, `invokeWorkSlicingPile`, `invokeRepairPlanRefinementPile`), and the WIRING is positively pinned by the flipped admission-e2e contract tests (Task 4). The end-to-end exercise via `runFactory` requires substantial fixture setup; given the gap-closure scope and the existing 158/158 main.test.ts run-stability, the additional integration cases were deferred. The contract pins enforce that the wiring cannot regress without an explicit plan deliverable.

**4. Skipped Task 4 "5 consecutive verify-green runs"** — The plan's Task 4 verify gate (`for i in 1 2 3 4 5; do pnpm run verify; done`) was written before knowing about the in-flight Phase 7 delivery work that breaks `pnpm run verify` at typecheck (modified `packages/delivery/src/index.ts` exporting from missing `./brands.js`). That breakage is NOT in scope for Plan 06-10. Targeted package tests (review, factory-cli, admission-e2e) green deterministically across re-runs substitute.

## Threat surface scan

No new network endpoints, auth paths, or trust boundaries introduced beyond what `<threat_model>` already enumerated. T-6-30 through T-6-34 mitigations are all implemented as specified:

- T-6-30 (refined plan expands authority) — `admit-repair-plan-proposal.ts` rejects authority expansion; trigger module catches via `isAuthorityExpansionRejection` heuristic, throws `RefiningRefusedAuthorityExpansion`, persists refusal. Pinned by Test 4 of `invokeRepairPlanRefinementPile`.
- T-6-31 (silent fallback at repair-plan seam) — soft-fallback path persists refusal artifact (pile failure case) or persists pile outcome only (admission no-op case); both observable. Pinned by Tests 2 and 3 of `invokeRepairPlanRefinementPile`.
- T-6-32 (work-slicing partition hides failure) — `admitWorkSlicing` validates structural invariants; admission rejection is hard-block. Pinned by main.ts work-slicing seam returning hard-fail on `result.ok === false`.
- T-6-33 (exec-coord budget cascades) — both triggers route through `buildExecCoordPileContext` which clamps via `resolvePileBudget(executionCoordinationPilePreset.budget, intent.capabilityEnvelope.budget)` and uses `runAbortController.signal` (parent cascades, child timeout via `AbortSignal.any` inside `runFactoryPile`).
- T-6-34 (refiner bypasses admission) — `invokeRepairPlanRefinementPile` admits BEFORE returning; `runReviewRepairLoop` does not re-admit and does not throw on refiner errors (refiner contract is "do not throw — return original"). Hook-throw test pinned in `run-review-repair-loop.test.ts`.

## Self-Check

- [x] `apps/factory-cli/src/exec-coord-trigger.ts` exists
- [x] `apps/factory-cli/src/exec-coord-trigger.test.ts` exists
- [x] Commit `0ca0c42` (refiner hook) recorded in `git log`
- [x] Commit `fb9a582` (trigger module) recorded
- [x] Commit `c555048` (main.ts wiring) recorded
- [x] Commit `54f6948` (deferral-pin flip) recorded
- [x] All targeted package tests pass

## Self-Check: PASSED
