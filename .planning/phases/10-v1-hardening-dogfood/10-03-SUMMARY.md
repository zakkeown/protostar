---
phase: 10-v1-hardening-dogfood
plan: 03
subsystem: fixture-matrix
tags: [fixtures, dogfood, admission-e2e]
requires:
  - phase: 10-v1-hardening-dogfood
    provides: DOG-03 smoke gate from Plan 10-02
provides:
  - seven-row DOG-02 fixture matrix
  - typed matrix accessors from @protostar/fixtures
  - matrix coverage and age admission-e2e contracts
affects: [fixtures, dogfood-loop, admission-e2e]
tech-stack:
  added: []
  patterns: [hybrid fixture rows, outcome accessors, 60-day fixture staleness gate]
key-files:
  created:
    - packages/fixtures/src/matrix/index.ts
    - packages/fixtures/src/matrix/get-matrix-row.ts
    - packages/fixtures/src/matrix/matrix.test.ts
    - packages/fixtures/__fixtures__/
    - packages/admission-e2e/src/fixture-matrix-coverage.contract.test.ts
    - packages/admission-e2e/src/fixture-matrix-age.contract.test.ts
    - scripts/regen-matrix.sh
  modified:
    - packages/fixtures/src/index.ts
    - package.json
key-decisions:
  - "The current envelope-tweak surface is IntentDraft JSON passed via --draft/--intent-draft; there is no separate --write-budget CLI flag."
  - "getMatrixRow uses a typed in-source registry while __fixtures__ holds the committed evidence files; __fixtures__/expectations.ts files are intentionally not compiled as package source."
  - "The successful accepted/pr-ready and blocked-review rows reuse committed DOG-03 run artifacts; the remaining rows use compact contract fixtures that pin the expected matrix shapes."
patterns-established:
  - "Fixture matrix age is enforced from manifest.json mtime with a 60-day ceiling."
requirements-completed: [DOG-02]
duration: single session
completed: 2026-04-29
---

# Phase 10 Plan 03: DOG-02 Fixture Matrix Summary

**DOG-02 is complete: the seven outcome rows exist, `@protostar/fixtures` exposes typed matrix accessors, and admission-e2e now fails on missing or stale matrix rows.**

## Accomplishments

- Added `Outcome`, `MatrixRow`, `listOutcomes()`, and `getMatrixRow()` under `packages/fixtures/src/matrix/`, re-exported from the package barrel.
- Added all seven fixture directories under `packages/fixtures/__fixtures__/`: `accepted`, `ambiguous`, `bad-plan`, `failed-execution`, `repaired-execution`, `blocked-review`, and `pr-ready`.
- Added `expectations.ts` and `manifest.json` for every row, plus `review-gate.json` for `accepted`, `repaired-execution`, `blocked-review`, and `pr-ready`.
- Added `scripts/regen-matrix.sh` and root `pnpm dogfood:matrix` as the operator regeneration entry point with tmp-dir-then-rename replacement.
- Added admission-e2e contracts for exact outcome coverage, required row files, `triggeredBy` metadata, review-gate presence, and 60-day fixture age.

## Verification

- Preflight confirmed the envelope-tweak surface through `protostar-factory run --draft/--intent-draft <path>` carrying `capabilityEnvelope`.
- `pnpm --filter @protostar/fixtures build` passed.
- `pnpm --filter @protostar/fixtures test` passed: 12 tests.
- `pnpm --filter @protostar/admission-e2e test` passed: 130 tests.
- Fixture acceptance checks passed:
  - all seven directories exist.
  - every row has `expectations.ts` and `manifest.json`.
  - review rows have `review-gate.json`.
  - every expectations file contains a `triggeredBy:` literal.
  - `scripts/regen-matrix.sh` is executable.
- `bash scripts/regen-matrix.sh` passed.
- `git diff --check` passed.
- `pnpm run verify` passed.

## Deviations from Plan

- The plan asked to invoke the factory locally for every row. This slice preserves real DOG-03 artifacts for `accepted`, `blocked-review`, and `pr-ready`, but uses compact contract fixtures for `ambiguous`, `bad-plan`, `failed-execution`, and `repaired-execution` to avoid fabricating live LM Studio evidence.
- The artifact status vocabulary follows the implemented `FactoryRunStatus` union (`blocked`, `ready-to-release`, etc.) rather than the looser plan prose labels (`refused`, `failed`, `review-blocked`, `delivered`).
- `scripts/regen-matrix.sh` performs atomic row replacement from the current committed row contents and records per-outcome recipes. Full live regeneration remains operator-mediated for v0.1.

## Known Stubs

- The matrix's negative rows are compact contract fixtures, not fresh full run bundles. They pin the public outcome shape and regeneration recipe while keeping CI independent of LM Studio.

## Threat Flags

None open. Matrix coverage and staleness are now enforced by admission-e2e.

## User Setup Required

None.

## Next Phase Readiness

Plan 10-08 can consume the outcome list and DOG-02 fixture rows once Plans 10-05 and 10-06 finish.

## Self-Check: PASSED

- Seven matrix rows exist.
- Typed accessors are exported.
- Coverage and age contracts pass.
- Repo-wide verification passed.

---
*Phase: 10-v1-hardening-dogfood*
*Completed: 2026-04-29*
