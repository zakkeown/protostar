---
phase: 03-repo-runtime-sandbox
plan: 04
subsystem: repo-runtime
tags: [isomorphic-git, test-fixtures, tmpdir, subpath-export]

requires:
  - phase: 03-repo-runtime-sandbox
    provides: [isomorphic-git dependency, repo-runtime dependency posture]
provides:
  - "buildSacrificialRepo fixture builder for Phase 3 repo contract tests"
  - "@protostar/repo/internal/test-fixtures private subpath export"
  - "Self-tests covering default repos, linear history, branches, dirty files, symlinks, and subpath resolution"
affects: [repo-runtime, admission-e2e, phase-3-contract-tests]

tech-stack:
  added: []
  patterns: [private internal test-fixture subpath, deterministic isomorphic-git fixture commits, caller-owned tmpdir cleanup]

key-files:
  created:
    - packages/repo/src/internal/test-fixtures/build-sacrificial-repo.ts
    - packages/repo/src/internal/test-fixtures/index.ts
    - packages/repo/src/internal/test-fixtures/build-sacrificial-repo.test.ts
  modified:
    - packages/repo/package.json

key-decisions:
  - "Kept the fixture source under packages/repo/src/internal so the existing rootDir/outDir contract continues emitting dist/internal without moving the package's public index output."
  - "Used crypto.randomUUID in the mkdtemp prefix and deterministic git author/committer timestamps for repeatable commit SHAs."

patterns-established:
  - "Repo test fixtures create real isomorphic-git repositories in os.tmpdir() and leave cleanup to t.after(() => rm(...))."
  - "Internal fixture exports are named private subpaths with an explicit header warning they are not public API."

requirements-completed: [REPO-02]

duration: 4min
completed: 2026-04-27
---

# Phase 03 Plan 04: Sacrificial Repo Test Fixture Summary

**`@protostar/repo/internal/test-fixtures` now builds real deterministic isomorphic-git repos for downstream Phase 3 contract tests.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-27T20:26:43Z
- **Completed:** 2026-04-27T20:30:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `buildSacrificialRepo()` with real `isomorphic-git` init/add/commit/branch behavior in a fresh `os.tmpdir()` directory.
- Added deterministic author, committer, timestamp, and timezone metadata so identical seed content produces stable HEAD SHAs across runs.
- Added dirty-file and symlink fixture options for later dirty-worktree and symlink-audit plans.
- Added `@protostar/repo/internal/test-fixtures` export wiring.
- Added six fixture tests: the five planned behavior checks plus a package-subpath import smoke test.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement buildSacrificialRepo + subpath barrel + private-subpath header** - `765cf91` (feat)
2. **Task 2: Self-test for fixture builder + subpath-export wiring** - `3582d48` (test)

**Plan metadata:** pending final docs commit.

## Files Created/Modified

- `packages/repo/src/internal/test-fixtures/build-sacrificial-repo.ts` - Private fixture builder returning `{ dir, headSha, defaultBranch, seededPaths }`.
- `packages/repo/src/internal/test-fixtures/index.ts` - Subpath barrel for the fixture builder and types.
- `packages/repo/src/internal/test-fixtures/build-sacrificial-repo.test.ts` - Node test suite for commit history, branches, dirty files, symlinks, and export resolution.
- `packages/repo/package.json` - Adds `./internal/test-fixtures` to the export map.

## Decisions Made

- The plan named `packages/repo/internal/...`, but the existing package emits `dist/*` from `src/*`. The implementation uses `packages/repo/src/internal/...`, which preserves the current `.` export at `dist/index.js` while still emitting the planned `dist/internal/test-fixtures/*` files.
- `crypto.randomUUID()` is included in the tmpdir prefix and `mkdtemp()` adds the final unique suffix, avoiding a new `nanoid` dependency.
- Symlink targets are accepted as provided because this is an operator-controlled negative-test fixture, matching the plan's accepted symlink disclosure risk.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Kept fixture source under the package src root**
- **Found during:** Task 1 (fixture implementation)
- **Issue:** The plan's root-level `packages/repo/internal/...` path conflicts with the current `packages/repo/tsconfig.json` `rootDir: "src"` and existing package exports. Including root-level `internal/**/*.ts` would either fail compilation or move existing output under `dist/src`.
- **Fix:** Implemented the files under `packages/repo/src/internal/test-fixtures`, which compiles to the planned `dist/internal/test-fixtures` export target without changing the package's public output shape.
- **Files modified:** `packages/repo/src/internal/test-fixtures/build-sacrificial-repo.ts`, `packages/repo/src/internal/test-fixtures/index.ts`, `packages/repo/src/internal/test-fixtures/build-sacrificial-repo.test.ts`
- **Verification:** `pnpm --filter @protostar/repo build`, `pnpm --filter @protostar/repo test`, and sibling-package subpath import smoke all passed.
- **Committed in:** `765cf91`, `3582d48`

---

**Total deviations:** 1 auto-fixed (Rule 3).
**Impact on plan:** No behavioral scope change; the emitted export path and downstream import contract match the plan.

## Issues Encountered

- The local GSD SDK path from the generic workflow (`node_modules/@gsd-build/sdk/dist/cli.js`) is not installed in this repo, so state/roadmap/requirements updates were applied directly.
- `pnpm run factory` built successfully, then stopped at the existing workspace-trust gate with exit code 2: `workspace-trust gate blocked: workspace is not trusted; escalation required before factory can proceed`.

## Known Stubs

None. The empty array defaults in `buildSacrificialRepo()` are intentional option defaults, not placeholder data flowing to a user-facing surface.

## Threat Flags

None. The tmpdir write boundary, internal export visibility, and symlink behavior are all explicitly covered by the plan threat model.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm --filter @protostar/repo build` - passed.
- `pnpm --filter @protostar/repo test` - passed, 11/11 tests including 6 fixture/export tests.
- `cat packages/repo/package.json | jq '.exports["./internal/test-fixtures"]'` returned the expected types/import object.
- Sibling-package smoke from `packages/admission-e2e`: `node -e 'import("@protostar/repo/internal/test-fixtures").then(m => console.log(typeof m.buildSacrificialRepo))'` printed `function`.
- Deterministic-SHA proof from `packages/admission-e2e`: two `buildSacrificialRepo({ commits: 3 })` calls produced the same HEAD SHA, `9b0d446f64cb31e3fed96edf9f016398cd303631`.
- `pnpm run verify` - passed.
- `pnpm run factory` - build passed, then stopped at the expected workspace-trust escalation gate.

## Platform Notes

Symlink creation passed on this darwin environment; no platform-specific symlink quirk was observed.

## Next Phase Readiness

Wave 1+ Phase 3 plans can import `buildSacrificialRepo` from `@protostar/repo/internal/test-fixtures` to exercise clone, branch, fs-adapter, dirty-worktree, symlink-audit, patch-apply, and subprocess-runner contracts against real git repos.

## Self-Check: PASSED

- Found summary file at `.planning/phases/03-repo-runtime-sandbox/03-04-sacrificial-repo-test-fixture-SUMMARY.md`.
- Found created fixture source, barrel, and test files under `packages/repo/src/internal/test-fixtures/`.
- Found task commits `765cf91` and `3582d48` in git history.
- No tracked deletions were introduced by either task commit.

---
*Phase: 03-repo-runtime-sandbox*
*Completed: 2026-04-27*
