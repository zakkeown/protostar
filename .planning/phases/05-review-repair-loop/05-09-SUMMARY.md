---
phase: 05-review-repair-loop
plan: 09
subsystem: repo-runtime
tags:
  - apply-change-set
  - cosmetic-tweak
  - atomic-refusal
  - repair-loop
requires:
  - phase: 03-repo-runtime-sandbox
    provides: applyChangeSet patch pipeline and per-file ApplyResult evidence
  - phase: 05-review-repair-loop
    provides: Q-08 dual-defense decision for cosmetic-tweak file caps
provides:
  - applyChangeSet archetype metadata input
  - cosmetic-tweak multi-file pre-write refusal
  - cosmetic-archetype-multifile evidence with sorted touchedFiles
affects:
  - packages/repo
  - phase-05-mechanical-checks-run-level-cosmetic-gate
tech-stack:
  added: []
  patterns:
    - pre-write change-set admission gate before per-file patch loop
key-files:
  created:
    - .planning/phases/05-review-repair-loop/05-09-SUMMARY.md
  modified:
    - packages/repo/src/apply-change-set.ts
    - packages/repo/src/apply-change-set.test.ts
key-decisions:
  - "Kept applyChangeSet patch arrays as the first argument and added archetype metadata as an optional second argument to preserve existing caller and mock ergonomics."
  - "Returned one refusal result for the first patch path when a cosmetic-tweak change set touches multiple distinct paths, with sorted touchedFiles evidence."
patterns-established:
  - "Archetype gates run before hash checks, patch parsing, and writes."
requirements-completed:
  - LOOP-01
duration: 4m
completed: 2026-04-28T00:44:54Z
---

# Phase 05 Plan 09: Apply Change Set Cosmetic Gate Summary

**applyChangeSet now refuses multi-file cosmetic-tweak change sets before any workspace write while preserving Phase 3 patch behavior.**

## Performance

- **Duration:** 4m
- **Started:** 2026-04-28T00:40:46Z
- **Completed:** 2026-04-28T00:44:54Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments

- Added optional `ApplyChangeSetInput` archetype metadata for `applyChangeSet`.
- Added `cosmetic-archetype-multifile` to the apply error taxonomy.
- Enforced the cosmetic-tweak distinct-path gate before the sequential per-file patch loop.
- Expanded `apply-change-set` tests from 8 to 14 cases, covering all six requested cosmetic-gate behaviors.

## Task Commits

1. **Task 1 RED: cosmetic apply-change-set gate coverage** - `d252da2` (test)
2. **Task 1 GREEN: cosmetic apply-change-set gate** - `b100283` (feat)
3. **Task 1 compatibility fix: preserve array call shape** - `adbbaac` (fix)

## Files Created/Modified

- `packages/repo/src/apply-change-set.ts` - Added optional archetype metadata, refusal evidence, and pre-write cosmetic multi-file gate.
- `packages/repo/src/apply-change-set.test.ts` - Added six tests for cosmetic one-file, multi-file refusal, same-file multi-hunk, non-cosmetic multi-file, omitted archetype, and atomic pre-write refusal.
- `.planning/phases/05-review-repair-loop/05-09-SUMMARY.md` - Plan execution record.

## Decisions Made

- Kept `applyChangeSet(patches, input?)` instead of an object-only call shape so existing callers, test doubles, and Phase 3 behavior remain source-compatible.
- Represented the gate as a single `ApplyResult` refusal for the first patch path because the existing function returns per-file result arrays rather than a whole-change-set result object.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Preserved applyChangeSet mock compatibility after adding archetype metadata**
- **Found during:** Task 1 root verification
- **Issue:** The initial object-or-array signature made factory-cli test doubles see the parameter as `PatchRequest[] | ApplyChangeSetInput`, breaking existing array indexing in typecheck.
- **Fix:** Changed the API to keep patch arrays as the first parameter and pass archetype metadata as an optional second parameter.
- **Files modified:** `packages/repo/src/apply-change-set.ts`, `packages/repo/src/apply-change-set.test.ts`
- **Verification:** `pnpm --filter @protostar/repo test` passed; `pnpm run typecheck` passed.
- **Committed in:** `adbbaac`

---

**Total deviations:** 1 auto-fixed (Rule 1).
**Impact on plan:** The gate semantics stayed the same and compatibility improved; no scope expansion outside the apply-change-set surface.

## Issues Encountered

- `node ./node_modules/@gsd-build/sdk/dist/cli.js query state.load` was unavailable because the SDK package is not installed in local `node_modules`.
- `pnpm run verify` is blocked by unrelated shared-wave work: `packages/lmstudio-adapter/src/create-judge-adapter.test.ts` imports missing `./create-judge-adapter.js` and references judge config fields that are not wired yet.

## Verification

- `pnpm --filter @protostar/repo test` passed with 100 tests.
- `pnpm run typecheck` passed.
- `grep -c 'cosmetic-archetype-multifile' packages/repo/src/apply-change-set.ts` returned `2`.
- `grep -c 'archetype' packages/repo/src/apply-change-set.ts` returned `4`.
- `pnpm run verify` failed on unrelated lmstudio-adapter judge-adapter WIP noted above.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None found in files created or modified by this plan. The empty array/object matches are internal defaults or accumulators, not placeholder data.

## Threat Flags

None. This plan tightened an existing workspace mutation path and introduced no new endpoint, auth path, schema boundary, or file access surface.

## Next Phase Readiness

Plan 05-07 can rely on this per-task first defense while implementing the run-level `git diff --name-only` cosmetic check as the second defense.

## Self-Check: PASSED

- Found summary file: `.planning/phases/05-review-repair-loop/05-09-SUMMARY.md`
- Found task commits: `d252da2`, `b100283`, `adbbaac`
- Verified package tests: `pnpm --filter @protostar/repo test`
- Verified root typecheck: `pnpm run typecheck`

---
*Phase: 05-review-repair-loop*
*Completed: 2026-04-28*
