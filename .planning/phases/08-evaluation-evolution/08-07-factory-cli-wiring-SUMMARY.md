---
phase: 08-evaluation-evolution
plan: 07
subsystem: factory-cli
tags: [factory-cli, evaluation-runner, evolution, lineage, jsonl, calibration]

requires:
  - phase: 08-02
    provides: evaluation/evolution config schema and eval refusal types
  - phase: 08-04
    provides: mechanical score data on review gates
  - phase: 08-06
    provides: runEvaluationStages and runner-owned ontology snapshots
provides:
  - CLI flags and config resolvers for evaluation judge models, lineage, generation, and code-evolution opt-in
  - factory-cli wiring from review output into runEvaluationStages
  - run-scoped evolution snapshot persistence and lineage JSONL chain index
  - append-only calibration log for future threshold calibration
  - optional prior-generation context in Dogpile planning missions
affects: [08-evaluation-evolution, factory-cli, dogpile-adapter, evaluation-runner, admission-e2e]

tech-stack:
  added: ["@protostar/evaluation-runner dependency in @protostar/factory-cli"]
  patterns:
    - CLI > config > built-in default resolver precedence
    - tmp file + fsync + rename for run snapshot persistence
    - append-only JSONL indexes under .protostar
    - deterministic evaluation fixture pile for factory-cli fixture-mode tests

key-files:
  created:
    - apps/factory-cli/src/evolution-snapshot-writer.ts
    - apps/factory-cli/src/evolution-snapshot-writer.test.ts
    - apps/factory-cli/src/evolution-chain-index.ts
    - apps/factory-cli/src/evolution-chain-index.test.ts
    - apps/factory-cli/src/calibration-log.ts
    - apps/factory-cli/src/calibration-log.test.ts
  modified:
    - apps/factory-cli/src/main.ts
    - apps/factory-cli/src/cli-args.ts
    - apps/factory-cli/src/load-factory-config.ts
    - apps/factory-cli/src/load-factory-config.test.ts
    - apps/factory-cli/src/exec-coord-trigger.ts
    - apps/factory-cli/package.json
    - apps/factory-cli/tsconfig.json
    - packages/dogpile-adapter/src/index.ts
    - packages/dogpile-adapter/src/public-candidate-plan.contract.test.ts
    - packages/evaluation-runner/src/run-evaluation-stages.ts
    - pnpm-lock.yaml

key-decisions:
  - "Fixture-mode factory CLI runs still route through runEvaluationStages, but use a deterministic local evaluation pile outcome to keep tests hermetic."
  - "Missing prior snapshot files are ignored so stale or manually edited chain indexes do not block a fresh factory run."
  - "The convergence threshold is resolved in factory-cli and threaded into the evaluation runner instead of re-reading config in a pure/domain package."

patterns-established:
  - "Factory CLI owns Phase 8 filesystem authority: snapshots, chain index, calibration log, and eval refusal artifacts."
  - "Dogpile planning missions can include prior-generation context without exposing prior code hints unless evolution is explicitly opted in."

requirements-completed: [EVAL-04, EVOL-01, EVOL-02, EVOL-03]

duration: 17min
completed: 2026-04-28
---

# Phase 8 Plan 7: Factory CLI Wiring Summary

**Factory CLI now drives the real evaluation runner, persists lineage snapshots, and feeds prior-generation summaries into planning.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-04-28T16:49:25Z
- **Completed:** 2026-04-28T17:06:48Z
- **Tasks:** 3
- **Files modified:** 17

## Accomplishments

- Added all five evaluation/evolution CLI flags and six config/default resolver helpers.
- Added atomic run snapshot persistence, lineage JSONL read/write helpers, and calibration log append support.
- Replaced factory-cli's stub evaluation/evolution path with `runEvaluationStages`, chain index appends, calibration entries, and `pile-evaluation` refusal artifacts.
- Extended Dogpile planning missions with a prior-generation summary block while keeping code-state hints behind `--evolve-code`.

## Task Commits

Each task was committed atomically:

1. **Task 1: CLI flags + factory-config plumbing** - `7c50d85` (feat)
2. **Task 2: Evolution persistence helpers** - `1ba44d6` (feat)
3. **Task 3: Factory CLI evaluation runner wiring** - `897a34e` (feat)

**Plan metadata:** final docs commit records this summary and planning state updates.

## Files Created/Modified

