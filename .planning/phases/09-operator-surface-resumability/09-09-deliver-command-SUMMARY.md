---
phase: 09-operator-surface-resumability
plan: 09
subsystem: operator-surface
tags: [factory-cli, deliver-command, delivery-runtime, reauthorization, canonical-json]

requires:
  - phase: 09-operator-surface-resumability
    provides: [CLI primitives, widened FactoryRunStatus, authorization payload writer, reAuthorizeFromPayload]
  - phase: 07-delivery
    provides: [delivery-runtime executeDelivery surface, delivery result schema]
provides:
  - protostar-factory deliver <runId> command
  - Idempotent already-delivered noop branch
  - Gated ready-to-release delivery branch with manifest completion transition
  - Retry path for completed runs with missing delivery result
  - Reauthorization boundary through reAuthorizeFromPayload
affects: [operator-surface, delivery, resumability, phase-09-plan-11]

tech-stack:
  added: []
  patterns: [commander subcommand, dependency-injected delivery runtime for tests, canonical stdout JSON, atomic manifest update]

key-files:
  created:
    - apps/factory-cli/src/commands/deliver.ts
    - apps/factory-cli/src/commands/deliver.test.ts
  modified:
    - apps/factory-cli/src/main.ts

key-decisions:
  - "deliver treats delivery/result.json as the public Phase 9 idempotency path while also accepting delivery/delivery-result.json from the existing Phase 7 writer."
  - "DeliveryAuthorization is always re-minted through reAuthorizeFromPayload before executeDelivery; deliver.ts has no direct mintDeliveryAuthorization reference."
  - "The command writes both delivery/result.json and delivery/delivery-result.json on CLI-triggered delivery to bridge Phase 9 status/inspect expectations with the Phase 7 result filename."

patterns-established:
  - "Command tests inject reAuthorizeFromPayload and executeDelivery seams so no network calls are made."
  - "Ready-to-release delivery completes the manifest through setFactoryRunStatus plus tmp/datasync/rename."

requirements-completed: [OP-06, OP-07]

duration: 7min
completed: 2026-04-28T19:40:28Z
---

# Phase 09 Plan 09: Deliver Command Summary

**`protostar-factory deliver <runId>` now revalidates persisted authorization payloads before delivery, supports gated first delivery, retries incomplete completed runs, and noops already-delivered runs.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-28T19:33:06Z
- **Completed:** 2026-04-28T19:40:28Z
- **Tasks:** 1 TDD task
- **Files modified:** 3

## Accomplishments

- Added `apps/factory-cli/src/commands/deliver.ts` with runId parsing, path confinement, manifest state branching, authorization payload loading, `reAuthorizeFromPayload`, delivery invocation, result persistence, and canonical stdout JSON.
- Added `apps/factory-cli/src/commands/deliver.test.ts` covering noop, retry, gated delivery, all non-deliverable states, missing/invalid run IDs, missing authorization, validator rejection, and the no-direct-mint source invariant.
- Wired `buildDeliverCommand()` into the commander root in `apps/factory-cli/src/main.ts`.

## TDD Gate Compliance

- **RED:** `cdd77b6` added failing deliver command coverage; `pnpm --filter @protostar/factory-cli test -- --test-name-pattern '^deliver'` failed because `./deliver.js` did not exist.
- **GREEN:** `7163121` added the deliver command and dispatcher wiring; focused and full factory-cli tests passed.

## Task Commits

1. **Task 1 RED: deliver command tests** - `cdd77b6` (test)
2. **Task 1 GREEN: deliver command implementation** - `7163121` (feat)

## Files Created/Modified

- `apps/factory-cli/src/commands/deliver.ts` - Deliver command implementation with idempotency, reauthorization, delivery-runtime invocation, and atomic manifest completion.
- `apps/factory-cli/src/commands/deliver.test.ts` - Branch coverage and security-boundary source assertion.
- `apps/factory-cli/src/main.ts` - Adds `buildDeliverCommand()` to the root commander program.

## Verification

- `pnpm --filter @protostar/factory-cli test -- --test-name-pattern '^deliver'` - PASS; due current script forwarding, this ran the full factory-cli suite (300 tests).
- `pnpm --filter @protostar/factory-cli build` - PASS.
- `pnpm --filter @protostar/factory-cli test` - PASS; 300 tests.
- `pnpm run verify` - PASS.

## Acceptance Criteria

- `grep -c 'export function buildDeliverCommand' apps/factory-cli/src/commands/deliver.ts` - PASS, `1`.
- `grep -c 'addCommand(buildDeliverCommand' apps/factory-cli/src/main.ts` - PASS, `1`.
- `grep -c 'reAuthorizeFromPayload' apps/factory-cli/src/commands/deliver.ts` - PASS, `3`.
- `grep -c 'executeDelivery' apps/factory-cli/src/commands/deliver.ts` - PASS, `4`.
- `grep -c 'mintDeliveryAuthorization' apps/factory-cli/src/commands/deliver.ts` - PASS, `0`.
- `grep -cE "'already-delivered'" apps/factory-cli/src/commands/deliver.ts` - PASS, `1`.
- `grep -cE "'authorization-missing'" apps/factory-cli/src/commands/deliver.ts` - PASS, `1`.
- `pnpm --filter @protostar/factory-cli test` - PASS.

## Decisions Made

- Accepted both `delivery/result.json` and `delivery/delivery-result.json` for idempotent noop detection. Phase 9 status/inspect already read `result.json`; Phase 7 wiring writes `delivery-result.json`.
- Wrote both result filenames from the deliver command so future operator surfaces see the PR URL regardless of which filename they consume.
- Kept tests network-free by injecting fake `executeDelivery` and `reAuthorizeFromPayload` dependencies through `buildDeliverCommand()`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Bridged delivery result filename mismatch**
- **Found during:** Task 1 (deliver command implementation)
- **Issue:** Plan 09-09 specified `delivery/result.json`, while the existing Phase 7 writer persists `delivery/delivery-result.json`; status/inspect already expect `delivery/result.json`.
- **Fix:** Noop detection accepts both filenames, and CLI-triggered delivery writes both filenames with the same canonical result payload.
- **Files modified:** `apps/factory-cli/src/commands/deliver.ts`, `apps/factory-cli/src/commands/deliver.test.ts`
- **Verification:** Deliver tests cover `delivery/result.json` noop and retry persistence; factory-cli test suite passed.
- **Committed in:** `7163121`

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug)
**Impact on plan:** The fix preserves compatibility with existing Phase 7 output while satisfying the Phase 9 operator-surface contract.

## Issues Encountered

- The factory-cli test script does not honor `-- --test-name-pattern '^deliver'` as a filter in the current invocation shape; the command still passed, and it effectively ran the full factory-cli suite.
- `.planning/ROADMAP.md` and `.planning/STATE.md` had pre-existing unrelated Phase 10.1 edits, which were preserved.

## Known Stubs

None.

## Threat Flags

None. The new delivery command is the planned Q-20/Q-21 operator surface, uses the existing delivery-runtime network boundary, and does not introduce merge authority or a direct mint bypass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 09-10 can add prune on top of the completed run/status/inspect/cancel/resume/delivery operator surface. Plan 09-11 can now lock deliver help/output contracts in admission-e2e.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/09-operator-surface-resumability/09-09-deliver-command-SUMMARY.md`.
- Created files exist: `apps/factory-cli/src/commands/deliver.ts` and `apps/factory-cli/src/commands/deliver.test.ts`.
- Task commits found in git history: `cdd77b6`, `7163121`.

---
*Phase: 09-operator-surface-resumability*
*Completed: 2026-04-28*
