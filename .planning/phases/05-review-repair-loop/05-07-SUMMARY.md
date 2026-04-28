---
phase: 05-review-repair-loop
plan: 07
subsystem: review
tags: [mechanical-checks, execution-adapter, isomorphic-git, node-test, review-findings]

requires:
  - phase: 05-review-repair-loop
    provides: mechanical-checks skeleton, review repair types, execution adapter contract
provides:
  - "Mechanical checks ExecutionAdapter emitting MechanicalCheckResult evidence"
  - "Diff-name-only helper for baseRef..HEAD via isomorphic-git"
  - "Pure findings builder for build, lint, cosmetic, timeout, and AC coverage findings"
affects: [05-10-review-repair-loop, 05-12-factory-cli-wiring]

tech-stack:
  added: [isomorphic-git direct dependency for @protostar/mechanical-checks]
  patterns:
    - "Mechanical checks source uses injected subprocess, readFile, and git fs capabilities"
    - "TDD RED/GREEN commits for helper, findings, and adapter behavior"

key-files:
  created:
    - packages/mechanical-checks/src/diff-name-only.ts
    - packages/mechanical-checks/src/diff-name-only.test.ts
    - packages/mechanical-checks/src/findings.ts
    - packages/mechanical-checks/src/findings.test.ts
    - packages/mechanical-checks/src/create-mechanical-checks-adapter.ts
    - packages/mechanical-checks/src/create-mechanical-checks-adapter.test.ts
  modified:
    - packages/mechanical-checks/src/index.ts
    - packages/mechanical-checks/package.json
    - packages/mechanical-checks/tsconfig.json
    - pnpm-lock.yaml

key-decisions:
  - "Kept ReviewRuleId unchanged in this parallel wave; mechanical-checks emits the new ruleId strings as structured runtime findings and casts at the review boundary."
  - "Injected gitFs into mechanical-checks instead of importing node:fs directly, preserving the authority boundary for source files."
  - "Kept diff-name-only in @protostar/mechanical-checks because the user-scoped plan owned only that package."

patterns-established:
  - "Mechanical check adapters emit empty RepoChangeSet patches plus MechanicalCheckResult evidence."
  - "AC coverage uses the v0.1 node:test substring rule for testName presence."

requirements-completed: [LOOP-01]

duration: 9min
completed: 2026-04-28
---

# Phase 05 Plan 07: Mechanical Checks Adapter Summary

**Mechanical checks now run configured commands through injected repo capabilities, compute run-level diff evidence, and emit structured findings for review.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-28T00:58:17Z
- **Completed:** 2026-04-28T01:06:56Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Added `computeDiffNameOnly` using isomorphic-git status matrix over an injected git filesystem client, with sorted base-to-head path output and rename-as-delete+add coverage.
- Added `buildFindings` for build failures, lint failures, cosmetic-tweak multi-file violations, command timeouts, and AC uncovered cases.
- Replaced the mechanical-checks placeholder with `createMechanicalChecksAdapter`, which runs commands sequentially through `config.subprocess`, reads test stdout through `config.readFile`, computes diff evidence, and emits a `final` change-set event with `MechanicalCheckResult` evidence.

## Task Commits

1. **Task 1 RED: diff-name-only tests** - `8f374bb` (test)
2. **Task 1 GREEN: diff-name-only helper** - `78dd2af` (feat)
3. **Task 2 RED: findings tests** - `f502cf2` (test)
4. **Task 2 GREEN: findings builder** - `6388b78` (feat)
5. **Task 3 RED: adapter orchestration tests** - `8729fc0` (test)
6. **Task 3 GREEN: mechanical checks adapter** - `ad2f8fd` (feat)

## Files Created/Modified

- `packages/mechanical-checks/src/diff-name-only.ts` - Computes sorted diff-name-only evidence via isomorphic-git and injected git fs.
- `packages/mechanical-checks/src/findings.ts` - Pure findings builder for command, cosmetic, timeout, and AC coverage checks.
- `packages/mechanical-checks/src/create-mechanical-checks-adapter.ts` - ExecutionAdapter implementation and injected capability config.
- `packages/mechanical-checks/src/index.ts` - Barrel exports for adapter, diff helper, and findings builder.
- `packages/mechanical-checks/src/*.test.ts` - TDD coverage for all plan behaviors.
- `packages/mechanical-checks/package.json`, `packages/mechanical-checks/tsconfig.json`, `pnpm-lock.yaml` - Direct dependency and Node type support needed by the package tests/source.

