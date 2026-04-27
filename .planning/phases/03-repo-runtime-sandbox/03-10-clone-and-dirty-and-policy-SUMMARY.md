---
phase: 03-repo-runtime-sandbox
plan: 10
subsystem: repo-runtime
tags: [isomorphic-git, clone, dirty-worktree, repo-policy, json-schema, tdd]

requires:
  - phase: 03-repo-runtime-sandbox
    provides: [isomorphic-git dependency, sacrificial repo fixture, symlink audit]
provides:
  - cloneWorkspace with credentialRef auth, retry cancellation, HEAD resolution, and post-clone symlink audit
  - dirtyWorktreeStatus with CONFLICT-02 tracked-file statusMatrix filter
  - repo runtime policy parser and loadRepoPolicy Q-02 recursive-clone refusal
  - repo-policy and repo-runtime admission-decision JSON schemas
affects: [factory-cli-wiring, repo-runtime-admission, admission-e2e-contracts]

tech-stack:
  added: []
  patterns: [TDD red-green commits, hermetic mocked git.clone tests, config-load filesystem safety check]

key-files:
  created:
    - packages/repo/src/dirty-worktree-status.ts
    - packages/repo/src/dirty-worktree-status.test.ts
    - packages/repo/src/repo-policy.ts
    - packages/repo/src/repo-policy.test.ts
    - packages/repo/src/clone-workspace.ts
    - packages/repo/src/clone-workspace.test.ts
    - packages/repo/schema/repo-policy.schema.json
    - packages/repo/schema/repo-runtime-admission-decision.schema.json
  modified:
    - packages/repo/src/index.ts
    - packages/repo/package.json

key-decisions:
  - "cloneWorkspace tests use dependency-injected git.clone/resolveRef/auditSymlinks mocks; no live network or file:// clones run in Plan 10."
  - "loadRepoPolicy resolves workspaceRoot against projectRoot and refuses equal-or-inside paths at config-load, not in the pure parser."
  - "dirtyWorktreeStatus only treats tracked HEAD rows whose workdir or stage state changed as dirty; untracked build artifacts stay clean."

patterns-established:
  - "Auth callbacks are split into buildOnAuth for unit testing and an instrumented cloneWorkspace wrapper for result evidence."
  - "Repo runtime policy defaults are deep-frozen and JSON-schema mirrored."

requirements-completed: [REPO-01, REPO-02, REPO-06]

duration: 7min
completed: 2026-04-27
---

# Phase 03 Plan 10: Clone, Dirty, and Policy Summary

**Repo runtime now has hermetic clone orchestration, tracked-file dirty detection, and repo-policy loading with recursive workspace refusal.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-27T21:05:16Z
- **Completed:** 2026-04-27T21:11:52Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Added `dirtyWorktreeStatus(dir)` using `isomorphic-git.statusMatrix` and the exact CONFLICT-02 filter: `row[HEAD] === 1 && (row[WORKDIR] !== row[HEAD] || row[STAGE] !== row[HEAD])`.
- Added repo runtime policy parsing/loading with defaults for `subprocessTailBytes`, `commandAllowlist`, `workspaceRoot`, and `tombstoneRetentionHours`.
- Pinned Q-02 by refusing workspace roots equal to or inside the source repo with: `workspaceRoot must be outside the source repo (recursive-clone risk): ${absWorkspaceRoot} is inside ${absProjectRoot}`.
- Added `cloneWorkspace` with `buildOnAuth`, credentialRef name-only evidence, retry-storm cancellation after two callbacks, `git.resolveRef("HEAD")`, and post-clone `auditSymlinks`.
- Added and exported `repo-policy.schema.json` and `repo-runtime-admission-decision.schema.json`; the latter requires `patchResults` and `subprocessRecords` arrays.

## Task Commits

Each TDD task was committed atomically:

1. **Task 1 RED: dirty-worktree tests** - `e23e0f9` (test)
2. **Task 1 GREEN: dirty-worktree implementation** - `3b45301` (feat)
3. **Task 2 RED: repo-policy tests + schema** - `02de134` (test)
4. **Task 2 GREEN: repo-policy parser/loader** - `ceda425` (feat)
5. **Task 3 RED: clone-workspace tests + admission schema** - `ba339b2` (test)
6. **Task 3 GREEN: clone-workspace implementation** - `4c41e02` (feat)

## TDD Gate Compliance

