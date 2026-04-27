---
phase: 03-repo-runtime-sandbox
plan: 09
subsystem: repo-runtime
tags: [subprocess, spawn, allowlist, stream-capture, timeout, tdd]

requires:
  - phase: 03-repo-runtime-sandbox
    provides: [subprocess baseline allowlist, argv pattern guard, command schemas]
provides:
  - "runCommand brand-consuming subprocess runner with pre-spawn validation"
  - "Stream-to-file stdout/stderr capture with rolling tails and byte counts"
  - "Timeout kill handling surfaced through SubprocessResult.killed"
  - "Integration coverage for refusal reasons, streaming, tail caps, nonzero exits, timeout, and flush consistency"
affects: [execution-engine, admission-e2e, factory-cli, security-review]

tech-stack:
  added: []
  patterns: [spawn array form with shell false, stream-to-file plus rolling tail, structural brand consumer inside repo to avoid authority cycle]

key-files:
  created:
    - packages/repo/src/subprocess-runner.ts
    - packages/repo/src/subprocess-runner.test.ts
  modified:
    - packages/repo/src/index.ts

key-decisions:
  - "Kept NODE_SCHEMA's safer script-path surface and used temporary .mjs files instead of node -e in tests."
  - "Flattened allowedFlags across subcommands for v1, with stricter per-subcommand pinning deferred to Plan 12 if contract tests demand it."
  - "Defined the AuthorizedSubprocessOp consumer shape locally in @protostar/repo to avoid a circular repo -> authority -> repo TypeScript project reference."

patterns-established:
  - "Subprocess execution validates effective allowlist, schema presence, outer argv guard, and subcommand membership before spawn."
  - "Runner waits for child stdio end events before ending file streams, then resolves only after stream.end callbacks fire."

requirements-completed: [REPO-04]

duration: 5min
completed: 2026-04-27
---

# Phase 03 Plan 09: Subprocess Runner Summary

**`runCommand` now executes allowlisted subprocesses through array-form `spawn`, captures full logs to disk, returns bounded tails, and refuses unsafe argv before spawn.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-27T20:56:49Z
- **Completed:** 2026-04-27T21:02:13Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `runCommand(op, options)` with `SubprocessResult`, `RunCommandOptions`, and `SubprocessRefusedError`.
- Enforced pre-spawn refusal for command-not-allowlisted, no-schema, and argv-violation cases.
- Spawned with `spawn(op.command, [...op.args], { shell: false })`; no `exec` or `execSync`.
- Captured stdout/stderr to configured files while tracking rolling tails and total byte counts.
- Added timeout handling via `SIGTERM` and `killed: true`.
- Added 10 integration tests, bringing `@protostar/repo` to 62 passing tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement subprocess-runner with pre-spawn validation + streaming + tail + flush-on-exit** - `62b77f2` (feat)
2. **Task 2 fix: Close the Pitfall 5 stdio/flush race** - `ed74744` (fix)
3. **Task 2: Subprocess-runner integration tests** - `0bb3cc9` (test)

**Plan metadata:** pending final docs commit.

## Files Created/Modified

- `packages/repo/src/subprocess-runner.ts` - Runner implementation, refusal error, result/options types, streaming/tail capture, timeout kill path.
- `packages/repo/src/subprocess-runner.test.ts` - Integration tests using temporary `.mjs` child scripts.
- `packages/repo/src/index.ts` - Public repo barrel exports for runner API and types.

## Decisions Made

- Used temporary script files rather than `node -e`, because Plan 08 intentionally restricts `NODE_SCHEMA` to script paths and top-level safe flags.
- Kept the v1 flattening of `allowedFlags` across subcommands, as directed by the plan; stricter per-subcommand flag pinning is the Plan 12 upgrade path.
- Re-declared the subprocess brand consumer shape locally in `@protostar/repo`, following the existing workspace-trust pattern that avoids circular `@protostar/authority` imports.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Avoided circular TypeScript project reference from repo to authority**
- **Found during:** Task 1 (subprocess runner implementation)
- **Issue:** Importing `AuthorizedSubprocessOp` from `@protostar/authority` caused `@protostar/repo` build failures because authority imports repo types and TypeScript pulled authority/intent source outside repo's `rootDir`.
- **Fix:** Defined a local structural `AuthorizedSubprocessOp` consumer interface in `subprocess-runner.ts`, matching the authority brand data fields while keeping repo compilation inside its boundary.
- **Files modified:** `packages/repo/src/subprocess-runner.ts`, `packages/repo/src/index.ts`
- **Verification:** `pnpm --filter @protostar/repo build` passed.
- **Committed in:** `62b77f2`

**2. [Rule 1 - Bug] Waited for child stdio before ending file streams**
- **Found during:** Task 2 (flush-on-exit test design)
- **Issue:** The first implementation awaited `child.exit` and then ended write streams, but Node can emit `exit` before stdout/stderr pipes finish delivering buffered data.
- **Fix:** Added waits for child stdout/stderr `end` events before calling `stream.end(cb)` on output files.
- **Files modified:** `packages/repo/src/subprocess-runner.ts`
- **Verification:** `pnpm --filter @protostar/repo test` passed, including the file-vs-tail flush consistency test.
- **Committed in:** `ed74744`

---

**Total deviations:** 2 auto-fixed (Rule 1: 1, Rule 3: 1).
**Impact on plan:** Both fixes preserved the planned contract and strengthened the subprocess safety boundary.

## Issues Encountered

- The local GSD query CLI was not available as `node ./node_modules/@gsd-build/sdk/dist/cli.js query ...`, and the `gsd-sdk` on PATH did not expose `query`. State, roadmap, and requirements updates were applied directly.
- The initial bad authority import emitted accidental untracked JS/declaration artifacts under `packages/authority/src` and `packages/intent/src`; those generated files were removed before any commit.
- `pnpm run factory` built successfully, then exited `2` at the existing workspace-trust gate because no trusted confirmed intent was supplied. This matches prior Phase 3 smoke behavior.

## Known Stubs

None. Stub-pattern scan found only intentional empty defaults/null checks in implementation/test helpers, not placeholder behavior.

## Threat Flags

None beyond the planned subprocess trust boundary. The new subprocess surface is the expected REPO-04 implementation and is guarded by allowlist, schema, argv guard, array-form spawn, timeout, and log-flush tests.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm --filter @protostar/repo build` - passed.
- `pnpm --filter @protostar/repo test` - passed, 62/62 tests including 10 `runCommand` tests.
- `rg "shell:\s*true|exec\(|execSync\(" packages/repo/src/subprocess-runner.ts` - returned no matches.
- `rg -c "shell: false" packages/repo/src/subprocess-runner.ts` - returned `1`.
- `pnpm run verify` - passed.
- `pnpm run factory` - build passed, then stopped at the expected workspace-trust escalation gate with exit code 2.

## Next Phase Readiness

Plan 11 can wire `runCommand` into `runFactory`, and Plan 12 can add admission-e2e contract coverage against the runner's refusal and evidence shape. If Plan 12 needs tighter command-specific validation, refine the current flattened `allowedFlags` union into per-subcommand flag pinning.

## Self-Check: PASSED

- Found summary file at `.planning/phases/03-repo-runtime-sandbox/03-09-subprocess-runner-SUMMARY.md`.
- Found created runner source and integration test files.
- Found task commits `62b77f2`, `ed74744`, and `0bb3cc9` in git history.
- No tracked deletions were introduced by task commits.

---
*Phase: 03-repo-runtime-sandbox*
*Completed: 2026-04-27*
