---
phase: 05-review-repair-loop
plan: 04
subsystem: review
tags: [review, repair, delivery-authorization, lifecycle-events, typescript, contracts]

requires:
  - phase: 05-review-repair-loop
    provides: Wave 0 repair/mechanical skeletons and schema 1.4.0 budget/AC transport
provides:
  - "Planning-owned RepairContext and ExecutionRunResult neutral leaf contracts"
  - "Review-owned RepairPlan, MechanicalCheckResult, ModelReviewer, and JudgeCritique contracts"
  - "DeliveryAuthorization private runtime-symbol brand and strict ReviewDecisionArtifact pass/pass contract"
  - "Seven-kind ReviewLifecycleEvent union with exhaustiveness tests"
affects: [05-05-repair-plan-author, 05-07-mechanical-checks-adapter, 05-08-model-reviewer, 05-10-review-repair-loop, 05-13-delivery-contract]

tech-stack:
  added: []
  patterns:
    - "TDD type-contract commits with RED/GREEN gates"
    - "Module-private unique-symbol brand with runtime symbol evidence"
    - "Planning neutral leaf type relocation to avoid review/execution cycles"

key-files:
  created:
    - packages/planning/src/repair-context.ts
    - packages/planning/src/repair-context.test.ts
    - packages/planning/src/execution-run-result.ts
    - packages/planning/src/execution-run-result.test.ts
    - packages/review/src/repair-types.ts
    - packages/review/src/repair-types.test.ts
    - packages/review/src/judge-types.ts
    - packages/review/src/judge-types.test.ts
    - packages/review/src/delivery-authorization.ts
    - packages/review/src/delivery-authorization.test.ts
    - packages/review/src/lifecycle-events.ts
    - packages/review/src/lifecycle-events.test.ts
  modified:
    - packages/planning/src/index.ts
    - packages/planning/package.json
    - packages/planning/tsconfig.json
    - packages/review/src/index.ts
    - pnpm-lock.yaml

key-decisions:
  - "RepairContext, AdapterAttemptRef, MechanicalCritiqueRef, ModelCritiqueRef, and ExecutionRunResult live in @protostar/planning to break the future review/execution cycle."
  - "DeliveryAuthorization uses a module-private runtime unique symbol so minted values carry symbol evidence while direct object literals fail type-checking."
  - "ReviewDecisionArtifact.model is exactly \"pass\"; \"skipped\" is rejected at the contract layer."

patterns-established:
  - "Review public contract modules are re-exported from @protostar/review for downstream waves."
  - "Lifecycle event consumers use assertExhaustive never-switch tests to catch new event kinds."

requirements-completed: [LOOP-03, LOOP-04, LOOP-05, LOOP-06]

duration: 8min
completed: 2026-04-28
---

# Phase 05 Plan 04: Review Types and Brands Summary

**Review/repair loop contracts are now pinned: repair context lives in planning, review exports the repair/model/delivery/lifecycle surfaces, and delivery authorization is non-forgeable by object literal.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-28T00:29:35Z
- **Completed:** 2026-04-28T00:37:05Z
- **Tasks:** 3
- **Files modified:** 21

## Accomplishments

- Added `RepairContext`, `AdapterAttemptRef`, `MechanicalCritiqueRef`, `ModelCritiqueRef`, and `ExecutionRunResult` to `@protostar/planning` as neutral leaf contracts.
- Added `RepairPlan`, `RepairTask`, `MechanicalCheckResult`, `ModelReviewInput`, `ModelReviewResult`, `ModelReviewer`, `MechanicalCheckerInput`, `MechanicalChecker`, and `JudgeCritique` to `@protostar/review`.
- Added `DeliveryAuthorization`, `ReviewDecisionArtifact`, `mintDeliveryAuthorization`, and `LoadDeliveryAuthorization` with type-level negative tests for forge attempts and `"skipped"` model decisions.
- Added the seven-kind `ReviewLifecycleEvent` union and exhaustiveness tests for downstream consumers.

## Task Commits

Each TDD task produced RED/GREEN commits:

1. **Task 1 RED: judge + repair contract tests** - `fd8c3b6` (test)
2. **Task 1 GREEN: review repair contract types** - `da07c6b` (feat)
3. **Task 2 RED: delivery authorization brand tests** - `789e8bb` (test)
4. **Task 2 GREEN: delivery authorization brand** - `32c3068` (feat)
5. **Task 3 RED: lifecycle event tests** - `8ebf53b` (test)
6. **Task 3 GREEN: lifecycle event union + barrel exports** - `d2228f9` (feat)

## Files Created/Modified

