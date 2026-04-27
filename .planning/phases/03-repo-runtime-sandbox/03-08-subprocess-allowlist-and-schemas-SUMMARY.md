---
phase: 03-repo-runtime-sandbox
plan: 08
subsystem: repo-runtime
tags: [subprocess, allowlist, argv-validation, schemas, tdd]

requires:
  - phase: 03-repo-runtime-sandbox
    provides: Phase 3 Q-07/Q-08 subprocess validation decisions
provides:
  - Frozen baseline subprocess allowlist for git, pnpm, node, and tsc
  - Policy-extension allowlist union helper
  - Outer argv pattern guard with enumerated refusal reasons
  - Per-command schema data for git, pnpm, node, and tsc
  - Schema surface tests for Plan 09 runner integration
affects: [repo-runtime, execution-engine, subprocess-runner, security-review]

tech-stack:
  added: []
  patterns: [deep-frozen subprocess schema data, two-layer argv validation, node:test TDD]

key-files:
  created:
    - packages/repo/src/subprocess-allowlist.ts
    - packages/repo/src/subprocess-allowlist.test.ts
    - packages/repo/src/argv-pattern-guard.ts
    - packages/repo/src/argv-pattern-guard.test.ts
    - packages/repo/src/subprocess-schemas/git.ts
    - packages/repo/src/subprocess-schemas/pnpm.ts
    - packages/repo/src/subprocess-schemas/node.ts
    - packages/repo/src/subprocess-schemas/tsc.ts
    - packages/repo/src/subprocess-schemas/index.ts
    - packages/repo/src/subprocess-schemas/schemas.test.ts
  modified:
    - packages/repo/src/index.ts

key-decisions:
  - "The validation half of REPO-04 is pure compute; no spawning was introduced in Plan 08."
  - "Node and tsc use the empty-string allowedFlags key for top-level flag surfaces because they have no subcommand."
  - "git clone remains an isomorphic-git path in v1; subprocess schemas pin diagnostic and niche shell-out surfaces for downstream use."

patterns-established:
  - "Outer argv guard first rejects shell metacharacters/whitespace, then accepts exact allowed flags or allowed --flag=value prefixes, then validates positional refs."
  - "Command schemas freeze the schema object, subcommand arrays, allowedFlags record, and inner flag arrays."

requirements-completed: [REPO-04]

duration: 4min
completed: 2026-04-27
---

# Phase 03 Plan 08: Subprocess Allowlist and Schemas Summary

**Pure subprocess validation now has a frozen baseline allowlist, argv injection guard, and git/pnpm/node/tsc schema surfaces ready for the Plan 09 runner.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-27T20:44:25Z
- **Completed:** 2026-04-27T20:48:34Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Added `SUBPROCESS_BASELINE_ALLOWLIST` and `intersectAllowlist(policyExtension)` so policy can extend but never remove the baseline commands.
- Added `applyOuterPatternGuard` and `ArgvViolation` with `flag-not-allowed`, `ref-pattern-violation`, and `shell-metachar` reasons.
- Added frozen per-command schemas and a barrel for `GIT_SCHEMA`, `PNPM_SCHEMA`, `NODE_SCHEMA`, and `TSC_SCHEMA`.
- Added 44 passing `@protostar/repo` tests total, including 19 new subprocess validation tests.

## Schema Coverage

| Command | Subcommands | Flags covered | Notes |
| --- | --- | --- | --- |
| git | clone, checkout, branch, status, rev-parse, log | clone: `--depth`, `--single-branch`, `--branch`, `--no-tags`; checkout: `-b`, `--detach`; branch: `--list`, `-D`; status: `--porcelain`, `--untracked-files=no`; rev-parse: `--show-toplevel`, `--abbrev-ref`; log: `--oneline`, `-n` | `git clone` is documented as isomorphic-git in v1; subprocess schema is for bounded diagnostics and niche downstream shell-outs. |
| pnpm | install, run, build, test, --filter, exec | install: `--frozen-lockfile`, `--no-frozen-lockfile`, `--force`; exec: `--` | Scoped package selectors are allowed by the ref pattern. |
| node | none | top-level: `--test`, `--enable-source-maps` | Script path is positional and ref-pattern validated. |
| tsc | none | top-level: `-b`, `--build`, `--noEmit`, `--pretty` | Flag-driven command surface. |

## Task Commits

Each task was committed atomically:

1. **Task 1: RED allowlist + argv guard tests** - `9bfc255` (test)
2. **Task 2: GREEN allowlist, guard, schemas, and barrel** - `3725654` (feat)
3. **Task 3: Schema surface tests** - `7b55a3f` (test)

