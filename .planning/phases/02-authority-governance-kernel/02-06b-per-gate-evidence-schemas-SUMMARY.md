---
phase: 02-authority-governance-kernel
plan: 06b
subsystem: governance
tags: [admission-decision, json-schema, package-exports, intent, planning, repo]

requires:
  - phase: 02-authority-governance-kernel
    provides: AdmissionDecisionBase fields, gate literals, intent-owned outcome literal, and signed-decision posture
provides:
  - Five per-gate admission-decision JSON schemas in owning packages
  - Intent, capability, repo-scope, planning, and workspace-trust schema subpath exports
  - Repo package schema packaging and test script support for plan verification
affects: [factory-cli-per-gate-writer, authority-stage-reader, repo-runtime-trust-check]

tech-stack:
  added: []
  patterns:
    - Static per-gate schemas repeat the admission-decision base shape inline
    - Owning packages export their own evidence schemas without runtime authority dependencies

key-files:
  created:
    - packages/intent/schema/intent-admission-decision.schema.json
    - packages/intent/schema/capability-admission-decision.schema.json
    - packages/intent/schema/repo-scope-admission-decision.schema.json
    - packages/planning/schema/planning-admission-decision.schema.json
    - packages/repo/schema/workspace-trust-admission-decision.schema.json
  modified:
    - packages/intent/package.json
    - packages/planning/package.json
    - packages/repo/package.json

key-decisions:
  - "Each schema repeats base fields inline with top-level and evidence-level additionalProperties:false, avoiding cross-package $ref coupling."
  - "The old intent admission schema/export is not preserved; Plan 09 owns legacy read fallback."
  - "The missing pre-existing intent schema was reconstructed from the current intent admission artifact contract instead of inventing a dual filename."

patterns-established:
  - "Per-gate evidence schemas live with their owning packages and expose package.json schema subpaths."
  - "Schema validation remains static JSON; no runtime dependency on @protostar/authority was added."

requirements-completed: [GOV-03, GOV-05]

duration: 3min
completed: 2026-04-27
---

# Phase 2 Plan 06b: Per-Gate Evidence Schemas Summary

**Five owning-package admission-decision schemas now define strict per-gate evidence payloads for the factory writer and stage reader.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-27T16:03:22Z
- **Completed:** 2026-04-27T16:06:11Z
- **Tasks:** 1
- **Files modified:** 8

## Accomplishments

- Added strict JSON Schema 2020-12 files for intent, capability, repo-scope, planning, and workspace-trust admission decisions.
- Updated intent, planning, and repo package exports so downstream code can import each owning package's schema by subpath.
- Added repo `"files": ["dist", "schema"]` and a `test` script so the plan's repo verification command is executable.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create 5 per-gate schemas + rename existing intent schema + update package.json exports** - `b59f21b` (feat)

## Files Created/Modified

- `packages/intent/schema/intent-admission-decision.schema.json` - Intent-gate decision schema with inline base fields and reconstructed current intent evidence fields.
- `packages/intent/schema/capability-admission-decision.schema.json` - Capability-gate requested/resolved envelope schema.
- `packages/intent/schema/repo-scope-admission-decision.schema.json` - Repo-scope requested/granted/denied scopes schema.
- `packages/planning/schema/planning-admission-decision.schema.json` - Planning-gate candidates/admitted/refused evidence schema.
- `packages/repo/schema/workspace-trust-admission-decision.schema.json` - Workspace-trust declared trust and granted access schema.
- `packages/intent/package.json` - Added three schema subpath exports; no old admission-decision schema export exists.
- `packages/planning/package.json` - Added planning admission-decision schema subpath export.
- `packages/repo/package.json` - Added workspace-trust schema export, package files entry, and test script.

## Decisions Made

- Kept all schemas static and package-local; no TypeScript code or authority runtime import was added.
- Used `gate: { const: ... }` in each schema to pin filenames to their trust boundary.
- Reconstructed the intent schema from `packages/intent/src/admission-decision.ts` because no tracked source schema existed to move.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reconstructed missing intent admission schema**
- **Found during:** Task 1
- **Issue:** The plan required `git mv packages/intent/schema/admission-decision.schema.json`, but the source file did not exist in the worktree or tracked history.
- **Fix:** Created `intent-admission-decision.schema.json` directly from the current intent admission artifact contract and verified the old filename/export remain absent.
- **Files modified:** `packages/intent/schema/intent-admission-decision.schema.json`
- **Verification:** File-exists checks passed; `test ! -f packages/intent/schema/admission-decision.schema.json && echo ok` returned `ok`; old export grep returned `0`.
- **Committed in:** `b59f21b`

**2. [Rule 3 - Blocking] Added repo test script for required verification command**
- **Found during:** Task 1
- **Issue:** The plan required `pnpm --filter @protostar/repo test`, but `@protostar/repo` only had build/typecheck scripts.
- **Fix:** Added `"test": "pnpm run build"` while adding repo schema packaging metadata.
- **Files modified:** `packages/repo/package.json`
- **Verification:** `pnpm --filter @protostar/repo test` passed.
- **Committed in:** `b59f21b`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** The final artifact surface matches Plan 06b's intended single-filename, per-gate schema contract. The only mechanical difference is that `git mv` could not be used because no old tracked schema existed.

## Issues Encountered

- The current codebase still writes legacy `admission-decision.json` in factory-cli tests; Plan 07/09 own writer and reader migration. This plan only delivered static schemas and exports.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None. The plan adds static schema files and package exports only; no new network endpoints, auth paths, filesystem reads, or runtime trust-boundary code were introduced.

## Verification

- `pnpm --filter @protostar/intent test` - passed; 118 tests, 0 failures.
- `pnpm --filter @protostar/planning test` - passed; 99 tests, 0 failures.
- `pnpm --filter @protostar/repo test` - passed; build completed.
- `pnpm run verify:full` - passed; recursive workspace tests green.
- `pnpm run verify` - passed; root typecheck, intent tests, and factory-cli tests green.
- `pnpm run factory` - passed; emitted a schemaVersion `1.1.0` confirmed intent payload.
- Five schema file-exists checks - passed.
- `test ! -f packages/intent/schema/admission-decision.schema.json && echo ok` - `ok`.
- `grep -c '"\\./schema/admission-decision\\.schema\\.json"' packages/intent/package.json` - `0`.
- `grep -H '"gate": { "const":' ...` - reported all five expected gate constants.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 07 can import the per-gate schemas while implementing the per-gate writer and `admission-decisions.jsonl` index. Plan 09 can use the new filenames as canonical reads and apply the legacy intent fallback at read time.

## Self-Check: PASSED

- Summary file exists.
- Key schema files exist.
- Task commit exists: `b59f21b`.
- Stub scan found no TODO/FIXME/placeholders in Plan 06b files.
- No tracked file deletions were introduced.

---
*Phase: 02-authority-governance-kernel*
*Completed: 2026-04-27*
