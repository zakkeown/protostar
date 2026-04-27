---
phase: 03-repo-runtime-sandbox
plan: 12
subsystem: testing
tags: [admission-e2e, repo-runtime, contract-tests, evidence-shapes]

requires:
  - phase: 03-repo-runtime-sandbox
    provides: [applyChangeSet, dirtyWorktreeStatus, auditSymlinks, runCommand, repo-runtime admission schema]
  - phase: 02-authority-governance-kernel
    provides: [authority internal test builders, admission-e2e contract pattern]
provides:
  - "Five repo-runtime admission-e2e contract tests pinning Phase 3 evidence shapes"
  - "Schema-backed repo-runtime decision/evidence helper for admission-e2e tests"
affects: [repo-runtime, factory-cli, admission-e2e, review-repair-loop]

tech-stack:
  added: []
  patterns: [producer-backed evidence-shape contract tests, schema-required evidence helper]

key-files:
  created:
    - packages/admission-e2e/src/_helpers/repo-runtime-evidence.ts
    - packages/admission-e2e/src/repo-runtime-hash-mismatch-refusal.contract.test.ts
    - packages/admission-e2e/src/repo-runtime-patch-apply-best-effort.contract.test.ts
    - packages/admission-e2e/src/repo-runtime-dirty-worktree-refusal.contract.test.ts
    - packages/admission-e2e/src/repo-runtime-symlink-refusal.contract.test.ts
    - packages/admission-e2e/src/repo-runtime-subprocess-allowlist-refusal.contract.test.ts
  modified: []

key-decisions:
  - "Kept admission-e2e dependency surface unchanged; no direct diff dependency was added."
  - "Symlink producer result asserts ok:false, while admission evidence stays aligned to the closed schema's offendingPaths-only shape."

patterns-established:
  - "Repo-runtime admission-e2e tests build sacrificial repos and assert both producer output and schema-shaped admission evidence."

requirements-completed: [REPO-03, REPO-04, REPO-05, REPO-06]

duration: 5min
completed: 2026-04-27
---

# Phase 03 Plan 12: Admission E2E Contract Suite Summary

**Admission-e2e now pins Phase 3 repo-runtime evidence shapes for patch application, dirty worktrees, symlinks, and subprocess refusals.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-27T21:31:00Z
- **Completed:** 2026-04-27T21:35:57Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added five `repo-runtime-*.contract.test.ts` files in `@protostar/admission-e2e`.
- Added a schema-backed helper that verifies repo-runtime admission decisions carry the required evidence keys and no unknown evidence fields.
- Covered hash-mismatch, 5-patch best-effort partial application, dirty-worktree refusal, symlink refusal, and subprocess allowlist/argv refusal paths using real repo-runtime producers.
- Confirmed `@protostar/admission-e2e` now has 60 passing tests and exactly five repo-runtime contract files.

## Task Commits

Each task was committed atomically:

1. **Task 1: Hash-mismatch + best-effort patch contract tests** - `bca4d8a` (test)
2. **Task 2: Dirty-worktree + symlink refusal contract tests** - `26f7336` (test)
3. **Task 3: Subprocess-allowlist refusal contract test** - `3d8043d` (test)

**Plan metadata:** pending final docs commit.

## Files Created/Modified

- `packages/admission-e2e/src/_helpers/repo-runtime-evidence.ts` - 121 lines; loads the repo-runtime admission schema export and checks required/allowed evidence shape.
- `packages/admission-e2e/src/repo-runtime-hash-mismatch-refusal.contract.test.ts` - 74 lines; asserts `skipped-hash-mismatch` evidence and unchanged file content.
- `packages/admission-e2e/src/repo-runtime-patch-apply-best-effort.contract.test.ts` - 97 lines; asserts five patch results with patch 3 skipped and files 1, 2, 4, 5 mutated.
- `packages/admission-e2e/src/repo-runtime-dirty-worktree-refusal.contract.test.ts` - 37 lines; asserts dirty tracked-file evidence from `dirtyWorktreeStatus`.
- `packages/admission-e2e/src/repo-runtime-symlink-refusal.contract.test.ts` - 38 lines; asserts symlink audit producer output and schema-shaped `symlinkRefusal` evidence.
- `packages/admission-e2e/src/repo-runtime-subprocess-allowlist-refusal.contract.test.ts` - 89 lines; asserts `command-not-allowlisted` for `cargo` and `argv-violation` for allowlisted `node`.

## Decisions Made

- Used `buildSacrificialRepo` in every repo-runtime contract file, keeping tests producer-backed instead of hand-rolling evidence.
- Used authority internal test builders for authorized workspace/subprocess ops where repo-runtime functions require branded inputs.
- Wrote small unified-diff fixture strings in admission-e2e instead of adding `diff` as a direct dependency.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Kept symlink evidence aligned to the committed schema**
- **Found during:** Task 2 (Dirty-worktree + symlink refusal contract tests)
- **Issue:** The plan text mentioned `symlinkRefusal: { ok, offendingPaths[] }`, but `repo-runtime-admission-decision.schema.json` is closed and only permits `symlinkRefusal.offendingPaths`.
- **Fix:** Asserted `auditSymlinks()` returns `{ ok: false, offendingPaths: ["link.txt"] }`, then projected only `{ offendingPaths }` into admission evidence.
- **Files modified:** `packages/admission-e2e/src/repo-runtime-symlink-refusal.contract.test.ts`
- **Verification:** `pnpm --filter @protostar/admission-e2e test` passed.
- **Committed in:** `26f7336`

---

**Total deviations:** 1 auto-fixed (Rule 1).
**Impact on plan:** The contract now matches the actual closed schema while still proving the producer refusal outcome.

## Issues Encountered

None.

## Known Stubs

None. Stub-pattern scan found no TODO/FIXME/placeholders or hardcoded empty UI-style data in the new files.

## Threat Flags

None. The new surface is test-only admission-e2e coverage and introduces no production network, auth, file-access, or schema trust boundary.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm --filter @protostar/admission-e2e test` - passed, 60/60 tests and 25/25 suites.
- `find packages/admission-e2e/src -maxdepth 1 -name 'repo-runtime-*.contract.test.ts' | wc -l | tr -d ' '` - returned `5`.
- `pnpm run verify` - passed.

## Next Phase Readiness

Phase 3 now has admission-e2e coverage for the repo-runtime evidence shapes emitted by its core refusal and partial-application paths. Plan 13 can proceed to the fresh-clone Dogpile SDK pin/checkpoint with the Phase 3 contract net in place.

## Self-Check: PASSED

- Found summary file at `.planning/phases/03-repo-runtime-sandbox/03-12-admission-e2e-contract-suite-SUMMARY.md`.
- Found all six created admission-e2e files.
- Found task commits `bca4d8a`, `26f7336`, and `3d8043d` in git history.
- No tracked deletions were introduced by task commits.

---
*Phase: 03-repo-runtime-sandbox*
*Completed: 2026-04-27*
