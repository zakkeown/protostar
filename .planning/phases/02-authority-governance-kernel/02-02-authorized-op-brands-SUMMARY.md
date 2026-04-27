---
phase: 02-authority-governance-kernel
plan: 02
subsystem: governance
tags: [authority, authorized-ops, brands, budget, node-test, typescript]

requires:
  - phase: 02-authority-governance-kernel
    provides: Buildable @protostar/authority package skeleton and internal subpath exports
provides:
  - Four AuthorizedOp brands for workspace, subprocess, network, and budget boundaries
  - Authority-owned authorize* producers with module-private mints hidden from public barrels
  - Internal brand witnesses and test-only builders for downstream contract tests
  - Boundary budget tracker and central aggregator type contracts
affects: [phase-2-authority, phase-3-repo-runtime, phase-4-execution, admission-e2e-contracts]

tech-stack:
  added: []
  patterns:
    - Module-private unique-symbol brand mints with public authorize* producers
    - Internal-only witness/test-builder subpaths
    - Type-only budget contract interfaces

key-files:
  created:
    - packages/authority/src/authorized-ops/workspace-op.ts
    - packages/authority/src/authorized-ops/subprocess-op.ts
    - packages/authority/src/authorized-ops/network-op.ts
    - packages/authority/src/authorized-ops/budget-op.ts
    - packages/authority/src/authorized-ops/index.ts
    - packages/authority/src/authorized-ops/authorized-ops.test.ts
    - packages/authority/src/budget/tracker.ts
    - packages/authority/src/budget/aggregator.ts
    - packages/authority/src/budget/index.ts
    - packages/authority/src/budget/budget.test.ts
  modified:
    - packages/authority/package.json
    - packages/authority/tsconfig.json
    - packages/authority/src/index.ts
    - packages/authority/src/internal/brand-witness.ts
    - packages/authority/src/internal/test-builders.ts

key-decisions:
  - "AuthorizedOp mints are exported only from their owning modules for sibling/internal use; package barrels expose producers and types only."
  - "The authority package test script now runs nested compiled tests so subdirectory contract tests execute."
  - "Budget enforcement remains interface-only in Phase 2; concrete counters are deferred to later runtime phases."

patterns-established:
  - "Every authority boundary gets an AuthorizedXOp data shape, branded type, authorizeXOp result union, private mint, witness alias, and test builder."
  - "Workspace write/execute authorization refuses untrusted workspaces at the authority boundary."

requirements-completed: [GOV-02]

duration: 7min
completed: 2026-04-27
---

# Phase 2 Plan 02: Authorized Op Brands Summary

**Workspace, subprocess, network, and budget authority boundaries now require branded AuthorizedOp contracts produced by authority-owned checks.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-27T15:39:30Z
- **Completed:** 2026-04-27T15:46:40Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments

- Added four AuthorizedOp brand modules with module-private `unique symbol` brands, exported sibling mints, public `authorize*Op` producers, and frozen authorized values.
- Wired GOV-04's admission-time workspace trust predicate: untrusted workspaces cannot obtain write/execute `AuthorizedWorkspaceOp` values.
- Added internal brand witnesses and test-only builders for all four AuthorizedOp brands without leaking builders or mints through the public barrel.
- Added type-only `BoundaryBudgetTracker` and `CentralBudgetAggregator` contracts with compiled tests exercising the interface shape.
- Kept the authority package pure: zero `node:fs` or bare `fs` imports under `packages/authority/src`.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Add failing authorized op brand tests** - `09235ac` (test)
2. **Task 1 GREEN: Implement authorized op brands** - `2b2224a` (feat)
3. **Task 2 RED: Add failing budget contract test** - `bfec515` (test)
4. **Task 2 GREEN: Add authority internals and budget contracts** - `2b37893` (feat)

_Note: Both tasks were TDD, so each produced RED and GREEN commits._

## Files Created/Modified

