---
phase: 09-operator-surface-resumability
plan: 01
subsystem: cli
tags: [commander, operator-surface, exit-codes, canonical-json, run-id, duration, node-test]

requires:
  - phase: 09-operator-surface-resumability
    provides: shared canonical-json export from Plan 09-02 and widened FactoryRunStatus from Plan 09-03
provides:
  - Commander-based root dispatcher with run command module extraction
  - ExitCode taxonomy, canonical stdout/stderr helpers, branded RunId helper, and duration parser
  - Runtime dependency lock entry for commander and @commander-js/extra-typings
affects: [operator-surface, status-command, resume-command, cancel-command, inspect-command, prune-command]

tech-stack:
  added: [commander@14.0.3, "@commander-js/extra-typings@14.0.0"]
  patterns: [thin commander dispatcher, per-command module, canonical stdout JSON, stderr diagnostics]

key-files:
  created:
    - apps/factory-cli/src/exit-codes.ts
    - apps/factory-cli/src/io.ts
    - apps/factory-cli/src/run-id.ts
    - apps/factory-cli/src/duration.ts
    - apps/factory-cli/src/commands/run.ts
    - apps/factory-cli/src/exit-codes.test.ts
    - apps/factory-cli/src/io.test.ts
    - apps/factory-cli/src/run-id.test.ts
    - apps/factory-cli/src/duration.test.ts
  modified:
    - apps/factory-cli/package.json
    - apps/factory-cli/src/main.ts
    - apps/factory-cli/src/main.real-execution.test.ts
    - .planning/PROJECT.md
    - pnpm-lock.yaml

key-decisions:
  - "Kept runFactory exported from main.ts for existing tests and composition imports while commands/run.ts owns CLI parsing/preflight/output."
  - "Preserved legacy run-command validation exit behavior for existing public CLI tests; commander parser errors still map to ExitCode.UsageOrArgError."
  - "Handled pnpm's leading `--` argv separator before legacy default-run normalization."

patterns-established:
  - "Root dispatcher owns the only process.exit site; command actions set process.exitCode."
  - "Command modules route help through stderr with commander.exitOverride() and configureOutput()."

requirements-completed: [OP-01, OP-07]

duration: 14min
completed: 2026-04-28
---

# Phase 9 Plan 01: Dispatcher and CLI Primitives Summary

**Commander run dispatch now fronts the existing factory run path while shared CLI primitives provide stable exit codes, canonical JSON output, runId validation, and duration parsing.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-04-28T18:10:51Z
- **Completed:** 2026-04-28T18:24:45Z
- **Tasks:** 2 TDD tasks
- **Files modified:** 15

## Accomplishments

- Added `ExitCode`, `writeStdoutJson`, `writeStderr`, `parseRunId`, `assertRunIdConfined`, and `parseDuration` with node:test coverage.
- Pinned `commander@14.0.3` and `@commander-js/extra-typings@14.0.0` on `@protostar/factory-cli`.
- Extracted run-command parsing/preflight/output into `apps/factory-cli/src/commands/run.ts`.
- Reduced `apps/factory-cli/src/main.ts` to 2,895 lines and made its entrypoint a commander dispatcher with one `process.exit(code)` site.
- Amended `PROJECT.md` with the Phase 9 Q-02 runtime dependency lock.

## TDD Gate Compliance

- **Task 1 RED:** `0c6b6fd` added failing primitive tests; factory-cli build failed because the four primitive modules did not exist.
- **Task 1 GREEN:** `68e2d1d` added the primitive modules; build and factory-cli tests passed.
- **Task 2:** Existing integration coverage plus updated static source assertion covered the dispatcher extraction. No separate RED commit was created because this was a behavior-preserving refactor around existing tests.

## Task Commits

1. **Task 1 RED: primitive tests** - `0c6b6fd` (test)
2. **Task 1 GREEN: primitive helpers** - `68e2d1d` (feat)
3. **Task 2: commander run dispatcher** - `d5efaeb` (feat)

## Files Created/Modified

- `apps/factory-cli/src/exit-codes.ts` - Public `ExitCode` const object and value type.
- `apps/factory-cli/src/io.ts` - Canonical stdout JSON and stderr diagnostic helpers.
- `apps/factory-cli/src/run-id.ts` - `RUN_ID_REGEX`, branded `RunId`, parser, and path confinement guard.
- `apps/factory-cli/src/duration.ts` - Shared duration parser for `s/m/h/d/w` units.
- `apps/factory-cli/src/commands/run.ts` - Commander run command, option translation, two-key preflight, runFactory delegation, stdout/stderr discipline.
- `apps/factory-cli/src/main.ts` - Thin root dispatcher and single process exit site.
- `apps/factory-cli/src/main.real-execution.test.ts` - Static parser assertion now follows parser code into `commands/run.ts`.
- `apps/factory-cli/package.json`, `pnpm-lock.yaml` - Commander dependency pins.
- `.planning/PROJECT.md` - Runtime dependency posture lock revision.

## Verification

- `pnpm install` - PASS; lockfile up to date after dependency add.
- `pnpm --filter @protostar/factory-cli build` - PASS.
- `pnpm --filter @protostar/factory-cli test` - PASS, 224 tests.
- `pnpm run factory` - PASS for expected behavior; exits 2 at workspace-trust gate with the existing refusal message.
- `pnpm run verify` - PASS.
- `node apps/factory-cli/dist/main.js --help` - PASS; help routed through commander output.
- `node apps/factory-cli/dist/main.js bogus-subcommand` - PASS; exits 2.

