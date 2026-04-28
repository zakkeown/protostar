---
phase: 06-live-dogpile-piles
plan: 01
subsystem: dogpile
tags: [dogpile, sdk, no-fs, rename, wave0]
requires:
  - "@dogpile/sdk@0.2.0 pinned (Phase 3 Plan 13)"
provides:
  - "@protostar/dogpile-types runtime + type re-export shim widened for Wave 1"
  - "executionCoordinationPilePreset (Q-16 rename) available for Wave 3 factory-config.json reference"
  - "static no-fs contract in @protostar/dogpile-adapter src/"
affects:
  - packages/dogpile-types/src/index.ts
  - packages/dogpile-adapter/src/index.ts
  - packages/dogpile-adapter/src/no-fs.contract.test.ts
tech-stack:
  added: []
  patterns:
    - "Static authority-boundary contract test (mirrors authority-no-fs.contract.test.ts)"
key-files:
  created:
    - packages/dogpile-adapter/src/no-fs.contract.test.ts
  modified:
    - packages/dogpile-types/src/index.ts
    - packages/dogpile-adapter/src/index.ts
decisions:
  - "Per Q-01/D-01: runtime re-exports (run, stream, createOpenAICompatibleProvider) live in dogpile-types but the shim itself remains zero-I/O"
  - "Per Q-02/D-02: stream + RunEvent + StreamHandle exposed because Wave 1 uses stream(); run re-exported for symmetry"
  - "Per Q-16/D-16: hard rename, no deprecated alias (no live callers existed)"
  - "Per Q-09/D-09: static fs-import audit lives in the package; runtime defense-in-depth ships in admission-e2e at Plan 08"
metrics:
  duration_seconds: 115
  tasks_completed: 3
  files_changed: 3
  completed_date: "2026-04-28"
---

# Phase 6 Plan 01: Wave 0 — Types Shim Widening + Q-16 Rename + Static No-FS Contract Summary

Widened `@protostar/dogpile-types` to re-export the SDK runtime + type symbols Wave 1 (`runFactoryPile`, `mapSdkStopToPileFailure`) needs, renamed `executionCoordinatorPilePreset` → `executionCoordinationPilePreset` per Q-16, and locked the dogpile-adapter no-fs authority boundary with a static contract test mirroring `authority-no-fs.contract.test.ts`.

## Tasks Completed

| Task | Name                                                            | Commit    | Files                                                  |
| ---- | --------------------------------------------------------------- | --------- | ------------------------------------------------------ |
| 1    | Widen @protostar/dogpile-types re-export shim                   | `90c124f` | packages/dogpile-types/src/index.ts                    |
| 2    | Q-16 rename executionCoordinator→executionCoordinationPilePreset | `f66868e` | packages/dogpile-adapter/src/index.ts                  |
| 3    | Static no-fs contract test for dogpile-adapter                  | `78375a1` | packages/dogpile-adapter/src/no-fs.contract.test.ts    |

## What Landed

### Task 1 — `@protostar/dogpile-types` widened
- Added type re-exports from `@dogpile/sdk/types`: `RunEvent`, `RunResult`, `Trace`, `RunAccounting`, `NormalizedStopReason`, `ConfiguredModelProvider`, `StreamHandle`.
- Added runtime re-exports from `@dogpile/sdk`: `run`, `stream`, `createOpenAICompatibleProvider`.
- Preserved existing exports: `AgentSpec`, `DogpileOptions`, `budget`, `convergence`, `firstOf`.
- Authority boundary unchanged (zero I/O in shim).

### Task 2 — Q-16 rename
- `executionCoordinatorPilePreset` → `executionCoordinationPilePreset` in `packages/dogpile-adapter/src/index.ts`.
- No deprecated alias (no external callers existed; verified by repo-wide grep across `packages/`, `apps/`, `.planning/codebase/`).
- `FactoryPileKind = 'execution-coordination'` value already correct, untouched.

### Task 3 — Static no-fs contract
- New file: `packages/dogpile-adapter/src/no-fs.contract.test.ts` (74 lines).
- Walks `packages/dogpile-adapter/src/` recursively (`readdir({ withFileTypes: true })` recursion), strips block + line comments, asserts no offending file matches `from "node:fs"`, `from "node:fs/promises"`, `from "fs"`, `from "node:path"`, `from "path"`.
- Excludes itself by basename (the test file itself imports `node:fs/promises`, `node:path`, `node:url` to walk the tree).
- Per D-09: runtime defense-in-depth lands in admission-e2e at Plan 08 (Wave 4).

## Verification

| Gate | Command | Result |
|------|---------|--------|
| dogpile-types builds | `pnpm --filter @protostar/dogpile-types build` | pass |
| Runtime re-exports import OK | `node -e "import('@protostar/dogpile-types').then(m => …)"` (run from package dir) | `runtime ok` |
| dogpile-adapter builds | `pnpm --filter @protostar/dogpile-adapter build` | pass |
| dogpile-adapter tests | `pnpm --filter @protostar/dogpile-adapter test` | 4/4 pass (incl. new no-fs contract) |
| Q-16 rename complete | `grep -q "export const executionCoordinationPilePreset" …` | found |
| No stale rename refs | `grep -rn "executionCoordinatorPilePreset" packages/ apps/ .planning/codebase/` | empty |
| Export-line count | `grep -c "^export" packages/dogpile-types/src/index.ts` | 4 (≥4) |

## Deviations from Plan

**Verify-command shape note (not a content deviation):** The plan's Task 1 verify command used `require('@protostar/dogpile-types')` (CJS). Both `@protostar/dogpile-types` and the SDK are ESM-only, so `require` cannot load them. I executed the equivalent dynamic-import smoke (`node -e "import('@protostar/dogpile-types').then(m => …)"`) from inside the package directory; the same six runtime symbols (`run`, `stream`, `createOpenAICompatibleProvider`, `budget`, `convergence`, `firstOf`) were asserted as functions. Result identical to plan intent: `runtime ok`.

The contract test additionally bans `from "path"` (without `node:` prefix) for symmetry with the `fs` / `node:fs` pair the plan's pattern array already covered. This is strictly tighter than the plan; no source file uses bare `path`, so no current code is affected.

## Threat Model Mitigations Landed

| Threat ID | Mitigation |
|-----------|------------|
| T-6-01 (dogpile-adapter src/ unintentionally imports node:fs) | Static no-fs.contract.test.ts walks src/ on every `pnpm --filter @protostar/dogpile-adapter test`; runtime defense-in-depth ships in Plan 08 |
| T-6-08 (Q-16 rename leaves a deprecated alias that drifts) | Repo-wide grep returns zero stale `executionCoordinatorPilePreset` references |
| T-6-09 (widened type shim accidentally re-exports SDK internals) | Re-exports are explicit named lists (`export type { … }` / `export { … }`), never `export *` |

## Self-Check: PASSED

- Files created exist:
  - `packages/dogpile-adapter/src/no-fs.contract.test.ts` — FOUND
- Files modified exist with expected content:
  - `packages/dogpile-types/src/index.ts` — FOUND (4 export lines, runtime + type re-exports)
  - `packages/dogpile-adapter/src/index.ts` — FOUND (`executionCoordinationPilePreset` exported; no stale name)
- Commits exist on main:
  - `90c124f` — FOUND
  - `f66868e` — FOUND
  - `78375a1` — FOUND
