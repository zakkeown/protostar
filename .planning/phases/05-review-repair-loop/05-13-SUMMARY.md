---
phase: 05-review-repair-loop
plan: 13
subsystem: delivery
tags: [delivery, delivery-authorization, type-contracts, github-pr, review-loop]

requires:
  - phase: 05-review-repair-loop
    provides: "DeliveryAuthorization brand from 05-04 and approved loop minting from 05-10"
provides:
  - "DeliveryAuthorization-gated createGitHubPrDeliveryPlan type declaration for Phase 7"
  - "Type-level negative tests proving delivery planning cannot be called without the brand"
  - "Deprecated legacy review-gate delivery helper preserved under createGitHubPrDeliveryPlanLegacy"
affects: [07-delivery, factory-cli, delivery]

tech-stack:
  added: []
  patterns:
    - "Type-only cross-phase contract pins use declare function plus type-only tests"
    - "Legacy runtime exports are renamed with @deprecated docs while canonical names are reserved for future implementation"

key-files:
  created:
    - packages/delivery/src/delivery-contract.ts
  modified:
    - packages/delivery/src/delivery-contract.test.ts
    - packages/delivery/src/index.ts
    - packages/delivery/package.json
    - packages/delivery/tsconfig.json
    - apps/factory-cli/src/main.ts
    - pnpm-lock.yaml

key-decisions:
  - "Pinned createGitHubPrDeliveryPlan as a declare function with DeliveryAuthorization as the required first argument."
  - "Kept the Phase 5 body runtime-free; Phase 7 owns the implementation against this exact signature."
  - "Renamed the existing review-gate helper to createGitHubPrDeliveryPlanLegacy so factory-cli can continue compiling until Phase 7 consumes DeliveryAuthorization directly."

patterns-established:
  - "Delivery package type tests can use import type plus declare const to validate future runtime declarations without executing missing Phase 7 bodies."

requirements-completed: [LOOP-05]

duration: approximately 15min
completed: 2026-04-28
---

# Phase 05 Plan 13: Delivery Contract Pin Summary

**Delivery now exposes a Phase 7 type pin requiring DeliveryAuthorization before GitHub PR planning can compile.**

## Performance

- **Duration:** Approximately 15 min
- **Started:** Not captured by SDK
- **Completed:** 2026-04-28T01:52:46Z
- **Tasks:** 1 TDD task
- **Files modified:** 7

## Accomplishments

- Added `packages/delivery/src/delivery-contract.ts` with `createGitHubPrDeliveryPlan(authorization: DeliveryAuthorization, input: GitHubPrDeliveryInput)`.
- Added type-level tests proving a missing authorization argument and forged plain object authorization both fail to compile.
- Added the delivery package test script and Node test types so `pnpm --filter @protostar/delivery test` covers the contract.
- Renamed the old review-gate runtime helper to deprecated `createGitHubPrDeliveryPlanLegacy` and updated the remaining factory-cli callsite.
- Added the delivery package dependency/reference edge to `@protostar/intent` for `ConfirmedIntent`.

## Task Commits

Each TDD gate was committed atomically:

1. **Task 1 RED: delivery authorization contract test** - `10c9ffc` (test)
2. **Task 1 GREEN: delivery authorization contract pin** - `35f2682` (feat)

## Files Created/Modified

- `packages/delivery/src/delivery-contract.ts` - Phase 5 type-only declaration for Phase 7 GitHub PR delivery planning.
- `packages/delivery/src/delivery-contract.test.ts` - Positive branded type check plus missing-brand and forged-brand `@ts-expect-error` tests.
- `packages/delivery/src/index.ts` - Re-exports the contract and preserves the old body as deprecated `createGitHubPrDeliveryPlanLegacy`.
- `packages/delivery/package.json` - Adds `test` script and `@protostar/intent` dependency.
- `packages/delivery/tsconfig.json` - Adds Node test types and intent project reference.
- `apps/factory-cli/src/main.ts` - Narrow compatibility edit to call the deprecated legacy helper until Phase 7 replaces delivery planning.
- `pnpm-lock.yaml` - Records the delivery-to-intent workspace importer edge.

