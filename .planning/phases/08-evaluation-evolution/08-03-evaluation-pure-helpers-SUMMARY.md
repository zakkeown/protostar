---
phase: 08-evaluation-evolution
plan: 03
subsystem: evaluation
tags: [evaluation, consensus, ontology, lineage, tdd]

requires:
  - phase: 08-evaluation-evolution
    provides: 08-02 numeric evaluation types, rubric dimensions, thresholds, and ReviewGate mechanicalScores
provides:
  - Pure mechanical scoring helper
  - Pure semantic confidence and consensus-gating helpers
  - Doubly-harsh consensus evaluator with threshold-hit breakdown
  - Spec ontology snapshot helper from confirmed intent
  - Deterministic canonical lineage hash helper
affects: [08-evaluation-evolution, evaluation-runner, factory-cli]

tech-stack:
  added: [node:crypto]
  patterns: [TDD red/green commits, pure helper modules, canonical JSON hashing]

key-files:
  created:
    - packages/evaluation/src/compute-mechanical-scores.ts
    - packages/evaluation/src/compute-mechanical-scores.test.ts
    - packages/evaluation/src/compute-semantic-confidence.ts
    - packages/evaluation/src/compute-semantic-confidence.test.ts
    - packages/evaluation/src/should-run-consensus.ts
    - packages/evaluation/src/should-run-consensus.test.ts
    - packages/evaluation/src/evaluate-consensus.ts
    - packages/evaluation/src/evaluate-consensus.test.ts
    - packages/evaluation/src/create-spec-ontology-snapshot.ts
    - packages/evaluation/src/create-spec-ontology-snapshot.test.ts
    - packages/evaluation/src/lineage-hash.ts
    - packages/evaluation/src/lineage-hash.test.ts
  modified:
    - packages/evaluation/src/index.ts
    - packages/evaluation/package.json
    - packages/evaluation/tsconfig.json

key-decisions:
  - "Helper modules use type-only imports from the evaluation barrel and local Phase 8 literal constants to avoid ESM initialization cycles caused by barrel re-exports."
  - "The evaluation package now depends on @protostar/intent because createSpecOntologySnapshot and computeLineageId intentionally accept ConfirmedIntent."

patterns-established:
  - "Consensus failure evidence records judge means, dimension means, threshold values, and thresholdsHit."
  - "Lineage identity hashes only normalized problem text and ordered acceptance-criteria structure."

requirements-completed: [EVAL-01, EVAL-02, EVAL-03, EVOL-01]

duration: 9min
completed: 2026-04-28
---

# Phase 08 Plan 03: Evaluation Pure Helpers Summary

**Pure evaluation scoring, consensus, spec snapshot, and lineage hashing helpers now cover the Phase 8 evaluation math with 39 new TDD cases.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-28T16:15:00Z
- **Completed:** 2026-04-28T16:24:13Z
- **Tasks:** 3
- **Files modified:** 15 plan files

## Accomplishments

- Added `computeMechanicalScores`, `computeSemanticConfidence`, and `shouldRunConsensus` with the Q-02/Q-05/Q-12 formulas.
- Added `evaluateConsensus` with the Q-09 doubly-harsh rule, missing-dimension validation, and explicit 16-case truth-table coverage.
- Added `createSpecOntologySnapshot` and `computeLineageId` for Q-13/Q-15 downstream factory-cli wiring.
- Re-exported all helper modules through `packages/evaluation/src/index.ts`.

## Task Commits

1. **Task 1 RED:** `e18e28c` test(08-03): add failing basic evaluation helper tests
2. **Task 1 GREEN:** `50a7002` feat(08-03): implement basic evaluation helpers
3. **Task 2 RED:** `cd099c7` test(08-03): add failing consensus evaluation tests
4. **Task 2 GREEN:** `92c225e` feat(08-03): implement consensus evaluation helper
5. **Task 3 RED:** `361c023` test(08-03): add failing spec snapshot lineage tests
6. **Task 3 GREEN:** `8f9951e` feat(08-03): implement spec snapshot lineage helpers

## Verification

