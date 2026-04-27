---
phase: 04-execution-engine
plan: 10
subsystem: execution
tags: [factory-cli, lmstudio, execution, journal, cancellation, admission]

requires:
  - phase: 04-execution-engine
    provides: execution contracts, LM Studio adapter, journal/snapshot helpers, network authorization
provides:
  - factory-cli real executor branch
  - coder-adapter-ready admission gate
  - fs-backed adapter RepoReader
  - SIGINT and CANCEL sentinel wiring
  - real-execution journal, snapshot, evidence, timeout, cancellation, orphan replay, and apply-boundary tests
affects: [factory-cli, execution, planning, authority, lmstudio-adapter, phase-5-review-loop]

tech-stack:
  added: []
  patterns: [append-only journal plus atomic snapshot, injected adapter and apply boundary, admission gate refusal pipeline]

key-files:
  created:
    - apps/factory-cli/src/load-factory-config.ts
    - apps/factory-cli/src/repo-reader-adapter.ts
    - apps/factory-cli/src/cancel.ts
    - apps/factory-cli/src/coder-adapter-admission.ts
    - apps/factory-cli/src/run-real-execution.ts
  modified:
    - apps/factory-cli/src/main.ts
    - apps/factory-cli/src/cli-args.ts
    - packages/execution/src/index.ts
    - packages/planning/src/index.ts
    - packages/authority/src/admission-decision/base.ts
    - .env.example

key-decisions:
  - "Kept `--executor` defaulting to `dry-run` for backward compatibility."
  - "Real executor admission enforces `allowedAdapters` only when real execution or the flag requests it, preserving legacy dry-run fixtures."
  - "Factory config is loaded for all runs so `factoryConfigHash` is present in policy snapshots."

patterns-established:
  - "Real executor lifecycle emits the same EXEC-01 event vocabulary as dry-run."
  - "Apply failure is a run-level block while task evidence remains durable."

requirements-completed: [EXEC-01, EXEC-03, EXEC-04, EXEC-05, EXEC-06, EXEC-07, EXEC-08]

duration: 1h 20m
completed: 2026-04-27
---

# Phase 4 Plan 10: Factory CLI Real Executor Wiring Summary

**Factory CLI now has an approval-gated real executor path from factory config and LM Studio preflight through journaled task execution, apply-boundary evidence, cancellation, and resume bootstrap.**

## Performance

- **Duration:** 1h 20m
- **Started:** 2026-04-27T22:24:00Z
- **Completed:** 2026-04-27T23:43:51Z
- **Tasks:** 4
- **Files modified:** 23

## Accomplishments

- Added `loadFactoryConfig`, `createFsRepoReader`, and `installCancelWiring` with tests for missing config defaults, env precedence, path traversal refusal, globbing, SIGINT listener cleanup, and stale CANCEL unlink.
- Added `coderAdapterReadyAdmission`, extending the existing admission/refusal pipeline with the `coder-adapter-ready` gate and network mint refusal before preflight.
- Added `runRealExecution`, including pending/running/terminal journal events, atomic snapshots, orphan replay, per-task evidence/transcript files, timeout/cancel handling, and apply-failure block semantics.
- Wired `apps/factory-cli/src/main.ts` with `--executor real|dry-run`, `--allowed-adapters`, LM Studio adapter construction, factory-config hash policy evidence, cancel wiring, repo reader injection, and dry-run-compatible output mapping.

## Task Commits

1. **Task 1: factory-config loader + RepoReader fs adapter + cancel wiring** - `9a8c395`
2. **Task 2: coderAdapterReadyAdmission gate** - `aa4717e`
3. **Task 3: runRealExecution loop with apply-boundary, evidence, journal, snapshot, orphan-replay** - `c685897`
4. **Task 4: main.ts integration + end-to-end test** - `72d262b`

## Verification

- `pnpm --filter @protostar/factory-cli test` - passed
- `pnpm run verify` - passed
- `runRealExecution` tests cover happy path, apply failure block, timeout, sentinel cancellation, orphan replay, snapshot interval, dry-run lifecycle vocabulary subset, and pre-image hash drift.
- `main.real-execution.test.ts` pins CLI flags, dry-run default, real branch module wiring, and `factoryConfigHash` policy snapshot wiring.

## Phase 4 Success Criteria Mapping

1. **Task state transitions persisted; kill/resume reaches terminal state** - `run-real-execution.test.ts` orphan replay and journal/snapshot tests.
2. **LM Studio coder adapter can produce non-empty diffs end-to-end** - Adapter path is wired through `createLmstudioCoderAdapter`; execution path is covered with injected adapter change-set tests because live LM Studio is not available in CI.
3. **Second adapter requires no execution contract change** - Existing Plan 08 allowed-adapter contract remains intact; Plan 10 threads `--allowed-adapters` through planning admission for real runs.
4. **Lifecycle events identical between dry-run and real paths** - `run-real-execution.test.ts` asserts real event types are a subset of dry-run event vocabulary.

## Files Created/Modified

