---
phase: 12-authority-boundary-stabilization
plan: 03
subsystem: mechanical-checks-tier-integrity
tags: [authority-boundary, no-net-contract, tier-purity, diff-name-only]
requires:
  - "@protostar/repo (existing fs-tier package)"
  - "@protostar/mechanical-checks (existing pure-tier package)"
provides:
  - "computeDiffNameOnly exported from @protostar/repo"
  - "MechanicalChecksAdapterConfig with diffNameOnly: readonly string[]"
  - "review-loop wiring that pre-computes diffNameOnly before adapter construction"
affects:
  - "@protostar/mechanical-checks tier classification (now genuinely pure)"
  - "apps/factory-cli/src/wiring/review-loop.ts (async config + injectable computeDiffNameOnly)"
key-files:
  created:
    - packages/repo/src/diff-name-only.ts
    - packages/repo/src/diff-name-only.test.ts
    - .planning/phases/12-authority-boundary-stabilization/deferred-items.md
  modified:
    - packages/repo/src/index.ts
    - packages/mechanical-checks/src/create-mechanical-checks-adapter.ts
    - packages/mechanical-checks/src/create-mechanical-checks-adapter.test.ts
    - packages/mechanical-checks/src/index.ts
    - packages/mechanical-checks/package.json
    - apps/factory-cli/src/wiring/review-loop.ts
    - apps/factory-cli/src/wiring/review-loop.test.ts
    - pnpm-lock.yaml
  removed:
    - packages/mechanical-checks/src/diff-name-only.ts
    - packages/mechanical-checks/src/diff-name-only.test.ts
decisions:
  - "Adapter test was rewritten without isomorphic-git rather than retained verbatim. Reason: no-net contract walks all .ts files in src/ (only contract tests are excluded); leaving the original adapter test would keep the contract red."
  - "Added optional computeDiffNameOnly override on BuildReviewRepairServicesInput. Reason: review-loop.test.ts passes gitFs: {} as never; without an injection point, the new async config call would explode in tests."
  - "Used Parameters<typeof computeDiffNameOnly>[0]['fs'] to derive GitFs type in factory-cli rather than adding isomorphic-git to factory-cli's deps. Reason: keep factory-cli's dependency surface unchanged; the type still flows from @protostar/repo where isomorphic-git correctly lives."
  - "Build-time smoke call to createAdapter uses an empty diffNameOnly placeholder (mechanicalAdapterConfigSync). Reason: keeps buildReviewRepairServices synchronous so its callers don't need to be modified; the real diff is computed per-attempt inside mechanicalChecker."
metrics:
  duration_minutes: ~30
  completed_date: 2026-04-29
  task_count: 2
  file_count: 11
---

# Phase 12 Plan 03: diff-name-only-relocate Summary

Moved `computeDiffNameOnly` (and its `isomorphic-git` dependency) out of the `pure`-tier `@protostar/mechanical-checks` package into the `fs`-tier `@protostar/repo` package, then reshaped the mechanical-checks adapter to consume an injected `diffNameOnly: readonly string[]`. The mechanical-checks no-net contract is now green against production source — tier classification is honest.

## Tasks Executed

| # | Name | Commit |
|---|------|--------|
| 1 | Move diff-name-only into @protostar/repo | 8fb68d9 |
| 2 | Reshape mechanical-checks adapter to consume injected diffNameOnly | e7ec775 |

## Verification

- `pnpm --filter @protostar/repo build` passes.
- `pnpm --filter @protostar/repo test` passes (108 tests, includes all 5 relocated diff-name-only cases).
- `pnpm --filter @protostar/mechanical-checks build` passes.
- `pnpm --filter @protostar/mechanical-checks test` passes (26 tests, including no-net.contract.test).
- `npx tsc --noEmit -p apps/factory-cli/tsconfig.json` passes for factory-cli source (excluding cross-package test refs in unrelated Phase 11 hosted-llm-adapter — see Deferred Issues).
- `node --test apps/factory-cli/dist/wiring/review-loop.test.js` — 7/7 pass.

## Must-Have Truths

