---
phase: 07-delivery
plan: 10
subsystem: delivery
tags: [factory-cli, delivery-runtime, preflight, github, abort-signal]

requires:
  - phase: 07-delivery
    provides: delivery-runtime fast/full preflight functions and Octokit client
provides:
  - factory-cli delivery preflight wiring module
  - fast preflight call at delivery-configured run start
  - full preflight call after approved review authorization
  - atomic preflight refusal artifact at runs/{id}/delivery/preflight-refusal.json
affects: [phase-07-delivery, plan-07-11-execute-delivery]

tech-stack:
  added: []
  patterns:
    - tmp-plus-rename JSON refusal artifact writer
    - delivery timeout signal composed with AbortSignal.any

key-files:
  created:
    - apps/factory-cli/src/delivery-preflight-wiring.ts
    - apps/factory-cli/src/delivery-preflight-wiring.test.ts
  modified:
    - apps/factory-cli/src/main.ts
    - apps/factory-cli/src/main.test.ts
    - apps/factory-cli/package.json
    - apps/factory-cli/tsconfig.json
    - pnpm-lock.yaml

key-decisions:
  - "Factory CLI imports @protostar/delivery-runtime directly for preflight orchestration."
  - "Legacy delivery-plan/pr-body artifacts are removed; Plan 07-11 owns executeDelivery persistence."
  - "No-delivery legacy fixtures skip delivery preflight; signed delivery targets exercise the new preflight gates."

patterns-established:
  - "Preflight refusal artifacts use { phase, result, runId, at } and never include tokens."
  - "Plan 07-11 handoff marker names fullResult.octokit and baseSha as the delivery execution inputs."

requirements-completed: [DELIVER-01]

duration: 16min
completed: 2026-04-28
---

# Phase 7 Plan 10: Factory CLI Preflight Wiring Summary

**Factory CLI now runs delivery-runtime preflights around the execution/review loop and persists token-safe refusal artifacts.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-04-28T14:52:30Z
- **Completed:** 2026-04-28T15:08:49Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added `runFastDeliveryPreflight` and `runFullDeliveryPreflight` wrappers with atomic `preflight-refusal.json` writes.
- Added 12 delivery-preflight wiring tests, including token non-leak coverage for refusal JSON.
- Wired `main.ts` to run fast preflight for delivery-configured intents and full preflight after approved review authorization.
- Removed the deprecated `createGitHubPrDeliveryPlanLegacy` call site and legacy `delivery-plan.json` / `delivery/pr-body.md` writes.
- Left the explicit `FIXME(Plan 07-11)` marker for `executeDelivery` using `fullResult.octokit` and `baseSha`.

## Task Commits

1. **Task 1 RED:** `16d2964` (`test`) - failing delivery preflight wiring tests.
2. **Task 1 GREEN:** `4abdf8d` (`feat`) - preflight wiring module and factory-cli delivery-runtime package link.
3. **Task 2:** `ec49808` (`feat`) - fast/full preflight call sites in `main.ts` and legacy test expectation updates.

## TDD Gate Compliance

- **RED:** `pnpm --filter @protostar/factory-cli test --run delivery-preflight-wiring` failed because `./delivery-preflight-wiring.js` did not exist.
- **GREEN:** The wiring module was implemented and the focused suite passed.
- **REFACTOR:** No separate refactor commit was needed.

## Files Created/Modified

- `apps/factory-cli/src/delivery-preflight-wiring.ts` - Calls delivery-runtime preflights and writes refusal artifacts with tmp+rename.
- `apps/factory-cli/src/delivery-preflight-wiring.test.ts` - Covers fast/full outcomes and token non-leak behavior.
- `apps/factory-cli/src/main.ts` - Adds preflight call sites, delivery timeout signal, and Plan 07-11 handoff marker.
- `apps/factory-cli/src/main.test.ts` - Updates legacy release-artifact expectations after removing deprecated delivery-plan output.
- `apps/factory-cli/package.json`, `apps/factory-cli/tsconfig.json`, `pnpm-lock.yaml` - Link factory-cli to `@protostar/delivery-runtime`.

## Decisions Made

- Used `process.env["PROTOSTAR_GITHUB_TOKEN"]` only; no CLI flag or alternate env source was introduced.
- Used `AbortSignal.any([runAbortController.signal, AbortSignal.timeout(deliveryWallClockMs)])` for the delivery boundary.
- Kept no-delivery historical fixtures runnable by only running delivery preflights when a signed delivery target exists.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Linked factory-cli to delivery-runtime**
- **Found during:** Task 1 GREEN
- **Issue:** `@protostar/factory-cli` could not resolve `@protostar/delivery-runtime`.
- **Fix:** Added the workspace dependency, TypeScript reference, and lockfile importer edge.
- **Files modified:** `apps/factory-cli/package.json`, `apps/factory-cli/tsconfig.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter @protostar/factory-cli test --run delivery-preflight-wiring`
- **Committed in:** `4abdf8d`

**2. [Rule 3 - Blocking] Preserved legacy no-delivery factory-cli fixtures**
- **Found during:** Task 2 verification
- **Issue:** Existing factory-cli fixtures do not yet carry `capabilityEnvelope.delivery.target`; unconditional delivery preflight would block unrelated no-delivery dry runs.
- **Fix:** Preflight call sites run for delivery-configured intents, while legacy no-delivery runs keep release skipped until Plan 07-11.
- **Files modified:** `apps/factory-cli/src/main.ts`, `apps/factory-cli/src/main.test.ts`
- **Verification:** `pnpm --filter @protostar/factory-cli test`
- **Committed in:** `ec49808`

**Total deviations:** 2 auto-fixed (Rule 3).
**Impact on plan:** Both were necessary to keep the new delivery preflight path buildable and the existing factory-cli suite deterministic. Delivery-configured intents still hit both new preflight gates.

## Known Stubs

| File | Line | Reason |
|------|------|--------|
| `apps/factory-cli/src/main.ts` | 1021 | Intentional `FIXME(Plan 07-11)` handoff marker; this plan wires preflight only, not `executeDelivery`. |

## Issues Encountered

- `pnpm run factory` exits 2 at the expected workspace-trust gate after building successfully.
- Root verification passed after updating stale legacy delivery-artifact assertions.

## User Setup Required

None - no new external service configuration required by this plan.

## Verification

- `pnpm --filter @protostar/factory-cli test --run delivery-preflight-wiring` - passed
- `pnpm --filter @protostar/factory-cli build` - passed
- `pnpm --filter @protostar/factory-cli test` - passed
- `pnpm run verify` - passed
- `pnpm run factory` - built, then stopped at expected workspace-trust gate (exit 2)

## Next Phase Readiness

Plan 07-11 can replace the handoff marker with `executeDelivery`, consuming `fullResult.octokit` and `baseSha`.

## Self-Check: PASSED

- Found `apps/factory-cli/src/delivery-preflight-wiring.ts`
- Found `apps/factory-cli/src/delivery-preflight-wiring.test.ts`
- Found commits `16d2964`, `4abdf8d`, and `ec49808`
- STATE.md and ROADMAP.md were intentionally not modified per the 07-10 ownership constraints.

---
*Phase: 07-delivery*
*Completed: 2026-04-28*
