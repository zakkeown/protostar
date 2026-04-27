---
phase: 03-repo-runtime-sandbox
plan: 01
subsystem: repo-runtime
tags: [isomorphic-git, diff, env, gitignore, errata]

requires:
  - phase: 03-repo-runtime-sandbox
    provides: Phase 3 context and CONFLICT-01 research
provides:
  - CONFLICT-01 erratum for Q-10 patch mechanism revision
  - Minimal runtime dependency posture with isomorphic-git and diff carve-outs
  - Pinned repo runtime dependencies and lockfile entries
  - Forward-look Phase 3-7 environment template
affects: [repo-runtime, execution-engine, dogpile-adapter, delivery, evaluation]

tech-stack:
  added: [isomorphic-git@1.37.6, diff@9.0.0]
  patterns: [dated errata note, exact runtime dependency pins, public env template]

key-files:
  created: [.env.example]
  modified:
    - .gitignore
    - .planning/PROJECT.md
    - .planning/codebase/CONCERNS.md
    - .planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md
    - packages/repo/package.json
    - pnpm-lock.yaml

key-decisions:
  - "CONFLICT-01 is resolved by preserving Q-10 intent while switching patch mechanics to diff@9.0.0."
  - "Protostar's runtime dependency posture is minimal external deps with explicit Phase 3 carve-outs, not zero external deps."

patterns-established:
  - "Dated errata amend locked Q&A without rewriting original decisions."
  - "Runtime dependency additions require exact pins and an explicit PROJECT.md lock-revision note."

requirements-completed: [REPO-09]

duration: 3min
completed: 2026-04-27
---

# Phase 03 Plan 01: Conflict Errata, Deps, and Env Summary

**CONFLICT-01 is now auditable, `@protostar/repo` has exact patch/git runtime deps, and Phase 3-7 env names are documented without secrets.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-27T19:59:54Z
- **Completed:** 2026-04-27T20:02:56Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added an E-01 erratum to `03-CONTEXT.md` documenting the Q-10 mechanism revision from nonexistent `isomorphic-git.apply` to `diff.parsePatch` / `diff.applyPatch` plus an explicit SHA-256 gate.
- Rephrased `.planning/PROJECT.md` from a zero-runtime-deps lock to a minimal-deps posture with exact carve-outs for `isomorphic-git@1.37.6`, `diff@9.0.0`, and the later `@dogpile/sdk@0.2.0` pin.
- Installed `isomorphic-git@1.37.6` and `diff@9.0.0` on `@protostar/repo`; `pnpm-lock.yaml` changed by 435 added lines and 0 removed lines.
- Added `.protostar/workspaces/` to `.gitignore`.
- Created `.env.example` with `GITHUB_PAT`, `LM_STUDIO_ENDPOINT`, `LM_STUDIO_CODER_MODEL`, and `LM_STUDIO_JUDGE_MODEL`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Erratum, dependency posture, and concerns addendum** - `57651c2` (docs)
2. **Task 2: Repo runtime dependencies and workspace gitignore** - `de0b9e6` (chore)
3. **Task 3: Environment template** - `fc22b6d` (docs)

## Files Created/Modified

- `.env.example` - Public template for Phase 3 clone auth plus Phase 4-8 LM Studio variables.
- `.gitignore` - Ignores `.protostar/workspaces/` tombstone workspace directories.
- `.planning/PROJECT.md` - Rephrases the runtime dependency posture and names the exact carve-outs.
- `.planning/codebase/CONCERNS.md` - Adds Phase 3 concerns for dependency lock revision, tombstone disk-fill, and binary patch skips.
- `.planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md` - Adds E-01 erratum without rewriting the original Q-10 Q&A.
- `packages/repo/package.json` - Pins `diff@9.0.0` and `isomorphic-git@1.37.6`.
- `pnpm-lock.yaml` - Records the exact dependency graph for the two repo runtime deps.

## Decisions Made

- Kept the locked Q-10 text intact and appended a dated erratum, preserving the audit trail.
- Treated `.env.example` as public documentation only: no real secrets, and `.env` remains gitignored.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used the existing pnpm store path for dependency install**
- **Found during:** Task 2 (Add isomorphic-git + diff deps to @protostar/repo + update .gitignore)
- **Issue:** `pnpm --filter @protostar/repo add ...` stopped with `ERR_PNPM_UNEXPECTED_STORE` because `node_modules` was linked from `/Users/zakkeown/Library/pnpm/store/v10` while pnpm wanted `.pnpm-store/v10`.
- **Fix:** Re-ran the same dependency add with `--store-dir /Users/zakkeown/Library/pnpm/store/v10`, matching the existing workspace install.
- **Files modified:** `packages/repo/package.json`, `pnpm-lock.yaml`
- **Verification:** Dependency pin check passed with `pnpm --filter @protostar/repo exec node -e ...`.
- **Committed in:** `de0b9e6`

---

**Total deviations:** 1 auto-fixed (Rule 3).
**Impact on plan:** No scope change; the fix only allowed the planned dependency install to use the workspace's existing pnpm store.

## Issues Encountered

None beyond the pnpm store-location blocker documented above.

## Known Stubs

None. Stub-pattern scan found only existing/planned concern prose, not live placeholders that affect this plan's outcome.

## User Setup Required

None - no external service configuration required for this plan. Future operators can copy `.env.example` to `.env` when Phase 3 clone auth or later LM Studio/PR flows are wired.

## Verification

- `grep -c "Errata" .planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md` returned `1`.
- `grep -c "isomorphic-git" .planning/PROJECT.md` returned `1`; `grep -c "diff@" .planning/PROJECT.md` returned `1`.
- `grep -c "Phase 3 Concerns" .planning/codebase/CONCERNS.md` returned `1`.
- `node -e 'const p=require("./packages/repo/package.json");if(p.dependencies["isomorphic-git"]!=="1.37.6"||p.dependencies["diff"]!=="9.0.0")process.exit(1)'` passed.
- `grep -q '\.protostar/workspaces/' .gitignore` passed.
- `test -f .env.example && grep -q '^GITHUB_PAT=' .env.example` passed.
- `pnpm run verify` passed.

## Next Phase Readiness

Wave 0 can continue with `@protostar/paths`, schema bump, and sacrificial repo fixture plans. Downstream patch-apply work can safely import `diff` from `@protostar/repo`'s runtime dependency set.

## Self-Check: PASSED

- Found summary file at `.planning/phases/03-repo-runtime-sandbox/03-01-conflict-errata-deps-and-env-SUMMARY.md`.
- Found created file `.env.example`.
- Found task commits `57651c2`, `de0b9e6`, and `fc22b6d` in git history.

---
*Phase: 03-repo-runtime-sandbox*
*Completed: 2026-04-27*