## Acceptance Criteria

- `grep -c 'Success: 0' apps/factory-cli/src/exit-codes.ts` - PASS, `1`.
- `grep -c 'UsageOrArgError: 2' apps/factory-cli/src/exit-codes.ts` - PASS, `1`.
- `grep -c 'NotResumable: 6' apps/factory-cli/src/exit-codes.ts` - PASS, `1`.
- `grep -cE 'export function writeStdoutJson' apps/factory-cli/src/io.ts` - PASS, `1`.
- `grep -cE 'export function writeStderr' apps/factory-cli/src/io.ts` - PASS, `1`.
- `grep -c 'RUN_ID_REGEX' apps/factory-cli/src/run-id.ts` - PASS, `3`.
- `grep -cE '\^\[a-zA-Z0-9_-\]\{1,128\}\$' apps/factory-cli/src/run-id.ts` - PASS, `1`.
- `grep -cE 'export function parseDuration' apps/factory-cli/src/duration.ts` - PASS, `1`.
- `grep -c '"commander": "14.0.3"' apps/factory-cli/package.json` - PASS, `1`.
- `grep -c '"@commander-js/extra-typings": "14.0.0"' apps/factory-cli/package.json` - PASS, `1`.
- `grep -c 'commander@14.0.3' .planning/PROJECT.md` - PASS, `1`.
- `test -f apps/factory-cli/src/commands/run.ts` - PASS.
- `grep -c 'export function buildRunCommand' apps/factory-cli/src/commands/run.ts` - PASS, `1`.
- `grep -c '.exitOverride()' apps/factory-cli/src/commands/run.ts` - PASS, `1`.
- `grep -c 'configureOutput' apps/factory-cli/src/commands/run.ts` - PASS, `1`.
- `grep -c 'addCommand(buildRunCommand' apps/factory-cli/src/main.ts` - PASS, `1`.
- `grep -cE '^\s*console\.log\(' apps/factory-cli/src/main.ts` - PASS, `0`.
- `pnpm --filter @protostar/factory-cli build` - PASS.
- `pnpm --filter @protostar/factory-cli test` - PASS.
- `pnpm run factory` - PASS; exits with existing workspace-trust gate code `2`.

## Decisions Made

- `commands/run.ts` owns option translation and two-key preflight while `runFactory` remains exported from `main.ts` to avoid churn in existing composition tests.
- Run-command validation errors that predate commander still preserve the existing generic-error behavior; commander parser errors and unknown subcommands map to `ExitCode.UsageOrArgError`.
- Root dispatcher strips a leading pnpm `--` separator before deciding whether to prepend the legacy default `run` subcommand.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Preserved pnpm start argv compatibility**
- **Found during:** Task 2 factory smoke
- **Issue:** `pnpm run factory` invokes `node dist/main.js -- run ...`; the first dispatcher pass treated the leading `--` as a signal to prepend another `run`, causing commander to reject extra args.
- **Fix:** Strip a leading `--` before default-run normalization in `main.ts`.
- **Files modified:** `apps/factory-cli/src/main.ts`
- **Verification:** `pnpm run factory` exits 2 at the workspace-trust gate.
- **Committed in:** `d5efaeb`

**2. [Rule 1 - Bug] Updated static parser assertion after extraction**
- **Found during:** Task 2 factory-cli test
- **Issue:** `main.real-execution.test.ts` still asserted `executor: executor.value` existed in `main.ts`; the parser now correctly lives in `commands/run.ts`.
- **Fix:** Read both `main.ts` and `commands/run.ts`, keeping the run-loop assertion in main and the parser assertion in the command module.
- **Files modified:** `apps/factory-cli/src/main.real-execution.test.ts`
- **Verification:** `pnpm --filter @protostar/factory-cli test` passes.
- **Committed in:** `d5efaeb`

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs)
**Impact on plan:** Both fixes preserve the intended behavior-preserving dispatcher extraction.

## Issues Encountered

- `pnpm --filter @protostar/factory-cli add ...` initially hit a pnpm store mismatch. Re-running with the existing store directory succeeded and `pnpm install` later confirmed the lockfile state.
- `pnpm run factory` appends a refusal record as part of the expected workspace-trust gate. The generated `.protostar/refusals.jsonl` line was reverted so this plan's commits stay scoped.

## Known Stubs

None.

## Threat Flags

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Subsequent Phase 9 command modules can import the shared primitives and compose beside `buildRunCommand()` on the root commander program. The dispatcher is ready for `status`, `resume`, `cancel`, `inspect`, `deliver`, and `prune` modules.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/09-operator-surface-resumability/09-01-dispatcher-and-cli-primitives-SUMMARY.md`.
- Created files exist: `apps/factory-cli/src/exit-codes.ts`, `apps/factory-cli/src/io.ts`, `apps/factory-cli/src/run-id.ts`, `apps/factory-cli/src/duration.ts`, `apps/factory-cli/src/commands/run.ts`, and four primitive test files.
- Task commits found in git history: `0c6b6fd`, `68e2d1d`, `d5efaeb`.

---
*Phase: 09-operator-surface-resumability*
*Completed: 2026-04-28*