## Decisions Made

- Used the first-argument signature requested by Q-16 rather than an input object carrying `authorization`; this makes the authorization requirement visually and type-level explicit.
- Used `export declare function` rather than a type alias so Phase 7 can provide the canonical runtime export without changing the public type surface.
- Kept the contract test type-only for the declared function to avoid creating a runtime stub before Phase 7.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated the remaining factory-cli legacy callsite**
- **Found during:** Task 1 (delivery-contract.ts + DeliveryAuthorization-gated signature)
- **Issue:** `apps/factory-cli/src/main.ts` still imported the old `createGitHubPrDeliveryPlan` runtime helper. Renaming the helper as planned would break the build.
- **Fix:** Updated the import and callsite to `createGitHubPrDeliveryPlanLegacy`.
- **Files modified:** `apps/factory-cli/src/main.ts`
- **Verification:** `pnpm --filter @protostar/factory-cli build`; root `pnpm run verify`
- **Committed in:** `35f2682`

**2. [Rule 3 - Blocking] Added delivery test infrastructure edge**
- **Found during:** Task 1 RED/GREEN
- **Issue:** `@protostar/delivery` had no `test` script and no Node test types, so the new contract test could not run cleanly.
- **Fix:** Added a package `test` script and `types: ["node"]` to the delivery tsconfig.
- **Files modified:** `packages/delivery/package.json`, `packages/delivery/tsconfig.json`
- **Verification:** `pnpm --filter @protostar/delivery test`
- **Committed in:** `10c9ffc`, `35f2682`

---

**Total deviations:** 2 auto-fixed (Rule 3: 2)  
**Impact on plan:** Both fixes were necessary to preserve buildability while keeping the Phase 7 delivery implementation deferred.

## Issues Encountered

- `pnpm run factory` built successfully and stopped at the expected workspace-trust gate with exit code 2.

## Verification

- `pnpm --filter @protostar/delivery test` - passed.
- `pnpm --filter @protostar/delivery build` - passed.
- `pnpm --filter @protostar/factory-cli build` - passed.
- `pnpm run verify` - passed.
- `pnpm run factory` - built, then stopped at expected workspace-trust gate.
- `grep -c 'DeliveryAuthorization' packages/delivery/src/delivery-contract.ts` - 3.
- `grep -c '@protostar/review' packages/delivery/package.json` - 1.
- `grep -c '@ts-expect-error' packages/delivery/src/delivery-contract.test.ts` - 2.
- `grep -c '@deprecated' packages/delivery/src/index.ts` - 1.

## Known Stubs

None in files created by this plan. Stub-pattern scan hits in `apps/factory-cli/src/main.ts` were pre-existing accumulator arrays and null guards, not placeholders or unwired delivery behavior.

## Threat Flags

None. This plan introduced no new network endpoint, filesystem operation, auth path, or runtime delivery side effect; it only pinned a type boundary and preserved the existing legacy runtime helper.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 7 can now implement the real GitHub PR delivery planner against `packages/delivery/src/delivery-contract.ts`. Any attempt to call the canonical planner without a minted `DeliveryAuthorization` fails at compile time.

## Self-Check: PASSED

- Created file exists: `packages/delivery/src/delivery-contract.ts`.
- Task commits exist in git history: `10c9ffc`, `35f2682`.
- Acceptance greps passed for `DeliveryAuthorization`, `@protostar/review`, two `@ts-expect-error` assertions, and `@deprecated`.
- Unrelated untracked `.protostar/refusals.jsonl` and `.planning/phases/07-delivery/` artifacts were left untouched.

---
*Phase: 05-review-repair-loop*
*Completed: 2026-04-28*
