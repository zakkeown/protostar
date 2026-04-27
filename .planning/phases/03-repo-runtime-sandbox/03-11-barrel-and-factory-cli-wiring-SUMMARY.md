---
phase: 03-repo-runtime-sandbox
plan: 11
subsystem: repo-runtime
tags: [repo, factory-cli, cleanup, clone, admission-decisions, workspace-root]

requires:
  - phase: 03-repo-runtime-sandbox
    provides: cloneWorkspace, dirtyWorktreeStatus, loadRepoPolicy, applyChangeSet, runCommand, auditSymlinks, resolveWorkspaceRoot
provides:
  - "@protostar/repo barrel exports for Wave 1-2 repo runtime surfaces"
  - "cleanupWorkspace success removal and failure tombstone primitive"
  - "factory-cli repo-runtime gate wiring: clone, audit, dirty check, admission decision, cleanup/tombstone"
affects: [factory-cli, repo-runtime, admission-decisions, authority-gates]

tech-stack:
  added: ["@protostar/paths dependency in @protostar/repo and @protostar/factory-cli"]
  patterns:
    - "repo-runtime admission decision emitted through the existing per-gate writer"
    - "failure workspaces retained with tombstone metadata; success workspaces removed"
    - "local file:// clones use array-form git subprocess with shell:false"

key-files:
  created:
    - packages/repo/src/cleanup-workspace.ts
    - packages/repo/src/cleanup-workspace.test.ts
  modified:
    - packages/repo/src/index.ts
    - packages/repo/package.json
    - apps/factory-cli/src/main.ts
    - apps/factory-cli/src/main.test.ts
    - apps/factory-cli/src/refusals-index.ts
    - apps/factory-cli/package.json
    - apps/factory-cli/tsconfig.json
    - packages/authority/src/admission-decision/base.ts
    - packages/authority/src/admission-decision/admission-decision.test.ts
    - packages/repo/src/clone-workspace.ts
    - packages/repo/schema/repo-runtime-admission-decision.schema.json
    - pnpm-lock.yaml

key-decisions:
  - "Factory CLI resolves workspace root with @protostar/paths instead of INIT_CWD."
  - "Repo-runtime wiring defaults the clone target to the current project root until ConfirmedIntent grows an explicit RepoTarget."
  - "Existing authority-shaped .protostar/repo-policy.json files are treated as absent for repo-runtime policy loading only when all parse errors are known authority-policy keys."
  - "The repo-runtime gate is now part of the shared authority gate literal set."

patterns-established:
  - "Repo runtime gates write allow/block artifacts with patchResults and subprocessRecords arrays even when empty."
  - "runFactory performs authority gates before repo clone side effects, preserving workspace-trust hard-fail behavior."
  - "cleanupWorkspace is idempotent on success and preserves failure workspaces with retention metadata."

requirements-completed: [REPO-01, REPO-02, REPO-05, REPO-06, REPO-07]

duration: "not captured exactly; resumed and completed on 2026-04-27"
completed: 2026-04-27
---

# Phase 03 Plan 11: Barrel and Factory CLI Wiring Summary

**Repo runtime lifecycle wired into factory-cli with public repo barrel exports, deterministic workspace-root resolution, repo-runtime admission artifacts, and cleanup/tombstone handling**

## Performance

- **Duration:** Not captured exactly; resumed after context compaction and completed on 2026-04-27
- **Started:** 2026-04-27
- **Completed:** 2026-04-27T21:27:56Z
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments

- Added `cleanupWorkspace` with success removal and failure tombstone retention semantics, covered by five hermetic tests.
- Expanded `@protostar/repo`'s public barrel to expose the Wave 1-2 runtime modules and policy/schema surfaces.
- Replaced factory-cli `INIT_CWD` workspace-root resolution with `resolveWorkspaceRoot()`.
- Wired `runFactory` through repo runtime admission: clone, symlink audit evidence, dirty-worktree refusal, per-gate admission decision emission, and cleanup or tombstone.
- Preserved the Phase 2 authority sequence: workspace-trust still blocks before repo clone/execution side effects.

## Task Commits

Each task was committed atomically:

