---
phase: 09-operator-surface-resumability
plan: 11
subsystem: testing
tags: [admission-e2e, cli-contracts, commander, stdout-json, resumability, delivery-authorization]

requires:
  - phase: 09-operator-surface-resumability
    provides: Completed Phase 9 operator CLI commands and public schemas from Plans 09-01 through 09-10
provides:
  - Admission-e2e contract suite pinning the Phase 9 public CLI surface
  - Eight commander help fixtures for root and subcommands
  - Factory-cli subpath exports for contract-only surfaces
affects: [phase-10-hardening, operator-cli, admission-e2e]

tech-stack:
  added: []
  patterns:
    - Admission-e2e tests spawn the built CLI from temp workspaces with no network calls
    - Help text snapshots assert stdout remains empty and stderr is fixture-pinned

key-files:
  created:
    - packages/admission-e2e/src/exit-codes.contract.test.ts
    - packages/admission-e2e/src/factory-cli-help.contract.test.ts
    - packages/admission-e2e/src/factory-cli-stdout-canonical.contract.test.ts
    - packages/admission-e2e/src/status-row-schema.contract.test.ts
    - packages/admission-e2e/src/inspect-schema.contract.test.ts
    - packages/admission-e2e/src/resume-stage-dispatch.contract.test.ts
    - packages/admission-e2e/src/delivery-reauthorize.contract.test.ts
    - packages/admission-e2e/src/fixtures/help/root-help.txt
    - packages/admission-e2e/src/fixtures/help/run-help.txt
    - packages/admission-e2e/src/fixtures/help/status-help.txt
    - packages/admission-e2e/src/fixtures/help/resume-help.txt
    - packages/admission-e2e/src/fixtures/help/cancel-help.txt
    - packages/admission-e2e/src/fixtures/help/inspect-help.txt
    - packages/admission-e2e/src/fixtures/help/deliver-help.txt
    - packages/admission-e2e/src/fixtures/help/prune-help.txt
    - apps/factory-cli/src/status-types.ts
    - apps/factory-cli/src/inspect-types.ts
  modified:
    - apps/factory-cli/package.json
    - packages/admission-e2e/package.json
    - packages/admission-e2e/tsconfig.json
    - pnpm-lock.yaml

key-decisions:
  - "Expose contract-only factory-cli subpaths instead of importing command internals from admission-e2e."
  - "Use temp pnpm-workspace roots for spawned inspect/resume tests so admission contracts never touch the real .protostar tree."

patterns-established:
  - "CLI help snapshots: spawn built dist/main.js, require stdout='', and compare stderr byte-for-byte to fixtures."
  - "Admission CLI fixtures: create isolated .protostar/runs/<id> trees in temp workspaces for no-network command exercises."

requirements-completed: [OP-01, OP-02, OP-03, OP-04, OP-05, OP-06, OP-07, OP-08]

duration: 11min
completed: 2026-04-28
---

# Phase 9 Plan 11: Admission E2E CLI Contracts Summary

**Admission-e2e now pins the completed Phase 9 operator CLI surface: exit codes, help text, canonical stdout JSON, status/inspect schemas, resume dispatch, and delivery reauthorization.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-28T19:51:53Z
- **Completed:** 2026-04-28T20:02:59Z
- **Tasks:** 1
- **Files modified:** 21

## Accomplishments

- Added seven admission-e2e contract tests for Phase 9 public CLI behavior.
- Captured eight `--help` fixtures from the built commander CLI and verified no volatile paths, timestamps, or hosts appear.
- Added contract-only factory-cli subpath exports for `ExitCode`, stdout JSON writing, status row types, and inspect output types.
- Added admission-e2e workspace dependencies/references for `@protostar/delivery` and `@protostar/review`.

## Task Commits

1. **Task 1: Add admission-e2e CLI contract suite** - `3ea75f6` (test)

**Plan metadata:** committed separately after this summary was written.

## Files Created/Modified

- `packages/admission-e2e/src/exit-codes.contract.test.ts` - Locks `ExitCode` integer values and JSON snapshot bytes.
- `packages/admission-e2e/src/factory-cli-help.contract.test.ts` - Spawns root plus `run/status/resume/cancel/inspect/deliver/prune --help`; asserts stdout empty and stderr fixture match.
- `packages/admission-e2e/src/factory-cli-stdout-canonical.contract.test.ts` - Captures `writeStdoutJson` output and round-trips it through `sortJsonValue`.
- `packages/admission-e2e/src/status-row-schema.contract.test.ts` - Locks minimal and full status row key sets.
- `packages/admission-e2e/src/inspect-schema.contract.test.ts` - Spawns `inspect <id> --json` against a temp run bundle and asserts trace content is not inlined.
- `packages/admission-e2e/src/resume-stage-dispatch.contract.test.ts` - Locks cancelled, transient sentinel, and completed resume branches.
- `packages/admission-e2e/src/delivery-reauthorize.contract.test.ts` - Locks valid reauthorization plus `runId-mismatch` and `gate-not-pass` rejection branches.
- `packages/admission-e2e/src/fixtures/help/*.txt` - Pinned commander help output for root and seven subcommands.
- `apps/factory-cli/src/status-types.ts` and `apps/factory-cli/src/inspect-types.ts` - Type-only re-export modules for admission-e2e contracts.
- `apps/factory-cli/package.json` - Adds public subpath exports for contract surfaces.
- `packages/admission-e2e/package.json`, `packages/admission-e2e/tsconfig.json`, `pnpm-lock.yaml` - Adds workspace dependency/reference links required by the new contracts.

