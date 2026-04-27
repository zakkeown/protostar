---
phase: 02-authority-governance-kernel
plan: 09
subsystem: governance
tags: [authority, stage-reader, workspace-trust, repo-runtime, signed-intent]

requires:
  - phase: 02-authority-governance-kernel
    provides: Per-gate admission artifacts, policy snapshots, signed intents, signature verification, and admission-decision contracts
provides:
  - FsAdapter-injected AuthorityStageReader with per-gate reads, legacy intent fallback, JSONL missing fallback, and verified-intent read support
  - Shared assertTrustedWorkspaceForGrant predicate used by authorized ops, intent admission, and repo runtime
  - packages/repo runtime WorkspaceTrustError contract for mid-run trust downgrade refusal
affects: [phase-2-authority, phase-3-repo-runtime, factory-cli-stage-consumers, admission-e2e-contracts]

tech-stack:
  added: []
  patterns:
    - "Authority reads durable run artifacts only through an injected FsAdapter; no authority filesystem imports."
    - "Workspace trust checks converge on one authority predicate across admission, minting, and runtime."

key-files:
  created:
    - packages/authority/src/stage-reader/fs-adapter.ts
    - packages/authority/src/stage-reader/factory.ts
    - packages/authority/src/stage-reader/factory.test.ts
    - packages/authority/src/workspace-trust/predicate.ts
    - packages/authority/src/workspace-trust/predicate.test.ts
    - packages/repo/src/workspace-trust-runtime.ts
    - packages/repo/src/workspace-trust-runtime.test.ts
  modified:
    - packages/authority/src/index.ts
    - packages/authority/src/authorized-ops/workspace-op.ts
    - packages/intent/src/repo-scope-admission.ts
    - packages/intent/src/promotion-contracts.ts
    - packages/intent/src/admission-control.test.ts
    - packages/intent/package.json
    - packages/repo/src/index.ts
    - packages/repo/package.json
    - packages/repo/tsconfig.json

key-decisions:
  - "Aligned trust evidence with the actual WorkspaceRef shape (`root`, not plan-sketch `path`)."
  - "Intent repo-scope admission enforces workspace trust only when callers provide workspace trust evidence, preserving existing callers while adding the new defense-in-depth path."
  - "Kept @protostar/authority filesystem-free by making stage reads use FsAdapter exclusively."

patterns-established:
  - "Stage readers validate schemaVersion and gate literals at every artifact boundary."
  - "Legacy run compatibility is read-only: new filenames are tried first and old artifacts are never renamed on read."
  - "Runtime repo trust refusal throws a typed WorkspaceTrustError before future Phase 3 filesystem operations."

requirements-completed: [GOV-03, GOV-04]

duration: 55min
completed: 2026-04-27
---

# Phase 2 Plan 09: Stage Reader and Repo Runtime Summary

**FsAdapter-injected authority stage reader plus shared workspace trust predicate spanning admission, authorized ops, and repo runtime.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-04-27T15:47:00Z
- **Completed:** 2026-04-27T16:42:07Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments

- Added `createAuthorityStageReader(runDir, fsAdapter)` with per-gate decision reads, legacy `admission-decision.json` fallback, missing `admission-decisions.jsonl` returning `[]`, schema/gate validation, policy/precedence reads, and `intent.json` verification.
- Added ConfirmedIntent legacy `1.0.0` in-memory upconversion for unsigned fixtures, with a fail-closed guard for `1.0.0` plus non-null signature.
- Added `assertTrustedWorkspaceForGrant` and wired it into `authorizeWorkspaceOp`, `packages/intent` repo-scope admission, and `packages/repo` runtime trust checks.
- Added `WorkspaceTrustError` and repo runtime tests that simulate mid-run trust downgrade refusal.
- Preserved the authority boundary: `packages/authority/src` still has zero `node:fs` or `fs` imports.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Stage reader contract tests** - `ed6b6c2` (test)
2. **Task 1 GREEN: Authority stage reader implementation** - `4cd232c` (feat)
3. **Task 2 RED: Workspace trust predicate/runtime/admission tests** - `fd950ec` (test)
4. **Task 2 GREEN: Shared predicate, repo runtime, and admission wiring** - `7e96919` (feat)

_Note: Plan 10 commits were interleaved by a concurrent Wave 4 executor; Plan 09 files were staged and committed separately._

## Files Created/Modified

- `packages/authority/src/stage-reader/fs-adapter.ts` - Minimal injected filesystem adapter plus structured `StageReaderError`.
- `packages/authority/src/stage-reader/factory.ts` - Typed stage reader with per-gate reads, legacy fallback, schema checks, JSONL index parsing, and signed-intent verification.
- `packages/authority/src/stage-reader/factory.test.ts` - Nine reader tests covering happy path, fallback, null optional artifacts, schema failures, signature verification, tampering, and legacy upconversion.
- `packages/authority/src/workspace-trust/predicate.ts` - Shared trust predicate and refusal evidence contract.
- `packages/authority/src/workspace-trust/predicate.test.ts` - Seven trust predicate cases for read/write/execute and workspace scope.
- `packages/repo/src/workspace-trust-runtime.ts` - Runtime trust assertion and `WorkspaceTrustError`.
- `packages/repo/src/workspace-trust-runtime.test.ts` - Runtime trust refusal coverage.
- `packages/intent/src/repo-scope-admission.ts` - Admission-time workspace trust check when trust evidence is supplied.
- `packages/intent/src/promotion-contracts.ts` - Optional workspace trust input and trust-refusal reason code.
- `packages/authority/src/authorized-ops/workspace-op.ts` - Refactored to use the shared trust predicate.
- `packages/authority/src/index.ts`, `packages/repo/src/index.ts` - Public exports.
- `packages/intent/package.json`, `packages/repo/package.json`, `packages/repo/tsconfig.json` - Workspace dependency/test build support for the new cross-package contracts.

