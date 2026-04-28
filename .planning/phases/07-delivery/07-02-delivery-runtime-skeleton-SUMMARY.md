---
phase: 07-delivery
plan: 02
subsystem: delivery-runtime
tags: [delivery, octokit, nock, node-test, workspace]

requires:
  - phase: 06-live-dogpile-piles
    provides: "network-permitted, fs-forbidden package pattern from dogpile-adapter"
provides:
  - "@protostar/delivery-runtime workspace skeleton registered with pnpm and TypeScript"
  - "Static no-fs and no-merge authority-boundary contract tests"
  - "Wave-0 nock 14 + Octokit 22 fetch interception gate"
affects: [delivery, factory-cli, phase-07]

tech-stack:
  added: ["@octokit/rest@22.0.1", "@octokit/plugin-retry@7.x", "@octokit/plugin-throttling@9.x", "isomorphic-git@1.37.6", "nock@14.0.13"]
  patterns: ["network-only delivery-runtime package", "mutually excluded static contract tests", "nock disableNetConnect smoke gate"]

key-files:
  created:
    - packages/delivery-runtime/package.json
    - packages/delivery-runtime/tsconfig.json
    - packages/delivery-runtime/vitest.config.ts
    - packages/delivery-runtime/src/index.ts
    - packages/delivery-runtime/src/no-fs.contract.test.ts
    - packages/delivery-runtime/src/no-merge.contract.test.ts
    - packages/delivery-runtime/src/nock-octokit-smoke.test.ts
  modified:
    - package.json
    - pnpm-lock.yaml
    - pnpm-workspace.yaml
    - tsconfig.json

key-decisions:
  - "Kept delivery-runtime scripts aligned with the repo's node:test compiled-dist convention."
  - "Used a regex-valid fake PAT in the nock smoke test so future fast preflight paths will not reject before interception."

patterns-established:
  - "Delivery runtime is network-permitted but fs-forbidden by static test."
  - "Delivery runtime source is forbidden from PR merge and branch-update surfaces."

requirements-completed: [DELIVER-01, DELIVER-07]

duration: 6min
completed: 2026-04-28
---

# Phase 7 Plan 02: Delivery Runtime Skeleton Summary

**Network-only delivery-runtime workspace with authority-boundary contracts and a passing nock 14 / Octokit 22 fetch interception gate**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-28T13:28:07Z
- **Completed:** 2026-04-28T13:34:27Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Registered `@protostar/delivery-runtime` in pnpm, root TypeScript references, and root `verify`.
- Added static no-fs and no-merge contract tests for `packages/delivery-runtime/src/`.
- Confirmed Pitfall 6 gate: PASS (`nock@14.0.13` intercepts `@octokit/rest@22.0.1` native fetch on Node `v22.22.1`).

## Task Commits

1. **Task 1: Create package skeleton + register in workspace** - `23d12c0` (feat)
2. **Task 2: Land static contract tests** - `dcbc4eb` (test)
3. **Task 3: Wave-0 nock + Octokit-22 smoke test** - `3e64102` (test)

## Files Created/Modified

- `packages/delivery-runtime/package.json` - New package with Octokit, plugins, nock, and exact `isomorphic-git@1.37.6`.
- `packages/delivery-runtime/tsconfig.json` - Composite TypeScript project with delivery, intent, review, and artifacts references.
- `packages/delivery-runtime/vitest.config.ts` - Placeholder config file requested by the plan.
- `packages/delivery-runtime/src/index.ts` - Empty barrel so the package build target is non-empty.
- `packages/delivery-runtime/src/no-fs.contract.test.ts` - Static source scan forbidding fs/path imports.
- `packages/delivery-runtime/src/no-merge.contract.test.ts` - Static source scan forbidding merge/automerge/update-branch surfaces.
- `packages/delivery-runtime/src/nock-octokit-smoke.test.ts` - Nock/Octokit fetch interception smoke.
- `package.json` - Root `verify` now runs delivery-runtime tests.
- `pnpm-lock.yaml` - Lockfile updated for delivery-runtime dependencies.
- `pnpm-workspace.yaml` - Explicit delivery-runtime workspace entry added.
- `tsconfig.json` - Root project reference added.

