---
phase: 11-headless-mode-e2e-stress
plan: 05
subsystem: cli-config
tags: [headless-mode, factory-config, stress-caps, cli, launchd]

requires:
  - phase: 11-headless-mode-e2e-stress
    provides: "STRESS-01 traceability and accepted Phase 11 plan graph"
provides:
  - "Validated factory.headlessMode and factory.nonInteractive config defaults"
  - "Strict factory.stress.caps defaults and validation"
  - "protostar-factory run --headless-mode and --non-interactive CLI wiring"
  - "All-three headless setup docs plus local launchd sample"
affects: [11-06, 11-09, 11-10, 11-13, 11-14, factory-cli, lmstudio-adapter]

tech-stack:
  added: []
  patterns:
    - "CLI > config file > defaults precedence for headless run options"
    - "Strict closed-key factory config validation mirrored in JSON schema"

key-files:
  created:
    - docs/headless/github-hosted.md
    - docs/headless/self-hosted-runner.md
    - docs/headless/local-daemon.md
    - scripts/protostar-local-daemon.launchd.plist
    - apps/factory-cli/src/commands/run.test.ts
  modified:
    - packages/lmstudio-adapter/src/factory-config.ts
    - packages/lmstudio-adapter/src/factory-config.schema.json
    - packages/lmstudio-adapter/src/factory-config.test.ts
    - packages/lmstudio-adapter/src/index.ts
    - apps/factory-cli/src/cli-args.ts
    - apps/factory-cli/src/cli-args.test.ts
    - apps/factory-cli/src/load-factory-config.ts
    - apps/factory-cli/src/load-factory-config.test.ts
    - apps/factory-cli/src/commands/run.ts
    - apps/factory-cli/src/main.ts
    - apps/factory-cli/src/coder-adapter-admission.test.ts
    - apps/factory-cli/src/wiring/review-loop.test.ts
    - docs/cli/run.txt

key-decisions:
  - "Kept ordinary local LM Studio behavior backward-compatible by defaulting factory.headlessMode to local-daemon and nonInteractive to false."
  - "Made stress cap config strict and closed-key now, while leaving cap enforcement to later Phase 11 stress plans."
  - "Kept the macOS launchd plist as inert sample documentation rather than installing or starting anything automatically."

patterns-established:
  - "Headless run options resolve through explicit CLI overrides before config-file values and defaults."
  - "Factory config additions must be represented in TypeScript defaults, validator tests, and factory-config.schema.json together."
  - "Headless setup docs name exact mode literals, command shape, evidence paths, and refusal posture."

requirements-completed: [STRESS-05, STRESS-11]

duration: 15min
completed: 2026-04-29
---

# Phase 11 Plan 05: Headless Mode Config CLI Summary

**Validated headless-mode config and CLI selection with strict stress cap defaults plus setup paths for hosted CI, self-hosted runners, and local daemon runs**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-29T16:34:37Z
- **Completed:** 2026-04-29T16:49:36Z
- **Tasks:** 3
- **Files modified:** 18 implementation/docs files

## Accomplishments

- Added `factory.headlessMode`, `factory.nonInteractive`, and `factory.stress.caps` defaults/validation in the LM Studio factory config resolver and JSON schema.
- Wired `protostar-factory run --headless-mode <mode>` and `--non-interactive` through CLI parsing, commander options, run option resolution, and help docs.
- Added all-three headless setup docs for `github-hosted`, `self-hosted-runner`, and `local-daemon`, plus an inert launchd sample plist.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pin headless config and CLI precedence tests** - `cdbf072` (test)
2. **Task 2: Implement `factory.headlessMode` and run flag wiring** - `2359361` (feat)
3. **Task 3: Add all-three headless setup docs and local daemon artifact** - `905f316` (docs)

**Plan metadata:** recorded in final docs commit after this summary.

## Files Created/Modified