## Files Created/Modified

- `packages/repo/src/subprocess-allowlist.ts` - Frozen baseline allowlist and policy-extension union helper.
- `packages/repo/src/subprocess-allowlist.test.ts` - Baseline, union, dedupe, and freeze coverage.
- `packages/repo/src/argv-pattern-guard.ts` - Outer argv validator and `ArgvViolation`.
- `packages/repo/src/argv-pattern-guard.test.ts` - Happy-path and rejection coverage, including separator-required mode.
- `packages/repo/src/subprocess-schemas/*.ts` - Frozen command schemas for git, pnpm, node, and tsc.
- `packages/repo/src/subprocess-schemas/schemas.test.ts` - Schema surface and guard-integration coverage.
- `packages/repo/src/index.ts` - Public repo barrel exports for allowlist and argv guard.

## Decisions Made

- Kept this plan spawn-free; Plan 09 will consume these validators before spawning array-form subprocesses.
- Represented top-level command flags with the `""` allowedFlags key for no-subcommand commands.
- Preserved the plan's schema guidance for `git clone` while documenting that v1 clone execution uses `isomorphic-git`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Accepted exact fixed equals-form flags**
- **Found during:** Task 3 (Per-command schema content tests)
- **Issue:** `applyOuterPatternGuard(["--untracked-files=no"], ...)` rejected the exact schema literal because the guard split at `=` before checking exact allowed flags.
- **Fix:** The guard now accepts either the exact token or the split flag prefix.
- **Files modified:** `packages/repo/src/argv-pattern-guard.ts`, `packages/repo/src/subprocess-schemas/schemas.test.ts`
- **Verification:** `pnpm --filter @protostar/repo test` passed with 44/44 tests.
- **Committed in:** `7b55a3f`

---

**Total deviations:** 1 auto-fixed (Rule 1).
**Impact on plan:** No scope expansion; the fix made the planned `git status --untracked-files=no` schema usable by the outer guard.

## Issues Encountered

- Local GSD query CLI was not available as `node ./node_modules/@gsd-build/sdk/dist/cli.js query ...`, and the `gsd-sdk` on PATH did not expose `query`. State and roadmap updates were applied directly.
- `pnpm run factory` built successfully, then exited `2` at the existing workspace-trust gate because no trusted confirmed intent was supplied. This is the current smoke path behavior, not a regression from Plan 08.

## Known Stubs

None. Stub-pattern scan found no TODO/FIXME/placeholder or hardcoded empty UI-flow values in the files created or modified by this plan.

## Threat Flags

None. This plan adds security validation logic only; no new network endpoint, file access path, subprocess spawn, auth path, or schema trust boundary was introduced.

## User Setup Required

None - no external service configuration required.

## Verification

- RED: `pnpm --filter @protostar/repo build` failed on missing `subprocess-allowlist.js` and `argv-pattern-guard.js` before implementation.
- `pnpm --filter @protostar/repo test` passed with 44 tests.
- `node -e 'import("./packages/repo/dist/subprocess-allowlist.js").then((a)=>{ console.log(Object.isFrozen(a.SUBPROCESS_BASELINE_ALLOWLIST)); })'` printed `true`.
- `node -e 'import("./packages/repo/dist/subprocess-schemas/index.js").then((s)=>{ for (const k of ["GIT_SCHEMA","PNPM_SCHEMA","NODE_SCHEMA","TSC_SCHEMA"]) if (!s[k]) process.exit(1); console.log("schemas importable"); })'` printed `schemas importable`.
- `pnpm run verify` passed.
- `pnpm run factory` built successfully and then stopped at the expected workspace-trust escalation gate with exit code 2.

## Next Phase Readiness

Plan 09 can wire these validators into the repo-owned subprocess runner without re-deriving allowlists or command schema data. REPO-04 remains implementation-incomplete until the runner exists and proves a real invocation refuses disallowed argv before spawning.

## Self-Check: PASSED

- Found summary file at `.planning/phases/03-repo-runtime-sandbox/03-08-subprocess-allowlist-and-schemas-SUMMARY.md`.
- Found key created files: `subprocess-allowlist.ts`, `argv-pattern-guard.ts`, `subprocess-schemas/index.ts`, and `subprocess-schemas/schemas.test.ts`.
- Found task commits `9bfc255`, `3725654`, and `7b55a3f` in git history.

---
*Phase: 03-repo-runtime-sandbox*
*Completed: 2026-04-27*