## Decisions Made

- Used injected `gitFs` rather than a direct `node:fs` import in source, so the final authority grep across non-test mechanical-checks source returns zero filesystem/subprocess hits.
- Did not widen `@protostar/review`'s `ReviewRuleId` union in this parallel wave because the user scope constrained ownership to mechanical-checks files; runtime findings still carry `build-failure`, `lint-failure`, `cosmetic-archetype-violation`, `ac-uncovered`, and `mechanical-command-timeout`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added mechanical-checks package metadata for tests**
- **Found during:** Task 1 RED
- **Issue:** The package skeleton lacked `types: ["node"]` and a direct `isomorphic-git` dependency, so node:test and git tests could not compile.
- **Fix:** Added the direct dependency, Node type compiler option, and lockfile update.
- **Files modified:** `packages/mechanical-checks/package.json`, `packages/mechanical-checks/tsconfig.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter @protostar/mechanical-checks build`
- **Committed in:** `8f374bb`

**2. [Rule 2 - Missing Critical] Injected git fs capability to satisfy authority gate**
- **Found during:** Task 3 authority acceptance check
- **Issue:** The initial diff helper directly imported `node:fs`, conflicting with the plan's final no-fs source gate.
- **Fix:** Changed `computeDiffNameOnly` and adapter config to receive an injected `gitFs` capability; tests supply Node fs, production wiring can supply the authorized repo-owned capability.
- **Files modified:** `packages/mechanical-checks/src/diff-name-only.ts`, `packages/mechanical-checks/src/create-mechanical-checks-adapter.ts`, related tests
- **Verification:** authority grep over non-test `packages/mechanical-checks/src` returned zero matches.
- **Committed in:** `ad2f8fd`

---

**Total deviations:** 2 auto-fixed (Rule 2: 1, Rule 3: 1)
**Impact on plan:** Both fixes preserve the mechanical-checks authority boundary and keep implementation scoped to the package.

## Issues Encountered

- `pnpm run verify` failed in unrelated `@protostar/factory-cli` tests after package verification passed. The failure is due to current planning admission fixture data missing `acceptanceTestRefs` for AC coverage, matching concurrent 05-11 work.

## Verification

- `pnpm --filter @protostar/mechanical-checks build` - passed.
- `pnpm --filter @protostar/mechanical-checks test` - passed: 19 tests, 3 suites.
- `pnpm run verify` - failed outside 05-07 in `@protostar/factory-cli` planning admission tests requiring `acceptanceTestRefs`.
- `pnpm run factory` - built successfully, then stopped at the expected workspace-trust gate with exit code 2.
- Source authority scan excluding tests returned zero `node:fs`, `fs`, `child_process`, `spawn`, or `fetch` matches.

## Known Stubs

None found in files created or modified by this plan.

## Threat Flags

None beyond the planned threat mitigations. The plan introduced subprocess execution only through injected `config.subprocess`; file reads and git filesystem access are injected capabilities.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 05-10 can consume `MechanicalCheckResult` evidence from the adapter. Plan 05-12 wiring must provide `gitFs`, `readFile`, and `subprocess` from authorized repo/factory-cli capabilities.

## Self-Check: PASSED

- Found `packages/mechanical-checks/src/diff-name-only.ts`
- Found `packages/mechanical-checks/src/findings.ts`
- Found `packages/mechanical-checks/src/create-mechanical-checks-adapter.ts`
- Found `.planning/phases/05-review-repair-loop/05-07-SUMMARY.md`
- Found task commits `8f374bb`, `78dd2af`, `f502cf2`, `6388b78`, `8729fc0`, and `ad2f8fd`

---
*Phase: 05-review-repair-loop*
*Completed: 2026-04-28*
