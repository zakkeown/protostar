---
phase: 10-v1-hardening-dogfood
plan: 02
subsystem: dogfood-fixtures
tags: [fixtures, dogfood, prune, github, lmstudio]
requires:
  - phase: 10-v1-hardening-dogfood
    provides: DOG-01 toy repo scaffold and green CI on main
provides:
  - @protostar/fixtures package with the three locked cosmetic-tweak seeds
  - prune support for .protostar/dogfood session directories
  - DOG-03 live-run checkpoint with verified GitHub access and LM Studio blocker
affects: [10-08-dogfood-loop, phase-7-delivery-verification, operator-prune]
tech-stack:
  added: []
  patterns: [frozen seed fixtures, cursor-protected dogfood pruning]
key-files:
  created:
    - packages/fixtures/package.json
    - packages/fixtures/tsconfig.json
    - packages/fixtures/tsconfig.build.json
    - packages/fixtures/src/index.ts
    - packages/fixtures/src/seeds/index.ts
    - packages/fixtures/src/seeds/button-color-hover.ts
    - packages/fixtures/src/seeds/card-shadow.ts
    - packages/fixtures/src/seeds/navbar-aria.ts
    - packages/fixtures/src/seeds/seed-library.test.ts
  modified:
    - tsconfig.json
    - pnpm-lock.yaml
    - apps/factory-cli/src/commands/prune.ts
    - apps/factory-cli/src/commands/prune.test.ts
key-decisions:
  - "Used actual GitHub owner zakkeown/protostar-toy-ttt; plan text owner zkeown is a known typo."
  - "Paused DOG-03 live run at LM Studio availability rather than fabricating PR evidence."
patterns-established:
  - "Fixture seeds are frozen objects collected into a frozen as-const seedLibrary."
  - "Dogfood prune reuses run directory enumeration and protects active sessions via cursor.completed < cursor.totalRuns."
requirements-completed: [DOG-03]
duration: 8min
completed: 2026-04-28
---

# Phase 10 Plan 02: DOG-03 Fixture Library + Prune Scope Summary

**Frozen cosmetic-tweak seed library and dogfood-session prune support are shipped; the first real PR run is paused on LM Studio availability.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-28T21:42:22Z
- **Completed:** 2026-04-28T21:50:46Z
- **Tasks:** 2 complete, 1 checkpoint blocked
- **Files modified:** 12

## Accomplishments

- Added `@protostar/fixtures` with `seedLibrary`, `getSeed(id)`, `listSeedIds()`, and the three Phase 10 cosmetic seeds.
- Locked DOG-03 seed text verbatim: `Change the primary button color and add a hover state`.
- Extended `prune` to scan and delete old completed `.protostar/dogfood/<sessionId>/` directories while preserving append-only files and protecting active cursors.
- Verified live GitHub access to `zakkeown/protostar-toy-ttt` and confirmed `PROTOSTAR_DOGFOOD_PAT` is available from `~/.env`.

## Task Commits

1. **Task 1 RED: fixture tests** - `16c0bcf` (`test`)
2. **Task 1 GREEN: fixture implementation** - `fef3f11` (`feat`)
3. **Task 2 RED: dogfood prune tests** - `adb8d25` (`test`)
4. **Task 2 GREEN: prune implementation** - `127f9a8` (`feat`)

## Files Created/Modified

- `packages/fixtures/src/seeds/*.ts` - frozen three-seed library for dogfood runs.
- `packages/fixtures/src/seeds/seed-library.test.ts` - six behavior tests for seed count, verbatim text, archetype, missing id, ordered frozen IDs, and deep freezing.
- `apps/factory-cli/src/commands/prune.ts` - dogfood scan/delete support with cursor active-session guard.
- `apps/factory-cli/src/commands/prune.test.ts` - dogfood dry-run, deletion, append-only preservation, and active cursor tests.

## Verification

- `pnpm install` passed; lockfile gained the `packages/fixtures` importer.
- `pnpm --filter @protostar/fixtures build` passed.
- `pnpm --filter @protostar/fixtures test` passed: 6 tests.
- `grep -F "Change the primary button color and add a hover state" packages/fixtures/src/seeds/button-color-hover.ts` passed.
- `grep -c "as const" packages/fixtures/src/seeds/index.ts` returned `1`.
- `jq -r '.publishConfig.access' packages/fixtures/package.json` returned `public`.
- `pnpm --filter @protostar/factory-cli build` passed.
- `pnpm --filter @protostar/factory-cli test -- --test-name-pattern "prune"` passed; prune suite includes 16 tests.
- `pnpm --filter @protostar/factory-cli test` passed: 323 tests.
- `pnpm run verify` passed.
- `pnpm run factory` built successfully and stopped at the expected workspace-trust gate.

## Checkpoint Status

Task 3 is blocked before the live DOG-03 invocation because LM Studio is not reachable at `http://127.0.0.1:1234/v1/models` (`curl` exit 7). The GitHub prerequisite is ready: after sourcing `~/.env`, `gh repo view zakkeown/protostar-toy-ttt --json name,visibility` returned `protostar-toy-ttt PUBLIC`.

Required continuation:

- Start LM Studio's OpenAI-compatible server on `127.0.0.1:1234`.
- Load the configured coder model `qwen3-coder-next-mlx-4bit`.
- Load the configured judge model used by the current factory config/defaults.
- Continue DOG-03 using actual owner `zakkeown/protostar-toy-ttt`, not the plan typo `zkeown`.

## Deviations from Plan

### Auto-fixed Issues

None.

### Plan/Environment Deviations

- The plan text refers to `zkeown/protostar-toy-ttt`; the actual public repo from Plan 10-01 is `zakkeown/protostar-toy-ttt`. Live GitHub checks used the actual owner.
- DOG-03 evidence files were not created because the run is blocked on LM Studio availability. No PR URL or screenshot is claimed.

**Total deviations:** 0 auto-fixed.  
**Impact on plan:** Implementation work is complete and verified; live Phase 7 catch-up evidence remains blocked by local model runtime availability.

## Known Stubs

None found in files created or modified by this plan.

## Threat Flags

None. The only security-relevant surface changed is the planned `.protostar/dogfood/` prune scope with cursor protection.

## Issues Encountered

- `node_modules/@gsd-build/sdk/dist/cli.js` was not present; the PATH fallback `gsd-sdk` is available.
- `gh` needed network escalation under the sandbox; the escalated repo visibility check passed.
- LM Studio local endpoint is unavailable, blocking the real DOG-03 run.

## User Setup Required

Start LM Studio with the required models loaded before resuming Task 3.

## Next Phase Readiness

Plans depending only on the seed library and prune scope can proceed. Wave 2 DOG-03 evidence is not complete until Task 3 opens a PR with green CI and captures the PR URL/screenshot artifacts.

## Self-Check: PASSED

- Created files exist under `packages/fixtures/`.
- Commits `16c0bcf`, `fef3f11`, `adb8d25`, and `127f9a8` exist in git history.
- Root verification passed after implementation.

---
*Phase: 10-v1-hardening-dogfood*
*Completed: 2026-04-28*