- `packages/lmstudio-adapter/src/factory-config.ts` - Added `HeadlessMode`, factory defaults, stress cap defaults, strict validation, and env/config merge support.
- `packages/lmstudio-adapter/src/factory-config.schema.json` - Mirrored strict factory/headless/stress cap schema with exact literals and closed objects.
- `packages/lmstudio-adapter/src/factory-config.test.ts` - Covered default mode, exact mode literals, invalid aliases, stress cap defaults, overrides, and closed-key validation.
- `packages/lmstudio-adapter/src/index.ts` - Exported the new headless mode type.
- `apps/factory-cli/src/cli-args.ts` and `apps/factory-cli/src/cli-args.test.ts` - Parsed `--headless-mode` and `--non-interactive` for run argv.
- `apps/factory-cli/src/load-factory-config.ts` and `apps/factory-cli/src/load-factory-config.test.ts` - Resolved CLI > config > defaults precedence for headless options.
- `apps/factory-cli/src/commands/run.ts` and `apps/factory-cli/src/commands/run.test.ts` - Added commander options, usage failure handling, canonical JSON failure coverage, and stdout/stderr discipline tests.
- `apps/factory-cli/src/main.ts`, `apps/factory-cli/src/coder-adapter-admission.test.ts`, and `apps/factory-cli/src/wiring/review-loop.test.ts` - Adapted existing run call sites and tests to the expanded run option contract.
- `docs/cli/run.txt` - Refreshed run help snapshot for the new flags.
- `docs/headless/*.md` - Documented hosted CI, self-hosted runner, and local daemon setup paths.
- `scripts/protostar-local-daemon.launchd.plist` - Added sample-only local daemon launchd config.

## Decisions Made

- Defaulted `factory.headlessMode` to `local-daemon` to preserve local LM Studio runs without requiring new config.
- Rejected aliases like `ci` and `dashboard`; only the three locked Q-04 literals are valid.
- Kept stress cap resolution in config only. Enforcement and cap-breach artifacts remain assigned to later Phase 11 stress-session and final-gate plans.
- Updated the checked CLI help snapshot because the run command surface changed.

## Deviations from Plan

None - plan executed as written. The CLI help snapshot and existing factory-cli call-site tests were refreshed as part of the planned run flag wiring.

## Issues Encountered

- `pnpm --filter @protostar/lmstudio-adapter test` needed an escalated rerun because sandboxed loopback binding failed with `EPERM`; the escalated run passed.
- `pnpm run factory` built successfully and stopped at the expected workspace-trust gate. Its generated refusal-log line was reverted after verification so runtime residue did not enter the commit.

## Known Stubs

No active implementation stubs. `scripts/protostar-local-daemon.launchd.plist` and `docs/headless/local-daemon.md` intentionally contain sample paths that operators must replace before installing the plist.

## Threat Flags

None. The new config and CLI trust boundaries were covered by the plan threat model; no new network endpoint, auth path, database schema, or automated filesystem installer was introduced.

## Verification

- `pnpm --filter @protostar/lmstudio-adapter test` passed after approved loopback escalation.
- `pnpm --filter @protostar/factory-cli test` passed.
- `pnpm --filter @protostar/factory-cli start -- run --help` matched `docs/cli/run.txt`.
- Acceptance greps for mode literals, flags, stress cap fields, setup docs, and launchd sample passed.
- `pnpm run verify` passed.
- `pnpm run factory` built and stopped at the expected workspace-trust gate.
- `git diff --check` passed.

## User Setup Required

None for this plan. The new headless docs describe future operator setup paths, but no external service configuration is required to use the default local behavior.

## Next Phase Readiness

Plan 11-06 can build the LLM backend selector on top of the headless run option shape. Plans 11-09, 11-10, 11-13, and 11-14 can consume the strict stress cap defaults and setup contracts without adding another headless-mode enum.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/11-headless-mode-e2e-stress/11-05-SUMMARY.md`.
- Task commits exist: `cdbf072`, `2359361`, `905f316`.
- Required created docs and launchd sample exist.
- Requirement IDs from the plan frontmatter are recorded: `STRESS-05`, `STRESS-11`.

---
*Phase: 11-headless-mode-e2e-stress*
*Completed: 2026-04-29*
