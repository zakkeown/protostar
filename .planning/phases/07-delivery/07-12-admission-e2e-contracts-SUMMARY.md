---
phase: 07-delivery
plan: 12
subsystem: testing
tags: [admission-e2e, delivery, contracts, no-merge, preflight]

requires:
  - phase: 07-delivery
    provides: delivery-runtime schema, preflight, and no-merge contracts
provides:
  - Repo-wide production-source no-merge contract at admission-e2e boundary
  - Q-17 delivery-result.json schema contract with version rejection
  - Delivery preflight refusal artifact shape and token-leak contract
affects: [phase-07-verification, phase-09-inspect]

tech-stack:
  added: []
  patterns: [node:test contract tests, local runtime asserters, repo-wide static source walk]

key-files:
  created:
    - packages/admission-e2e/src/delivery-no-merge-repo-wide.contract.test.ts
    - packages/admission-e2e/src/delivery-result-schema.contract.test.ts
    - packages/admission-e2e/src/delivery-preflight-refusal-shapes.contract.test.ts
  modified:
    - packages/admission-e2e/package.json
    - packages/admission-e2e/tsconfig.json
    - pnpm-lock.yaml

key-decisions:
  - "Admission-e2e depends on @protostar/delivery-runtime to pin delivery wire contracts at the package boundary."
  - "Repo-wide no-merge scanning excludes test files and an explicit no-merge contract allowlist only."

patterns-established:
  - "Boundary contract tests may define local runtime asserters for JSON artifacts consumed by later phases."
  - "Repo-wide forbidden-surface scans strip comments before matching production source."

requirements-completed: [DELIVER-05, DELIVER-07]

duration: 6m39s
completed: 2026-04-28
---

# Phase 7 Plan 12: Admission E2E Contracts Summary

**Admission-e2e now pins the repo-wide no-merge invariant, delivery-result.json Q-17 schema, and preflight refusal artifact taxonomy.**

## Performance

- **Duration:** 6m39s
- **Started:** 2026-04-28T15:25:34Z
- **Completed:** 2026-04-28T15:32:13Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added the strongest DELIVER-07 contract: a repo-wide scan of production TypeScript under `packages/` and `apps/`, with comment stripping, test exclusions, explicit allowlist, offender line reporting, and synthetic offender coverage.
- Added an admission-e2e Q-17 `delivery-result.json` contract that imports `DeliveryResult` and `DELIVERY_RESULT_SCHEMA_VERSION`, round-trips delivered and blocked fixtures, rejects unversioned artifacts, pins `screenshots.status = "deferred-v01"`, and covers all CI verdict literals.
- Added preflight refusal artifact shape coverage for `token-missing`, `token-invalid`, `repo-inaccessible`, `base-branch-missing`, and `excessive-pat-scope`, including classic and fine-grained PAT leak rejection.
- Added `@protostar/delivery-runtime` as an admission-e2e workspace dependency/reference so the boundary tests consume the real delivery contracts.

## Task Commits

Each task was committed atomically, with TDD red and green commits:

1. **Task 1: Repo-wide no-merge contract** - `4a65127` (test), `2d71eaa` (feat)
2. **Task 2: delivery-result.json schema contract** - `942be2a` (test), `90adfb6` (feat)
3. **Task 3: Preflight refusal artifact shape contract** - `d67c07b` (test), `2b9daa5` (feat)

## Files Created/Modified

- `packages/admission-e2e/src/delivery-no-merge-repo-wide.contract.test.ts` - Repo-wide production source no-merge scan and synthetic offender test.
- `packages/admission-e2e/src/delivery-result-schema.contract.test.ts` - Q-17 delivery result fixtures and schema guard.
- `packages/admission-e2e/src/delivery-preflight-refusal-shapes.contract.test.ts` - Preflight refusal artifact shape guard and token leak rejection.
- `packages/admission-e2e/package.json` - Added `@protostar/delivery-runtime` dependency.
- `packages/admission-e2e/tsconfig.json` - Added delivery-runtime project reference.
- `pnpm-lock.yaml` - Recorded the workspace link.

## Decisions Made

- Used local asserters inside admission-e2e contract tests instead of exporting new production validators; the plan only required boundary pinning and this avoids expanding runtime API surface.
- Kept the repo-wide no-merge allowlist limited to the two no-merge contract tests while excluding all test files from production-source enforcement.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `pnpm run factory` exited 2 at the expected workspace-trust gate: `workspace is not trusted; escalation required before factory can proceed`.
- The execute-plan SDK path referenced by the workflow was absent in `node_modules`; execution continued from the explicit plan and required context files without touching protected planning state.

## Verification

- `pnpm --filter @protostar/admission-e2e test` - passed, 89 tests.
- `pnpm --filter @protostar/delivery-runtime test` - passed, 82 tests.
- `pnpm run verify` - passed.
- `pnpm run factory` - build passed, then stopped at expected workspace-trust gate with exit 2.

## Known Stubs

None.

## Threat Flags

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 7 admission-e2e closure contracts are in place. VALIDATION.md required surfaces are now covered by package-local contracts and this admission-e2e boundary suite, leaving Phase 7 ready for verification.

## Self-Check: PASSED

- Created files exist.
- Task commits exist in git history.
- Focused and broad verification commands were run.

---
*Phase: 07-delivery*
*Completed: 2026-04-28*
