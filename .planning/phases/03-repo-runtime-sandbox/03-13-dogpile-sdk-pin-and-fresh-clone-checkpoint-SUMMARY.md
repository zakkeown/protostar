---
phase: 03-repo-runtime-sandbox
plan: 13
subsystem: dependency-hygiene
tags: [dogpile-sdk, pnpm, fresh-clone, validation, repo-runtime]

requires:
  - phase: 03-repo-runtime-sandbox
    provides: [repo-runtime contract tests, factory-cli repo-runtime wiring, Phase 3 validation template]
provides:
  - "Exact @dogpile/sdk@0.2.0 pin through the @protostar/dogpile-types shim"
  - "Fresh-clone REPO-08 install smoke evidence with sibling ~/Code/dogpile moved aside and restored"
  - "Completed Phase 3 validation strategy with per-task verification map"
affects: [dogpile-adapter, dogpile-types, repo-runtime-validation, fresh-clone-onboarding]

tech-stack:
  added: ["@dogpile/sdk@0.2.0"]
  patterns:
    - "Retain @protostar/dogpile-types as a thin re-export shim over the pinned upstream SDK"
    - "Record destructive/manual checkpoint evidence in phase-local markdown before summary"

key-files:
  created:
    - .planning/phases/03-repo-runtime-sandbox/03-13-fresh-clone-smoke.md
    - .planning/phases/03-repo-runtime-sandbox/03-13-dogpile-sdk-pin-and-fresh-clone-checkpoint-SUMMARY.md
  modified:
    - packages/dogpile-types/package.json
    - packages/dogpile-types/src/index.ts
    - packages/dogpile-types/src/index.test.ts
    - pnpm-lock.yaml
    - .planning/phases/03-repo-runtime-sandbox/03-VALIDATION.md

key-decisions:
  - "Pinned @dogpile/sdk@0.2.0 on @protostar/dogpile-types instead of @protostar/dogpile-adapter to preserve the adapter indirection."
  - "Kept DogpileOptions as an upstream type re-export and verified only the adapter-consumed indexed slices in shim tests."
  - "Committed Task 2 as a phase-local smoke evidence artifact because the checkpoint itself produces no code changes."

patterns-established:
  - "Dependency hygiene checkpoints that mutate local machine state leave auditable phase-local evidence."
  - "Dogpile SDK consumption remains mediated through @protostar/dogpile-types."

requirements-completed: [REPO-08]

duration: 46min
completed: 2026-04-27
---

# Phase 03 Plan 13: Dogpile SDK Pin and Fresh Clone Checkpoint Summary

**Dogpile SDK now resolves from pinned npm package `@dogpile/sdk@0.2.0`, with fresh-clone install evidence and a completed Phase 3 validation map.**

## Performance

- **Duration:** 46 min
- **Started:** 2026-04-27T21:39:07Z
- **Completed:** 2026-04-27T22:25:06Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added exact `@dogpile/sdk: "0.2.0"` dependency to `@protostar/dogpile-types` and locked it with registry integrity in `pnpm-lock.yaml`.
- Replaced the local vendored Dogpile surface with a 12-line shim that re-exports `AgentSpec`, `DogpileOptions`, `budget`, `convergence`, and `firstOf` from upstream.
- Ran the approved REPO-08 smoke with `/Users/zakkeown/Code/dogpile` moved aside, dependencies removed and reinstalled, and the sibling directory restored.
- Filled `03-VALIDATION.md` with Node 22 test infrastructure, sampling strategy, 33 per-task rows across Plans 01-13, Wave 0 requirements, and the manual-only REPO-08 verification.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pin `@dogpile/sdk@0.2.0` and retain re-export shim** - `2c32cca` (feat)
2. **Task 2: REPO-08 fresh-clone install smoke checkpoint** - `870a341` (test)
3. **Task 3: Fill `03-VALIDATION.md` per-task map** - `1f43f7b` (docs)

**Plan metadata:** pending final docs commit.

## Files Created/Modified

- `packages/dogpile-types/package.json` - Adds exact `@dogpile/sdk@0.2.0` dependency.
- `packages/dogpile-types/src/index.ts` - Re-export shim from `@dogpile/sdk/types` and `@dogpile/sdk`.
- `packages/dogpile-types/src/index.test.ts` - Verifies the five adapter-consumed symbols and upstream SDK option slices.
- `pnpm-lock.yaml` - Records `@dogpile/sdk@0.2.0` registry integrity.
- `.planning/phases/03-repo-runtime-sandbox/03-13-fresh-clone-smoke.md` - Captures the approved fresh-clone smoke evidence.
- `.planning/phases/03-repo-runtime-sandbox/03-VALIDATION.md` - Completed Phase 3 validation strategy and task map.

## Decisions Made

