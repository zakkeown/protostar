---
phase: 05-review-repair-loop
plan: 10
subsystem: review
tags: [review-loop, repair-loop, persistence, delivery-authorization, fs-adapter]

requires:
  - phase: 05-review-repair-loop
    provides: "Review contracts, repair transforms, execution repair context, mechanical checks, and judge adapter seams from Plans 05-04 through 05-08"
provides:
  - "runReviewRepairLoop strict mechanical-to-model serial control loop"
  - "Injected ReviewPersistence implementation for iteration, decision, block, and lifecycle artifacts"
  - "loadDeliveryAuthorization injected-reader helper for strict pass/pass brand re-minting"
affects: [05-12-factory-cli-wiring, 07-delivery, 09-operator-surface]

tech-stack:
  added: []
  patterns:
    - "Review package consumes durable writes only through injected persistence/FsAdapter contracts"
    - "Repair transforms are structurally typed so review can call repair without a project-reference cycle"
    - "DeliveryAuthorization is minted only after review-decision.json persistence succeeds"

key-files:
  created:
    - packages/review/src/run-review-repair-loop.ts
    - packages/review/src/run-review-repair-loop.test.ts
    - packages/review/src/persist-iteration.ts
    - packages/review/src/persist-iteration.test.ts
    - packages/review/src/load-delivery-authorization.ts
    - packages/review/src/load-delivery-authorization.test.ts
  modified:
    - packages/review/src/index.ts
    - packages/review/package.json
    - packages/review/tsconfig.json
    - packages/repair/src/synthesize-repair-plan.ts
    - packages/repair/src/synthesize-repair-plan.test.ts
    - packages/repair/package.json
    - packages/repair/tsconfig.json
    - packages/repo/src/fs-adapter.ts
    - packages/repo/src/index.ts
    - pnpm-lock.yaml

key-decisions:
  - "runReviewRepairLoop reads maxRepairLoops only from confirmedIntent.capabilityEnvelope.budget.maxRepairLoops and throws when absent/invalid."
  - "ReviewPersistence appends review.jsonl lifecycle events through FsAdapter.appendFile + fsync before later durable writes."
  - "Repair package source no longer imports @protostar/review; its pure transforms are generic structural contracts to avoid a review↔repair project-reference cycle."
  - "loadDeliveryAuthorization rejects any non-pass mechanical or model value before re-minting the DeliveryAuthorization brand."

patterns-established:
  - "Per-iteration review artifacts live under runs/{runId}/review/iter-{N}/."
  - "Terminal review artifacts are review-decision.json on approval and review-block.json on block."
  - "Review package source remains free of node:fs, node:net, fetch, and spawn."

requirements-completed: [LOOP-01, LOOP-02, LOOP-03, LOOP-04, LOOP-05, LOOP-06]

duration: 15min
completed: 2026-04-28
---

# Phase 05 Plan 10: Run Review Repair Loop Summary

**The central review control loop now serializes mechanical then model review, synthesizes bounded repair plans, persists review evidence, and mints delivery authorization only after pass/pass approval is durable.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-28T01:12:21Z
- **Completed:** 2026-04-28T01:27:33Z
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments

- Added `runReviewRepairLoop` with strict mechanical-before-model ordering, envelope-sourced repair-loop budget, repair subgraph computation, repair-plan synthesis, injected re-execution, lifecycle events, terminal block/decision artifacts, and post-decision delivery brand minting.
- Added `createReviewPersistence` to persist `iter-{N}` mechanical/model/repair-plan files, `review.jsonl`, `review-decision.json`, and `review-block.json` through injected `FsAdapter`.
- Added `loadDeliveryAuthorization` so downstream phases can re-mint `DeliveryAuthorization` from durable strict pass/pass decisions without review importing filesystem APIs.

## Task Commits

1. **Task 1: runReviewRepairLoop core** - `3fd2821` (feat)
2. **Task 2: ReviewPersistence concrete adapter** - `04bef73` (feat)
3. **Task 3: loadDeliveryAuthorization helper** - `23b81f2` (feat)

## Files Created/Modified

- `packages/review/src/run-review-repair-loop.ts` - Main strict mechanical/model review-repair loop and injected executor/persistence contracts.
- `packages/review/src/persist-iteration.ts` - FsAdapter-backed persistence for review iteration, decision, block, and lifecycle artifacts.
- `packages/review/src/load-delivery-authorization.ts` - Injected-reader strict pass/pass brand re-mint helper.
- `packages/review/src/index.ts` - Barrel exports for the new loop, persistence, and loader modules; deprecated legacy loop remains callable.
- `packages/repair/src/synthesize-repair-plan.ts` - Generic structural repair transform types to avoid a review/repair project-reference cycle.
- `packages/repo/src/fs-adapter.ts` - Added the injected object-shaped `FsAdapter` contract needed by review persistence.
- Test files beside each new module cover the planned behavior.

