---
phase: 07-delivery
plan: 04
subsystem: delivery
tags: [typescript, branded-types, validation, refusals, github-pr]

requires:
  - phase: 05-review-repair-loop
    provides: DeliveryAuthorization gate
  - phase: 07-delivery
    provides: delivery schema cascade and Q-02/Q-08 context
provides:
  - BranchName, PrTitle, and PrBody unique-symbol brands with pure validators
  - 14-variant DeliveryRefusal discriminator with typed evidence
  - runId-extended evidence marker builder/parser
  - type-level raw-string rejection contract test
  - GitHub PR delivery contract without gh argv emission
affects: [delivery-runtime, factory-cli, phase-07]

tech-stack:
  added: []
  patterns: [unique-symbol string brands, discriminated refusal union, strict marker parsing, type-level contract tests]

key-files:
  created:
    - packages/delivery/src/brands.ts
    - packages/delivery/src/brands.test.ts
    - packages/delivery/src/refusals.ts
    - packages/delivery/src/refusals.test.ts
    - packages/delivery/src/evidence-marker.ts
    - packages/delivery/src/evidence-marker.test.ts
    - packages/delivery/src/brand-rejects-raw-string.contract.test.ts
  modified:
    - packages/delivery/src/index.ts
    - packages/delivery/src/delivery-contract.ts
    - packages/delivery/src/delivery-contract.test.ts

key-decisions:
  - "Kept packages/delivery pure: no filesystem, network, subprocess, or gh argv surface."
  - "Preserved the legacy factory-cli delivery-plan helper as non-throwing while removing its command field, because Wave 5 owns call-site replacement."

patterns-established:
  - "Brand validators return { ok: true, value } or { ok: false, refusal } and mint brands only after validation."
  - "Evidence comments use <!-- protostar-evidence:{kind}:{runId} --> and reject kind-only or whitespace-variant markers."

requirements-completed: [DELIVER-02, DELIVER-07]

duration: 6min
completed: 2026-04-28
---

# Phase 7 Plan 04: Brands and Refusals Summary

**Delivery now has brand-minted branch/title/body inputs, typed delivery refusals, strict runId evidence markers, and no `gh pr create` argv path.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-28T13:42:52Z
- **Completed:** 2026-04-28T13:49:06Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Added `BranchName`, `PrTitle`, and `PrBody` unique-symbol brands with validators for branch regex/length, title truncation, body UTF-8 byte cap, control-character refusal, and GitHub PAT format checks.
- Added the 14-kind `DeliveryRefusal` union with variant-specific evidence and an exhaustiveness helper.
- Added strict evidence marker helpers for `<!-- protostar-evidence:{kind}:{runId} -->`, rejecting malformed, unknown-kind, kind-only, and whitespace-variant markers.
- Removed the `gh` argv field from `GitHubPrDeliveryPlan` and the legacy delivery-plan output.
- Added type-level `@ts-expect-error` coverage proving raw strings cannot satisfy delivery brands.

## Task Commits

1. **Task 1 RED: refusal and marker tests** - `b7797b8` (test)
2. **Task 1 GREEN: refusal and marker implementation** - `deee48e` (feat)
3. **Task 2 RED: brand validator tests** - `a2e76e9` (test)
4. **Task 2 GREEN: brand validators** - `4865276` (feat)
5. **Task 3: brand contract and gh argv removal** - `52542fe` (feat)

## Files Created/Modified

- `packages/delivery/src/brands.ts` - Brand types, validators, control-character checks, PAT format helper.
- `packages/delivery/src/brands.test.ts` - Validator behavior tests for valid/refusal cases and token formats.
- `packages/delivery/src/refusals.ts` - Delivery refusal discriminator and exhaustiveness helper.
- `packages/delivery/src/refusals.test.ts` - All-variant construction and kind-narrowing tests.
- `packages/delivery/src/evidence-marker.ts` - Evidence marker constants, builder, and strict parser.
- `packages/delivery/src/evidence-marker.test.ts` - Marker round-trip and malformed-input tests.
- `packages/delivery/src/brand-rejects-raw-string.contract.test.ts` - Type-level raw-string rejection contract.
- `packages/delivery/src/delivery-contract.ts` - Branded delivery contract shape with no command field.
- `packages/delivery/src/delivery-contract.test.ts` - Updated contract tests for branded inputs.
- `packages/delivery/src/index.ts` - Barrel exports for the new delivery surface and legacy helper without argv.

## Decisions Made

- Kept `createGitHubPrDeliveryPlanLegacy` callable and non-throwing, but removed `command`, because `apps/factory-cli` still persists the legacy artifact in Wave 1 and later Phase 7 plans own runtime replacement.
- Used an `if (false)` block for type-level raw-string negative calls so TypeScript checks the `@ts-expect-error` lines without emitting runtime calls to declared-only functions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prevented runtime execution of declared-only contract helpers**
- **Found during:** Task 3
- **Issue:** The plan's sample type-level contract called `declare function` helpers at top level; compiled JavaScript would throw `ReferenceError` during `node:test`.
- **Fix:** Kept the `@ts-expect-error` assertions inside `if (false)` so TypeScript still checks them and runtime never executes them.
- **Files modified:** `packages/delivery/src/brand-rejects-raw-string.contract.test.ts`, `packages/delivery/src/delivery-contract.test.ts`
- **Verification:** `pnpm --filter @protostar/delivery test`
- **Committed in:** `52542fe`

**2. [Rule 3 - Blocking] Made barrel exports explicit for acceptance verification**
- **Found during:** Task 3 acceptance checks
- **Issue:** `export *` was valid TypeScript but did not expose the required symbol names to the grep-based acceptance check.
- **Fix:** Added explicit named/type re-exports alongside the existing wildcard exports.
- **Files modified:** `packages/delivery/src/index.ts`
- **Verification:** grep found `validateBranchName`, `validatePrTitle`, `validatePrBody`, `BranchName`, `PrTitle`, `PrBody`, `DeliveryRefusal`, `buildEvidenceMarker`, and `parseEvidenceMarker`.
- **Committed in:** `52542fe`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocker).
**Impact on plan:** No scope expansion; both fixes preserve the intended contract and keep tests executable.

## Issues Encountered

- `noUncheckedIndexedAccess` required a small test helper in `refusals.test.ts` before the narrowing test could compile.
- Another agent committed unrelated Phase 6 docs during this work; 07-04 commits and staging were kept to delivery files only.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm --filter @protostar/delivery test` - passed, 13 tests.
- `grep -rn "gh pr create" packages/delivery/ || true` - zero matches.
- `pnpm --filter @protostar/delivery build` - passed.
- `pnpm run typecheck` - passed.

## Next Phase Readiness

Wave 2 can consume branded branch/title/body values and typed `DeliveryRefusal` results. Wave 5 can replace the legacy factory-cli delivery-plan call without carrying the old argv surface forward.

## Self-Check: PASSED

- Verified summary file exists.
- Verified key created files exist: `brands.ts`, `refusals.ts`, `evidence-marker.ts`, `brand-rejects-raw-string.contract.test.ts`.
- Verified task commits exist: `b7797b8`, `deee48e`, `a2e76e9`, `4865276`, `52542fe`.

---
*Phase: 07-delivery*
*Completed: 2026-04-28*
