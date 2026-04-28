---
phase: 05-review-repair-loop
plan: 01
subsystem: repair
tags: [repair, package-skeleton, pure-transform, typescript, pnpm]

requires:
  - phase: 04-execution-engine
    provides: execution/review loop context that downstream repair plans will consume
provides:
  - "@protostar/repair workspace skeleton"
  - "Repair package dependency boundary on review, planning, and intent"
  - "Root workspace, TypeScript reference, and verify-script registration"
affects: [phase-5-review-repair-loop, phase-7-delivery, phase-8-evaluation]

tech-stack:
  added: []
  patterns:
    - domain-first pure-transform package skeleton
    - node:test zero-test package hook through root verify

key-files:
  created:
    - packages/repair/package.json
    - packages/repair/tsconfig.json
    - packages/repair/src/index.ts
  modified:
    - package.json
    - pnpm-lock.yaml
    - pnpm-workspace.yaml
    - tsconfig.json

key-decisions:
  - "Kept @protostar/repair as a zero-fs pure-transform package boundary for later RepairPlan authorship."
  - "Added the repair zero-test hook to root verify because root verify uses hardcoded package test commands."

patterns-established:
  - "Wave 0 package skeletons expose only a marker symbol until their downstream type dependencies exist."
  - "New Phase 5 packages are explicitly registered in workspace metadata even when the pnpm glob would include them."

requirements-completed: [LOOP-03]

duration: 12min
completed: 2026-04-28
---

# Phase 05 Plan 01: Repair Package Skeleton Summary

**`@protostar/repair` now exists as a pure-transform workspace boundary with build, verify, and downstream import registration.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-27T23:53:30Z
- **Completed:** 2026-04-28T00:05:29Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added `packages/repair/` with ESM package metadata, TypeScript project config, and a skeleton marker export.
- Declared repair dependencies on `@protostar/review`, `@protostar/planning`, and `@protostar/intent` without adding filesystem, network, or fetch imports.
- Registered the package in pnpm workspace metadata, the root TypeScript project graph, pnpm lockfile, and root `verify`.

## Task Commits

1. **Task 1: Scaffold @protostar/repair workspace** - `338c6c2` (feat)
2. **Task 2: Register workspace + project references + verify hook** - `4129c24` (chore)

## Files Created/Modified

- `packages/repair/package.json` - New `@protostar/repair` workspace manifest and scripts.
- `packages/repair/tsconfig.json` - Composite TypeScript config with references to review, planning, and intent.
- `packages/repair/src/index.ts` - Skeleton marker export for Wave 1 imports.
- `pnpm-lock.yaml` - Added the repair package importer.
- `pnpm-workspace.yaml` - Explicitly registered `packages/repair`.
- `tsconfig.json` - Added the repair project reference.
- `package.json` - Added the repair zero-test hook to `pnpm run verify`.

## Decisions Made

- Followed the plan's skeleton-only scope: `synthesizeRepairPlan` is intentionally not implemented until Plan 05-05.
- Added `pnpm --filter @protostar/repair test` to root `verify` because the existing script uses hardcoded package test commands rather than `pnpm -r test`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Verification

- `pnpm install --filter @protostar/repair...` passed.
- `pnpm install` passed.
- `pnpm --filter @protostar/repair build` passed.
- `pnpm --filter @protostar/repair test` passed with 0 tests.
- `pnpm run verify` passed.
- `grep -c 'packages/repair' pnpm-workspace.yaml` returned `1`.
- `grep -c '"path": "packages/repair"' tsconfig.json` returned `1`.
- `grep -v '^[[:space:]]*//' packages/repair/src/index.ts | grep -cE 'node:fs|node:net|^import.*fetch'` printed `0`.

## Known Stubs

- `packages/repair/src/index.ts` intentionally exports only `__REPAIR_PACKAGE_SKELETON__`; Plan 05-05 lands the real `synthesizeRepairPlan` implementation after the review/planning type contracts exist.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Downstream Phase 5 plans can now import `@protostar/repair` and fill in the typed `RepairPlan` transform once the shared review/planning contracts land.

## Self-Check: PASSED

- Created files exist.
- Task commits `338c6c2` and `4129c24` exist in git history.
- Verification commands listed above passed.

---
*Phase: 05-review-repair-loop*
*Completed: 2026-04-28*