## Decisions Made

- Kept `runMechanicalReviewExecutionLoop` callable and marked `@deprecated`; it remains the compatibility path while new callers use `runReviewRepairLoop`.
- Did not add a review tsconfig reference to repair. Instead, repair dropped its source dependency on review types so review can import the repair package without TS6202 cycles.
- Persistence validates review-block reason discriminators but otherwise writes caller-supplied artifacts; the loop owns terminal artifact shape construction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed repair source dependency on review to avoid project-reference cycle**
- **Found during:** Task 1 (runReviewRepairLoop core)
- **Issue:** The planned `@protostar/review` import from `@protostar/repair` would create a review↔repair TypeScript project-reference cycle because repair still imported review types.
- **Fix:** Made `@protostar/repair` transform inputs generic structural contracts and removed its review dependency/reference. Review can now call `synthesizeRepairPlan`/`computeRepairSubgraph` without adding a review→repair project reference.
- **Files modified:** `packages/repair/src/synthesize-repair-plan.ts`, `packages/repair/src/synthesize-repair-plan.test.ts`, `packages/repair/package.json`, `packages/repair/tsconfig.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter @protostar/repair build`, `pnpm --filter @protostar/repair test`, `pnpm -w exec tsc --build packages/planning packages/execution packages/review`
- **Committed in:** `3fd2821`

**2. [Rule 2 - Missing Critical] Added FsAdapter append/rename/fsync contract for review persistence**
- **Found during:** Task 2 (ReviewPersistence concrete adapter)
- **Issue:** The repo package exposed function-style read/write helpers but no object-shaped adapter with `appendFile`, `rename`, or `fsync` for review persistence and JSONL ordering.
- **Fix:** Added `FsAdapter` as a type-only repo contract and consumed it from `createReviewPersistence`; concrete filesystem ownership remains outside review.
- **Files modified:** `packages/repo/src/fs-adapter.ts`, `packages/repo/src/index.ts`, `packages/review/src/persist-iteration.ts`
- **Verification:** `pnpm --filter @protostar/review test`; source authority grep returned no review fs/network/subprocess imports.
- **Committed in:** `04bef73`

---

**Total deviations:** 2 auto-fixed (Rule 2: 1, Rule 3: 1)  
**Impact on plan:** Both fixes were necessary to preserve the authority boundary and cycle-free build. No unrelated user changes were reverted or staged.

## Issues Encountered

- `node ./node_modules/@gsd-build/sdk/dist/cli.js query state.load` remains unavailable in this checkout; prior Phase 5 summaries report the same SDK absence.
- `pnpm run verify` still fails in the pre-existing `apps/factory-cli` `runRealExecution` cancellation cluster. This plan's scoped review/repair/typecheck verification passed before that unrelated root failure.
- `pnpm run factory` built successfully and then stopped at the expected workspace-trust gate with exit code 2.

## Verification

- `pnpm --filter @protostar/review test` passed: 43 tests.
- `pnpm --filter @protostar/repair test` passed: 13 tests.
- `pnpm -w exec tsc --build packages/planning packages/execution packages/review` passed.
- `rg -n 'node:fs|node:net|fetch\\(|spawn\\(' packages/review/src -g '*.ts' -g '!*.test.ts'` returned no matches.
- Task acceptance greps passed for `runReviewRepairLoop`, `createReviewPersistence`, `loadDeliveryAuthorization`, strict pass/pass checks, `@deprecated`, and `maxRepairLoops`.
- `pnpm run verify` failed only in the known `apps/factory-cli` `runRealExecution` cancellation cluster.
- `pnpm run factory` built, then stopped at the expected workspace-trust gate.

## Known Stubs

None. Stub-pattern scan hits were implementation accumulator/guard code only (`[]` arrays and null checks), not user-visible placeholders or unwired data.

## Threat Flags

None beyond the planned review artifact/filesystem boundary. The plan added durable artifact persistence only through injected contracts and introduced no new network endpoints, auth paths, or direct filesystem imports in review source.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 05-12 can wire concrete factory-cli persistence, mechanical checker, model reviewer, and executor services into `runReviewRepairLoop`. Phase 7 can consume `DeliveryAuthorization`, including re-minting from `review-decision.json` via `loadDeliveryAuthorization`.

## Self-Check: PASSED

- Created files exist: `run-review-repair-loop.ts`, `persist-iteration.ts`, `load-delivery-authorization.ts`, and their tests.
- Task commits exist in git history: `3fd2821`, `04bef73`, `23b81f2`.
- Review package exports all new modules.
- The unrelated untracked `.protostar/refusals.jsonl` and `.planning/phases/07-delivery/` were left untouched.

---
*Phase: 05-review-repair-loop*
*Completed: 2026-04-28*
