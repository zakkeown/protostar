---
phase: 07-delivery
plan: 09
subsystem: delivery
tags: [delivery-runtime, ci, octokit, polling, schema]

requires:
  - phase: 07-delivery
    provides: "Plans 07-06 and 07-08 delivery-runtime Octokit client, executeDelivery initial CI snapshot, and no-fs/no-merge contracts"
provides:
  - "Q-15 CI verdict computation over required-check allowlists"
  - "Q-14/Q-16/Q-19 pollCiStatus async generator for continued CI capture"
  - "Q-17 DeliveryResult and CiEvent wire-shape types"
affects: [phase-07-delivery, phase-09-operator-surface, factory-cli-ci-persistence]

tech-stack:
  added: []
  patterns:
    - "Pure verdict reducer before network polling"
    - "AbortSignal-aware async generator polling"
    - "Type-pinned JSON wire shape with round-trip contract tests"

key-files:
  created:
    - packages/delivery-runtime/src/compute-ci-verdict.ts
    - packages/delivery-runtime/src/compute-ci-verdict.test.ts
    - packages/delivery-runtime/src/poll-ci-status.ts
    - packages/delivery-runtime/src/poll-ci-status.test.ts
    - packages/delivery-runtime/src/delivery-result-schema.ts
    - packages/delivery-runtime/src/delivery-result-schema.test.ts
  modified:
    - packages/delivery-runtime/src/index.ts

key-decisions:
  - "CI verdicts are AND-over-allowlist; empty requiredChecks means no-checks-configured."
  - "pollCiStatus owns only network polling and timestamps; factory-cli remains responsible for persistence."
  - "DeliveryResult keeps screenshots pinned to deferred-v01 for v0.1."

patterns-established:
  - "Delivery-runtime CI polling threads AbortSignal through both Octokit checks.listForRef and inter-poll sleep."
  - "Delivery result schemas are exported as TypeScript wire types plus JSON round-trip contract examples."

requirements-completed: [DELIVER-04, DELIVER-05]

duration: 7min
completed: 2026-04-28
---

# Phase 7 Plan 09: Poll CI Status Summary

**CI capture primitives for GitHub delivery: allowlisted verdict computation, abort-aware polling, and pinned delivery-result JSON types.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-28T14:42:26Z
- **Completed:** 2026-04-28T14:49:28Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added `computeCiVerdict()` with Q-15 allowlist semantics: missing/running/unknown checks stay pending, failing required checks fail, passing required checks pass, and non-allowlisted failures are ignored.
- Added `pollCiStatus()` as an async generator that yields one `CiSnapshot` per Octokit `checks.listForRef` poll, defaults to `10_000ms`, terminates on pass/fail/no-checks, and throws `AbortError` on signal cancellation.
- Added `DeliveryResult`, `CiEvent`, and `DELIVERY_RESULT_SCHEMA_VERSION = "1.0.0"` for the Q-17 delivery artifact and CI event stream shape.

## Task Commits

Each TDD task produced RED and GREEN commits:

1. **Task 1: computeCiVerdict (pure)** - `943004d` (test), `eddc59b` (feat)
2. **Task 2: pollCiStatus async generator** - `5d10b86` (test), `cb9f4c4` (feat)
3. **Task 3: DeliveryResult + CiEvent schema definitions** - `2516268` (test), `8c34920` (feat)

## Files Created/Modified

- `packages/delivery-runtime/src/compute-ci-verdict.ts` - Pure Q-15 required-check verdict reducer.
- `packages/delivery-runtime/src/compute-ci-verdict.test.ts` - Nine verdict cases covering empty allowlist, missing checks, pass/fail/pending, neutral/skipped-style pass behavior, and ignored out-of-allowlist failures.
- `packages/delivery-runtime/src/poll-ci-status.ts` - Abort-aware CI polling async generator with default 10s cadence.
- `packages/delivery-runtime/src/poll-ci-status.test.ts` - Nock-backed terminal, pending-to-pass, no-checks, pre-abort, and sleep-abort tests.
- `packages/delivery-runtime/src/delivery-result-schema.ts` - DeliveryResult/CiEvent wire-shape exports for factory-cli persistence.
- `packages/delivery-runtime/src/delivery-result-schema.test.ts` - Delivered/blocked result round trips, schema version pin, CI verdict literals, and one round-trip test per CiEvent kind.
- `packages/delivery-runtime/src/index.ts` - Additive exports for the new CI/status/schema modules.

## Decisions Made

- Kept CI persistence out of `delivery-runtime`; this plan only returns structured snapshots and types, matching the factory-cli persistence boundary.
- Used `AbortError` by name for polling cancellation so downstream factory-cli code can translate cancellation into Q-17 `ci-cancelled` events.
- Split CiEvent tests into individual variant cases to satisfy the 9+ test-case acceptance gate explicitly.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. The empty arrays in tests are fixture values, not UI/data-source stubs.

## Threat Flags

None. The new GitHub checks polling surface and schema tamper protections were already covered by T-07-09-01 through T-07-09-03.

## Issues Encountered

- The local `node ./node_modules/@gsd-build/sdk/dist/cli.js query state.load` path from the generic executor workflow was unavailable, and the `gsd-sdk` on PATH did not expose `query`. Execution continued from the requested plan and loaded planning context directly from disk.
- Per user ownership constraints, `.planning/STATE.md` and `.planning/ROADMAP.md` were intentionally not modified.

## Verification

- `pnpm --filter @protostar/delivery-runtime build` - passed
- `node --test packages/delivery-runtime/dist/compute-ci-verdict.test.js` - passed (9 tests)
- `node --test packages/delivery-runtime/dist/poll-ci-status.test.js` - passed (5 tests)
- `node --test packages/delivery-runtime/dist/delivery-result-schema.test.js` - passed (12 tests)
- `pnpm --filter @protostar/delivery-runtime test` - passed (82 tests, including no-fs and no-merge contracts)
- `pnpm run verify` - passed

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Factory-cli can now consume `pollCiStatus`, `DeliveryResult`, and `CiEvent` in Plan 07-11 to persist `delivery-result.json` and append `ci-events.jsonl` without adding filesystem authority to `delivery-runtime`.

## Self-Check: PASSED

- Created files exist: `compute-ci-verdict.ts`, `poll-ci-status.ts`, `delivery-result-schema.ts`, and this SUMMARY.
- Task commits found in git history: `943004d`, `eddc59b`, `5d10b86`, `cb9f4c4`, `2516268`, `8c34920`.
- No unexpected tracked-file deletions detected after task commits.

---
*Phase: 07-delivery*
*Completed: 2026-04-28*
