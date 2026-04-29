---
phase: 11-headless-mode-e2e-stress
plan: 10
subsystem: factory-cli
tags: [stress, sustained-load, bash, headless, confirmed-intent]

requires:
  - phase: 11-headless-mode-e2e-stress
    provides: "Plan 11-09 __stress-step input preparation, session evidence, cap-breach, and finalization actions"
provides:
  - "Executable scripts/stress.sh sustained-load driver"
  - "Root pnpm stress:sustained shortcut"
  - "__stress-step test coverage for the exact sustained-load bash-driver action flags"
  - "Validation command text for one-run sustained-load mock smoke"
affects: [11-11, 11-14, factory-cli, stress]

tech-stack:
  added: []
  patterns:
    - "Bash stress orchestration stays sustained-load only and delegates state/input/evidence writes to __stress-step."
    - "Stress runs consume materialized intent.draft.json and confirmed-intent.json paths before trusted factory launch."

key-files:
  created:
    - scripts/stress.sh
    - .planning/phases/11-headless-mode-e2e-stress/11-10-SUMMARY.md
  modified:
    - package.json
    - apps/factory-cli/src/commands/__stress-step.test.ts
    - .planning/phases/11-headless-mode-e2e-stress/11-VALIDATION.md

key-decisions:
  - "Kept concurrency and fault-injection out of bash with the required TypeScript-driver refusal message."
  - "Used node apps/factory-cli/dist/main.js for the uninstalled smoke path while preserving the exact run flag set from the plan."
  - "Skipped the live one-run smoke in this worker pass to avoid creating unignored .protostar/stress artifacts outside the assigned write scope."

patterns-established:
  - "scripts/stress.sh parses only driver flags and caps; durable writes are performed by begin, next-seed, materialize-draft, sign-intent, record-run, finalize, and cap-breach actions."
  - "Sustained-load factory invocations must pass both --draft and --confirmed-intent with trusted two-key launch flags."

requirements-completed: [STRESS-12]

duration: 35min
completed: 2026-04-29
---

# Phase 11 Plan 10: Sustained-Load Bash Driver Summary

**Sustained-load stress now has a narrow bash driver that prepares signed inputs through factory-cli and launches trusted headless factory runs**

## Performance

- **Duration:** 35 min
- **Completed:** 2026-04-29
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added executable `scripts/stress.sh` for sequential sustained-load only, with defaults of 100 runs, mock backend, local-daemon headless mode, 500-run cap, 7-day cap, and mixed cosmetic/feature seeds.
- Wired each run through `__stress-step next-seed`, `materialize-draft`, and `sign-intent`, parsing JSON with `jq -r` and passing the returned `intent.draft.json` and `confirmed-intent.json` paths to `node apps/factory-cli/dist/main.js run`.
- Added the exact concurrency/fault refusal message and cap-breach delegation through `__stress-step`.
- Added the root `stress:sustained` script and focused `__stress-step` coverage for the bash-driver flag set.
- Documented the sustained-load shortcut in `11-VALIDATION.md`.

## Task Commits

Planned as one atomic Worker A commit after verification. No ROADMAP or STATE files were changed by this worker.

## Files Created/Modified

- `scripts/stress.sh` - Sustained-load driver, argument parser, cap checks, signed input preparation, trusted factory run invocation, run recording, and finalization.
- `package.json` - Adds `stress:sustained`.
- `apps/factory-cli/src/commands/__stress-step.test.ts` - Adds exact action/flag support coverage for the bash driver.
- `.planning/phases/11-headless-mode-e2e-stress/11-VALIDATION.md` - Adds the sustained-load shortcut command.
- `.planning/phases/11-headless-mode-e2e-stress/11-10-SUMMARY.md` - Records this plan outcome.

## Decisions Made

- Used `node apps/factory-cli/dist/main.js run` rather than requiring an installed `protostar-factory` binary, matching the plan's uninstalled smoke path.
- Continued through individual factory-run failures after recording `outcome=failed`, so the sustained-load report can capture pass-rate data instead of aborting the whole session on the first nonzero run.
- Did not add direct wedge detection to bash; this plan only required caps and evidence delegation, while wedge support already exists behind `__stress-step`.

## Deviations from Plan

None in implementation scope. The one-run live smoke was not run in this worker pass because `.protostar/stress/` is not ignored in this checkout, and the smoke would create untracked artifacts outside Worker A's assigned write scope.

## Issues Encountered

- The factory-cli package test command forwarded `--test-name-pattern "stress"` after `--`, so Node ran the full factory-cli suite instead of only stress-matching tests. The suite still passed.

## Verification

- `bash -n scripts/stress.sh` passed.
- `scripts/stress.sh --shape concurrency` exited nonzero and printed exactly `Use apps/factory-cli/src/scripts/stress.ts for concurrency and fault-injection`.
- `rg -n "sustained-load|__stress-step|next-seed|materialize-draft|sign-intent|--draft|--confirmed-intent|--llm-backend|--headless-mode|Use apps/factory-cli/src/scripts/stress.ts" scripts/stress.sh` found all required text.
- `rg -n "\\.protostar/stress|events\\.jsonl|stress-report\\.json" scripts/stress.sh` returned no matches.
- `pnpm --filter @protostar/factory-cli test -- --test-name-pattern "stress"` passed; due package forwarding, this ran the full factory-cli suite: 398 tests passed.

## User Setup Required

None for the bash driver. Running real sustained-load evidence requires built factory-cli artifacts and the normal headless/mock or real backend setup.

## Next Phase Readiness

Plan 11-14 can invoke `pnpm stress:sustained -- --runs 1 --llm-backend mock --headless-mode local-daemon` for a small local smoke, or run the full sustained-load cap outside per-task feedback. Plan 11-11 remains the owner for concurrency and fault-injection.

---
*Phase: 11-headless-mode-e2e-stress*
*Completed: 2026-04-29*