## Verification

- `pnpm --filter @protostar/factory-cli build` - PASS.
- `pnpm --filter @protostar/admission-e2e build` - PASS.
- `pnpm --filter @protostar/admission-e2e test` - PASS, 124 tests.
- `pnpm run verify` - PASS.
- Manual fixture scan: `rg -n "/Users|Code/protostar|2026|T[0-9]{2}:|localhost|127\\.0\\.0\\.1" packages/admission-e2e/src/fixtures/help` - PASS, no matches.

## Acceptance Criteria

- Seven planned contract test files exist - PASS.
- `ls packages/admission-e2e/src/fixtures/help/ | wc -l` - PASS, `8`.
- `grep -c 'JUDGE_SAID_INSPECT_TEST_SENTINEL' packages/admission-e2e/src/inspect-schema.contract.test.ts` - PASS, `2`.
- `grep -c 'reAuthorizeFromPayload' packages/admission-e2e/src/delivery-reauthorize.contract.test.ts` - PASS, `5`.
- `grep -cE "'gate-not-pass'" packages/admission-e2e/src/delivery-reauthorize.contract.test.ts` - PASS, `1`.
- `grep -cE "'runId-mismatch'" packages/admission-e2e/src/delivery-reauthorize.contract.test.ts` - PASS, `1`.
- `grep -c 'operator-cancelled-terminal' packages/admission-e2e/src/resume-stage-dispatch.contract.test.ts` - PASS, `3`.
- `pnpm --filter @protostar/admission-e2e test` - PASS.
- `pnpm run verify` - PASS.

## Decisions Made

- Added narrow factory-cli subpath exports rather than importing `apps/factory-cli/src/**` paths from admission-e2e.
- Kept help fixtures under `src/fixtures/help`; tests read them from source at runtime so TypeScript does not need to copy text fixtures into `dist`.
- Used spawned CLI processes for help, inspect, and resume contracts; delivery reauthorization stays in-process because it is a pure validator boundary and must not call network.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added public factory-cli subpaths for contract imports**
- **Found during:** Task 1 (admission-e2e contract implementation)
- **Issue:** `@protostar/factory-cli` only exported prior pile/refusal subpaths, so admission-e2e could not import `ExitCode`, stdout JSON, or command schema types through package boundaries.
- **Fix:** Added `./exit-codes`, `./io`, `./status-types`, and `./inspect-types` exports plus tiny type re-export modules for schema-only contracts.
- **Files modified:** `apps/factory-cli/package.json`, `apps/factory-cli/src/status-types.ts`, `apps/factory-cli/src/inspect-types.ts`
- **Verification:** `pnpm --filter @protostar/admission-e2e build`, `pnpm --filter @protostar/admission-e2e test`, and `pnpm run verify` passed.
- **Committed in:** `3ea75f6`

**2. [Rule 3 - Blocking] Linked review and delivery packages into admission-e2e**
- **Found during:** Task 1 (delivery reauthorization contract)
- **Issue:** The new reauthorization contract imports `reAuthorizeFromPayload` and the persisted authorization payload type, but admission-e2e did not yet depend on `@protostar/review` or `@protostar/delivery`.
- **Fix:** Added workspace dependencies, TypeScript project references, and refreshed the pnpm workspace lock/link state.
- **Files modified:** `packages/admission-e2e/package.json`, `packages/admission-e2e/tsconfig.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter @protostar/admission-e2e test` passed after `pnpm install`.
- **Committed in:** `3ea75f6`

---

**Total deviations:** 2 auto-fixed (2 Rule 3 blockers)
**Impact on plan:** Both were required to keep the contract suite package-boundary-correct and executable; no runtime CLI behavior changed.

## Issues Encountered

- The first admission-e2e test run failed because `@protostar/review` was not linked into `node_modules` after editing package metadata. Running `pnpm install` refreshed workspace links; the rerun passed.
- The initial acceptance grep loop caught two literal-sentinel mismatches: the inspect sentinel appeared once instead of twice, and `gate-not-pass` / `runId-mismatch` used double-quoted literals. The tests already covered the behavior; literals were adjusted to satisfy the plan's explicit grep gates.
- TypeScript briefly emitted generated `authorization-payload.*` files into `packages/delivery/src`; those untracked build artifacts were removed and were not committed.

## Known Stubs

None.

## Threat Flags

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 9's operator CLI public surface now has admission-e2e regression coverage. Phase 9 can move to closure verification, and Phase 10 can rely on stable CLI contracts while hardening/dogfooding.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/09-operator-surface-resumability/09-11-admission-e2e-cli-contracts-SUMMARY.md`.
- Task commit exists: `3ea75f6`.
- Key created files exist: seven contract tests, eight help fixtures, and the two factory-cli type-export modules.

---
*Phase: 09-operator-surface-resumability*
*Completed: 2026-04-28*
