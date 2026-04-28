---
phase: 09-operator-surface-resumability
plan: 06
subsystem: cli
tags: [cancel-command, operator-surface, manifest, atomic-write, sentinel, node-test]

requires:
  - phase: 09-operator-surface-resumability
    provides: Commander CLI primitives, runId parsing/path confinement, canonical stdout JSON, and widened FactoryRunStatus
provides:
  - protostar-factory cancel command with atomic manifest cancelling writes
  - CANCEL sentinel touch for cooperative out-of-process cancellation
  - terminal-run refusal with exit 4 and canonical stdout JSON
  - sentinel-driven teardown transition from cancelling to cancelled
affects: [operator-surface, resume-command, status-command, phase-10-dogfood]

tech-stack:
  added: []
  patterns: [out-of-process command module, atomic tmp-rename manifest writer, sentinel abort teardown writer]

key-files:
  created:
    - apps/factory-cli/src/commands/cancel.ts
  modified:
    - apps/factory-cli/src/commands/cancel.test.ts
    - apps/factory-cli/src/main.ts

key-decisions:
  - "Kept apps/factory-cli/src/commands/cancel.ts distinct from apps/factory-cli/src/cancel.ts: command writes state, wiring detects state."
  - "Accepted the Q-16 race where cancelling can become completed if the run loop finishes before observing CANCEL."
  - "Sentinel teardown only marks cancelled for abortReason === 'sentinel' and an existing cancelling manifest."

patterns-established:
  - "Out-of-process run mutation uses parseRunId + assertRunIdConfined before filesystem access."
  - "Cancel success and already-terminal refusal both emit canonical stdout JSON; diagnostics remain stderr-only."

requirements-completed: [OP-04, OP-07]

duration: 7min
completed: 2026-04-28
---

# Phase 9 Plan 06: Cancel Command Summary

**Out-of-process factory cancellation now atomically marks runs as cancelling, touches the CANCEL sentinel, and lets sentinel teardown finalize cancelled state.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-28T18:55:04Z
- **Completed:** 2026-04-28T19:01:51Z
- **Tasks:** 1 TDD task
- **Files modified:** 3

## Accomplishments

- Added `protostar-factory cancel <runId>` as a commander subcommand wired into the root dispatcher.
- Implemented runId regex validation plus path confinement before touching `.protostar/runs/<id>`.
- Added atomic tmp+rename manifest writes for `status: "cancelling"` and touched `runs/<id>/CANCEL`.
- Refused completed, blocked, and cancelled manifests with exit 4 plus canonical `{ error: "already-terminal" }` stdout JSON.
- Added a sentinel teardown helper in `main.ts` that transitions `cancelling` to `cancelled` only for sentinel-driven aborts.

## TDD Gate Compliance

- **RED:** `1fd5162` added failing cancel command tests. Factory-cli build failed because `commands/cancel.ts` and `writeCancelledManifestForSentinelAbort` did not exist.
- **GREEN:** `6048256` added the command implementation, root dispatcher wiring, atomic writes, sentinel touch, terminal refusal, and sentinel teardown writer. Tests and acceptance gates passed.
- **REFACTOR:** No separate refactor commit was needed.

## Task Commits

1. **Task 1 RED: cancel command contract** - `1fd5162` (test)
2. **Task 1 GREEN: cancel command implementation** - `6048256` (feat)

## Files Created/Modified

- `apps/factory-cli/src/commands/cancel.ts` - Out-of-process cancel command with atomic manifest update, CANCEL sentinel write, terminal refusal JSON, and race documentation.
- `apps/factory-cli/src/commands/cancel.test.ts` - Node test coverage for success, terminal refusals, invalid/missing runs, atomic-write source gate, and sentinel teardown.
- `apps/factory-cli/src/main.ts` - Registers `buildCancelCommand()` and exposes/wires the sentinel abort teardown writer.

## Verification

- `pnpm --filter @protostar/factory-cli test -- --test-name-pattern '^cancel'` - PASS; script ran full factory-cli suite, 276 tests.
- `pnpm --filter @protostar/factory-cli build` - PASS.
- `pnpm --filter @protostar/factory-cli test` - PASS, 276 tests.
- `pnpm run verify` - PASS.

## Acceptance Criteria

- `grep -c 'export function buildCancelCommand' apps/factory-cli/src/commands/cancel.ts` - PASS, `1`.
- `grep -c 'addCommand(buildCancelCommand' apps/factory-cli/src/main.ts` - PASS, `1`.
- `grep -cE "'cancelling'" apps/factory-cli/src/commands/cancel.ts` - PASS, `1`.
- `grep -cE "'already-terminal'" apps/factory-cli/src/commands/cancel.ts` - PASS, `1`.
- `grep -cE 'cancelling-requested' apps/factory-cli/src/commands/cancel.ts` - PASS, `1`.
- `grep -cE "'cancelled'" apps/factory-cli/src/main.ts | grep -v '^#'` - PASS, `1`.
- `grep -cE 'rename\(' apps/factory-cli/src/commands/cancel.ts` - PASS, `1`.
- `pnpm --filter @protostar/factory-cli test` - PASS.

## Decisions Made

- The cancel command treats malformed or missing manifest reads as `ExitCode.NotFound`, matching the plan's missing/parse-fail branch.
- The sentinel teardown writer is intentionally narrow: non-sentinel aborts and non-cancelling manifests are left untouched.
- The accepted `cancelling -> completed` race is documented in command help text and source comments.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first GREEN test run exposed a macOS temp-path normalization mismatch (`/var` vs `/private/var`) in the test expectation. The assertion was adjusted to the real public contract: absolute sentinel path, correct run-relative suffix, and file existence.

## Known Stubs

None.

## Threat Flags

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Resume can now distinguish terminal operator cancellation via `manifest.status === "cancelled"`, while status can honestly surface in-flight cancellation as `cancelling`.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/09-operator-surface-resumability/09-06-cancel-command-SUMMARY.md`.
- Created file exists: `apps/factory-cli/src/commands/cancel.ts`.
- Modified files exist: `apps/factory-cli/src/commands/cancel.test.ts`, `apps/factory-cli/src/main.ts`.
- Task commits found in git history: `1fd5162`, `6048256`.

---
*Phase: 09-operator-surface-resumability*
*Completed: 2026-04-28*