1. **Task 1: cleanup primitive + barrel update + @protostar/paths dep** - `b0aee27` (feat)
2. **Task 2: Replace INIT_CWD with resolveWorkspaceRoot in factory-cli** - `705728f` (refactor)
3. **Task 3: Wire repo runtime lifecycle into runFactory** - `6d3d8a9` (feat)

## Files Created/Modified

- `packages/repo/src/cleanup-workspace.ts` - Q-11 cleanup primitive: remove workspace on success; write `tombstone.json` on failure.
- `packages/repo/src/cleanup-workspace.test.ts` - Five cleanup/tombstone contract tests.
- `packages/repo/src/index.ts` - Public repo barrel exports for clone, audit, FS adapter, apply-change-set, dirty status, subprocess runner, schemas, repo policy, and cleanup.
- `packages/repo/package.json` / `pnpm-lock.yaml` - Added `@protostar/paths` workspace dependency.
- `apps/factory-cli/src/main.ts` - Replaced workspace-root resolution and added repo runtime admission/cleanup lifecycle.
- `apps/factory-cli/src/main.test.ts` - Updated factory-cli tests for six gates and workspace-root sentinel behavior.
- `apps/factory-cli/src/refusals-index.ts` - Added `repo-runtime` refusal stage.
- `apps/factory-cli/package.json` / `apps/factory-cli/tsconfig.json` - Added `@protostar/paths` dependency and project reference.
- `packages/authority/src/admission-decision/base.ts` - Added `repo-runtime` to the shared gate literals.
- `packages/authority/src/admission-decision/admission-decision.test.ts` - Updated shared gate contract assertion to six gates.
- `packages/repo/src/clone-workspace.ts` - Added local `file://` clone support via array-form `git clone` for factory smoke/testability.
- `packages/repo/schema/repo-runtime-admission-decision.schema.json` - Allowed dirty-worktree and error evidence in repo-runtime decisions.

## Decisions Made

- Defaulted the repo-runtime clone target to the current project root because `ConfirmedIntent` does not yet carry an explicit `RepoTarget`; this avoided a schema expansion in an integration plan.
- Kept authority policy loading and repo-runtime policy loading separate: factory-cli still uses its authority policy loader for precedence gates, while `@protostar/repo` owns runtime policy parsing.
- Treated known authority-policy keys in `.protostar/repo-policy.json` as a compatibility fallback for repo-runtime loading, rather than failing every existing factory run before Phase 3 policy files are split.
- Added `repo-runtime` to the shared gate literal set so per-gate writer and refusal indexing can represent the new runtime boundary explicitly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added factory-cli TypeScript project reference for @protostar/paths**
- **Found during:** Task 2
- **Issue:** Adding `@protostar/paths` to factory-cli required a TS project reference for workspace builds/tests to resolve consistently.
- **Fix:** Added the dependency and `tsconfig.json` reference; refreshed workspace links with `pnpm install`.
- **Files modified:** `apps/factory-cli/package.json`, `apps/factory-cli/tsconfig.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter @protostar/factory-cli test`
- **Committed in:** `705728f`

**2. [Rule 3 - Blocking] Supported local file:// clone targets**
- **Found during:** Task 3
- **Issue:** The current `ConfirmedIntent` has no explicit `RepoTarget`, so factory-cli needs to clone the current project root for the integrated runtime path; `isomorphic-git` does not support the local `file://` clone path used for that smoke/test path.
- **Fix:** Added local `file://` handling in `cloneWorkspace` using `git clone` with array-form `spawn` and `shell:false`, while preserving the existing isomorphic-git HTTP/HTTPS path.
- **Files modified:** `packages/repo/src/clone-workspace.ts`
- **Verification:** `pnpm --filter @protostar/repo test`, `pnpm run verify:full`, `pnpm run factory`
- **Committed in:** `6d3d8a9`

**3. [Rule 3 - Blocking] Added repo-runtime policy compatibility fallback**
- **Found during:** Task 3
- **Issue:** Existing `.protostar/repo-policy.json` files are authority-governance shaped and fail the stricter repo-runtime policy parser, which would block all existing factory-cli runs before repo runtime could be exercised.
- **Fix:** In factory-cli only, known authority-policy parse errors are treated as an absent repo-runtime policy, falling back to `DEFAULT_REPO_POLICY`; malformed or unknown runtime policy errors still fail closed.
- **Files modified:** `apps/factory-cli/src/main.ts`
- **Verification:** `pnpm --filter @protostar/factory-cli test`, `pnpm run verify:full`
- **Committed in:** `6d3d8a9`

