---
phase: 03-repo-runtime-sandbox
plan: 02
subsystem: repo-runtime
tags: [paths, workspace-root, pnpm-workspace, agents]

requires:
  - phase: 03-repo-runtime-sandbox
    provides: Phase 3 Q-15 decision and Wave 0 repo-runtime foundations
provides:
  - "@protostar/paths workspace package with resolveWorkspaceRoot()"
  - "Five unit tests for pnpm-workspace.yaml sentinel resolution"
  - "AGENTS.md scope-ceiling carve-out for @protostar/paths"
affects: [repo-runtime, factory-cli, package-boundaries, phase-3]

tech-stack:
  added: []
  patterns: [zero-runtime-dep workspace utility package, node:test against compiled dist]

key-files:
  created:
    - packages/paths/package.json
    - packages/paths/tsconfig.json
    - packages/paths/src/index.ts
    - packages/paths/src/resolve-workspace-root.ts
    - packages/paths/src/resolve-workspace-root.test.ts
  modified:
    - AGENTS.md
    - pnpm-lock.yaml
    - tsconfig.base.json
    - tsconfig.json

key-decisions:
  - "Kept @protostar/paths to the Q-15 scope ceiling: workspace-root path resolution only."
  - "Registered @protostar/paths in the root TypeScript reference graph and path aliases."

patterns-established:
  - "Tiny carve-out packages must document their scope ceiling in both AGENTS.md and public source comments."
  - "Workspace-root resolution is a synchronous parent walk to pnpm-workspace.yaml, not INIT_CWD or .git discovery."

requirements-completed: [REPO-07]

duration: 3min
completed: 2026-04-27
---

# Phase 03 Plan 02: Paths Package and AGENTS Carve-Out Summary

**`@protostar/paths` now resolves the monorepo root by walking to `pnpm-workspace.yaml`, with tests and an explicit AGENTS.md scope ceiling.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-27T20:05:46Z
- **Completed:** 2026-04-27T20:08:50Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Added the zero-runtime-dependency `@protostar/paths` workspace package.
- Implemented synchronous `resolveWorkspaceRoot(startDir = process.cwd())`.
- Added five `node:test` cases covering no-sentinel failure, deep nested lookup, root lookup, default argument behavior, and sentinel specificity.
- Registered the package in `pnpm-lock.yaml`, `tsconfig.base.json`, and the root `tsconfig.json` project references.
- Added the AGENTS.md carve-out naming `@protostar/paths`, its permitted contents, and forbidden expansion areas.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: failing paths workspace-root tests** - `ea00df4` (test)
2. **Task 1 GREEN: workspace root resolver implementation** - `51aac42` (feat)
3. **Task 2: AGENTS.md carve-out clause** - `ea42c8a` (docs)

**Plan metadata:** pending final docs commit.

_Note: Task 1 was TDD, so it produced separate RED and GREEN commits._

## Files Created/Modified

- `packages/paths/package.json` - Defines the private `@protostar/paths` package, export map, and build/test/typecheck scripts.
- `packages/paths/tsconfig.json` - Composite package config mirroring the established small-package pattern.
- `packages/paths/src/index.ts` - Barrel re-export for `resolveWorkspaceRoot`.
- `packages/paths/src/resolve-workspace-root.ts` - Synchronous parent walk to `pnpm-workspace.yaml`.
- `packages/paths/src/resolve-workspace-root.test.ts` - Five behavioral tests for REPO-07.
- `AGENTS.md` - Documents the single domain-first package carve-out and forbidden expansion areas.
- `pnpm-lock.yaml` - Records the new workspace importer.
- `tsconfig.base.json` - Adds the `@protostar/paths` path alias.
- `tsconfig.json` - Adds the package to the root TypeScript project reference graph.

## Decisions Made

- Kept the package surface to one export: `resolveWorkspaceRoot`.
- Used `existsSync` only for sentinel detection; no YAML parsing, subprocess, networking, or business logic.
- Treated `.git` as explicitly outside the current contract; the sentinel is `pnpm-workspace.yaml`.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope change.

## Issues Encountered

- The local GSD SDK path from the generic workflow (`node_modules/@gsd-build/sdk/dist/cli.js`) is not installed in this repo, so state/roadmap/requirements updates were applied directly.
- `pnpm run factory` built successfully, then exited 2 at the current workspace-trust gate: `workspace is not trusted; escalation required before factory can proceed`. This is existing control-plane behavior after Phase 2 and not a regression from `@protostar/paths`.

## Known Stubs

None. Stub-pattern scan of the created/modified plan files found no TODO/FIXME/placeholder data paths.

## User Setup Required

None - no external service configuration required.

## Verification

- RED gate: `pnpm --filter @protostar/paths test` failed before implementation with `TS2307: Cannot find module './resolve-workspace-root.js'`.
- GREEN/task verification: `pnpm --filter @protostar/paths test` passed with 5/5 tests.
- Workspace registration: `pnpm -r list --depth -1` included `@protostar/paths@0.0.0`.
- AGENTS verification: `grep -c "@protostar/paths" AGENTS.md` returned `3`.
- Project verification: `pnpm run verify:full` passed.
- AGENTS package-export check: `pnpm run factory` ran the build successfully and then stopped at the existing workspace-trust escalation gate with exit code 2.

## Next Phase Readiness

Wave 0 can continue. Downstream Phase 3 plans can import `resolveWorkspaceRoot` from `@protostar/paths` when replacing brittle `INIT_CWD` / `cwd()` workspace root handling in `apps/factory-cli` and repo-runtime code.

## Self-Check: PASSED

- Found summary file at `.planning/phases/03-repo-runtime-sandbox/03-02-paths-package-and-agents-carveout-SUMMARY.md`.
- Found created files under `packages/paths/`.
- Found task commits `ea00df4`, `51aac42`, and `ea42c8a` in git history.

---
*Phase: 03-repo-runtime-sandbox*
*Completed: 2026-04-27*
