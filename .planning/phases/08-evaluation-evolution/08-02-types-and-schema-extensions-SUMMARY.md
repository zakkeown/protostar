---
phase: 08-evaluation-evolution
plan: 02
subsystem: evaluation
tags: [evaluation, review, dogpile, refusals, factory-config, tdd]

requires:
  - phase: 08-evaluation-evolution
    provides: 08-01 evaluation-runner skeleton
provides:
  - Evaluation result type surface with numeric verdict/score contracts
  - ReviewGate mechanicalScores extension
  - Evaluation pile failure/refusal type extensions
  - Factory config evaluation/evolution schema and loader fields
affects: [08-evaluation-evolution, factory-cli, dogpile-adapter, lmstudio-adapter]

tech-stack:
  added: []
  patterns: [TDD red/green commits, exactOptionalPropertyTypes optional spreads, schema plus TS mirror validation]

key-files:
  created:
    - packages/evaluation/src/types.test.ts
    - packages/review/src/mechanical-scores.test.ts
    - packages/dogpile-adapter/src/pile-failure-types.test.ts
  modified:
    - packages/evaluation/src/index.ts
    - packages/review/src/index.ts
    - packages/dogpile-adapter/src/pile-failure-types.ts
    - apps/factory-cli/src/refusals-index.ts
    - apps/factory-cli/src/refusals-index.test.ts
    - packages/lmstudio-adapter/src/factory-config.schema.json
    - packages/lmstudio-adapter/src/factory-config.ts
    - packages/lmstudio-adapter/src/factory-config.test.ts

key-decisions:
  - "Retained createEvaluationReport({ runId, reviewGate }) as a degraded fail-only compatibility stub until Plans 08-06/08-07 replace it."
  - "Used a structural ConsensusBreakdown copy in dogpile-adapter to avoid widening package dependencies outside the user-scoped file list."

patterns-established:
  - "Evaluation stages use verdict plus numeric score; no skipped stage verdict."
  - "Factory config blocks remain optional and reject unknown keys at each nested trust boundary."

requirements-completed: [EVAL-01, EVAL-02, EVAL-03, EVAL-04, EVOL-01, EVOL-02, EVOL-03]

duration: 6min
completed: 2026-04-28
---

# Phase 08 Plan 02: Types and Schema Extensions Summary

**Evaluation, review, refusal, and factory-config contracts now expose the Phase 8 type surface that downstream scoring/evolution plans depend on.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-28T16:06:52Z
- **Completed:** 2026-04-28T16:12:45Z
- **Tasks:** 4
- **Files modified:** 11 plan files

## Accomplishments

- Added the Phase 8 evaluation contract: `EvaluationStageResult` is now `{ stage, verdict, score, scores?, summary }`, `EvaluationStageStatus` is `"pass" | "fail"`, rubric dimensions are fixed, and threshold/result interfaces are exported.
- Extended `ReviewGate` with optional `mechanicalScores` and preserved backward compatibility for callers without scores.
- Added the evaluation pile refusal surface: `PileKind = "evaluation"`, `PileSourceOfTruth = "EvaluationResult"`, `eval-consensus-block`, and `RefusalStage = "pile-evaluation"`.
- Added `factory-config.json` support for `evaluation.semanticJudge`, `evaluation.consensusJudge`, and `evolution.{lineage,codeEvolution,convergenceThreshold}` with nested `additionalProperties: false`.

## Task Commits

1. **Task 1 RED:** `36045e7` test(08-02): add failing evaluation type tests
2. **Task 1 GREEN:** `e553d85` feat(08-02): extend evaluation type surface
3. **Task 2 RED:** `affe5de` test(08-02): add failing review mechanical scores tests
4. **Task 2 GREEN:** `2dde1a9` feat(08-02): extend review gate mechanical scores
5. **Task 3 RED:** `bc92d7c` test(08-02): add failing pile evaluation refusal tests
6. **Task 3 GREEN:** `ee6c2be` feat(08-02): extend pile evaluation refusal types
7. **Task 4 RED:** `6ec9cc3` test(08-02): add failing factory config evolution tests
8. **Task 4 GREEN:** `519a15e` feat(08-02): extend factory config evaluation schema

## Verification

- `pnpm --filter @protostar/evaluation test` passed.
- `pnpm --filter @protostar/review test` passed.
- `pnpm --filter @protostar/dogpile-adapter test` passed.
- `pnpm --filter @protostar/lmstudio-adapter test` passed with escalation for local loopback server tests after sandbox `listen EPERM`.
- `grep -rn '"skipped"' packages/evaluation/src/` returned zero matches.
- `pnpm --filter @protostar/factory-cli test --run refusals-index` blocked on unrelated dirty Phase 7 factory-cli errors in `src/exec-coord-trigger.ts` and `src/main.ts`.
- `pnpm -r build` blocked on the same unrelated factory-cli errors.
- `pnpm run verify` blocked on the same unrelated factory-cli errors during `tsc -b --pretty false`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used structural ConsensusBreakdown fallback**
- **Found during:** Task 3
- **Issue:** Importing `ConsensusBreakdown` from `@protostar/evaluation` in `dogpile-adapter` required package dependency/reference edits outside the user-scoped file list.
- **Fix:** Used the plan-approved structural fallback locally in `pile-failure-types.ts`; tests construct the same evidence shape through the public `PileFailure` union.
- **Files modified:** `packages/dogpile-adapter/src/pile-failure-types.ts`, `packages/dogpile-adapter/src/pile-failure-types.test.ts`
- **Verification:** `pnpm --filter @protostar/dogpile-adapter test` passed.
- **Committed in:** `ee6c2be`

**Total deviations:** 1 auto-fixed (Rule 3).  
**Impact on plan:** The public failure contract and threshold evidence shape landed without widening package metadata outside the allowed file set.

## Known Stubs

- `packages/evaluation/src/index.ts` keeps the intentional degraded `createEvaluationReport({ runId, reviewGate })` compatibility stub. It always returns `verdict: "fail"`, stage `score: 0`, and summary `Phase 8 Plan 08-07 replaces this call site.` Plan 08-06 removes this overload; Plan 08-07 removes the legacy call site.

## Issues Encountered

- Existing dirty Phase 7 work prevents factory-cli and repo-wide verification from completing:
  - `apps/factory-cli/src/exec-coord-trigger.ts(364,60): error TS2366`
  - `apps/factory-cli/src/main.ts(2530,57): error TS2366`
- These files were explicitly out of scope for 08-02 and were not modified or staged.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Wave 2+ can depend on the new type/schema surface. Repo-wide verification should be rerun after the unrelated Phase 7 factory-cli dirt is resolved.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/08-evaluation-evolution/08-02-types-and-schema-extensions-SUMMARY.md`.
- All eight task commits were found in `git log --all`.

---
*Phase: 08-evaluation-evolution*
*Completed: 2026-04-28*
