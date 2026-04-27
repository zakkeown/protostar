---
phase: 04-execution-engine
plan: 03
subsystem: execution-adapter-testing
tags: [lmstudio, node-test, sse, fixtures, loopback]

requires:
  - phase: 03-repo-runtime-sandbox
    provides: repo-runtime contracts and workspace safety posture
provides:
  - "@protostar/lmstudio-adapter workspace skeleton"
  - "Loopback-only LM Studio HTTP stub server for adapter tests"
  - "Canonical cosmetic-tweak fixture with diff samples"
affects: [phase-04-execution-engine, lmstudio-adapter, wave-1-adapter-tests]

tech-stack:
  added: []
  patterns: [node:test against compiled dist, loopback-only HTTP test fixture, TDD red-green commits]

key-files:
  created:
    - packages/lmstudio-adapter/package.json
    - packages/lmstudio-adapter/tsconfig.json
    - packages/lmstudio-adapter/src/index.ts
    - packages/lmstudio-adapter/internal/test-fixtures/stub-lmstudio-server.ts
    - packages/lmstudio-adapter/internal/test-fixtures/stub-lmstudio-server.test.ts
    - packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.ts
    - packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.test.ts
  modified:
    - tsconfig.json
    - pnpm-lock.yaml

key-decisions:
  - "Use tsc -p for the new package build script so this disjoint plan can verify while parallel Phase 4 execution-state work is in flight."
  - "Export a local structural ExecutionAdapterTaskInput fixture type until the execution adapter contract lands in a later Phase 4 plan."

patterns-established:
  - "Stub server fixtures bind only 127.0.0.1:0 and are closed through node:test teardown."
  - "Cosmetic-tweak adapter fixtures keep parser-positive and prose-drift diff samples side by side."

requirements-completed: [EXEC-03, EXEC-04]

duration: 8min
completed: 2026-04-27
---

# Phase 04 Plan 03: Stub Server and Fixture Summary

**LM Studio adapter workspace skeleton with deterministic loopback stub server and canonical cosmetic-tweak fixture for downstream adapter tests**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-27T22:32:06Z
- **Completed:** 2026-04-27T22:39:53Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Added `@protostar/lmstudio-adapter` as a workspace package with internal test-fixture compilation.
- Built a loopback-only LM Studio HTTP stub supporting model preflight, SSE streaming, 5xx failures, malformed SSE, empty streams, mid-stream aborts, slow-drip chunks, and request recording.
- Added a cosmetic-tweak fixture with target files, pre-image bytes, strict diff sample, prose-drift diff sample, and planned 1.3.0 envelope fields.

## Task Commits

Each task was committed atomically:

1. **Task 1: Package skeleton + workspace wiring** - `2414759` (feat)
2. **Task 2 RED: Stub LM Studio HTTP server tests** - `6e92caf` (test)
3. **Task 2 GREEN: Stub LM Studio HTTP server fixture** - `6d36347` (feat)
4. **Task 3 RED: Cosmetic-tweak fixture tests** - `50af33b` (test)
5. **Task 3 GREEN: Cosmetic-tweak fixture** - `53c2297` (feat)

## Files Created/Modified

- `packages/lmstudio-adapter/package.json` - Workspace manifest and package-local test/build scripts.
- `packages/lmstudio-adapter/tsconfig.json` - Compiles `src/**/*` and `internal/**/*`.
- `packages/lmstudio-adapter/src/index.ts` - Empty public barrel reserved for later adapter plans.
- `packages/lmstudio-adapter/internal/test-fixtures/stub-lmstudio-server.ts` - Reusable loopback LM Studio HTTP/SSE stub.
- `packages/lmstudio-adapter/internal/test-fixtures/stub-lmstudio-server.test.ts` - Nine behavior tests for the stub server.
- `packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.ts` - Canonical cosmetic-tweak fixture.
- `packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.test.ts` - Five fixture contract tests.
- `tsconfig.json` - Root project reference for the new workspace.
- `pnpm-lock.yaml` - Workspace importer links for the new package.

## Decisions Made

- The new package uses `tsc -p tsconfig.json` for its local build script. `tsc -b` was blocked by concurrent Phase 4 execution-state work outside this plan's file list, and the package-local build still compiles all files this plan owns.
- `ExecutionAdapterTaskInput` is exported structurally from the fixture file because `packages/execution/src/adapter-contract.ts` does not exist yet in this branch. The fixture can be swapped to the canonical type when that later Phase 4 plan lands.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Scoped package build away from parallel execution-state source churn**
- **Found during:** Task 1
- **Issue:** `pnpm --filter @protostar/lmstudio-adapter build` with `tsc -b` attempted to build `@protostar/execution`, where parallel Phase 4 lifecycle work was temporarily inconsistent with this plan.
- **Fix:** Changed only the new package's `build` and `typecheck` scripts to `tsc -p tsconfig.json`, keeping this plan isolated while still compiling all adapter package sources/tests.
- **Files modified:** `packages/lmstudio-adapter/package.json`
- **Verification:** `pnpm --filter @protostar/lmstudio-adapter test` passed.
- **Committed in:** `2414759`

**2. [Rule 3 - Blocking] Used local structural adapter task fixture type**
- **Found during:** Task 3
- **Issue:** Plan referenced `packages/execution/src/adapter-contract.ts`, but that file is not present yet.
- **Fix:** Exported a local structural `ExecutionAdapterTaskInput` in the fixture file with the planned `targetFiles` and `adapterRef` fields.
- **Files modified:** `packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.ts`
- **Verification:** `node --test dist/internal/test-fixtures/cosmetic-tweak-fixture.test.js` passed.
- **Committed in:** `53c2297`

---

**Total deviations:** 2 auto-fixed (2 Rule 3 blocking issues).  
**Impact on plan:** Both changes keep the plan's fixture outputs usable without touching parallel Phase 4 execution-package work.

## Known Stubs

- `packages/lmstudio-adapter/src/index.ts` - Intentionally empty public barrel; production adapter exports land in Plans 04-04 / 04-05 / 04-06.
- `packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.ts:52` - Intentional TODO to re-canonicalize the fixture through the signed 1.3.0 schema once that schema bump lands.
- `packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.ts` - Fixture signature/hash strings are non-production sentinel values for a test-only artifact.

## Issues Encountered

- Loopback tests fail inside the default sandbox with `listen EPERM: operation not permitted 127.0.0.1`; rerunning with approved escalation passed.
- `grep -rn 'node:fs\|node:fs/promises' packages/lmstudio-adapter/src/` returned zero matches as required.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm --filter @protostar/lmstudio-adapter test` - PASS, 14 tests.
- `grep -rn 'node:fs\|node:fs/promises' packages/lmstudio-adapter/src/` - PASS, zero matches.
- `grep -rn 'node:http\|node:net' packages/lmstudio-adapter/src/ packages/lmstudio-adapter/internal/test-fixtures/` - PASS, Node HTTP/net imports appear only in `internal/test-fixtures/`.

## Self-Check: PASSED

- Created files exist.
- Task commits exist: `2414759`, `6e92caf`, `6d36347`, `50af33b`, `53c2297`.
- Plan-level verification passed.

## Next Phase Readiness

Wave 1 adapter implementation plans can import the stub server and cosmetic-tweak fixture. The only expected follow-up is replacing the local structural task type with the canonical execution adapter contract once that contract exists.

---
*Phase: 04-execution-engine*
*Completed: 2026-04-27*
