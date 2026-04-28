---
phase: 05-review-repair-loop
plan: 05
subsystem: repair
tags: [repair, review, deterministic-transform, typescript, node-test]

requires:
  - phase: 05-review-repair-loop
    provides: Review-owned RepairPlan, ReviewFinding, ReviewGate, ModelReviewResult, and JudgeCritique contracts from Plan 05-04
provides:
  - "Pure computeRepairSubgraph helper for topologically ordered repair reruns"
  - "Pure synthesizeRepairPlan fan-in from mechanical findings and model critiques"
  - "@protostar/repair barrel exports for Plan 05-10 loop consumption"
affects: [05-10-review-repair-loop, 05-08-model-reviewer, 05-07-mechanical-checks]

tech-stack:
  added: []
  patterns:
    - "Pure deterministic transform modules with no filesystem, network, clock, or randomness access"
    - "Repair tasks materialized in admitted plan task order"

key-files:
  created:
    - packages/repair/src/compute-repair-subgraph.ts
    - packages/repair/src/compute-repair-subgraph.test.ts
    - packages/repair/src/synthesize-repair-plan.ts
    - packages/repair/src/synthesize-repair-plan.test.ts
  modified:
    - packages/repair/src/index.ts

key-decisions:
  - "computeRepairSubgraph returns repair seed tasks plus all downstream dependents in admitted plan order."
  - "synthesizeRepairPlan groups mechanical findings by ReviewFinding.repairTaskId and model critiques by JudgeCritique.taskRefs."
  - "RepairTask ordering follows admitted plan task order rather than lexical sorting."

patterns-established:
  - "Plan-order materialization for deterministic repair transforms."
  - "EmptyRepairSynthesisError marks caller bugs where no repair evidence was supplied."

requirements-completed: [LOOP-03, LOOP-04]

duration: 7min
completed: 2026-04-28
---

# Phase 05 Plan 05: Synthesize Repair Plan Summary

**Pure repair plan authoring now turns review findings and judge critiques into deterministic RepairPlan values, with dependent subgraph computation pinned by Q-03 examples.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-28T00:40:53Z
- **Completed:** 2026-04-28T00:47:39Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `computeRepairSubgraph`, including Q-03 A→B→C examples, diamond traversal, empty-input behavior, unknown-id errors, and topological-order coverage.
- Added `synthesizeRepairPlan`, grouping mechanical findings by `repairTaskId` and model critiques by `taskRefs`.
- Replaced the repair package skeleton barrel with exports for both new pure-transform modules.

## Task Commits

Each task was committed atomically where the shared branch allowed:

1. **Task 1 RED: repair subgraph tests** - `5ed5f9a` (test)
2. **Task 1 GREEN: repair subgraph implementation** - `7ba6a24` (feat)
3. **Task 2 GREEN: repair synthesis implementation + barrel exports** - `60c1b05` (feat)

_Note: Task 2 RED tests were authored during this execution, but the shared branch advanced and the test file was committed by an intervening docs commit (`e615864`) before a local RED commit could be isolated. The implementation commit consumes those tests, and they pass._

## Files Created/Modified

- `packages/repair/src/compute-repair-subgraph.ts` - Pure dependent-subgraph helper with `UnknownRepairTaskError`.
- `packages/repair/src/compute-repair-subgraph.test.ts` - Six tests for Q-03 examples, diamond traversal, empty input, unknown ids, and topo order.
- `packages/repair/src/synthesize-repair-plan.ts` - Pure repair synthesis fan-in with `EmptyRepairSynthesisError`.
- `packages/repair/src/synthesize-repair-plan.test.ts` - Seven tests for mechanical/model grouping, multi-task critiques, dependent ids, determinism, and empty synthesis.
- `packages/repair/src/index.ts` - Barrel exports for the two repair transform modules.

## Decisions Made

