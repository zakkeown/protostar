---
phase: 08-evaluation-evolution
plan: 08
subsystem: admission-e2e
tags: [admission-e2e, evaluation, evolution, contracts, jsonl]

requires:
  - phase: 08-06
    provides: runEvaluationStages and static evaluation-runner no-fs contract
  - phase: 08-07
    provides: factory-cli evaluation/evolution wiring, prior planning summaries, and calibration log append shape
provides:
  - EVAL-04 no-skipped evaluation contract
  - EvaluationResult refusal byte-equality contract
  - Runtime evaluation-runner no-fs defense contract
  - PriorGenerationSummary planning mission inclusion/exclusion contract
  - Calibration JSONL append shape contract
affects: [08-evaluation-evolution, admission-e2e, evaluation-runner, dogpile-adapter, factory-cli]

tech-stack:
  added: ["@protostar/evaluation and @protostar/evaluation-runner dependencies in @protostar/admission-e2e"]
  patterns:
    - Cross-package admission-e2e contracts around Phase 8 invariants
    - Hermetic evaluation-runner fixture inputs for runtime contract tests
    - Isolated temp JSONL writes for generated calibration artifacts

key-files:
  created:
    - packages/admission-e2e/src/no-skipped-evaluation.contract.test.ts
    - packages/admission-e2e/src/eval-refusal-byte-equality.contract.test.ts
    - packages/admission-e2e/src/evaluation-runner-no-fs.contract.test.ts
    - packages/admission-e2e/src/planning-mission-prior-summary.contract.test.ts
    - packages/admission-e2e/src/calibration-log-append.contract.test.ts
  modified:
    - packages/admission-e2e/package.json
    - packages/admission-e2e/tsconfig.json
    - pnpm-lock.yaml
    - .gitignore

key-decisions:
  - "Admission-e2e imports @protostar/evaluation and @protostar/evaluation-runner directly for hermetic cross-package contracts."
  - "Calibration append testing writes to isolated temp directories instead of the real workspace .protostar path."
  - "Evaluation refusal symmetry is pinned against the EvaluationResult schema without widening factory-cli pile persistence in this plan."

patterns-established:
  - "No-skipped evaluation is pinned by both source scanning and runtime report parsing."
  - "Runtime no-fs defense combines an admission-e2e static scan with a fake-pile runEvaluationStages exercise."

requirements-completed: [EVAL-04, EVOL-01, EVOL-02, EVOL-03]

duration: 22min
completed: 2026-04-28
---

# Phase 8 Plan 8: Admission E2E Contracts Summary

**Five admission-e2e contracts now pin Phase 8 evaluation/evolution invariants across report verdicts, refusal evidence, no-fs authority, prior-generation planning context, and calibration JSONL output.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-04-28T17:12:30Z
- **Completed:** 2026-04-28T17:34:30Z
- **Tasks:** 5
- **Files modified:** 9

## Accomplishments

- Closed the EVAL-04 risk-register row with static and runtime checks proving evaluation reports never emit `"skipped"` verdicts.
- Added evaluation refusal symmetry coverage for `EvaluationResult` / `pile-evaluation` schema-parse failures.
- Added defense-in-depth around `@protostar/evaluation-runner` filesystem authority using a static scan plus runtime fake-pile exercise.
- Pinned `PriorGenerationSummary` mission text and `includePriorCodeHints` gating.
- Pinned calibration JSONL line-count and entry shape for first-run and second-run evolution decisions.

## Task Commits

Each task was committed atomically:

1. **Task 1: No skipped evaluation contract** - `c86cf33` (test)
2. **Task 2: Eval refusal byte equality contract** - `dcfe5ac` (test)
3. **Task 3: Evaluation runner no-fs contract** - `d884518` (test)
4. **Task 4: Planning mission prior summary contract** - `2e64945` (test)
5. **Task 5: Calibration log append contract** - `db120e1` (test)

Support cleanup:

- `f19a485` (chore) removed an unused temporary factory-cli export.
- `76d1ac3` (chore) ignored generated `.protostar/calibration/` and `.protostar/evolution/` runtime artifacts.

## Files Created/Modified