- `packages/authority/src/authorized-ops/workspace-op.ts` - `AuthorizedWorkspaceOp`, sibling mint, and `authorizeWorkspaceOp` with trust check.
- `packages/authority/src/authorized-ops/subprocess-op.ts` - `AuthorizedSubprocessOp` contract and shell-metacharacter guard.
- `packages/authority/src/authorized-ops/network-op.ts` - `AuthorizedNetworkOp` contract and http/https URL validation.
- `packages/authority/src/authorized-ops/budget-op.ts` - `AuthorizedBudgetOp`, `BudgetUnit`, and finite non-negative amount guard.
- `packages/authority/src/authorized-ops/index.ts` - Public authorized-op subdir barrel exposing producers and types only.
- `packages/authority/src/authorized-ops/authorized-ops.test.ts` - Unit coverage for success, failure, and frozen brand outputs.
- `packages/authority/src/internal/brand-witness.ts` - Internal witness aliases for the four AuthorizedOp brands.
- `packages/authority/src/internal/test-builders.ts` - Internal test-only builders that call sibling mints directly.
- `packages/authority/src/budget/tracker.ts` - Per-boundary budget tracker interface.
- `packages/authority/src/budget/aggregator.ts` - Central budget aggregator interface.
- `packages/authority/src/budget/index.ts` - Type-only budget barrel.
- `packages/authority/src/budget/budget.test.ts` - Contract-shape test for tracker and aggregator interfaces.
- `packages/authority/package.json` - Added workspace dependencies and recursive compiled test discovery.
- `packages/authority/tsconfig.json` - Added project references to `intent` and `repo`.
- `packages/authority/src/index.ts` - Re-exported authorized-op and budget public surfaces only.

## Decisions Made

- Kept mints available from owning modules for sibling/internal use, matching the Phase 1 pattern, but omitted all `mintAuthorized*` symbols from both public barrels.
- Used `WorkspaceRef.root` in workspace trust errors because the current repo contract exposes `root`, not `path`.
- Updated the authority package test script to `node --test "dist/**/*.test.js"` so nested package tests are not silently skipped.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Expanded authority package test discovery**
- **Found during:** Task 1 (Create the four AuthorizedOp brand modules)
- **Issue:** The package test script only ran `dist/*.test.js`, so the planned nested `authorized-ops/authorized-ops.test.ts` would compile but not execute.
- **Fix:** Changed the script to `node --test "dist/**/*.test.js"`.
- **Files modified:** `packages/authority/package.json`
- **Verification:** `pnpm --filter @protostar/authority test` ran 10 tests across 3 suites, including nested authorized-op and budget tests.
- **Committed in:** `2b2224a`

---

**Total deviations:** 1 auto-fixed (Rule 3)
**Impact on plan:** Required for the planned tests to actually guard behavior; no scope expansion.

## Issues Encountered

- A parallel Plan 03 file was accidentally included in the first Task 2 GREEN commit attempt. I soft-reset that commit, unstaged the unrelated file, and recommitted Task 2 with only authority files. The unrelated file remained in the other agent's lane and is not present in the final Task 2 commit.

## Authentication Gates

None.

## Known Stubs

None that prevent this plan's goal. The budget tracker and aggregator are intentionally interfaces only per Q-07; concrete runtime counters are deferred to later phases.

## Verification

- `pnpm --filter @protostar/authority test` - passed; 10 tests, 3 suites, 0 failures.
- `pnpm --filter @protostar/authority build` - passed.
- `pnpm run verify:full` - passed.
- `pnpm run verify` - passed.
- `pnpm run factory` - passed; emitted a schemaVersion `1.1.0` confirmed intent payload.
- `grep -v '^#' packages/authority/src/index.ts | grep -c 'mintAuthorized'` - `0`.
- `grep -v '^#' packages/authority/src/authorized-ops/index.ts | grep -c 'mintAuthorized'` - `0`.
- `grep -v '^#' packages/authority/src/index.ts | grep -c 'ForTest'` - `0`.
- `grep -RIn "from ['\"]node:fs['\"]\\|from ['\"]fs['\"]" packages/authority/src/ | grep -v '^#' | wc -l` - `0`.
- `node -e "const m = require('./packages/authority/dist/internal/test-builders.js'); if (typeof m.buildAuthorizedWorkspaceOpForTest !== 'function') process.exit(1)"` - passed.
- All four brand files contain `unique symbol`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Wave 1 consumers can now depend on `@protostar/authority` for AuthorizedOp producers and budget contracts. Plan 10 can pin the public surface using the brand witnesses and internal test-builders added here.

## Self-Check: PASSED

- Summary file exists.
- Key created files exist.
- Task commits exist: `09235ac`, `2b2224a`, `bfec515`, `2b37893`.
- Stub scan found only intentional empty arrays in test-builder defaults, test in-memory state, and local `errors` accumulators; no unresolved placeholders or UI-flow stubs.

---
*Phase: 02-authority-governance-kernel*
*Completed: 2026-04-27*
