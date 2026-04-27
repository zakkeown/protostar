---
phase: 03-repo-runtime-sandbox
plan: 06
subsystem: repo-runtime
tags: [symlink-audit, node22, readdir, sandbox, tdd]

requires:
  - phase: 03-repo-runtime-sandbox
    provides: [isomorphic-git dependency, sacrificial repo fixture]
provides:
  - "auditSymlinks(workspaceRoot) strict tree-wide symlink refusal helper"
  - "Six audit tests covering clean, root, nested, multiple, outside-target, and broken symlinks"
affects: [clone-workspace, repo-runtime-admission, phase-3-contract-tests]

tech-stack:
  added: []
  patterns: [Node 22 recursive readdir audit, workspace-relative POSIX refusal paths, TDD red-green gate]

key-files:
  created:
    - packages/repo/src/symlink-audit.ts
    - packages/repo/src/symlink-audit.test.ts
  modified: []

key-decisions:
  - "auditSymlinks rethrows IO errors to let Plan 09 mark clone admission untrusted through the broader admission path."
  - "Recursive readdir is the primary path; manual recursion is only a compatibility fallback when Dirent parent metadata is unavailable."

patterns-established:
  - "Post-clone audits return stable workspace-relative POSIX paths suitable for refusal artifacts."
  - "Strict symlink refusal is target-agnostic: inside, outside, and broken targets are all reported by entry type."

requirements-completed: [REPO-03]

duration: 4min
completed: 2026-04-27
---

# Phase 03 Plan 06: Symlink Audit Summary

**Strict post-clone symlink audit now reports every workspace symlink with stable relative paths before later repo mutation.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-27T20:39:28Z
- **Completed:** 2026-04-27T20:41:36Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `auditSymlinks(workspaceRoot)` using Node 22 `readdir({ recursive: true, withFileTypes: true })`.
- Returns `{ ok: true, offendingPaths: [] }` for clean repos and `{ ok: false, offendingPaths }` for any symlink entry.
- Reports workspace-relative POSIX-style paths and sorts them for deterministic refusal artifacts.
- Added a compatibility fallback that manually recurses when recursive `Dirent` entries do not expose `parentPath` or `path`.
- Added six TDD cases covering clean-empty, root, nested, multiple, outside-target, and broken symlinks.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: failing audit-symlinks suite** - `1c1961f` (test)
2. **Task 2 GREEN: one-pass symlink tree audit** - `281e532` (feat)

**Plan metadata:** final docs commit created after summary/state updates.

## TDD Gate Compliance

- **RED:** `pnpm --filter @protostar/repo build` failed with `TS2307: Cannot find module './symlink-audit.js'`, proving the tests targeted missing behavior.
- **GREEN:** `pnpm --filter @protostar/repo test` passed with 25/25 package tests, including 6/6 `auditSymlinks` tests.
- **REFACTOR:** No separate refactor commit was needed.

## Files Created/Modified

- `packages/repo/src/symlink-audit.ts` - Implements strict tree-wide symlink auditing and path normalization.
- `packages/repo/src/symlink-audit.test.ts` - Exercises clean, root, nested, multiple, outside-target, and broken symlink cases using the sacrificial repo fixture.

## Decisions Made

- IO failures are rethrown rather than encoded as synthetic `.audit-error:*` paths, matching the plan recommendation that the clone admission caller owns broader untrusted-workspace handling.
- The fallback manual walk is intentionally only a compatibility path. On this Node 22.22.1 environment, recursive `Dirent` entries exposed both `parentPath` and `path`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The local `gsd-sdk` CLI does not expose the `query state.*` subcommands from the generic workflow, so `.planning/STATE.md`, `.planning/ROADMAP.md`, and `.planning/REQUIREMENTS.md` were updated directly.

## Known Stubs

None. Stub-pattern scan found only an intentional local `string[]` accumulator in `symlink-audit.ts`.

## Threat Flags

None. The new filesystem read surface is the planned post-clone audit boundary from T-03-06-01.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm --filter @protostar/repo build` failed during RED as expected on missing `./symlink-audit.js`.
- `pnpm --filter @protostar/repo test` passed: 25 tests, 4 suites, including 6 audit tests.
- Node observation command reported Node `22.22.1` and recursive `Dirent` entries with both `parentPath` and `path`.
- `pnpm run verify` passed.

## Next Phase Readiness

Plan 09 can call `auditSymlinks` immediately after clone and mark the workspace untrusted when `offendingPaths` is non-empty. Plan 12 can use the returned paths in symlink-refusal admission evidence.

## Self-Check: PASSED

- Found summary file at `.planning/phases/03-repo-runtime-sandbox/03-06-symlink-audit-SUMMARY.md`.
- Found created files `packages/repo/src/symlink-audit.ts` and `packages/repo/src/symlink-audit.test.ts`.
- Found task commits `1c1961f` and `281e532` in git history.
- No tracked deletions were introduced by either task commit.

---
*Phase: 03-repo-runtime-sandbox*
*Completed: 2026-04-27*
