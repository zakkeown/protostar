---
phase: 07-delivery
plan: 06
subsystem: delivery-runtime
tags: [octokit, github, preflight, redaction, nock]

requires:
  - phase: 07-delivery
    provides: "Delivery brands/refusals and PR body exports from Plans 07-04/07-05"
provides:
  - "Octokit factory with retry and throttling safe defaults"
  - "Env-only GitHub token fast preflight"
  - "Octokit-backed full delivery preflight with token scope, repo, and base-branch checks"
  - "Octokit error to DeliveryRefusal mapper with token redaction"
affects: [07-07, 07-08, factory-cli-delivery]

tech-stack:
  added: []
  patterns: [injected-octokit-network-primitive, nock-fixture-tests, bounded-refusal-evidence]

key-files:
  created:
    - packages/delivery-runtime/src/octokit-client.ts
    - packages/delivery-runtime/src/octokit-client.test.ts
    - packages/delivery-runtime/src/preflight-fast.ts
    - packages/delivery-runtime/src/preflight-fast.test.ts
    - packages/delivery-runtime/src/preflight-full.ts
    - packages/delivery-runtime/src/preflight-full.test.ts
    - packages/delivery-runtime/src/map-octokit-error.ts
    - packages/delivery-runtime/src/map-octokit-error.test.ts
  modified:
    - packages/delivery-runtime/src/index.ts

key-decisions:
  - "Full preflight accepts absent X-OAuth-Scopes as empty scopes for fine-grained PATs."
  - "The delivery-runtime barrel exports only public primitives and types; the Octokit class test helper stays source-local."

patterns-established:
  - "Octokit clients are constructed once with no retry on hard 4xx refusals and no secondary rate-limit retry."
  - "Octokit boundary errors are mapped to existing DeliveryRefusal variants without serializing raw error objects."

requirements-completed: [DELIVER-01]

duration: 30min
completed: 2026-04-28
---

# Phase 7 Plan 06: Octokit and Preflight Summary

**GitHub delivery network primitives with safe Octokit construction, fast/full preflights, and token-redacted refusal mapping**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-04-28T13:40:00Z
- **Completed:** 2026-04-28T14:10:23Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Added `buildOctokit` with `@octokit/plugin-retry` and `@octokit/plugin-throttling`, hard 4xx no-retry defaults, and secondary rate-limit refusal.
- Added `preflightDeliveryFast` for env-only `PROTOSTAR_GITHUB_TOKEN` presence and classic/fine-grained PAT format checks.
- Added `preflightDeliveryFull` with injected Octokit calls for auth, excessive PAT scope rejection, repo accessibility, base branch resolution, and signal threading.
- Added `mapOctokitErrorToRefusal` with bounded refusal evidence and classic/fine-grained token redaction.

## Task Commits

1. **Task 1 RED:** `d04976c` test(07-06): add failing tests for octokit client and fast preflight
2. **Task 1 GREEN:** `73527c9` feat(07-06): implement octokit client and fast preflight
3. **Task 2 RED:** `d381c61` test(07-06): add failing tests for full delivery preflight
4. **Task 2 GREEN:** `3aff5eb` feat(07-06): implement full delivery preflight
5. **Task 3 RED:** `8eaf511` test(07-06): add failing tests for Octokit error mapping
6. **Task 3 GREEN:** `9e3d515` feat(07-06): implement redacted Octokit error mapper
7. **Refactor:** `a6bb727` refactor(07-06): narrow delivery runtime barrel exports

## Files Created/Modified

- `packages/delivery-runtime/src/octokit-client.ts` - Octokit factory with retry/throttling plugins and safe defaults.
- `packages/delivery-runtime/src/octokit-client.test.ts` - Auth, plugin composition, and retry/throttle behavior tests.
- `packages/delivery-runtime/src/preflight-fast.ts` - Pure env-only token preflight.
- `packages/delivery-runtime/src/preflight-fast.test.ts` - Missing, empty, invalid, classic PAT, and fine-grained PAT cases.
- `packages/delivery-runtime/src/preflight-full.ts` - Injected-Octokit full preflight with forbidden scope checks and branch SHA resolution.
- `packages/delivery-runtime/src/preflight-full.test.ts` - Nock-driven coverage for ok, invalid token, excessive scope, repo inaccessible, branch missing, fine-grained scopes, and 500 propagation.
- `packages/delivery-runtime/src/map-octokit-error.ts` - Octokit error classifier with token/header redaction before refusal evidence capture.
- `packages/delivery-runtime/src/map-octokit-error.test.ts` - Refusal mapping and no-token-serialization assertions.
- `packages/delivery-runtime/src/index.ts` - Public exports for downstream delivery plans.

## Decisions Made

- Kept `preflightDeliveryFull` Octokit-injected rather than constructing a client internally, preserving testability and avoiding implicit env access.
- Treated absent `X-OAuth-Scopes` as an empty scope list, matching fine-grained PAT behavior while still rejecting known classic PAT admin scopes.
- Did not widen `DeliveryRefusal`; the mapper uses existing precise variants and only captures bounded/redacted strings where the variant already supports them.

## Deviations from Plan

None - plan executed as written. The only refactor narrowed the barrel export surface so the source-level test helper does not become a package-level public primitive.

## Issues Encountered

An early focused package test run surfaced a transient/out-of-scope `packages/review` typecheck error while `preflight-full.ts` did not exist yet. After the delivery-runtime implementation was complete, `pnpm --filter @protostar/delivery-runtime test` and full `pnpm run verify` both passed.

## Known Stubs

None.

## Threat Flags

None. The new network and token-handling surfaces are the planned T-07-06 mitigations: no secondary rate-limit retry, excessive PAT scope rejection, and redacted refusal evidence.

## Verification

- `pnpm --filter @protostar/delivery-runtime test --run octokit-client` - passed
- `pnpm --filter @protostar/delivery-runtime test --run preflight-fast` - passed
- `node --test packages/delivery-runtime/dist/*.test.js --run preflight-full` - passed
- `node --test packages/delivery-runtime/dist/*.test.js --run map-octokit-error` - passed
- `node --test packages/delivery-runtime/dist/*.test.js --run 'octokit-client|preflight-fast|preflight-full|map-octokit-error|no-fs.contract|no-merge.contract'` - passed
- `pnpm --filter @protostar/delivery-runtime test` - passed
- `pnpm run verify` - passed

## User Setup Required

None - no external service configuration required for this plan.

## Next Phase Readiness

Plans 07-07 and 07-08 can consume `buildOctokit`, `preflightDeliveryFast`, `preflightDeliveryFull`, and `mapOctokitErrorToRefusal` from `@protostar/delivery-runtime`. The package remains fs-forbidden and merge-free under the existing static contract tests.

## Self-Check: PASSED

- Created files exist.
- Task commits exist in `git log`.
- Summary path created at `.planning/phases/07-delivery/07-06-octokit-and-preflight-SUMMARY.md`.

---
*Phase: 07-delivery*
*Completed: 2026-04-28*