**4. [Rule 3 - Blocking] Preserved authority gate ordering before repo side effects**
- **Found during:** Task 3
- **Issue:** Repo clone must not run before existing Phase 2 workspace-trust hard-fail behavior.
- **Fix:** Wrote authority gate decisions before repo-runtime admission and only cloned after the authority path admitted the run.
- **Files modified:** `apps/factory-cli/src/main.ts`
- **Verification:** `pnpm --filter @protostar/factory-cli test`, `pnpm run factory` exits 2 at workspace-trust for the default untrusted launch.
- **Committed in:** `6d3d8a9`

**5. [Rule 1 - Bug] Made same-run clone retries idempotent**
- **Found during:** Task 3
- **Issue:** A retained tombstone/clone directory from a previous failed run with the same run id caused clone collisions on rerun.
- **Fix:** The runtime path clears an existing same-run clone directory with success cleanup before attempting a new clone.
- **Files modified:** `apps/factory-cli/src/main.ts`
- **Verification:** `pnpm --filter @protostar/factory-cli test`
- **Committed in:** `6d3d8a9`

**6. [Rule 2 - Missing Critical] Added repo-runtime to authority/refusal stage literals**
- **Found during:** Task 3
- **Issue:** The per-gate writer and refusal index needed a canonical gate/stage literal for repo runtime decisions.
- **Fix:** Added `repo-runtime` to `GATE_NAMES`/`GateName` and `RefusalStage`, with contract tests updated.
- **Files modified:** `packages/authority/src/admission-decision/base.ts`, `packages/authority/src/admission-decision/admission-decision.test.ts`, `apps/factory-cli/src/refusals-index.ts`
- **Verification:** `pnpm --filter @protostar/authority test`, `pnpm run verify:full`
- **Committed in:** `6d3d8a9`

---

**Total deviations:** 6 auto-fixed (1 bug, 1 missing critical, 4 blocking)
**Impact on plan:** All deviations were required to complete the integration safely without broadening domain boundaries. The only new execution surface is contained in `packages/repo` and uses array-form subprocess spawning.

## Issues Encountered

- `pnpm run factory` is expected to exit 2 in the default smoke path because the workspace-trust gate blocks untrusted launches. This confirms the Phase 2 hard-fail behavior is preserved after repo-runtime wiring.

## Known Stubs

None. Stub scan found only ordinary local empty arrays/strings used as accumulators or subprocess stderr buffers; no UI-facing placeholders, TODOs, or unwired mock data were introduced.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: local-git-clone | `packages/repo/src/clone-workspace.ts` | Local `file://` clone support invokes `git clone` through array-form `spawn` with `shell:false`; the surface remains inside `packages/repo` and exists to support local factory smoke/runtime wiring before explicit `RepoTarget` plumbing. |

## Verification

- `pnpm --filter @protostar/repo test` - passed
- `pnpm --filter @protostar/factory-cli test` - passed
- `pnpm --filter @protostar/authority test` - passed
- `pnpm run verify:full` - passed
- `pnpm run factory` - built successfully, then exited 2 at the expected workspace-trust gate
- `rg -n "INIT_CWD" apps/factory-cli/src/main.ts` - no matches

## Self-Check: PASSED

- Summary file exists at `.planning/phases/03-repo-runtime-sandbox/03-11-barrel-and-factory-cli-wiring-SUMMARY.md`.
- Task commits exist: `b0aee27`, `705728f`, `6d3d8a9`.
- Created cleanup primitive exists at `packages/repo/src/cleanup-workspace.ts`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 12 can now pin repo-runtime admission evidence contract shapes end-to-end against a factory-cli that actually emits the `repo-runtime-admission-decision.json` artifact. Future work should introduce an explicit repo target in confirmed intent rather than continuing to infer the current project root.

---
*Phase: 03-repo-runtime-sandbox*
*Completed: 2026-04-27*
