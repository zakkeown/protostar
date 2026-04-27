---
phase: 03-repo-runtime-sandbox
plan: 07
subsystem: repo-runtime
tags: [tdd, diff, patch-apply, sha256, fs-adapter]

requires:
  - phase: 03-repo-runtime-sandbox
    provides: [diff@9.0.0 dependency, sacrificial repo fixture, FS adapter]
provides:
  - "applyChangeSet patch pipeline using diff.parsePatch/applyPatch"
  - "SHA-256 pre-image gate before workspace mutation"
  - "Best-effort per-file ApplyResult evidence for applied, hash mismatch, and skipped-error outcomes"
affects: [execution-engine, review-repair-loop, admission-e2e]

tech-stack:
  added: []
  patterns: [sequential best-effort patch loop, pre-image hash gate, binary-marker refusal]

key-files:
  created:
    - packages/repo/src/apply-change-set.ts
    - packages/repo/src/apply-change-set.test.ts
  modified:
    - packages/repo/src/index.ts

key-decisions:
  - "Binary patch refusal scans both raw diff text and parsed hunk lines so parsePatch no-structure output still refuses binary before generic parse errors."
  - "Kept apply-change-set tests on the repo-local AuthorizedWorkspaceOp shape to preserve the Plan 05 authority/repo cycle workaround."

patterns-established:
  - "Patch application reads bytes, hashes, parses, checks binary markers, applies hunks, then writes through the FS adapter."
  - "Per-file failures return structured evidence and do not stop later patches."

requirements-completed: [REPO-05]

duration: 3min
completed: 2026-04-27
---

# Phase 03 Plan 07: Apply Change Set Summary

**`@protostar/repo` now applies unified text patches through a SHA-256 pre-image gate with ordered best-effort evidence.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-27T20:51:38Z
- **Completed:** 2026-04-27T20:54:40Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `applyChangeSet()` with the required read → hash gate → parse → binary check → apply → write pipeline.
- Added eight apply-change-set tests covering happy single, happy five-patch, hash mismatch, best-effort partial, hunk-fit failure, binary marker, parse error, and read IO error.
- Preserved input order and sequential execution so later patches still run after earlier per-file failures.
- Exported `applyChangeSet`, `PatchRequest`, `ApplyResult`, `ApplyStatus`, and `ApplyError` from `@protostar/repo`.

## Task Commits

Each task was committed atomically:

1. **Task 1: RED apply-change-set contract suite** - `aba2bf8` (test)
2. **Task 2: GREEN applyChangeSet pipeline** - `3ab2a91` (feat)

**Plan metadata:** pending final docs commit.

## TDD Gate Compliance

- **RED:** `pnpm --filter @protostar/repo build` failed with `TS2307: Cannot find module './apply-change-set.js'`.
- **GREEN:** `pnpm --filter @protostar/repo test` passed with 52/52 package tests, including 8/8 apply-change-set tests.
- **REFACTOR:** No separate refactor commit was needed; the implementation landed with a private `applyOnePatch` helper for readability.

## Files Created/Modified

- `packages/repo/src/apply-change-set.ts` - Patch request/result contract and sequential diff-based apply pipeline.
- `packages/repo/src/apply-change-set.test.ts` - Eight-test TDD suite using sacrificial repos and FS adapter reads.
- `packages/repo/src/index.ts` - Root exports for the apply-change-set contract.

## Decisions Made

- Used `diff.parsePatch` / `diff.applyPatch` from `diff@9.0.0`; there are no `isomorphic-git.apply` references.
- Binary detection checks raw patch text first, then parsed hunk lines. This covers both `parsePatch` preserving the marker and returning no structured patch for binary-only text.
- Treated parsed patches with no hunks as `parse-error` after the binary-marker check, preventing garbage patch text from becoming a no-op success.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Preserved repo-local authorized op shape in tests**
- **Found during:** Task 1 (RED apply-change-set contract suite)
- **Issue:** The plan asked tests to mint ops through `@protostar/authority`, but Plan 05 documented that direct authority imports pull source across the repo package's TypeScript root boundary.
- **Fix:** Used the same frozen `AuthorizedWorkspaceOp` data shape as `fs-adapter.test.ts`, keeping the boundary contract while avoiding the existing project-reference cycle.
- **Files modified:** `packages/repo/src/apply-change-set.test.ts`
- **Verification:** RED failed only because `apply-change-set.ts` was missing; GREEN tests passed.
- **Committed in:** `aba2bf8`

**2. [Rule 1 - Bug] Rejected no-hunk parse output instead of applying a no-op**
- **Found during:** Task 2 (GREEN applyChangeSet pipeline)
- **Issue:** `diff.parsePatch("not a patch\n")` returned a no-hunk structure, and `applyPatch` treated it as an unchanged successful apply.
- **Fix:** Added an explicit no-hunk `parse-error` guard after binary-marker detection.
- **Files modified:** `packages/repo/src/apply-change-set.ts`
- **Verification:** `pnpm --filter @protostar/repo test` passed with the parse-error case green.
- **Committed in:** `3ab2a91`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug).
**Impact on plan:** The behavior contract is stronger and the authority boundary workaround matches the established repo pattern.

## Issues Encountered

- `pnpm run factory` built successfully, then stopped at the existing workspace-trust gate with exit code 2: `workspace-trust gate blocked: workspace is not trusted; escalation required before factory can proceed`.

## Known Stubs

None. Stub-pattern scan found only the internal result accumulator in `apply-change-set.ts`, not placeholder data.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm --filter @protostar/repo build` - RED failed before implementation with missing `./apply-change-set.js`.
- `pnpm --filter @protostar/repo test` - passed, 52/52 package tests including 8/8 apply-change-set tests.
- `pnpm run verify` - passed.
- `pnpm run factory` - build passed, then stopped at the expected workspace-trust escalation gate.
- `rg -c "isomorphic-git\\.apply|isoGit\\.apply" packages/repo/src/apply-change-set.ts` - 0 matches.
- `rg -c "parsePatch|applyPatch" packages/repo/src/apply-change-set.ts` - 4 matches.

## Next Phase Readiness

Phase 4 execution and Phase 5 review/repair can consume structured per-file patch evidence. Phase 3 Plan 12 can now add higher-level admission-e2e coverage for hash-mismatch and best-effort partial outcomes.

## Self-Check: PASSED

- Found summary file at `.planning/phases/03-repo-runtime-sandbox/03-07-apply-change-set-SUMMARY.md`.
- Found created apply-change-set source and test files under `packages/repo/src/`.
- Found task commits `aba2bf8` and `3ab2a91` in git history.
- No tracked deletions were introduced by either task commit.

---
*Phase: 03-repo-runtime-sandbox*
*Completed: 2026-04-27*
