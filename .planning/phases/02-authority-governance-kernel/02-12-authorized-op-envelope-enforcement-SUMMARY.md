---
phase: 02-authority-governance-kernel
plan: 12
subsystem: auth
tags: [typescript, authorized-ops, capability-envelope, grant-checks, tdd]

# Dependency graph
requires:
  - phase: 02-authority-governance-kernel
    provides: AuthorizedOp brand types, CapabilityEnvelope shape, workspace trust predicate
provides:
  - hasWorkspaceGrant, hasExecuteGrant, hasNetworkGrant, hasBudgetGrant pure helpers in grant-checks.ts
  - All four AuthorizedOp producers now reject empty or mismatched resolved envelopes
  - budgetKey field added to AuthorizedBudgetOpData, making envelope cap check load-bearing
affects:
  - 02-authority-governance-kernel (downstream plans using AuthorizedOp producers)
  - 03-repo-runtime-sandbox (executor must supply populated envelope to all producers)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure grant-check helpers as separate file; producers import and call them"
    - "Access rank ordering (read=0, write=1, execute=2) for workspace access level comparison"
    - "Fail-closed: any empty or mismatched envelope yields ok:false with diagnostic error text"

key-files:
  created:
    - packages/authority/src/authorized-ops/grant-checks.ts
  modified:
    - packages/authority/src/authorized-ops/workspace-op.ts
    - packages/authority/src/authorized-ops/subprocess-op.ts
    - packages/authority/src/authorized-ops/network-op.ts
    - packages/authority/src/authorized-ops/budget-op.ts
    - packages/authority/src/authorized-ops/authorized-ops.test.ts
    - packages/authority/src/internal/test-builders.ts

key-decisions:
  - "budgetKey added as required field to AuthorizedBudgetOpData (not optional) — callers must explicitly declare which budget cap to check"
  - "scope.path '.' treated as root wildcard matching all paths in hasWorkspaceGrant"
  - "Network grant restricted to use/execute/admin only — read and write do not grant network access"
  - "hasWorkspaceGrant matches scope.workspace === workspace.root OR === 'main' for broad grants"

patterns-established:
  - "Grant checks are pure functions separate from producers — testable in isolation"
  - "Error messages include the envelope field name (resolvedEnvelope.repoScopes, resolvedEnvelope.executeGrants, toolPermissions network, resolvedEnvelope.budget) to aid debugging"

requirements-completed:
  - GOV-02
  - GOV-04

# Metrics
duration: 35min
completed: 2026-04-27
---

# Phase 02 Plan 12: AuthorizedOp Envelope Enforcement Summary

**Resolved envelope is now load-bearing for all four AuthorizedOp producers — empty or mismatched envelopes are rejected with diagnostic error text referencing the specific envelope field**

## Performance

- **Duration:** 35 min
- **Started:** 2026-04-27T00:00:00Z
- **Completed:** 2026-04-27T00:35:00Z
- **Tasks:** 2 (TDD: 3 commits per task — test/feat/fix)
- **Files modified:** 6

## Accomplishments

- Created `grant-checks.ts` with four pure helpers: `hasWorkspaceGrant`, `hasExecuteGrant`, `hasNetworkGrant`, `hasBudgetGrant`
- All AuthorizedOp producers (`workspace-op`, `subprocess-op`, `network-op`, `budget-op`) now call the corresponding grant helper and reject if the resolved envelope lacks a matching grant
- `AuthorizedBudgetOpData` gains required `budgetKey` field, forcing callers to declare which cap is being checked
- 106 authority unit tests pass; 42 admission-e2e contract tests pass

## Task Commits

Each task was committed atomically:

1. **test(02-12): add failing grant-check helper tests** - `d66be2e` (test — RED)
2. **feat(02-12): add resolved envelope grant-check helpers** - `c7f3b87` (feat — GREEN Task 1)
3. **feat(02-12): enforce resolvedEnvelope grants in authorized op producers** - `f9bb64d` (feat — GREEN Task 2)

## Files Created/Modified