- Preserved admitted plan task order for `RepairTask[]` output so downstream execution receives deterministic task sequencing.
- Kept model-only repair tasks valid with `mechanicalCritiques: []`; the critique source still determines why the task is targeted.
- Treated repair evidence that references no admitted plan task as empty synthesis and threw `EmptyRepairSynthesisError`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Build-before-test requirement for repair tests**
- **Found during:** Task 1 and Task 2 verification
- **Issue:** `@protostar/repair` test script runs compiled `dist/**/*.test.js` and does not build first, so fresh source tests were invisible or stale until `tsc -b` ran.
- **Fix:** Used `pnpm --filter @protostar/repair build && pnpm --filter @protostar/repair test` as the verification gate.
- **Files modified:** None.
- **Verification:** Build plus package tests passed with 13 tests.
- **Committed in:** N/A - process deviation only.

**2. [Rule 3 - Blocking] Shared branch advanced during Task 2 RED**
- **Found during:** Task 2 commit
- **Issue:** Parallel workers advanced `main` and committed `packages/repair/src/synthesize-repair-plan.test.ts` in `e615864` before the local RED commit could be isolated.
- **Fix:** Continued from the current branch tip, kept implementation scoped to `packages/repair`, and verified the synthesis tests against the implementation.
- **Files modified:** `packages/repair/src/synthesize-repair-plan.ts`, `packages/repair/src/index.ts`
- **Verification:** `pnpm --filter @protostar/repair build && pnpm --filter @protostar/repair test`
- **Committed in:** `60c1b05`

---

**Total deviations:** 2 auto-handled (Rule 3: 2)
**Impact on plan:** Both were execution-environment issues. The shipped repair package behavior matches the plan.

## Issues Encountered

- `node ./node_modules/@gsd-build/sdk/dist/cli.js query state.load` is unavailable in this checkout because `@gsd-build/sdk` is not installed under `node_modules`.
- Existing shared planning files were modified by other workers during execution, so this plan's metadata commit is limited to `05-05-SUMMARY.md` to avoid capturing unrelated changes.

## Verification

- `pnpm --filter @protostar/repair build && pnpm --filter @protostar/repair test` passed: 13 tests.
- `pnpm run verify` passed from the current shared branch.
- `grep -c 'export function computeRepairSubgraph' packages/repair/src/compute-repair-subgraph.ts` returned `1`.
- `grep -c 'UnknownRepairTaskError' packages/repair/src/compute-repair-subgraph.ts` returned `3`.
- `grep -cE 'node:fs|node:net|fetch\(' packages/repair/src/compute-repair-subgraph.ts` returned `0`.
- `grep -c 'export function synthesizeRepairPlan' packages/repair/src/synthesize-repair-plan.ts` returned `1`.
- `grep -cE 'Date\.now|Math\.random|crypto\.' packages/repair/src/synthesize-repair-plan.ts` returned `0`.
- `grep -cE 'node:fs|node:net|fetch\(' packages/repair/src/synthesize-repair-plan.ts` returned `0`.
- `grep -c 'export \* from "./synthesize-repair-plan' packages/repair/src/index.ts` returned `1`.
- `grep -c 'export \* from "./compute-repair-subgraph' packages/repair/src/index.ts` returned `1`.

## Known Stubs

None. The only empty array detected by the stub scan is a test helper default parameter.

## Threat Flags

None beyond the planned deterministic-transform threat mitigations. This plan introduced no network endpoints, filesystem access, auth paths, subprocesses, or trust-boundary storage.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 05-10 can call `computeRepairSubgraph` before re-execution and `synthesizeRepairPlan` after any non-pass review iteration. Plan 05-07 and Plan 05-08 can supply the mechanical and model evidence consumed by this package.

## Self-Check: PASSED

- Created files exist: `compute-repair-subgraph.ts`, `compute-repair-subgraph.test.ts`, `synthesize-repair-plan.ts`, `synthesize-repair-plan.test.ts`.
- Task commits exist in git history: `5ed5f9a`, `7ba6a24`, `60c1b05`.
- Repair package barrel exports both new modules.
- Package tests and repo verification passed.

---
*Phase: 05-review-repair-loop*
*Completed: 2026-04-28*