- `@protostar/mechanical-checks/src/` has zero `isomorphic-git` imports (verified by greenness of `no-net.contract.test.ts`).
- `computeDiffNameOnly` is exported from `@protostar/repo`.
- `MechanicalChecksAdapterConfig` declares `readonly diffNameOnly: readonly string[]` and no `gitFs` field.
- `mechanical-checks/package.json` no longer declares `isomorphic-git` (`grep -c '"isomorphic-git"'` returns 0).
- no-net contract test in mechanical-checks is green (it was RED at the worktree base; this plan turned it green by removing both the production and the test isomorphic-git imports).

## Deviations from Plan

### Auto-fixed / Auto-adjusted

**1. [Rule 1 - Bug] Plan claimed no-net contract was already green; it was red at base**

- **Found during:** Task 2 verification (`pnpm --filter @protostar/mechanical-checks test` on base)
- **Issue:** Plan must-have stated "no-net contract test in mechanical-checks stays green (it always was)". At the worktree base it was failing because `create-mechanical-checks-adapter.test.ts` imported `isomorphic-git`.
- **Fix:** Rewrote `create-mechanical-checks-adapter.test.ts` to inject `diffNameOnly` directly (no `isomorphic-git`, no real git fixtures), satisfying the contract walker.
- **Files modified:** packages/mechanical-checks/src/create-mechanical-checks-adapter.test.ts
- **Commit:** e7ec775

**2. [Rule 3 - Blocking] review-loop.test.ts passed `gitFs: {} as never` — sync `computeDiffNameOnly` would crash**

- **Found during:** Task 2 design
- **Issue:** Existing tests pass a stub `gitFs`; the new async config call would invoke real isomorphic-git on a `{}` fs and throw.
- **Fix:** Added optional `computeDiffNameOnly` override to `BuildReviewRepairServicesInput`; tests inject `async () => []`. Production callers continue to use the default (the real `@protostar/repo` export).
- **Files modified:** apps/factory-cli/src/wiring/review-loop.ts, apps/factory-cli/src/wiring/review-loop.test.ts
- **Commit:** e7ec775

**3. [Rule 3 - Blocking] Avoid adding isomorphic-git as factory-cli dep**

- **Found during:** Task 2 wiring
- **Issue:** Plan instructed to import `FsClient` type from isomorphic-git in review-loop.ts. factory-cli has no such dep. Adding it would broaden a non-pure tier package surface unnecessarily.
- **Fix:** Used `type GitFs = Parameters<typeof computeDiffNameOnly>[0]["fs"]` to derive the type from the @protostar/repo export. Type flows the same; no new dep.
- **Files modified:** apps/factory-cli/src/wiring/review-loop.ts
- **Commit:** e7ec775

**4. [Rule 3 - Blocking] Re-export removed from mechanical-checks barrel**

- **Found during:** Task 2 build
- **Issue:** `packages/mechanical-checks/src/index.ts` re-exported `./diff-name-only.js` after the file was moved.
- **Fix:** Removed the stale re-export. Consumers now import from `@protostar/repo`.
- **Files modified:** packages/mechanical-checks/src/index.ts
- **Commit:** e7ec775

## Deferred Issues

Pre-existing TS errors in `packages/hosted-llm-adapter/src/coder-adapter.test.ts` and `hosted-openai-client.test.ts` are present at the worktree base (71f21fb). They belong to Phase 11 work running in a parallel worktree and are out of scope for 12-03. Logged in `deferred-items.md`. They prevent `tsc -b` (project-references walk) from finishing cleanly across the monorepo, but factory-cli's own source typechecks. Resolution will arrive when Phase 11 lands on main and the parallel worktrees converge.

## Threat Flags

None. Work removed an authority crossing rather than introducing one.

## Self-Check: PASSED

- packages/repo/src/diff-name-only.ts — FOUND
- packages/repo/src/diff-name-only.test.ts — FOUND
- packages/mechanical-checks/src/diff-name-only.ts — confirmed REMOVED
- packages/mechanical-checks/package.json — `isomorphic-git` substring count: 0
- Commit 8fb68d9 — FOUND in `git log`
- Commit e7ec775 — FOUND in `git log`
- `pnpm --filter @protostar/repo test` — 108/108 pass
- `pnpm --filter @protostar/mechanical-checks test` — 26/26 pass (no-net contract green)
- `node --test apps/factory-cli/dist/wiring/review-loop.test.js` — 7/7 pass
