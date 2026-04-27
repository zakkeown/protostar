---
phase: 02-authority-governance-kernel
plan: 01
subsystem: governance
tags: [authority, governance, workspace, json-schema, node-test, typescript]

requires:
  - phase: 01-intent-planning-admission
    provides: Intent package schema/export conventions and node:test workspace pattern
provides:
  - Buildable @protostar/authority workspace package
  - Authority-owned Draft 2020-12 schema skeletons
  - Zero-filesystem-import authority boundary baseline
affects: [phase-2-authority, phase-3-repo-runtime, admission-decisions, governance-schemas]

tech-stack:
  added: []
  patterns:
    - ESM TypeScript workspace package with compiled node:test smoke test
    - JSON Schema Draft 2020-12 files exported as package subpaths

key-files:
  created:
    - packages/authority/package.json
    - packages/authority/tsconfig.json
    - packages/authority/src/index.ts
    - packages/authority/src/internal/brand-witness.ts
    - packages/authority/src/internal/test-builders.ts
    - packages/authority/src/skeleton.test.ts
    - packages/authority/schema/repo-policy.schema.json
    - packages/authority/schema/admission-decision-base.schema.json
    - packages/authority/schema/precedence-decision.schema.json
    - packages/authority/schema/policy-snapshot.schema.json
    - packages/authority/schema/escalation-marker.schema.json
  modified:
    - tsconfig.json
    - pnpm-lock.yaml

key-decisions:
  - "@protostar/authority starts as a pure-logic package with no runtime dependencies and no node:fs imports."
  - "Authority schemas use schemaVersion const 1.0.0 and top-level additionalProperties:false."
  - "High-level GOV requirements remain open until later Phase 2 plans add behavior."

patterns-established:
  - "Authority workspace mirrors @protostar/intent package scripts, files, and subpath export shape."
  - "Schema subpaths are exported before runtime validators consume them in later waves."

requirements-completed: [GOV-01, GOV-02, GOV-03, GOV-05]

duration: 35min
completed: 2026-04-27
---

# Phase 2 Plan 01: Authority Package Skeleton Summary

**Buildable pure-logic `@protostar/authority` workspace with schema-versioned governance artifacts and a zero-filesystem-import boundary baseline.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-04-27T15:03:00Z
- **Completed:** 2026-04-27T15:39:11Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- Created `@protostar/authority` as a pnpm workspace package with ESM TypeScript build, compiled `node:test` smoke coverage, package subpath exports, and no runtime dependencies.
- Registered the authority package in root TypeScript project references and refreshed the lockfile workspace importer entry.
- Added the five authority-owned JSON Schema files for repo policy, shared admission decision base, precedence decision, policy snapshot, and escalation marker.
- Verified the authority boundary baseline: zero `node:fs` or bare `fs` imports under `packages/authority/src`.

## Task Commits

1. **Task 1 RED: Add failing authority skeleton smoke test** - `d3bcc0d` (test)
2. **Task 1 GREEN: Create authority workspace skeleton** - `4084822` (feat)
3. **Task 2: Add authority schema skeletons** - `d473a9e` (feat)

_Note: Task 1 was TDD, so it produced RED and GREEN commits._

## Files Created/Modified

- `packages/authority/package.json` - Workspace manifest, scripts, files list, and subpath exports for future authority consumers.
- `packages/authority/tsconfig.json` - Package build config mirroring `@protostar/intent`.
- `packages/authority/src/index.ts` - Wave 0 public barrel with package-ready smoke export.
- `packages/authority/src/internal/brand-witness.ts` - Internal placeholder module for future brand contract witnesses.
- `packages/authority/src/internal/test-builders.ts` - Internal placeholder module for future test-only brand builders.
- `packages/authority/src/skeleton.test.ts` - Compiled `node:test` smoke test for package readiness.
- `packages/authority/schema/*.schema.json` - Five authority-owned governance schemas with Draft 2020-12 headers and schemaVersion `1.0.0`.
- `tsconfig.json` - Root project reference for `packages/authority`.
- `pnpm-lock.yaml` - Workspace importer entry for `packages/authority`.

## Decisions Made

- Followed `@protostar/intent` package shape for scripts, ESM exports, `files`, and `sideEffects`.
- Kept `packages/authority` dependency-free in Wave 0; later waves will add workspace references only when imports land.
- Left GOV requirement checkboxes open in `.planning/REQUIREMENTS.md` because this plan provides prerequisite skeletons, not full behavioral enforcement.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first schema validation command used unescaped `$id` inside a double-quoted shell string, so the shell expanded it before Node executed. Reran the same validation with quoted property access; schemas passed.

## Authentication Gates

None.

## Known Stubs

None that prevent this plan's goal. The internal placeholder modules and `__authorityPackageReady` barrel export are intentional Wave 0 scaffolding called for by the plan.

## Verification

- `pnpm install` - passed; lockfile was up to date and registered all 15 workspace projects.
- `pnpm --filter @protostar/authority test` - passed; 1 test, 1 suite, 0 failures.
- `pnpm run verify:full` - passed after Task 1 and after Task 2; full recursive workspace test suite green.
- `pnpm run verify` - passed; typecheck, `@protostar/intent` tests, and `@protostar/factory-cli` tests green.
- `pnpm run factory` - passed; build succeeded and the sample factory command emitted a confirmed intent JSON payload.
- `grep -RIn --include='*.ts' "from ['\"]node:fs['\"]\\|from ['\"]fs['\"]" packages/authority/src/ | grep -v '^#' | wc -l` - `0`.
- Schema parse/id/additionalProperties check - passed for all five authority schemas.
- `repo-policy.schema.json` property-order check - passed.
- `admission-decision-base.schema.json` outcome enum check - passed.

## Self-Check: PASSED

- Created files exist.
- Task commits exist: `d3bcc0d`, `4084822`, `d473a9e`.
- Summary path exists: `.planning/phases/02-authority-governance-kernel/02-01-authority-package-skeleton-SUMMARY.md`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 02 can fill the authority package with AuthorizedOp brands using the internal placeholder modules and package exports created here. The package builds, tests, and participates in root `verify:full`.

---
*Phase: 02-authority-governance-kernel*
*Completed: 2026-04-27*
