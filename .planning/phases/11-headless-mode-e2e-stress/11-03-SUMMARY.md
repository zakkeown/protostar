---
phase: 11-headless-mode-e2e-stress
plan: 03
subsystem: fixtures
tags: [seed-library, ttt, admission-e2e, ambiguity, feature-add]

requires:
  - phase: 11-headless-mode-e2e-stress
    provides: "STRESS-01 traceability and accepted Phase 11 plan graph"
  - phase: 11-headless-mode-e2e-stress
    provides: "Feature-add admission caps and repair-loop budget of 9"
provides:
  - "Frozen per-archetype seedLibrary record preserving Phase 10 cosmetic seed order"
  - "TTT feature-add seed and expectations for ../protostar-toy-ttt"
  - "Admission-e2e seed-library shape and TTT ambiguity contracts"
  - "Explicit admission-e2e dependency/reference on @protostar/fixtures"
affects: [11-09, 11-10, 11-12, 11-13, 11-14, fixtures, admission-e2e, factory-cli]

tech-stack:
  added: []
  patterns:
    - "Frozen archetype-keyed seed library with flattening helper for future stress drivers"
    - "Test-owned seed materialization into real IntentDraft shape"
    - "Phase 10 matrix outcome directories filtered separately from archetype fixture directories"

key-files:
  created:
    - packages/admission-e2e/src/seed-library-shape.contract.test.ts
    - packages/admission-e2e/src/ttt-seed-ambiguity.contract.test.ts
    - packages/fixtures/src/seeds/feature-add/ttt-game.ts
    - packages/fixtures/src/seeds/feature-add/ttt-game.json
    - packages/fixtures/__fixtures__/feature-add/ttt-game/expectations.ts
  modified:
    - packages/fixtures/src/seeds/index.ts
    - packages/fixtures/src/seeds/seed-library.test.ts
    - packages/fixtures/src/seeds/button-color-hover.ts
    - packages/fixtures/src/seeds/card-shadow.ts
    - packages/fixtures/src/seeds/navbar-aria.ts
    - packages/fixtures/src/matrix/matrix.test.ts
    - packages/admission-e2e/package.json
    - packages/admission-e2e/tsconfig.json
    - packages/admission-e2e/src/fixture-matrix-age.contract.test.ts
    - packages/admission-e2e/src/fixture-matrix-coverage.contract.test.ts
    - apps/factory-cli/src/commands/__dogfood-step.ts
    - apps/factory-cli/src/commands/__dogfood-step.test.ts
    - pnpm-lock.yaml

key-decisions:
  - "Kept listSeedIds() cosmetic-only by default for Phase 10 dogfood compatibility; flattenSeedLibrary() is the all-archetype view."
  - "Kept the TTT seed acceptance-criteria strings exact; the ambiguity contract expands them only while materializing an IntentDraft."
  - "Treated packages/fixtures/__fixtures__/feature-add as seed expectations, not a Phase 10 DOG-02 matrix outcome row."

patterns-established:
  - "Seed files stay pure TypeScript/JSON data; no runtime filesystem reads are needed to consume the seed."
  - "Admission-e2e contracts may import @protostar/fixtures directly only with explicit workspace dependency and tsconfig reference."
  - "TTT seed admission proof asserts the canonical 0.2 ambiguity threshold instead of changing scorer calibration."

requirements-completed: [STRESS-03]

duration: 20min
completed: 2026-04-29
---

# Phase 11 Plan 03: Seed Library TTT Summary

**Per-archetype seed library with a rich TTT feature-add seed that clears the existing brownfield ambiguity gate**

## Performance

- **Duration:** 20 min
- **Started:** 2026-04-29T17:26:50Z
- **Completed:** 2026-04-29T17:46:00Z
- **Tasks:** 3
- **Files modified:** 18 implementation/test files

## Accomplishments

- Converted the seed library from a flat cosmetic-only list into a frozen record keyed by `cosmetic-tweak`, `feature-add`, `bugfix`, and `refactor`.
- Added the `ttt-game` feature-add seed, typed export, JSON fixture, immutable verification expectations, and exact repair-loop budget of 9.
- Added admission-e2e contracts proving the seed library shape and the TTT seed materialize into an admitted brownfield `IntentDraft` at the canonical `0.2` ambiguity threshold.

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert seed library tests to per-archetype shape** - `748f182` (test)
2. **Task 2: Add the TTT feature-add seed and expectations** - `d12b190` (feat)
3. **Task 3 RED: Prove the TTT seed clears the existing ambiguity gate** - `81c7cfd` (test)
4. **Task 3 GREEN: Prove TTT seed clears ambiguity gate** - `01bc1ae` (feat)
5. **Verification fix: Keep TTT acceptance criteria internal** - `917ac5d` (fix)

**Plan metadata:** recorded in final docs commit after this summary.

## Files Created/Modified