- `packages/authority/src/authorized-ops/grant-checks.ts` — Pure grant-matching helpers with access rank ordering and scope wildcard support
- `packages/authority/src/authorized-ops/workspace-op.ts` — Calls `hasWorkspaceGrant`; error references `resolvedEnvelope.repoScopes`
- `packages/authority/src/authorized-ops/subprocess-op.ts` — Calls `hasExecuteGrant`; error references `resolvedEnvelope.executeGrants`
- `packages/authority/src/authorized-ops/network-op.ts` — Calls `hasNetworkGrant`; error references `toolPermissions network`
- `packages/authority/src/authorized-ops/budget-op.ts` — Adds `budgetKey`, calls `hasBudgetGrant`; error references `resolvedEnvelope.budget`
- `packages/authority/src/authorized-ops/authorized-ops.test.ts` — Replaced empty-envelope positive tests with populated envelope; added negative cases for all four producers
- `packages/authority/src/internal/test-builders.ts` — Added `budgetKey: "maxUsd"` default to `buildAuthorizedBudgetOpForTest`

## Decisions Made

- `budgetKey` is required (not optional) on `AuthorizedBudgetOpData` — forces callers to be explicit about which cap governs the operation
- `scope.path === "."` is treated as a root wildcard in `hasWorkspaceGrant` — discovered during test execution when the "main" workspace broad-grant test failed
- Network permission levels `read` and `write` do NOT grant network access; only `use`, `execute`, `admin` do

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] hasWorkspaceGrant path "." wildcard**
- **Found during:** Task 1 GREEN (test run)
- **Issue:** `"src/example.ts".startsWith("." + "/")` = `startsWith("./")` = false; the "matches when scope.workspace is 'main'" test failed because scope.path was "." and the path check rejected it
- **Fix:** Added `scope.path === "."` as an explicit match condition before the prefix check
- **Files modified:** `packages/authority/src/authorized-ops/grant-checks.ts`
- **Verification:** All 106 tests pass
- **Committed in:** `f9bb64d` (Task 2 feat commit)

**2. [Rule 3 - Blocking] Pre-existing TS5055 error from tsc -b with stale dist/**
- **Found during:** First test run
- **Issue:** Composite `tsc -b` fails with TS5055 when `dist/` contains `.d.ts` files from a previous non-composite `tsc --project` run; affects this worktree because `dist/` was pre-populated
- **Fix:** `rm -rf dist` before each `tsc -b` invocation in this session; added `rm -rf dist &&` prefix to all test commands
- **Files modified:** None (workflow-only fix)
- **Verification:** Tests run cleanly after dist removal
- **Committed in:** N/A (no file change needed)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking environment issue)
**Impact on plan:** Bug fix was essential for correctness; env fix was worktree-specific. No scope creep.

## Issues Encountered

- `pnpm --filter @protostar/authority test` failed with TS5055 on first run due to pre-populated `dist/` in the worktree; resolved by clearing dist before each tsc -b invocation

## Known Stubs

None — all grant checks are fully wired to the resolved envelope.

## Threat Flags

No new threat surface introduced. This plan closes T-2-2 (brand laundering) and T-2-5 (workspace trust bypass) by making the resolved envelope load-bearing in all four producers.

## Next Phase Readiness

- All AuthorizedOp producers are now envelope-grounded; downstream executors must pass a populated `CapabilityEnvelope` from the precedence resolution step
- `budgetKey` is now required — any caller using `mintAuthorizedBudgetOp` directly must supply it (only `test-builders.ts` does; updated)
- Phase 03 repo runtime will need to populate envelopes before calling any producer

## Self-Check: PASSED

- `packages/authority/src/authorized-ops/grant-checks.ts` — EXISTS
- `packages/authority/src/authorized-ops/workspace-op.ts` contains `hasWorkspaceGrant` — CONFIRMED
- `packages/authority/src/authorized-ops/subprocess-op.ts` contains `hasExecuteGrant` — CONFIRMED
- `packages/authority/src/authorized-ops/network-op.ts` contains `hasNetworkGrant` — CONFIRMED
- `packages/authority/src/authorized-ops/budget-op.ts` contains `budgetKey` and `hasBudgetGrant` — CONFIRMED
- Commits d66be2e, c7f3b87, f9bb64d — EXIST in git log
- 106 authority tests pass — VERIFIED
- 42 admission-e2e tests pass — VERIFIED

---
*Phase: 02-authority-governance-kernel*
*Completed: 2026-04-27*
