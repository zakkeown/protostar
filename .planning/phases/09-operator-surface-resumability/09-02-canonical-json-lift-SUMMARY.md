---
phase: 09-operator-surface-resumability
plan: 02
subsystem: artifacts
tags: [canonical-json, execution, stdout, snapshots, node-test]

requires:
  - phase: 04-execution-engine
    provides: execution snapshot serialization and task journal replay contracts
provides:
  - Shared canonical JSON helper exported from @protostar/artifacts/canonical-json
  - Execution snapshot serialization backed by the shared helper
  - Round-trip, primitive, idempotency, and byte-stability tests for sortJsonValue
affects: [operator-surface, execution, factory-cli, admission-e2e]

tech-stack:
  added: []
  patterns: [pure shared canonicalization helper, node:test package-local coverage, package subpath export]

key-files:
  created:
    - packages/artifacts/src/canonical-json.ts
    - packages/artifacts/src/canonical-json.test.ts
  modified:
    - packages/artifacts/package.json
    - packages/artifacts/src/index.ts
    - packages/artifacts/tsconfig.json
    - packages/execution/src/snapshot.ts
    - tsconfig.base.json

key-decisions:
  - "Kept sortJsonValue in pure @protostar/artifacts so execution and future factory-cli stdout share one canonicalizer."
  - "Used the existing project-reference shape for execution because @protostar/execution already referenced ../artifacts and no artifacts tsconfig.build.json exists."

patterns-established:
  - "Subpath exports should be paired with tsconfig.base path aliases for workspace TypeScript imports."
  - "Package-local node:test suites need explicit package test scripts and Node types when the package previously had no tests."

requirements-completed: [OP-07]

duration: 4min
completed: 2026-04-28
---

# Phase 9 Plan 02: Canonical JSON Lift Summary

**Shared canonical JSON sorting now lives in @protostar/artifacts and execution snapshot serialization imports it without byte-output drift.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-28T17:56:01Z
- **Completed:** 2026-04-28T17:59:49Z
- **Tasks:** 1 TDD task
- **Files modified:** 7

## Accomplishments

- Lifted `sortJsonValue` into `packages/artifacts/src/canonical-json.ts` with the Q-12 subpath export.
- Replaced the execution-private helper in `packages/execution/src/snapshot.ts` with an import from `@protostar/artifacts/canonical-json`.
- Added package-local canonical JSON tests for object sorting, array order preservation, primitives, idempotency, byte-stable stringify output, and a snapshot-like round-trip fixture.

## TDD Gate Compliance

- **RED:** `15d2e78` added failing canonical JSON tests. `pnpm --filter @protostar/artifacts test` failed because `./canonical-json.js` did not exist.
- **GREEN:** `677e050` added the shared module and import refactor. Targeted package tests and root verify passed.
- **REFACTOR:** No separate refactor commit was needed; implementation was already minimal and clean after GREEN.

## Task Commits

1. **Task 1 RED: canonical JSON contract tests** - `15d2e78` (test)
2. **Task 1 GREEN: lifted canonical JSON helper** - `677e050` (feat)

## Files Created/Modified

- `packages/artifacts/src/canonical-json.ts` - Shared `sortJsonValue` implementation copied from execution and exported.
- `packages/artifacts/src/canonical-json.test.ts` - Behavior tests for recursive sorting, primitives, idempotency, and byte-stable stringify output.
- `packages/artifacts/package.json` - Added `./canonical-json` export and package-local test script.
- `packages/artifacts/src/index.ts` - Re-exported `sortJsonValue` from the artifacts barrel.
- `packages/artifacts/tsconfig.json` - Added Node types for the new `node:test` suite.
- `packages/execution/src/snapshot.ts` - Removed local helper and imported the shared canonicalizer.
- `tsconfig.base.json` - Added the workspace path alias for `@protostar/artifacts/canonical-json`.

## Verification

- `pnpm install` - PASS; lockfile already up to date.
- `pnpm --filter @protostar/artifacts build` - PASS.
- `pnpm --filter @protostar/artifacts test` - PASS, 5 tests.
- `pnpm --filter @protostar/execution build` - PASS.
- `pnpm --filter @protostar/execution test` - PASS, 55 tests.
- `pnpm run verify` - PASS; root typecheck plus repair, evaluation-runner, intent, delivery-runtime, and factory-cli suites passed.

## Acceptance Criteria

- `grep -c 'export function sortJsonValue' packages/artifacts/src/canonical-json.ts` - PASS, `1`.
- `grep -c '\bfunction sortJsonValue\b' packages/execution/src/snapshot.ts | grep -v '^#'` - PASS, `0`.
- `grep -c 'from "@protostar/artifacts/canonical-json"' packages/execution/src/snapshot.ts` - PASS, `1`.
- `grep -c '"./canonical-json"' packages/artifacts/package.json` - PASS, `1`.
- `grep -c '"@protostar/artifacts"' packages/execution/package.json` - PASS, `1`.
- `pnpm --filter @protostar/artifacts test` - PASS.
- `pnpm --filter @protostar/execution test` - PASS.
- `pnpm run verify` - PASS.

## Decisions Made

- Used `@protostar/artifacts/canonical-json` as the stable public subpath for future factory-cli stdout canonicalization.
- Left `packages/execution/tsconfig.json` unchanged because it already references `../artifacts`; the plan's `../artifacts/tsconfig.build.json` target does not exist in this repo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added artifacts test harness wiring**
- **Found during:** Task 1 RED
- **Issue:** `@protostar/artifacts` had no `test` script and lacked Node types for `node:test` imports.
- **Fix:** Added `test` script and `types: ["node"]` in the artifacts tsconfig.
- **Files modified:** `packages/artifacts/package.json`, `packages/artifacts/tsconfig.json`
- **Verification:** `pnpm --filter @protostar/artifacts test` failed first for the missing module, then passed after GREEN.
- **Committed in:** `15d2e78`

**2. [Rule 3 - Blocking] Added TypeScript subpath alias**
- **Found during:** Task 1 GREEN
- **Issue:** Workspace TypeScript needs a path mapping for `@protostar/artifacts/canonical-json` before execution can import the subpath consistently.
- **Fix:** Added the subpath alias to `tsconfig.base.json`.
- **Files modified:** `tsconfig.base.json`
- **Verification:** `pnpm --filter @protostar/execution build` and `pnpm run verify` passed.
- **Committed in:** `677e050`

---

**Total deviations:** 2 auto-fixed (2 Rule 3 blockers)
**Impact on plan:** No scope expansion beyond enabling the required tests/import path.

## Issues Encountered

- A concurrent unrelated commit, `846cad1 docs(10): capture phase context (power-mode, 22/22 answered)`, landed between the RED and GREEN commits. It did not touch this plan's files and required no merge work.

## Known Stubs

None.

## Threat Flags

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 09-01 and later Phase 9 CLI stdout work can import `sortJsonValue` from `@protostar/artifacts/canonical-json` for byte-stable JSON output.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/09-operator-surface-resumability/09-02-canonical-json-lift-SUMMARY.md`.
- Created files exist: `packages/artifacts/src/canonical-json.ts`, `packages/artifacts/src/canonical-json.test.ts`.
- Task commits found in git history: `15d2e78`, `677e050`.

---
*Phase: 09-operator-surface-resumability*
*Completed: 2026-04-28*