- `apps/factory-cli/src/load-factory-config.ts` - Reads optional `.protostar/factory-config.json` and resolves env overrides.
- `apps/factory-cli/src/repo-reader-adapter.ts` - FS-backed `RepoReader` with traversal refusal and simple globbing.
- `apps/factory-cli/src/cancel.ts` - Root abort controller, SIGINT handler, CANCEL sentinel poll, stale sentinel unlink.
- `apps/factory-cli/src/coder-adapter-admission.ts` - LM Studio preflight admission gate and refusal artifacts.
- `apps/factory-cli/src/run-real-execution.ts` - Real executor task loop.
- `apps/factory-cli/src/main.ts` - Factory CLI real/dry-run branch integration.
- `packages/execution/src/index.ts` and `packages/planning/src/index.ts` - Preserve optional `targetFiles`/`adapterRef` through execution handoff.
- `packages/authority/src/admission-decision/base.ts` - Adds `coder-adapter-ready` gate name.

## New CLI Flags

- `--executor dry-run|real` defaults to `dry-run`.
- `--allowed-adapters lmstudio-coder,...` is comma-separated and only activates adapter metadata admission when supplied or when `--executor real` is used.

## Real-Execution Event Sequence

For each task: `task-pending -> task-running -> task-succeeded | task-failed | task-timeout | task-cancelled`.

Apply failure emits `task-failed` and returns run outcome `block`; downstream tasks are not executed.

## Resume Bootstrap Order

`parseJournalLines -> reduceJournalToSnapshot -> replayOrphanedTasks -> unlinkSentinelOnResume -> run remaining tasks`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Declared and resolved `@protostar/lmstudio-adapter` for factory-cli runtime**
- **Found during:** Task 1
- **Issue:** factory-cli could compile only after declaring the workspace dependency and TypeScript path/reference.
- **Fix:** Added package dependency, TypeScript reference/path mapping, and corrected lmstudio-adapter package exports to its emitted `dist/src/index.js`.
- **Files modified:** `apps/factory-cli/package.json`, `apps/factory-cli/tsconfig.json`, `tsconfig.base.json`, `packages/lmstudio-adapter/package.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter @protostar/factory-cli test`
- **Committed in:** `9a8c395`

**2. [Rule 1 - Bug] Preserved legacy dry-run planning fixtures while adding real-run adapter admission**
- **Found during:** Task 4
- **Issue:** Always passing default `allowedAdapters` caused legacy dry-run planning fixtures without `targetFiles` to fail admission.
- **Fix:** Only applies default allowed-adapter enforcement for `--executor real` or explicit `--allowed-adapters`.
- **Files modified:** `apps/factory-cli/src/main.ts`
- **Verification:** `pnpm --filter @protostar/factory-cli test`, `pnpm run verify`
- **Committed in:** `72d262b`

**3. [Rule 3 - Blocking] Reworked admission tests to avoid sandbox listener restrictions**
- **Found during:** Task 2
- **Issue:** Local HTTP listener tests failed under sandbox with `listen EPERM`.
- **Fix:** Injected `fetchImpl` into the admission preflight path for deterministic tests while preserving production behavior.
- **Files modified:** `apps/factory-cli/src/coder-adapter-admission.ts`, `apps/factory-cli/src/coder-adapter-admission.test.ts`
- **Verification:** `pnpm --filter @protostar/factory-cli test`
- **Committed in:** `aa4717e`

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** All fixes were required to make the planned integration compile, run, and preserve existing behavior.

## Known Stubs

- `apps/factory-cli/src/main.ts` maps the real execution result into the existing dry-run-shaped review loop output with a minimal pass/block review gate. Phase 5 owns the review→repair loop integration; Plan 10 persists real execution evidence and keeps the existing bundle contract intact.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: network-admission | `apps/factory-cli/src/coder-adapter-admission.ts` | New LM Studio preflight gate mints `AuthorizedNetworkOp` before loopback HTTP preflight. |
| threat_flag: workspace-fs-read | `apps/factory-cli/src/repo-reader-adapter.ts` | New fs-backed repo reader exposes workspace file reads to the adapter context with traversal refusal. |
| threat_flag: process-cancel | `apps/factory-cli/src/cancel.ts` | New SIGINT listener and CANCEL sentinel abort root execution. |

## Issues Encountered

- Node package export shape for `@protostar/lmstudio-adapter` did not match emitted files; fixed as part of Task 1.
- Existing source-order tests expected a dry-run branch anchor; retained an explicit source-order comment while adding the real branch.

## User Setup Required

None for tests. Live `--executor real` runs require LM Studio at `LMSTUDIO_BASE_URL` with `LMSTUDIO_MODEL` loaded; `.env.example` now documents the variables.

## Next Phase Readiness

Phase 5 can consume persisted real-execution evidence and terminal task events. Phase 9 can build on the shipped resume/cancel primitives.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/04-execution-engine/04-10-factory-cli-real-executor-wiring-SUMMARY.md`.
- Task commits found: `9a8c395`, `aa4717e`, `c685897`, `72d262b`.
- Verification passed: `pnpm run verify`.

---
*Phase: 04-execution-engine*
*Completed: 2026-04-27*
