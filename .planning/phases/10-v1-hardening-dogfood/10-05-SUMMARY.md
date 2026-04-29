---
phase: 10-v1-hardening-dogfood
plan: 05
subsystem: package-hygiene
tags: [knip, readmes, admission-e2e, docs]
requires:
  - phase: 10-v1-hardening-dogfood
    provides: DOG-03 smoke gate from Plan 10-02
  - phase: 10-v1-hardening-dogfood
    provides: Phase 10 dev-dependency lock revision from Plan 10-04
provides:
  - root knip configuration in verify
  - README.md for every packages/* workspace and apps/factory-cli
  - admission-e2e package README coverage contract
affects: [public-package-readiness, verify, admission-e2e]
tech-stack:
  added:
    - knip@^5.88.1
  patterns: [per-package README template, README coverage contract, knip hygiene gate]
key-files:
  created:
    - knip.json
    - .planning/templates/package-readme.md
    - packages/*/README.md
    - apps/factory-cli/README.md
    - packages/admission-e2e/src/per-package-readme-coverage.contract.test.ts
  modified:
    - package.json
    - pnpm-lock.yaml
    - packages/repair/package.json
key-decisions:
  - "knip runs at the tail of pnpm verify as pnpm knip --no-config-hints."
  - "knip excludes intentionally public type surfaces, duplicate compatibility exports, and historical contract files while preserving file/dependency/unlisted checks."
  - "Added @protostar/artifacts as a devDependency of @protostar/repair because synthesize-repair-plan.test.ts imports its StageArtifactRef type."
patterns-established:
  - "Every package README must include Public exports, Runtime dependencies, Authority constraints, and Change log sections."
requirements-completed: [DOG-06]
duration: single session
completed: 2026-04-29
---

# Phase 10 Plan 05: DOG-06 Package Hygiene Summary

**DOG-06 is complete: package READMEs exist for every workspace package, README coverage is enforced by admission-e2e, and `knip` is wired into `pnpm run verify`.**

## Accomplishments

- Added `knip@^5.88.1` as a root devDependency and `knip.json` at the repo root.
- Updated root `pnpm run verify` to end with `pnpm knip --no-config-hints`.
- Added `.planning/templates/package-readme.md` with the standard package README structure.
- Added `README.md` to every `packages/*` workspace and `apps/factory-cli`, covering purpose, public exports, runtime dependencies, authority constraints, and change-log link.
- Added `packages/admission-e2e/src/per-package-readme-coverage.contract.test.ts`, which dynamically enumerates `packages/*` plus `apps/factory-cli` and fails on missing READMEs or required sections.
- Added a test-only `@protostar/artifacts` devDependency to `@protostar/repair` to satisfy a type import in `synthesize-repair-plan.test.ts`.

## Verification

- `grep -q "knip" .planning/PROJECT.md` passed, confirming Plan 10-04's lock revision is present.
- `pnpm install -w -D knip@^5` passed.
- `pnpm install` passed after adding the `@protostar/repair` devDependency.
- `pnpm knip --no-config-hints` passed.
- `pnpm knip` passed.
- README acceptance checks passed:
  - template exists.
  - every `packages/*` workspace has `README.md`.
  - `apps/factory-cli/README.md` exists.
  - every README has all four required sections.
  - `packages/dogpile-adapter/README.md` mentions `no-fs`.
  - `packages/delivery-runtime/README.md` mentions `no-merge`.
- `pnpm --filter @protostar/admission-e2e test` passed: 132 tests.
- `git diff --check` passed.
- `pnpm run verify` passed, including the new knip step.

## Deviations from Plan

- `knip` reported many intentionally public type exports, compatibility duplicate exports, and standalone historical contract files. The config explicitly excludes those categories so the gate remains useful rather than forcing deletion of public API/contract surfaces.
- The root verify script uses `pnpm knip --no-config-hints` to avoid noisy non-failing configuration suggestions in routine verification output; plain `pnpm knip` also exits 0.

## Known Stubs

None.

## Threat Flags

None open. README coverage and knip now run in automated gates.

## User Setup Required

None.

## Next Phase Readiness

Plan 10-06 release packaging is unblocked. It remains marked non-autonomous because it touches release tooling and public publish posture.

## Self-Check: PASSED

- `knip` is installed, configured, and part of `pnpm run verify`.
- Every package has a README with required sections.
- Admission-e2e enforces README coverage.
- Repo-wide verification passed.

---
*Phase: 10-v1-hardening-dogfood*
*Completed: 2026-04-29*
