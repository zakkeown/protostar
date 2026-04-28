---
phase: 08-evaluation-evolution
plan: 06
subsystem: evaluation
tags: [evaluation-runner, semantic-evaluation, consensus, no-fs, tdd]

requires:
  - phase: 08-evaluation-evolution
    provides: 08-03 pure evaluation helpers
  - phase: 08-evaluation-evolution
    provides: 08-05 evaluation pile preset and mission builder
provides:
  - Pure createEvaluationReport assembler
  - Evaluation stage runner with injected pile runner and snapshotReader
  - Static no-fs contract for @protostar/evaluation-runner
affects: [08-evaluation-evolution, factory-cli, admission-e2e]

tech-stack:
  added: []
  patterns: [TDD red/green commits, injected runner dependencies, static authority-boundary contract]

key-files:
  created:
    - packages/evaluation/src/create-evaluation-report.ts
    - packages/evaluation/src/create-evaluation-report.test.ts
    - packages/evaluation-runner/src/run-evaluation-stages.ts
    - packages/evaluation-runner/src/run-evaluation-stages.test.ts
    - packages/evaluation-runner/src/no-fs.contract.test.ts
  modified:
    - packages/evaluation/src/index.ts
    - packages/evaluation/src/types.test.ts
    - packages/evaluation-runner/src/index.ts
    - packages/evaluation-runner/src/index.test.ts
    - packages/evaluation-runner/package.json

key-decisions:
  - "ResolvedPileBudget is imported from @protostar/dogpile-adapter, not @protostar/dogpile-types."
  - "runEvaluationStages uses injected runFactoryPile and snapshotReader dependencies so tests do not invoke Dogpile or filesystem reads."
  - "Semantic verdict is intentionally lighter than consensus: all critiques must pass and average rubric score must be at least 0.5; low confidence still triggers consensus."

patterns-established:
  - "Evaluation pile failures and parser failures return PileFailure refusals instead of throwing."
  - "Consensus harsh-rule failures return eval-consensus-block with threshold evidence."

requirements-completed: [EVAL-01, EVAL-02, EVAL-03, EVAL-04, EVOL-01]

duration: 13min
completed: 2026-04-28
---

# Phase 08 Plan 06: Evaluation Runner Summary

**Evaluation reports now assemble from real stage results, and @protostar/evaluation-runner orchestrates mechanical, semantic, consensus, snapshot, and evolution decisions without filesystem authority.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-04-28T16:34:34Z
- **Completed:** 2026-04-28T16:47:24Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Replaced the degraded `createEvaluationReport({ runId, reviewGate })` stub with the Q-12 pure assembler.
- Added `runEvaluationStages` with mechanical scoring, semantic pile parsing, conditional consensus, refusals, snapshots, and `decideEvolution`.
- Added a static no-fs contract for `@protostar/evaluation-runner` and smoke-tested that it fails on a temporary `node:fs/promises` import.

## Task Commits

1. **Task 1 RED:** `a194acd` test(08-06): add failing evaluation report tests
2. **Task 1 GREEN:** `79dfd39` feat(08-06): implement evaluation report assembler
3. **Task 2 RED:** `fc2345d` test(08-06): add failing evaluation runner tests
4. **Task 2 GREEN:** `3f06e27` feat(08-06): implement evaluation stage runner
5. **Task 3:** `4b3ab5b` test(08-06): add evaluation runner no-fs contract

## Verification

- `pnpm --filter @protostar/evaluation test` passed: 65 tests.
- `pnpm --filter @protostar/evaluation-runner build` passed.
- `pnpm --filter @protostar/evaluation-runner test` passed: 12 tests.
- `pnpm --filter @protostar/evaluation-runner test -- --test-name-pattern no-fs` passed after reverting the smoke import.
- No forbidden fs/path imports outside `no-fs.contract.test.ts`.
- `pnpm -r build` blocked in `apps/factory-cli`:
  - `apps/factory-cli/src/exec-coord-trigger.ts(364,60): TS2366`
  - `apps/factory-cli/src/main.ts(989,5): TS2353` old `createEvaluationReport({ reviewGate })` call
  - `apps/factory-cli/src/main.ts(2530,57): TS2366`