- `apps/factory-cli/src/cli-args.ts` - Parses `--lineage`, `--evolve-code`, `--generation`, `--semantic-judge-model`, and `--consensus-judge-model`.
- `apps/factory-cli/src/load-factory-config.ts` - Resolves judge models, code-evolution mode, lineage ID, generation, and convergence threshold.
- `apps/factory-cli/src/evolution-snapshot-writer.ts` - Atomically writes `runs/{id}/evolution/snapshot.json`.
- `apps/factory-cli/src/evolution-chain-index.ts` - Reads/writes `.protostar/evolution/{lineageId}.jsonl`.
- `apps/factory-cli/src/calibration-log.ts` - Appends `.protostar/calibration/ontology-similarity.jsonl`.
- `apps/factory-cli/src/main.ts` - Calls `runEvaluationStages`, persists snapshot/chain/calibration artifacts, and writes eval refusal artifacts.
- `packages/dogpile-adapter/src/index.ts` - Adds `PriorGenerationSummary` and optional mission context.
- `packages/evaluation-runner/src/run-evaluation-stages.ts` - Accepts an injected convergence threshold.

## Decisions Made

- Fixture-mode CLI tests remain deterministic by invoking the real runner with a local fixture evaluation pile response.
- Factory CLI computes and persists lineage state because it is the package with filesystem authority.
- Prior code hints are excluded by default and only included when `--evolve-code` or `evolution.codeEvolution: "opt-in"` is set.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added factory-cli dependency/reference for evaluation-runner**
- **Found during:** Task 3
- **Issue:** `apps/factory-cli` could not import `@protostar/evaluation-runner` without workspace metadata.
- **Fix:** Added package dependency, TypeScript project reference, and lockfile importer update.
- **Files modified:** `apps/factory-cli/package.json`, `apps/factory-cli/tsconfig.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter @protostar/factory-cli build`
- **Committed in:** `897a34e`

**2. [Rule 2 - Missing Critical] Threaded convergence threshold into the runner**
- **Found during:** Task 3
- **Issue:** The plan required factory-cli to resolve `evolution.convergenceThreshold`, but the runner input had no field for it.
- **Fix:** Added optional `convergenceThreshold` to `RunEvaluationStagesInput` and passed it to `decideEvolution`.
- **Files modified:** `packages/evaluation-runner/src/run-evaluation-stages.ts`, `apps/factory-cli/src/main.ts`
- **Verification:** `pnpm --filter @protostar/evaluation-runner test`
- **Committed in:** `897a34e`

**3. [Rule 3 - Blocking] Added eval-consensus-block formatting**
- **Found during:** Task 3
- **Issue:** Phase 8 widened `PileFailure` with `eval-consensus-block`; factory-cli formatting switches were no longer exhaustive.
- **Fix:** Added formatting cases in the main CLI path and exec-coordination trigger.
- **Files modified:** `apps/factory-cli/src/main.ts`, `apps/factory-cli/src/exec-coord-trigger.ts`
- **Verification:** `pnpm --filter @protostar/factory-cli build`
- **Committed in:** `897a34e`

**4. [Rule 1 - Bug] Tolerated missing prior snapshot files**
- **Found during:** Task 3
- **Issue:** A stale chain index line could point to a missing snapshot and block a new run before evaluation.
- **Fix:** Prior-generation summary loading ignores missing snapshots and proceeds as a first-generation-style run.
- **Files modified:** `apps/factory-cli/src/main.ts`
- **Verification:** `pnpm --filter @protostar/factory-cli test`
- **Committed in:** `897a34e`

---

**Total deviations:** 4 auto-fixed (1 Rule 1, 1 Rule 2, 2 Rule 3)
**Impact on plan:** All deviations were required to make the planned wiring compile, preserve config semantics, or keep stale runtime state from blocking runs. No architectural change was needed.

## Issues Encountered

- `pnpm run factory` built successfully and then stopped at the expected workspace-trust gate with exit code 2: `workspace is not trusted; escalation required before factory can proceed`.
- The GSD SDK `query` subcommands were unavailable in this checkout, so planning metadata updates were applied directly to the markdown state files.

## Verification

- `pnpm --filter @protostar/evaluation-runner test` - passed, 12 tests.
- `pnpm --filter @protostar/dogpile-adapter test` - passed, 46 tests.
- `pnpm --filter @protostar/factory-cli build` - passed.
- `pnpm --filter @protostar/factory-cli test` - passed, 213 tests.
- `pnpm run verify` - passed.
- `pnpm run factory` - built successfully, then stopped at the expected workspace-trust gate.

## Known Stubs

- `apps/factory-cli/src/calibration-log.ts` writes the Phase 8 calibration log required by Q-18; its empirical consumer is intentionally deferred to Phase 10 dogfood runs.

## User Setup Required

None - no external service configuration required beyond the existing LM Studio/provider setup for live pile modes.

## Next Phase Readiness

Plan 08-08 can now add admission-e2e contracts around no-skipped evaluation output, eval refusal byte equality, prior planning summaries, and calibration log append behavior.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/08-evaluation-evolution/08-07-factory-cli-wiring-SUMMARY.md`.
- Task commits found: `7c50d85`, `1ba44d6`, `897a34e`.
- ROADMAP marks 08-07 complete and REQUIREMENTS marks this plan's declared IDs complete.

---
*Phase: 08-evaluation-evolution*
*Completed: 2026-04-28*