- Kept the Dogpile SDK dependency on `@protostar/dogpile-types` so `@protostar/dogpile-adapter` continues to depend on the Protostar-owned shim rather than the upstream SDK directly.
- Treated the upstream `DogpileOptions` required `intent` and `model` fields as surface drift for tests only; adapter code already uses indexed slices, so no adapter change was needed.
- Recorded Task 2 as a committed evidence artifact because the checkpoint succeeded without producing source changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used approved pnpm store access for dependency installation**
- **Found during:** Task 1
- **Issue:** Initial `pnpm --filter @protostar/dogpile-types add @dogpile/sdk@0.2.0` failed because the current `node_modules` linked to `/Users/zakkeown/Library/pnpm/store/v10` while pnpm wanted the workspace `.pnpm-store`.
- **Fix:** Re-ran the install with the existing store path under approved escalated access, allowing pnpm to update the manifest and lockfile without reinstalling the whole workspace.
- **Files modified:** `packages/dogpile-types/package.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter @protostar/dogpile-types test`, `pnpm --filter @protostar/dogpile-adapter test`
- **Committed in:** `2c32cca`

**2. [Rule 1 - Bug] Updated shim tests for upstream `DogpileOptions` shape**
- **Found during:** Task 1
- **Issue:** `@dogpile/sdk@0.2.0` exports the full `DogpileOptions` type, which requires `intent` and `model`; the old shim test constructed a reduced options object.
- **Fix:** Kept the shim as a type re-export and updated the test to verify only the indexed slices consumed by `dogpile-adapter`.
- **Files modified:** `packages/dogpile-types/src/index.test.ts`
- **Verification:** `pnpm --filter @protostar/dogpile-types test`, `pnpm --filter @protostar/dogpile-adapter test`
- **Committed in:** `2c32cca`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes preserved the plan's intended architecture: exact upstream pin, no sibling link, and shim retained as indirection.

## Issues Encountered

- `pnpm why @dogpile/sdk` at the workspace root produced no useful output, so the checkpoint evidence uses `pnpm --filter @protostar/dogpile-types why @dogpile/sdk` and `pnpm list @dogpile/sdk --filter @protostar/dogpile-types --depth 0`, both showing `@dogpile/sdk@0.2.0`.

## Known Stubs

None. Stub scan found no TODO/FIXME/placeholders or hardcoded empty UI-style data in the created/modified files.

## Threat Flags

None. The new supply-chain and sibling-restore surfaces were already represented in the plan threat model (`T-03-13-01` through `T-03-13-03`) and mitigated by exact pinning, link scans, install smoke, and restore evidence.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm --filter @protostar/dogpile-types build` - passed.
- `pnpm --filter @protostar/dogpile-types test` - passed, 4/4 tests.
- `pnpm --filter @protostar/dogpile-adapter test` - passed, 3/3 tests.
- `node -e 'const p=require("./packages/dogpile-types/package.json"); if(p.dependencies["@dogpile/sdk"]!=="0.2.0")process.exit(1)'` - passed.
- `rg -n '"link:' packages apps` / `grep -rn '"link:' packages apps` - no matches.
- Fresh-clone checkpoint: `/Users/zakkeown/Code/dogpile` moved aside, dependency folders removed, `pnpm install --frozen-lockfile` passed, sibling restored, and `/Users/zakkeown/Code/dogpile` verified present.
- `pnpm --filter @protostar/dogpile-types why @dogpile/sdk` - reported `@dogpile/sdk@0.2.0`.
- `pnpm list @dogpile/sdk --filter @protostar/dogpile-types --depth 0` - reported `@dogpile/sdk@0.2.0`.
- `pnpm run verify:full` - passed.
- `head -10 .planning/phases/03-repo-runtime-sandbox/03-VALIDATION.md | grep -q 'nyquist_compliant: true'` - passed.
- Validation task-row count check - returned `rows=34`, above the `>=20` gate.

## Next Phase Readiness

REPO-08 is closed for Phase 3: Dogpile resolves from a pinned registry package, no package/app manifests contain sibling `link:` references, and a no-sibling install smoke has passed with the operator-owned sibling restored. Phase 3 validation is now ready for verifier consumption.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/03-repo-runtime-sandbox/03-13-dogpile-sdk-pin-and-fresh-clone-checkpoint-SUMMARY.md`.
- Key files exist: `packages/dogpile-types/src/index.ts`, `.planning/phases/03-repo-runtime-sandbox/03-13-fresh-clone-smoke.md`, and `.planning/phases/03-repo-runtime-sandbox/03-VALIDATION.md`.
- Task commits exist in git history: `2c32cca`, `870a341`, and `1f43f7b`.
- No tracked deletions were introduced by task commits.

---
*Phase: 03-repo-runtime-sandbox*
*Completed: 2026-04-27*