- `pnpm --filter @protostar/evaluation test` passed: 45 tests total, including 39 new plan tests.
- `pnpm --filter @protostar/evaluation build` passed.
- Helper re-export grep found all six helper barrel exports.
- No `node:fs`, `node:path`, `fs`, or `path` imports were found in new helper files.
- `pnpm run verify` blocked on unrelated dirty Phase 7 files:
  - `apps/factory-cli/src/exec-coord-trigger.ts(364,60): error TS2366`
  - `apps/factory-cli/src/main.ts(2530,57): error TS2366`
- `pnpm run factory` blocked on the same unrelated Phase 7 TypeScript errors during `pnpm run build`.

## Files Created/Modified

- `packages/evaluation/src/compute-mechanical-scores.ts` - Mechanical score formulas and verdict min-rule.
- `packages/evaluation/src/compute-semantic-confidence.ts` - Inverse-variance semantic confidence helper.
- `packages/evaluation/src/should-run-consensus.ts` - Strict less-than consensus gate.
- `packages/evaluation/src/evaluate-consensus.ts` - Doubly-harsh consensus evaluator and breakdown producer.
- `packages/evaluation/src/create-spec-ontology-snapshot.ts` - ConfirmedIntent acceptance criteria to generation-0 ontology snapshot.
- `packages/evaluation/src/lineage-hash.ts` - Canonical JSON plus SHA-256 lineage id helper.
- `packages/evaluation/src/*.test.ts` - 39 new helper behavior tests.
- `packages/evaluation/src/index.ts` - Helper barrel re-exports.
- `packages/evaluation/package.json` and `packages/evaluation/tsconfig.json` - Added the planned `@protostar/intent` type dependency/reference.

## Decisions Made

- Kept helpers pure and deterministic; the only new Node import is `node:crypto` in `lineage-hash.ts`.
- Left `apps/factory-cli/src/main.ts` snapshot helper removal to Plan 08-07 as planned.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Avoided evaluation barrel runtime cycles**
- **Found during:** Task 2 (evaluateConsensus implementation)
- **Issue:** Helper modules that runtime-imported constants from `index.ts` crashed under ESM when `index.ts` re-exported those same helpers.
- **Fix:** Changed helper modules to use type-only barrel imports and local Phase 8 literal constants/dimension lists while preserving public constants in `index.ts`.
- **Files modified:** `packages/evaluation/src/compute-mechanical-scores.ts`, `packages/evaluation/src/compute-semantic-confidence.ts`, `packages/evaluation/src/should-run-consensus.ts`, `packages/evaluation/src/evaluate-consensus.ts`
- **Verification:** `pnpm --filter @protostar/evaluation test -- --test-name-pattern evaluateConsensus` passed.
- **Committed in:** `92c225e`

**2. [Rule 3 - Blocking] Added @protostar/intent package wiring**
- **Found during:** Task 3 (ConfirmedIntent helper implementation)
- **Issue:** `createSpecOntologySnapshot` and `computeLineageId` intentionally import `ConfirmedIntent`, but `@protostar/evaluation` did not reference `@protostar/intent`.
- **Fix:** Added `@protostar/intent` to `packages/evaluation/package.json` and `../intent` to `packages/evaluation/tsconfig.json` references.
- **Files modified:** `packages/evaluation/package.json`, `packages/evaluation/tsconfig.json`
- **Verification:** `pnpm --filter @protostar/evaluation build` passed.
- **Committed in:** `8f9951e`

---

**Total deviations:** 2 auto-fixed (Rule 3).  
**Impact on plan:** Both fixes were required for the planned helpers to build and run without widening authority beyond `packages/evaluation`.

## Known Stubs

None in files created by this plan.

## Issues Encountered

- Repo-wide verification is still blocked by unrelated Phase 7 dirty factory-cli files. These files were out of scope and were not modified or staged.
- Concurrent Wave 2 plan 08-04 committed `packages/mechanical-checks` work while this plan was running; no 08-04 files were modified by this execution.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plans 08-06 and 08-07 can now compose deterministic scoring helpers, consensus gating, spec snapshots, and default lineage IDs. `createIntentOntologySnapshot` / `createPlanOntologySnapshot` in `apps/factory-cli/src/main.ts` remain slated for removal in Plan 08-07.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/08-evaluation-evolution/08-03-evaluation-pure-helpers-SUMMARY.md`.
- All six task commits were found in `git log --all --grep='08-03'`.
- Plan verification commands for `@protostar/evaluation` passed.

---
*Phase: 08-evaluation-evolution*  
*Completed: 2026-04-28*