## Decisions Made

- Used `workspace.root` in trust evidence because the live `WorkspaceRef` interface uses `root`; the plan text's `workspace.path` was stale.
- Kept intent admission backward-compatible by making trust evidence optional. Existing callers without trust evidence preserve their previous repo-scope behavior; callers with trust evidence get the new GOV-04 block path.
- Used repo runtime throws rather than Result values because repo operations are imperative and must halt before Phase 3 filesystem/subprocess work.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adapted trust evidence to current WorkspaceRef**
- **Found during:** Task 2
- **Issue:** The plan sketch referenced `workspace.path`, but `packages/repo/src/index.ts` defines `WorkspaceRef.root`.
- **Fix:** `TrustRefusalEvidence` records `workspaceRoot`, and all runtime/admission errors use `workspace.root`.
- **Files modified:** `packages/authority/src/workspace-trust/predicate.ts`, `packages/repo/src/workspace-trust-runtime.ts`, tests
- **Verification:** `pnpm --filter @protostar/authority test`, `pnpm --filter @protostar/repo test`, and `pnpm --filter @protostar/intent test` passed.
- **Committed in:** `7e96919`

**2. [Rule 2 - Missing Critical] Added an explicit trust-evidence input for intent admission**
- **Found during:** Task 2
- **Issue:** `evaluateRepoScopeAdmission` had no workspace trust input, so admission-time trust enforcement could not distinguish trusted from untrusted workspaces without breaking existing callers.
- **Fix:** Added optional `workspaceTrust` evidence and enforced the shared predicate when supplied; tests cover trusted allow and untrusted workspace-scope block.
- **Files modified:** `packages/intent/src/promotion-contracts.ts`, `packages/intent/src/repo-scope-admission.ts`, `packages/intent/src/admission-control.test.ts`
- **Verification:** `pnpm --filter @protostar/intent test` passed.
- **Committed in:** `7e96919`

**3. [Rule 3 - Blocking] Enabled repo runtime tests**
- **Found during:** Task 2
- **Issue:** `@protostar/repo` previously used `pnpm run build` as its test script and did not include Node test types.
- **Fix:** Updated the repo test script to run `node --test "dist/**/*.test.js"` and added `types: ["node"]`.
- **Files modified:** `packages/repo/package.json`, `packages/repo/tsconfig.json`
- **Verification:** `pnpm --filter @protostar/repo test` passed.
- **Committed in:** `7e96919`

---

**Total deviations:** 3 auto-fixed (1 missing critical, 2 blocking)  
**Impact on plan:** All changes were required to satisfy the planned contracts against the live codebase. No filesystem authority was added to `@protostar/authority`.

## Issues Encountered

- `pnpm install` reported a cyclic workspace dependency after adding plan-required authority imports from `packages/intent` and `packages/repo`. The workspace still typechecked and `pnpm run verify:full` passed; future package-boundary cleanup may want a slimmer predicate-only contract surface.
- Wave 4 Plan 10 commits interleaved between Plan 09 commits. I did not stage or modify Plan 10 admission-e2e files.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None. Stub scan only found normal empty local accumulators and expected `null` checks in validation/verification code.

## Threat Flags

None beyond planned trust-boundary surfaces. `packages/repo` gained a runtime trust assertion contract but no real filesystem operation; `@protostar/authority` remains filesystem-free.

## Verification

- `pnpm --filter @protostar/authority test` - passed; 75 tests, 9 suites, 0 failures.
- `pnpm --filter @protostar/repo test` - passed; 5 tests, 1 suite, 0 failures.
- `pnpm --filter @protostar/intent test` - passed; 119 tests, 17 suites, 0 failures.
- `pnpm run verify:full` - passed.
- `pnpm run verify` - passed.
- `pnpm run factory` - passed; emitted signed `schemaVersion: "1.1.0"` intent output.
- `grep -RIn "from ['\"]node:fs['\"]\|from ['\"]fs['\"]" packages/authority/src/ | grep -v '^#' | wc -l` - `0`.
- Three call-site grep passed: `assertTrustedWorkspaceForGrant` appears in `authorized-ops/workspace-op.ts`, `packages/repo/src/workspace-trust-runtime.ts`, and `packages/intent/src/repo-scope-admission.ts`.

## Next Phase Readiness

Phase 3 can call `assertWorkspaceTrust` before real repo reads/writes/subprocess operations. Plan 10 can assert the stage-reader and no-fs authority contracts against the completed public surface.

## Self-Check: PASSED

- Summary exists at `.planning/phases/02-authority-governance-kernel/02-09-stage-reader-and-repo-runtime-SUMMARY.md`.
- Key created files exist under `packages/authority/src/stage-reader`, `packages/authority/src/workspace-trust`, and `packages/repo/src`.
- Task commits exist: `ed6b6c2`, `4cd232c`, `fd950ec`, `7e96919`.
- No tracked file deletions were introduced by Plan 09 commits.

---
*Phase: 02-authority-governance-kernel*
*Completed: 2026-04-27*