- `pnpm run verify` blocked on the same factory-cli typecheck errors.

## Files Created/Modified

- `packages/evaluation/src/create-evaluation-report.ts` - Q-12 report assembly with mechanical, semantic, and optional consensus stages.
- `packages/evaluation/src/create-evaluation-report.test.ts` - Eight report assembly cases.
- `packages/evaluation/src/index.ts` - Removes the legacy overload and exports the real assembler.
- `packages/evaluation-runner/src/run-evaluation-stages.ts` - Orchestrates evaluation stages and evolution decisions.
- `packages/evaluation-runner/src/run-evaluation-stages.test.ts` - Ten runner cases covering happy paths, refusals, consensus, and evolution.
- `packages/evaluation-runner/src/no-fs.contract.test.ts` - Static no-fs/no-path authority contract.
- `packages/evaluation-runner/package.json` - Uses `tsc -b` so project references build correctly.

## Decisions Made

- Left `apps/factory-cli/src/main.ts` untouched because it was already dirty and excluded from this plan's ownership list. The stale call site remains for Plan 08-07.
- Kept `snapshotReader` injected; the runner never imports filesystem or path modules.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated adjacent legacy tests after stub removal**
- **Found during:** Task 1
- **Issue:** `packages/evaluation/src/types.test.ts` still asserted the deprecated degraded overload.
- **Fix:** Converted it to a type-level negative assertion that the reviewGate-shaped input is no longer accepted.
- **Files modified:** `packages/evaluation/src/types.test.ts`
- **Verification:** `pnpm --filter @protostar/evaluation test` passed.
- **Committed in:** `79dfd39`

**2. [Rule 3 - Blocking] Repaired evaluation-runner build script and placeholder barrel test**
- **Found during:** Task 2
- **Issue:** `pnpm --filter @protostar/evaluation-runner build` used `tsconfig.build.json`, which pulled workspace source files under the runner `rootDir`; the placeholder `index.test.ts` expected the runner to throw.
- **Fix:** Switched the package build script to `tsc -b` and updated the barrel test to assert the real function export.
- **Files modified:** `packages/evaluation-runner/package.json`, `packages/evaluation-runner/src/index.test.ts`
- **Verification:** `pnpm --filter @protostar/evaluation-runner build` and `pnpm --filter @protostar/evaluation-runner test` passed.
- **Committed in:** `3f06e27`

---

**Total deviations:** 2 auto-fixed (Rule 3).  
**Impact on plan:** Both were directly required to keep planned package tests/builds green after replacing placeholders with real APIs.

## Issues Encountered

- Repo-wide verification cannot pass until the factory-cli call site is updated to the new report signature. That file was already dirty and outside this plan's allowed ownership list, so it was not modified.
- `pnpm -r build` emits untracked compiled artifacts into package `src/` directories before failing in factory-cli. These generated files were removed and not committed.

## Known Stubs

None in files created by this plan.

## Threat Flags

None. The new runner adds network orchestration through `@protostar/dogpile-adapter` and an injected reader, but no filesystem/path imports or new trust-boundary file access.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 08-07 should replace the stale factory-cli `createEvaluationReport({ runId, reviewGate })` call with `runEvaluationStages`, then persist the returned report, snapshot, evolution decision, and refusal evidence.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/08-evaluation-evolution/08-06-evaluation-runner-SUMMARY.md`.
- Task commits `a194acd`, `79dfd39`, `fc2345d`, `3f06e27`, and `4b3ab5b` were found in `git log --all`.
- Plan-owned package verification commands passed.

---
*Phase: 08-evaluation-evolution*  
*Completed: 2026-04-28*
