---
phase: 08-evaluation-evolution
plan: 01
subsystem: evaluation-runner
tags: [evaluation, evolution, package-skeleton, typescript, node-test]

requires:
  - phase: 06-live-dogpile-piles
    provides: dogpile-adapter network-only pile invocation boundary
provides:
  - "@protostar/evaluation-runner workspace skeleton"
  - "Placeholder runEvaluationStages public export for downstream Phase 8 wiring"
  - "Root workspace, TypeScript reference, lockfile, and verify-script registration"
affects: [phase-8-evaluation-evolution, factory-cli, evaluation, dogpile-adapter]

tech-stack:
  added: []
  patterns:
    - domain-first adapter package skeleton
    - compiled node:test placeholder coverage through root verify
    - network/injected-reader boundary with no filesystem imports

key-files:
  created:
    - packages/evaluation-runner/package.json
    - packages/evaluation-runner/tsconfig.json
    - packages/evaluation-runner/tsconfig.build.json
    - packages/evaluation-runner/src/index.ts
    - packages/evaluation-runner/src/index.test.ts
  modified:
    - package.json
    - pnpm-lock.yaml
    - pnpm-workspace.yaml
    - tsconfig.json

key-decisions:
  - "Kept @protostar/evaluation-runner as a skeleton-only adapter boundary; real runEvaluationStages behavior remains reserved for Plan 08-06."
  - "Added the evaluation-runner test hook to root verify because the current verify script is hardcoded rather than recursive."
  - "Used the repo's actual TypeScript/package conventions (^6.0.3 and project references to package roots) while retaining the plan-required tsconfig.build.json entrypoint."

patterns-established:
  - "Phase 8 adapter skeletons compile their placeholder node:test coverage as part of package build."
  - "Evaluation-runner source stays free of node:fs/node:path imports; Plan 08-06 will add the static contract test."

requirements-completed: []

duration: 4min
completed: 2026-04-28
---

# Phase 08 Plan 01: Evaluation Runner Skeleton Summary

**`@protostar/evaluation-runner` now exists as a registered network/injected-reader adapter workspace with a throwing placeholder export and compiled smoke test.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-28T15:47:10Z
- **Completed:** 2026-04-28T15:51:19Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Added the `packages/evaluation-runner/` workspace package with ESM exports, strict composite TypeScript config, and the plan's `runEvaluationStages` placeholder surface.
- Added a compiled `node:test` assertion proving the placeholder rejects until Plan 08-06 wires the real three-stage evaluation runner.
- Registered the package in pnpm workspace metadata, the root TypeScript project graph, pnpm lockfile, and root `verify`.

## Task Commits

1. **Task 1: Create @protostar/evaluation-runner package skeleton** - `7da35f5` (feat)
2. **Task 2: Register package in workspace + root TS references + root verify hook** - `c398c8e` (chore)

## Files Created/Modified

- `packages/evaluation-runner/package.json` - New private workspace manifest, dependency boundary, and build/test scripts.
- `packages/evaluation-runner/tsconfig.json` - Composite TypeScript config with project references and Node test types.
- `packages/evaluation-runner/tsconfig.build.json` - Build entrypoint used by the package build script.
- `packages/evaluation-runner/src/index.ts` - Public placeholder `runEvaluationStages` export.
- `packages/evaluation-runner/src/index.test.ts` - Placeholder rejection test.
- `pnpm-workspace.yaml` - Explicit workspace registration.
- `tsconfig.json` - Root project reference.
- `package.json` - Root `verify` hook for the new package test.
- `pnpm-lock.yaml` - Workspace importer entry from `pnpm install`.

## Decisions Made

- Followed the repository's actual skeleton precedent where package project references point to sibling package roots; no existing package had `tsconfig.build.json` references to copy.
- Kept the placeholder intentional and observable via test rather than adding any evaluation behavior in this skeleton-only plan.
- Added the root verify hook explicitly because the root script does not use `pnpm -r test`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Compiled the placeholder test in the build entrypoint**
- **Found during:** Task 1 (Create @protostar/evaluation-runner package skeleton)
- **Issue:** A build config excluding `*.test.ts` made `pnpm --filter @protostar/evaluation-runner test` report zero tests instead of exercising the placeholder rejection.
- **Fix:** Kept `tsconfig.build.json` as the build entrypoint but allowed it to inherit the package `include`, so the placeholder test is emitted into `dist/`.
- **Files modified:** `packages/evaluation-runner/tsconfig.build.json`
- **Verification:** `pnpm --filter @protostar/evaluation-runner test` passed with 1 test.
- **Committed in:** `7da35f5`

**2. [Rule 3 - Blocking] Added Node test types to package tsconfig**
- **Found during:** Task 1 (Create @protostar/evaluation-runner package skeleton)
- **Issue:** TypeScript could not resolve `node:test` / `node:assert/strict` types while compiling the new package.
- **Fix:** Added `"types": ["node"]` to `packages/evaluation-runner/tsconfig.json`, reusing the root `@types/node` dependency.
- **Files modified:** `packages/evaluation-runner/tsconfig.json`
- **Verification:** `pnpm --filter @protostar/evaluation-runner build` passed.
- **Committed in:** `7da35f5`

---

**Total deviations:** 2 auto-fixed (Rule 3).
**Impact on plan:** Both fixes were necessary to make the plan's build/test gates meaningful. No behavior beyond the skeleton placeholder was added.

## Issues Encountered

- `pnpm -r build` and `pnpm run verify` are currently blocked by unrelated dirty Phase 7 delivery-runtime edits: `packages/delivery-runtime/src/push-branch.ts(195,16)` and `(195,47)` report `TS2339: Property 'name' does not exist on type '{ readonly code?: unknown; readonly message?: unknown; }'`. The new `@protostar/evaluation-runner` package built successfully before the recursive build reached that out-of-scope failure.

## Verification

- `pnpm install` passed.
- `pnpm --filter @protostar/evaluation-runner build` passed.
- `pnpm --filter @protostar/evaluation-runner test` passed with 1 test.
- `grep -c 'evaluation-runner' pnpm-workspace.yaml` returned `1`.
- `grep -c 'evaluation-runner' tsconfig.json` returned `1`.
- `grep -rE '\bfrom ["'\'']node:fs|node:path|"fs"|"path"' packages/evaluation-runner/src/` returned zero matches.
- `pnpm -r build` did not complete because of the unrelated Phase 7 delivery-runtime TypeScript errors listed above.
- `pnpm run verify` did not complete because the root `typecheck` hit the same unrelated Phase 7 delivery-runtime TypeScript errors.

## Known Stubs

- `packages/evaluation-runner/src/index.ts` intentionally returns a placeholder type and throws `"runEvaluationStages not yet wired..."`; Plan 08-06 lands the real implementation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Downstream Phase 8 plans can now import `@protostar/evaluation-runner` and replace the placeholder with the real three-stage evaluation orchestration. Plan 08-06 still needs to add the static no-fs contract test for this package.

## Self-Check: PASSED

- Created files exist.
- Task commits `7da35f5` and `c398c8e` exist in git history.
- Verification commands listed above were run; package-local gates passed, while repo-wide gates are blocked by unrelated Phase 7 dirty files.

---
*Phase: 08-evaluation-evolution*
*Completed: 2026-04-28*