- `packages/fixtures/src/seeds/index.ts` - Added `SeedArchetype`, richer `Seed` shape, grouped `seedLibrary`, `listSeedIds()`, and `flattenSeedLibrary()`.
- `packages/fixtures/src/seeds/feature-add/ttt-game.ts` and `ttt-game.json` - Added the pure typed and JSON TTT feature-add seed.
- `packages/fixtures/__fixtures__/feature-add/ttt-game/expectations.ts` - Added target repo, immutable verification file, CI check, and max ambiguity expectations.
- `packages/fixtures/src/seeds/*` cosmetic seed files - Added acceptance criteria while preserving Phase 10 order.
- `packages/fixtures/src/seeds/seed-library.test.ts` - Locked grouped seed shape, frozen output, cosmetic order, and TTT presence.
- `packages/admission-e2e/src/seed-library-shape.contract.test.ts` - Added cross-package seed-library shape contract.
- `packages/admission-e2e/src/ttt-seed-ambiguity.contract.test.ts` - Added RED/GREEN TTT seed admission and ambiguity contract.
- `packages/admission-e2e/package.json`, `tsconfig.json`, and `pnpm-lock.yaml` - Added explicit `@protostar/fixtures` workspace dependency/reference.
- `apps/factory-cli/src/commands/__dogfood-step.ts` and test - Kept dogfood rotation on the cosmetic seed group after the library shape changed.
- `packages/fixtures/src/matrix/matrix.test.ts` and admission-e2e fixture-matrix contracts - Kept Phase 10 DOG-02 matrix rows scoped to known outcome directories.

## Decisions Made

- Preserved Phase 10 behavior by making `listSeedIds()` return cosmetic ids when no archetype is supplied; callers that need all seeds can use `flattenSeedLibrary()`.
- Expanded the TTT acceptance criteria only in the admission-e2e materialized draft so the canonical seed strings remain exact and operator-readable.
- Kept bugfix and refactor seed groups empty in this plan; Plan 11-02 wires their admission caps, while this plan owns only the TTT feature-add seed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated dogfood seed consumers for grouped seedLibrary**
- **Found during:** Task 2
- **Issue:** The internal dogfood command still indexed `seedLibrary` as a flat array.
- **Fix:** Scoped dogfood rotation and tests to `seedLibrary["cosmetic-tweak"]`.
- **Files modified:** `apps/factory-cli/src/commands/__dogfood-step.ts`, `apps/factory-cli/src/commands/__dogfood-step.test.ts`
- **Verification:** `pnpm --filter @protostar/factory-cli test -- --test-name-pattern "__dogfood-step"` passed as part of the Task 2 verification.
- **Committed in:** `d12b190`

**2. [Rule 1 - Bug] Kept feature-add expectations out of the Phase 10 fixture matrix**
- **Found during:** Task 2
- **Issue:** The new `packages/fixtures/__fixtures__/feature-add` tree looked like an extra DOG-02 matrix row to existing matrix tests/contracts.
- **Fix:** Filtered matrix coverage and age checks to the known Phase 10 outcome directories.
- **Files modified:** `packages/fixtures/src/matrix/matrix.test.ts`, `packages/admission-e2e/src/fixture-matrix-age.contract.test.ts`, `packages/admission-e2e/src/fixture-matrix-coverage.contract.test.ts`
- **Verification:** `pnpm --filter @protostar/fixtures test` and `pnpm --filter @protostar/admission-e2e test` passed.
- **Committed in:** `d12b190`

**3. [Rule 1 - Bug] Removed unused public TTT acceptance-criteria export**
- **Found during:** Final verification
- **Issue:** `pnpm run verify` failed at `knip` because `tttGameAcceptanceCriteria` was exported but unused.
- **Fix:** Kept the frozen array internal to the TTT seed module.
- **Files modified:** `packages/fixtures/src/seeds/feature-add/ttt-game.ts`
- **Verification:** `pnpm --filter @protostar/fixtures test`, `pnpm knip --no-config-hints`, and a full rerun of `pnpm run verify` passed.
- **Committed in:** `917ac5d`

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs)
**Impact on plan:** All auto-fixes were compatibility or verification hygiene directly caused by the seed-library shape change. No scope expansion.

## Issues Encountered

- After `pnpm install --lockfile-only`, the local admission-e2e workspace needed `pnpm install --offline` before the new `@protostar/fixtures` symlink was available for the RED package test.
- `pnpm run factory` built successfully and then stopped at the expected workspace-trust gate with exit code 2. The generated `.protostar/refusals.jsonl` line was removed after verification so runtime residue did not enter the commit.

## Known Stubs

None. The scan only found existing test-local empty strings/arrays and runtime null checks that do not flow to UI rendering or seed behavior.

## Threat Flags

None. This plan added static fixture/test data and package dependency wiring only; it introduced no network endpoint, auth path, file-access runtime, or database schema surface outside the plan threat model.

## Verification

- `pnpm --filter @protostar/fixtures test` passed.
- `pnpm --filter @protostar/admission-e2e test` passed.
- `pnpm --filter @protostar/admission-e2e exec node --test dist/ttt-seed-ambiguity.contract.test.js` passed.
- `pnpm --filter @protostar/admission-e2e test -- --test-name-pattern "TTT seed ambiguity"` passed; the package script ran the full suite.
- `pnpm knip --no-config-hints` passed after `917ac5d`.
- `pnpm run verify` passed.
- `pnpm run factory` built successfully, then stopped at the expected workspace-trust gate.
- `git diff --check` passed.

## User Setup Required

None. The TTT seed references the existing external toy repo and immutable verification files, but this plan did not modify that repo or require new secrets.

## Next Phase Readiness

Plans 11-09, 11-10, and 11-14 can consume `seedLibrary["feature-add"]`, `flattenSeedLibrary()`, and the TTT expectations. Plan 11-12 can add bounded package-add authority knowing the TTT seed already pins immutable verification file assumptions.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/11-headless-mode-e2e-stress/11-03-SUMMARY.md`.
- Task commits exist: `748f182`, `d12b190`, `81c7cfd`, `01bc1ae`, `917ac5d`.
- Required created files exist for the TTT seed, expectations, seed-library contract, and TTT ambiguity contract.
- Requirement IDs from the plan frontmatter are recorded: `STRESS-03`.

---
*Phase: 11-headless-mode-e2e-stress*
*Completed: 2026-04-29*