- `packages/planning/src/repair-context.ts` - Neutral `RepairContext` and critique reference contracts.
- `packages/planning/src/execution-run-result.ts` - Neutral first-pass execution result contract.
- `packages/review/src/repair-types.ts` - Repair plan, mechanical check, model reviewer, and mechanical checker contracts.
- `packages/review/src/judge-types.ts` - `JudgeCritique` wire-format contract.
- `packages/review/src/delivery-authorization.ts` - Private-symbol delivery authorization brand and review decision artifact type.
- `packages/review/src/lifecycle-events.ts` - Seven-kind review lifecycle event union.
- `packages/review/src/index.ts` - Barrel re-exports for all four new review modules.
- Test files beside each new contract module pin the expected shapes and negative type cases.

## Decisions Made

- Kept planning free of `@protostar/review` and `@protostar/execution` imports; it now depends on `@protostar/artifacts` only for `StageArtifactRef`.
- Used a runtime `Symbol("DeliveryAuthorization")` rather than an ambient-only `declare const` so tests can prove minted values carry brand evidence at runtime.
- Kept `LoadDeliveryAuthorization` as a type alias only; Plan 05-10 owns any injected-reader implementation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added planning artifact dependency/reference**
- **Found during:** Task 1 (judge-types.ts + repair-types.ts)
- **Issue:** The planned planning leaf contracts import `StageArtifactRef`, but `@protostar/planning` did not yet depend on or reference `@protostar/artifacts`.
- **Fix:** Added the workspace dependency, TypeScript project reference, and lockfile importer edge.
- **Files modified:** `packages/planning/package.json`, `packages/planning/tsconfig.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm -w exec tsc --build packages/planning packages/execution packages/review`
- **Committed in:** `da07c6b`

**2. [Rule 1 - Bug] Kept synthetic lifecycle exhaustiveness probe type-only**
- **Found during:** Task 3 (lifecycle-events.ts + exhaustiveness test)
- **Issue:** The synthetic 8th-kind exhaustiveness probe executed at runtime and threw after the test body completed.
- **Fix:** Left the `@ts-expect-error` exhaustiveness proof in place but stopped invoking the synthetic classifier.
- **Files modified:** `packages/review/src/lifecycle-events.test.ts`
- **Verification:** `pnpm --filter @protostar/review test`
- **Committed in:** `d2228f9`

---

**Total deviations:** 2 auto-fixed (Rule 1: 1, Rule 3: 1)
**Impact on plan:** Both fixes preserved the planned contract surface and avoided scope expansion.

## Issues Encountered

- `node ./node_modules/@gsd-build/sdk/dist/cli.js query state.load` was unavailable because the SDK package is not installed under `node_modules`, and `gsd-sdk query` on PATH does not support the query subcommand in this checkout. Planning state updates were applied directly.
- `pnpm run verify` still fails in the known `@protostar/factory-cli` `runRealExecution` cancellation cluster documented in Plan 05-02. This is outside the 05-04 type-contract surface; targeted review/planning checks passed.
- `pnpm run factory` built successfully, then stopped at the expected workspace-trust escalation gate with exit code 2.

## Verification

- `pnpm --filter @protostar/planning test` passed.
- `pnpm --filter @protostar/review test` passed.
- `pnpm -w exec tsc --build packages/planning packages/execution packages/review` passed.
- `grep -cE '@protostar/review|@protostar/execution' packages/planning/src/repair-context.ts packages/planning/src/execution-run-result.ts` returned zero matches.
- `grep -cE 'node:fs|node:net|fetch\('` across the new contract modules returned zero matches.
- `pnpm run factory` built, then stopped at the expected workspace-trust gate.
- `pnpm run verify` failed only in the pre-existing factory-cli cancellation cluster noted above.

## Known Stubs

None found in files created or modified by this plan.

## Threat Flags

None beyond the planned threat mitigations. The plan introduced no new network endpoints, filesystem access, auth paths, or runtime trust-boundary storage.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 05-05 can author `RepairPlan` values against the now-pinned review contracts. Plan 05-07 can consume `MechanicalCheckResult`; Plan 05-08 can implement `ModelReviewer`; Plan 05-10 can mint `DeliveryAuthorization` and emit `ReviewLifecycleEvent`; Plan 05-13 can require the brand at the delivery boundary.

## Self-Check: PASSED

- Created files exist: planning leaf contracts, review contract modules, and their tests.
- Task commits exist in git history: `fd8c3b6`, `da07c6b`, `789e8bb`, `32c3068`, `8ebf53b`, `d2228f9`.
- Barrel exports are present for `repair-types`, `judge-types`, `delivery-authorization`, and `lifecycle-events`.
- `RepairContext` and `ExecutionRunResult` are exported from `@protostar/planning`.

---
*Phase: 05-review-repair-loop*
*Completed: 2026-04-28*