- `packages/admission-e2e/src/no-skipped-evaluation.contract.test.ts` - Static and runtime EVAL-04 report-verdict contract.
- `packages/admission-e2e/src/eval-refusal-byte-equality.contract.test.ts` - Evaluation refusal byte-equality contract modulo `parseErrors`.
- `packages/admission-e2e/src/evaluation-runner-no-fs.contract.test.ts` - Evaluation-runner static/runtime no-fs defense.
- `packages/admission-e2e/src/planning-mission-prior-summary.contract.test.ts` - Prior summary inclusion and code-hint exclusion contract.
- `packages/admission-e2e/src/calibration-log-append.contract.test.ts` - Calibration JSONL append and entry shape contract.
- `packages/admission-e2e/package.json` - Added evaluation/evaluation-runner workspace dependencies.
- `packages/admission-e2e/tsconfig.json` - Added project references for those dependencies.
- `pnpm-lock.yaml` - Updated admission-e2e workspace importer metadata.
- `.gitignore` - Ignored generated calibration/evolution runtime directories.

## Decisions Made

- Used hermetic `runEvaluationStages` fixture calls for runtime evaluation checks so contracts do not require live LM Studio or mutate real run state.
- Kept calibration tests isolated with temp directories while preserving the exact `.protostar/calibration/ontology-similarity.jsonl` path literal and entry shape.
- Mirrored evaluation refusal artifact shape locally because the existing public `writePileArtifacts` helper does not expose evaluation as a pile artifact kind.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added admission-e2e evaluation package references**
- **Found during:** Task 1
- **Issue:** `@protostar/admission-e2e` could not import `@protostar/evaluation-runner` or `@protostar/evaluation` until workspace metadata was updated.
- **Fix:** Added dependencies, TypeScript project references, and refreshed `pnpm-lock.yaml`.
- **Files modified:** `packages/admission-e2e/package.json`, `packages/admission-e2e/tsconfig.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter @protostar/admission-e2e test --run no-skipped-evaluation`
- **Committed in:** `c86cf33`

**2. [Rule 3 - Blocking] Removed unused temporary factory-cli main export**
- **Found during:** Task 5 cleanup
- **Issue:** Early setup added a `@protostar/factory-cli/main` export that the final contracts did not need, expanding public surface unnecessarily.
- **Fix:** Removed the export and reran admission-e2e.
- **Files modified:** `apps/factory-cli/package.json`
- **Verification:** `pnpm --filter @protostar/admission-e2e test`
- **Committed in:** `f19a485`

**3. [Rule 3 - Blocking] Ignored generated evolution runtime artifacts**
- **Found during:** Plan-level verification
- **Issue:** `pnpm run verify` generated `.protostar/calibration/` and `.protostar/evolution/` runtime files that were untracked.
- **Fix:** Added both generated directories to `.gitignore`.
- **Files modified:** `.gitignore`
- **Verification:** `git status --short` no longer reports those generated directories.
- **Committed in:** `76d1ac3`

---

**Total deviations:** 3 auto-fixed (3 Rule 3)
**Impact on plan:** All fixes were narrow support work for contract compilation or generated-artifact hygiene. No architecture change was introduced.

## Issues Encountered

- The GSD SDK was not installed at `node_modules/@gsd-build/sdk`, so planning state updates were applied directly to markdown files, matching the prior Phase 8 Plan 07 fallback.
- A temporary smoke insertion of `node:fs/promises` into `runEvaluationStages` correctly failed `evaluation-runner-no-fs`; the temporary line was reverted before commit.

## Verification

- `pnpm --filter @protostar/admission-e2e test --run no-skipped-evaluation` - passed.
- `pnpm --filter @protostar/admission-e2e test --run eval-refusal-byte-equality` - passed.
- `pnpm --filter @protostar/admission-e2e test --run evaluation-runner-no-fs` - passed.
- `pnpm --filter @protostar/admission-e2e test --run planning-mission-prior-summary` - passed.
- `pnpm --filter @protostar/admission-e2e test --run calibration-log-append` - passed.
- `pnpm --filter @protostar/admission-e2e test` - passed, 103 tests.
- `pnpm run verify` - passed.

## Known Stubs

None in the admission-e2e contracts. The calibration JSONL remains the intentional Phase 8 stub output consumed by Phase 10 calibration work.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 8 is verification-ready: every CONTEXT.md decision Q-01 through Q-20 now has unit, package, or admission-e2e coverage, and the final high-risk invariants from the risk register are pinned.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/08-evaluation-evolution/08-08-admission-e2e-contracts-SUMMARY.md`.
- Task commits found: `c86cf33`, `dcfe5ac`, `d884518`, `2e64945`, `db120e1`.
- Support commits found: `f19a485`, `76d1ac3`.
- Plan-level verification passed with `pnpm --filter @protostar/admission-e2e test` and `pnpm run verify`.

---
*Phase: 08-evaluation-evolution*
*Completed: 2026-04-28*
