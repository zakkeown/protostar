---
phase: 05-review-repair-loop
plan: 06
subsystem: execution
tags: [execution, adapter-contract, repair-context, retry-reason, typescript]

requires:
  - phase: 05-review-repair-loop
    provides: Planning-owned RepairContext neutral leaf from Plan 05-04
provides:
  - "AdapterContext.repairContext optional repair-iteration contract"
  - "AdapterEvidence retryReason taxonomy widened to include repair"
  - "TaskJournalEvent task-failed retryReason taxonomy widened to include repair"
affects: [05-08-judge-adapter, 05-10-run-review-repair-loop, 05-12-factory-cli-wiring]

tech-stack:
  added: []
  patterns:
    - "Execution imports RepairContext from @protostar/planning to avoid review/execution cycles"
    - "TDD type-contract pinning with @ts-expect-error negative literal-union coverage"

key-files:
  created:
    - .planning/phases/05-review-repair-loop/05-06-SUMMARY.md
  modified:
    - packages/execution/src/adapter-contract.ts
    - packages/execution/src/adapter-contract.test.ts
    - packages/execution/src/journal-types.ts

key-decisions:
  - "RepairContext is sourced from @protostar/planning, never @protostar/review, preserving the locked neutral-leaf cycle break."
  - "The execution package gained type-only repair awareness with no runtime behavior changes."

patterns-established:
  - "Adapter repair attempts are represented as structured context plus a distinct retryReason literal."

requirements-completed: [LOOP-03, LOOP-04]

duration: 3min
completed: 2026-04-28
---

# Phase 05 Plan 06: Adapter Context Repair Extension Summary

**Execution adapters now accept planning-owned repair context and can distinguish repair retries from transient and parse-reformat retries.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-28T00:40:42Z
- **Completed:** 2026-04-28T00:43:12Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments

- Added `repairContext?: RepairContext` to `AdapterContext`, imported from `@protostar/planning`.
- Widened `AdapterEvidence.retries[].retryReason` to include `"repair"`.
- Widened `TaskJournalEvent` `task-failed.retryReason` to include `"repair"`.
- Added TDD coverage for optional repair context, populated repair context, accepted `"repair"` retries, and rejected unknown retry reasons.

## Task Commits

1. **Task 1 RED: adapter repair context contract tests** - `8b4392e` (test)
2. **Task 1 GREEN: execution adapter repair context types** - `db059da` (feat)

## Files Created/Modified

- `packages/execution/src/adapter-contract.ts` - Adds the planning-owned repair context field and repair retry literal.
- `packages/execution/src/adapter-contract.test.ts` - Pins constructibility with and without repair context plus retry reason literals.
- `packages/execution/src/journal-types.ts` - Adds `"repair"` to `task-failed.retryReason`.
- `.planning/phases/05-review-repair-loop/05-06-SUMMARY.md` - Records execution results.

## Decisions Made

- Kept `@protostar/execution` pointed at `@protostar/planning` for `RepairContext`; no `@protostar/review` dependency or import was added.
- Kept the change type-only in execution; adapters and journals can now carry repair metadata without new runtime behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adjusted test helper for exact optional property typing**
- **Found during:** Task 1 (Extend AdapterContext + AdapterEvidence retry union)
- **Issue:** The RED test helper initially always wrote `repairContext: undefined`, which violates `exactOptionalPropertyTypes` once the optional field exists.
- **Fix:** Returned the base context without the property unless a repair context override is provided.
- **Files modified:** `packages/execution/src/adapter-contract.test.ts`
- **Verification:** `pnpm --filter @protostar/execution build`; `pnpm --filter @protostar/execution test`
- **Committed in:** `db059da`

---

**Total deviations:** 1 auto-fixed (Rule 1: 1)
**Impact on plan:** The fix kept the planned contract surface unchanged and made the type-level tests valid under the repo's strict compiler settings.

## Issues Encountered

- `node ./node_modules/@gsd-build/sdk/dist/cli.js query state.load` was unavailable because the SDK package is not installed under `node_modules`, and `gsd-sdk query` on PATH does not support the query subcommand in this checkout. Planning state updates were applied directly.
- A first verification attempt saw transient `packages/repo` test type errors from concurrent Wave 2 work. After that work landed, scoped execution build/test and the three-package cycle check passed.
- Root `pnpm run verify` is currently blocked by unrelated concurrent changes in `packages/lmstudio-adapter` and `apps/factory-cli`; scoped 05-06 verification passed.

## Verification

- `node -e "console.log(require('./packages/planning/package.json').name)"` returned `@protostar/planning`.
- `grep -l 'export interface RepairContext' packages/planning/src/*.ts` found `packages/planning/src/repair-context.ts`.
- `pnpm -w exec tsc --build packages/planning` passed before execution edits.
- Acceptance grep results: `repairContext` in adapter contract = 1; `from "@protostar/planning"` = 1; `from "@protostar/review"` = 0; `"repair"` in adapter contract = 1; `"repair"` in journal types = 1; `@protostar/review` in execution package.json = 0.
- `pnpm -w exec tsc --build packages/planning packages/execution packages/review` passed.
- `pnpm --filter @protostar/execution build` passed.
- `pnpm --filter @protostar/execution test` passed: 55 tests, 10 suites.
- `pnpm run verify` failed outside this plan's ownership in `packages/lmstudio-adapter/src/coder-adapter.ts` and `apps/factory-cli/src/run-real-execution.test.ts`.

## Known Stubs

None found in files created or modified by this plan.

## Threat Flags

None beyond the planned threat mitigations. The plan introduced no new network endpoints, filesystem access, auth paths, or runtime trust-boundary storage.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 05-10 can attach `RepairContext` to adapter calls during repair iterations and emit `"repair"` retry evidence without reopening execution contracts. Wave 2 adapters can compile against the stable type shape.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/05-review-repair-loop/05-06-SUMMARY.md`.
- Task commits exist in git history: `8b4392e`, `db059da`.
- `AdapterContext.repairContext` imports from `@protostar/planning`; no execution import from `@protostar/review` exists.
- Execution build/test and the planning/execution/review cycle check passed after the task commits.

---
*Phase: 05-review-repair-loop*
*Completed: 2026-04-28*
