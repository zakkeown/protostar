---
phase: 08-evaluation-evolution
plan: 04
subsystem: evaluation
tags: [mechanical-checks, review, evaluation, tdd]

requires:
  - phase: 08-evaluation-evolution
    provides: 08-02 ReviewGate mechanicalScores type extension
provides:
  - Mechanical score producer in @protostar/mechanical-checks
  - Mechanical-checks adapter evidence populated with mechanicalScores
affects: [08-evaluation-evolution, review-loop, evaluation-runner]

tech-stack:
  added: []
  patterns: [TDD red/green commits, pure score formulas, additive evidence fields]

key-files:
  created: []
  modified:
    - packages/mechanical-checks/src/findings.ts
    - packages/mechanical-checks/src/findings.test.ts
    - packages/mechanical-checks/src/create-mechanical-checks-adapter.ts
    - packages/mechanical-checks/src/create-mechanical-checks-adapter.test.ts
    - packages/mechanical-checks/src/index.ts

key-decisions:
  - "Kept score production in @protostar/mechanical-checks and did not import @protostar/evaluation."
  - "Mapped verify/build command ids to the build score to match existing build-failure finding semantics."
  - "Emitted mechanicalScores on mechanical-checks evidence because ReviewGate assembly lives in factory-cli wiring, outside this plan's allowed file scope."

patterns-established:
  - "Mechanical score formulas are pure and covered independently from finding emission."
  - "Adapter-level scores are additive; existing findings and evidence fields remain unchanged."

requirements-completed: [EVAL-01]

duration: 5min
completed: 2026-04-28
---

# Phase 08 Plan 04: Mechanical Scores Producer Summary

**Mechanical-checks now produces Q-02 numeric scores from command, diff, and AC evidence while preserving existing findings behavior.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-28T16:15:14Z
- **Completed:** 2026-04-28T16:20:21Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `computeMechanicalScoresFromFindings` with the four Q-02 dimensions: `build`, `lint`, `diffSize`, and `acCoverage`.
- Covered all eight score formula cases, including absent commands, oversized cosmetic diffs, partial AC coverage, and zero ACs.
- Threaded scores into the mechanical-checks adapter evidence object without changing existing finding emission.

## Task Commits

1. **Task 1 RED:** `2b43697` test(08-04): add failing mechanical scores producer tests
2. **Task 1 GREEN:** `006e6e3` feat(08-04): implement mechanical scores producer
3. **Task 2 RED:** `6b94b41` test(08-04): add failing adapter mechanical score tests
4. **Task 2 GREEN:** `1bf4e90` feat(08-04): emit adapter mechanical scores

## Verification

- `pnpm --filter @protostar/mechanical-checks test --run findings` passed.
- `pnpm --filter @protostar/mechanical-checks test --run create-mechanical-checks-adapter` passed.
- `pnpm --filter @protostar/mechanical-checks test` passed.
- `pnpm --filter @protostar/mechanical-checks build` passed.
- Acceptance greps passed:
  - `computeMechanicalScoresFromFindings` export count in `findings.ts`: 1
  - `MechanicalScores` count in `findings.ts`: 3
  - `computeMechanicalScoresFromFindings` count in `index.ts`: 1
  - `mechanicalScores` count in adapter: 3
  - `computeMechanicalScoresFromFindings` count in adapter: 2
- `pnpm run verify` blocked on unrelated pre-existing factory-cli TypeScript errors:
  - `apps/factory-cli/src/exec-coord-trigger.ts(364,60): error TS2366`
  - `apps/factory-cli/src/main.ts(2530,57): error TS2366`
- `pnpm run factory` blocked on the same unrelated factory-cli TypeScript errors during `pnpm run build`.

## Files Created/Modified

- `packages/mechanical-checks/src/findings.ts` - Adds `MechanicalScoresInput` and the pure score producer.
- `packages/mechanical-checks/src/findings.test.ts` - Adds eight Q-02 formula tests.
- `packages/mechanical-checks/src/create-mechanical-checks-adapter.ts` - Computes adapter evidence `mechanicalScores` from command results, diff, archetype, and AC coverage.
- `packages/mechanical-checks/src/create-mechanical-checks-adapter.test.ts` - Adds three adapter score tests.
- `packages/mechanical-checks/src/index.ts` - Adds explicit producer/type re-exports.

## Decisions Made

- `@protostar/evaluation` remains separate; this producer shares Q-02 as the formula spec rather than importing the evaluation helper.
- `verify*` command ids count as the build score input because existing mechanical findings classify `verify*` and `build*` failures as build failures.
- The adapter emits `mechanicalScores` on mechanical evidence. The final `ReviewGate` threading remains a downstream wiring responsibility because `apps/factory-cli/src/wiring/review-loop.ts` was outside this plan's allowed file scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Preserved verify-as-build semantics for scores**
- **Found during:** Task 2
- **Issue:** The plan text referred to `id === "build"`, but the package's default mechanical command and existing build-failure rule use `verify*`.
- **Fix:** Scored the build dimension from `verify*` or `build*` command ids so default mechanical checks cannot fail `verify` while reporting build score `1`.
- **Files modified:** `packages/mechanical-checks/src/create-mechanical-checks-adapter.ts`, `packages/mechanical-checks/src/create-mechanical-checks-adapter.test.ts`
- **Verification:** Adapter tests passed, including a passing `verify`/`lint` score case.
- **Committed in:** `1bf4e90`

**Total deviations:** 1 auto-fixed (Rule 2).  
**Impact on plan:** The score producer follows the existing mechanical-checks command semantics and avoids a false-pass build score for default `verify` failures.

## Issues Encountered

- The package test script runs compiled `dist/**/*.test.js`, so RED gates required `pnpm --filter @protostar/mechanical-checks build` before running source test changes.
- The plan requested `ReviewGate` threading, but `ReviewGate` assembly occurs in `apps/factory-cli/src/wiring/review-loop.ts`, which was explicitly out of scope for this concurrent plan. This plan stopped at mechanical-checks evidence emission.

## Known Stubs

None - stub-pattern scan found only local empty arrays/strings used as accumulators or fixtures.

## Threat Flags

None - no new network endpoints, auth paths, filesystem authority, or schema trust boundary were introduced in `packages/mechanical-checks`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Downstream evaluation wiring can consume `mechanicalScores` from mechanical-checks evidence and thread it into `ReviewGate` where factory-cli review-loop assembly is in scope.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/08-evaluation-evolution/08-04-mechanical-scores-producer-SUMMARY.md`.
- Task commits `2b43697`, `006e6e3`, `6b94b41`, and `1bf4e90` were found in `git log`.

---
*Phase: 08-evaluation-evolution*
*Completed: 2026-04-28*
