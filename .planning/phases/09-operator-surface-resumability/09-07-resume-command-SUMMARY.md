---
phase: 09-operator-surface-resumability
plan: 07
subsystem: cli
tags: [resume-command, operator-surface, journal-replay, sentinel, commander, node-test]

requires:
  - phase: 09-operator-surface-resumability
    provides: Commander CLI primitives, runId parsing/path confinement, widened FactoryRunStatus, run liveness, and cancel sentinel handling
provides:
  - protostar-factory resume command with manifest.status dispatch
  - Phase 4 journal replay path using reduceJournalToSnapshot and replayOrphanedTasks
  - Operator-cancelled terminal refusal and transient CANCEL sentinel auto-unlink
  - Repairing-stage review resume dispatch to iter-(N+1)
affects: [operator-surface, status-command, cancel-command, review-pile, phase-10-dogfood]

tech-stack:
  added: []
  patterns: [commander subcommand module, injectable stage resume dispatch, stderr diagnostics, canonical stdout JSON for conflict output]

key-files:
  created:
    - apps/factory-cli/src/commands/resume.ts
    - apps/factory-cli/src/commands/resume.test.ts
  modified:
    - apps/factory-cli/src/main.ts

key-decisions:
  - "Resume command owns manifest/status dispatch; actual stage continuation remains behind injectable resume entrypoints."
  - "Mid-execution dispatch uses Phase 4 journal helpers and passes the derived orphan replay events to the execution resume entrypoint."
  - "Transient CANCEL sentinels are unlinked only after manifest.status is proven non-cancelled."
  - "Existing unrelated ROADMAP.md/STATE.md edits were preserved and not included in the plan metadata commit."

patterns-established:
  - "Resume command tests stub stage entrypoints while verifying durable-artifact dispatch semantics."
  - "Repairing resume computes the next review pile iteration from existing piles/review/iter-N directories."

requirements-completed: [OP-03, OP-07]

duration: 8min
completed: 2026-04-28
---

# Phase 9 Plan 07: Resume Command Summary

**`protostar-factory resume` now dispatches resumable runs by manifest status, replays execution journals through Phase 4 helpers, and handles operator cancellation distinctly from transient sentinels.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-28T19:23:26Z
- **Completed:** 2026-04-28T19:31:15Z
- **Tasks:** 1 TDD task
- **Files modified:** 3

## Accomplishments

- Added `buildResumeCommand()` and registered it on the root `protostar-factory` dispatcher.
- Implemented runId parsing/path confinement, missing-manifest exit 3, and not-resumable exit 6 status handling.
- Implemented `cancelled` as a terminal operator-cancel conflict: exit 4 with canonical stdout JSON `{ error: "operator-cancelled-terminal", runId }`.
- Implemented transient sentinel handling: non-cancelled manifests with `CANCEL` present log to stderr, call `unlinkSentinelOnResume`, and continue.
- Implemented mid-execution dispatch by reading `execution/journal.jsonl`, reducing it to a snapshot, deriving orphan replay events with `replayOrphanedTasks`, and invoking the resume execution entrypoint.
- Implemented repairing-stage dispatch by scanning `piles/review/iter-N` and invoking review resume at `N+1`.

## TDD Gate Compliance

- **RED:** `562d9a5` added failing resume command tests. Factory-cli build failed because `commands/resume.ts` did not exist.
- **GREEN:** `a2cf886` added the resume command, main.ts registration, status matrix, sentinel handling, journal replay, review iter dispatch, and injectable stage entrypoints.
- **REFACTOR:** No separate refactor commit was needed.

## Task Commits

1. **Task 1 RED: resume command contract** - `562d9a5` (test)
2. **Task 1 GREEN: resume command dispatch** - `a2cf886` (feat)

## Files Created/Modified

- `apps/factory-cli/src/commands/resume.ts` - Resume subcommand, manifest dispatch, sentinel cleanup, journal replay, and review iter dispatch.
- `apps/factory-cli/src/commands/resume.test.ts` - Node test coverage for cancelled/transient sentinel branches, running/orphaned replay, repairing iter increment, not-resumable statuses, invalid/missing IDs, and source gates.
- `apps/factory-cli/src/main.ts` - Registers `buildResumeCommand()`.

## Verification

- `pnpm --filter @protostar/factory-cli build` - PASS.
- `node --test apps/factory-cli/dist/commands/resume.test.js` - PASS, 8 resume tests.
- `pnpm --filter @protostar/factory-cli test` - PASS, 286 tests.
- `pnpm run verify` - PASS.
- `pnpm run factory` - PASS for expected smoke behavior: build succeeded, then exited 2 at the workspace-trust gate.

## Acceptance Criteria

- `grep -c 'export function buildResumeCommand' apps/factory-cli/src/commands/resume.ts` - PASS, `1`.
- `grep -c 'addCommand(buildResumeCommand' apps/factory-cli/src/main.ts` - PASS, `1`.
- `grep -c 'replayOrphanedTasks' apps/factory-cli/src/commands/resume.ts` - PASS, `2`.
- `grep -c 'reduceJournalToSnapshot' apps/factory-cli/src/commands/resume.ts` - PASS, `2`.
- `grep -c 'unlinkSentinelOnResume' apps/factory-cli/src/commands/resume.ts` - PASS, `1`.
- `grep -cE "'operator-cancelled-terminal'" apps/factory-cli/src/commands/resume.ts` - PASS, `1`.
- `grep -cE "manifest\\.status\\s*===\\s*'cancelled'" apps/factory-cli/src/commands/resume.ts` - PASS, `1`.
- `grep -cE "ready-to-release" apps/factory-cli/src/commands/resume.ts` - PASS, `2`.
- `pnpm --filter @protostar/factory-cli test` - PASS.

## Decisions Made

- Kept `resume.ts` as the dispatcher and exposed injectable `resumeRealExecution` / `resumeReviewLoop` entrypoints so tests can verify routing without running live adapters.
- Used `computeRunLiveness()` only for sentinel detection; manifest.status remains the authority for the resume decision.
- Returned success when the journal has no orphaned running tasks, matching Q-13's "just continue" operator expectation.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The package test script does not pass `--test-name-pattern` through as a focused node-test filter, so the documented focused command ran the full factory-cli suite. A direct compiled test command was used for fast iteration, then the full package test was run and passed.
- `pnpm run factory` appended the expected workspace-trust refusal line to `.protostar/refusals.jsonl`; that generated change was restored so commits remain scoped.
- `gsd-sdk query` was unavailable as noted in the runtime instructions. `STATE.md` and `ROADMAP.md` already had unrelated modifications, so they were preserved and not committed with this plan.

## Known Stubs

None.

## Threat Flags

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Operators can now use `resume <runId>` for running/orphaned execution and repairing review states. Deliver/prune remain separate future command surfaces; ready-to-release runs now get a clear deliver hint instead of an ambiguous resume attempt.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/09-operator-surface-resumability/09-07-resume-command-SUMMARY.md`.
- Created files exist: `apps/factory-cli/src/commands/resume.ts`, `apps/factory-cli/src/commands/resume.test.ts`.
- Modified file exists: `apps/factory-cli/src/main.ts`.
- Task commits found in git history: `562d9a5`, `a2cf886`.

---
*Phase: 09-operator-surface-resumability*
*Completed: 2026-04-28*