## Decisions Made

- Kept package scripts on the existing `node:test` pattern rather than introducing a Vitest runtime, because this repo compiles tests to `dist/*.test.js`.
- Used `ghp_TESTFAKENOTREAL36CHARSxxxxxxxxxxxxxx` as the smoke token. The plan sample contained underscores after `ghp_`, but the same task requires `^gh[pousr]_[A-Za-z0-9]{36}$`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected fake PAT format**
- **Found during:** Task 3 (nock + Octokit smoke)
- **Issue:** The sample token contained underscores in the 36-character body, conflicting with the plan's required PAT regex.
- **Fix:** Used a format-valid fake token with exactly 36 alphanumeric characters after `ghp_`.
- **Files modified:** `packages/delivery-runtime/src/nock-octokit-smoke.test.ts`
- **Verification:** `pnpm --filter @protostar/delivery-runtime test` passed; `scope.done()` succeeded.
- **Committed in:** `3e64102`

---

**Total deviations:** 1 auto-fixed (Rule 1).
**Impact on plan:** Preserves the intended test path while keeping the fake token compatible with future preflight validation.

## Issues Encountered

- `pnpm install` completed with a peer warning: `@octokit/plugin-throttling@9.6.1` expects `@octokit/core@^6.1.3`, while `@octokit/rest@22.0.1` brings core 7. The plan explicitly requested `@octokit/plugin-throttling@^9`; no runtime code imports the plugin in this skeleton.
- Root `pnpm run verify` failed outside 07-02 in in-flight Phase 7 intent changes: `packages/intent/dist/admission-control.test.js` expected a budget without `deliveryWallClockMs`, but the current working tree adds `deliveryWallClockMs: 600000`. Focused delivery-runtime verification passed.
- While committing Task 3, an unrelated staged admission-e2e rename from a parallel agent was briefly included. The commit was rewritten with a temporary index so `3e64102` contains only `packages/delivery-runtime/src/nock-octokit-smoke.test.ts`.

## Known Stubs

- `packages/delivery-runtime/src/index.ts:1` intentionally contains `export {};` only. This is the planned Wave-0 placeholder barrel; downstream Phase 7 plans add runtime exports.
- `packages/delivery-runtime/vitest.config.ts:1` intentionally contains `export default {};`. The repo's active test path remains compiled `node:test`.

## Threat Flags

None - new threat surfaces were already covered by the plan threat model (`test -> real network`, no-fs, no-merge).

## Verification

- `pnpm install` - passed; lockfile up to date on second run.
- `pnpm --filter @protostar/delivery-runtime build` - passed.
- `pnpm --filter @protostar/delivery-runtime test` - passed, 3/3 tests.
- `node --test packages/delivery-runtime/dist/no-fs.contract.test.js` - passed.
- `node --test packages/delivery-runtime/dist/no-merge.contract.test.js` - passed.
- Comment-stripping probe with temporary source comments containing `pulls.merge`, `from "node:fs";`, and `git merge --` - passed; probe removed before commit.
- `pnpm run verify` - failed in unrelated in-flight Phase 7 intent tests before reaching factory-cli; focused 07-02 tests passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Delivery-runtime is registered, builds, and has the Wave-0 authority gates in place. Downstream Phase 7 plans can use nock fixtures with the Pitfall 6 gate recorded as passing.

## Self-Check: PASSED

- Found all created 07-02 files on disk.
- Found task commits `23d12c0`, `dcbc4eb`, and `3e64102` in git history.
- Verified `pnpm-workspace.yaml`, root `tsconfig.json`, and root `package.json` reference `@protostar/delivery-runtime`.

---
*Phase: 07-delivery*
*Completed: 2026-04-28*