- **Task 1 RED:** `pnpm --filter @protostar/repo test` failed with missing `./dirty-worktree-status.js`.
- **Task 1 GREEN:** `pnpm --filter @protostar/repo test` passed with 66/66 tests, including 4/4 dirty-worktree tests.
- **Task 2 RED:** `pnpm --filter @protostar/repo test` failed with missing `./repo-policy.js`.
- **Task 2 GREEN:** `pnpm --filter @protostar/repo test` passed with 81/81 tests, including 6 parser tests and 9 loader tests.
- **Task 3 RED:** `pnpm --filter @protostar/repo test` failed with missing `./clone-workspace.js`.
- **Task 3 GREEN:** `pnpm --filter @protostar/repo test` passed with 89/89 tests, including 4 `buildOnAuth` tests and 4 `cloneWorkspace` tests.

## Files Created/Modified

- `packages/repo/src/dirty-worktree-status.ts` - `statusMatrix` wrapper with `--untracked-files=no` semantics.
- `packages/repo/src/dirty-worktree-status.test.ts` - 4 tests, including the CONFLICT-02 assertion that untracked `dist/foo.js` reports `{ isDirty: false, dirtyFiles: [] }`.
- `packages/repo/src/repo-policy.ts` - Pure parser plus IO loader for `.protostar/repo-policy.json`.
- `packages/repo/src/repo-policy.test.ts` - 15 tests: 6 parser cases and 9 loader cases.
- `packages/repo/src/clone-workspace.ts` - Clone orchestration, auth shim, retry cancellation, HEAD resolution, and symlink audit trigger.
- `packages/repo/src/clone-workspace.test.ts` - 8 tests using mocked clone/resolve/audit dependencies; no live clone path.
- `packages/repo/schema/repo-policy.schema.json` - Closed draft 2020-12 schema for runtime repo policy.
- `packages/repo/schema/repo-runtime-admission-decision.schema.json` - Repo runtime gate evidence schema.
- `packages/repo/src/index.ts` - Barrel exports for new runtime functions and types.
- `packages/repo/package.json` - Schema subpath exports for both new schema files.

## Decisions Made

- Used dependency injection for `git.clone`, `git.resolveRef`, and `auditSymlinks` in clone tests. This preserves the W-02 mock-only lock and avoids all network/file clone behavior in this plan.
- Kept `system` in the auth union/schema for Q-04 compatibility, but v1 `cloneWorkspace` returns `anonymous` when no `credentialRef` is provided because `isomorphic-git` does not integrate system credential helpers.
- Exported underscored clone dependency setters for tests only; production callers use `cloneWorkspace` and `buildOnAuth`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The generic workflow's local SDK path (`node_modules/@gsd-build/sdk/dist/cli.js`) is not installed in this repo, so state/roadmap/requirements updates are applied directly after summary creation.
- `pnpm run factory` built successfully, then stopped at the expected workspace-trust gate with exit code 2.

## Known Stubs

None. Stub-pattern scan found only intentional local empty array/object initializers in tests and parser accumulators.

## Threat Flags

None. New auth, filesystem config-load, schema, dirty-status, and symlink-audit surfaces match the plan threat model.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm --filter @protostar/repo test` - passed, 89 tests / 14 suites.
- `pnpm run verify` - passed.
- `pnpm run factory` - build passed, then stopped at expected workspace-trust escalation gate.
- `jq -r '.title' packages/repo/schema/repo-runtime-admission-decision.schema.json` returned `RepoRuntimeAdmissionDecision`.
- `grep -E 'matrix\.length\s*>\s*0' packages/repo/src/dirty-worktree-status.ts` returned no matches.
- `grep -v '^#' packages/repo/src/dirty-worktree-status.ts | grep -cE 'WORKDIR|STAGE'` returned `3`.
- `grep -v '^#' packages/repo/src/repo-policy.ts | grep -c 'loadRepoPolicy'` returned `1`.
- `grep -v '^#' packages/repo/src/repo-policy.ts | grep -cE 'startsWith.*sep|recursive.*clone|outside the source'` returned `3`.

## Next Phase Readiness

Plan 11 can wire `cloneWorkspace`, `dirtyWorktreeStatus`, and `loadRepoPolicy` into `runFactory`, emit repo-runtime admission evidence with the new schema, and apply cleanup/tombstone lifecycle behavior using `tombstoneRetentionHours`.

## Self-Check: PASSED

- Found summary file at `.planning/phases/03-repo-runtime-sandbox/03-10-clone-and-dirty-and-policy-SUMMARY.md`.
- Found created files for dirty status, repo policy, clone workspace, and both schemas.
- Found task commits `e23e0f9`, `3b45301`, `02de134`, `ceda425`, `ba339b2`, and `4c41e02` in git history.
- No tracked deletions were introduced by task commits.

---
*Phase: 03-repo-runtime-sandbox*
*Completed: 2026-04-27*
