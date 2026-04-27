---
phase: 02-authority-governance-kernel
plan: 08
subsystem: factory-cli
tags: [authority, workspace-trust, two-key-launch, escalation, cli]

requires:
  - phase: 02-authority-governance-kernel
    provides: Per-gate admission decision writer, workspace-trust gate artifact, intent admission outcomes
provides:
  - Factory CLI `--trust` and `--confirmed-intent` parsing with default untrusted posture
  - CLI-level two-key launch refusal before `runFactory` gates
  - Run-local `escalation-marker.json` writer for `escalate` admission outcomes
  - Trusted-workspace hardcode removal from `apps/factory-cli/src/main.ts`
affects: [phase-2-authority, stage-reader-plan-09, operator-surface-plan-09, repo-runtime-plan-09]

tech-stack:
  added: []
  patterns:
    - CLI argv parsing isolated from `main.ts` with structured `ArgvError`
    - Stop-for-human conditions use exit code 2 and durable evidence
    - Escalation markers are distinct from refusal triples

key-files:
  created:
    - apps/factory-cli/src/cli-args.ts
    - apps/factory-cli/src/two-key-launch.ts
    - apps/factory-cli/src/escalation-marker.ts
    - apps/factory-cli/src/cli-args.test.ts
    - apps/factory-cli/src/two-key-launch.test.ts
    - apps/factory-cli/src/escalation-marker.test.ts
  modified:
    - apps/factory-cli/src/main.ts
    - apps/factory-cli/src/main.test.ts
    - apps/factory-cli/src/refusals-index.ts

key-decisions:
  - "Default CLI trust is untrusted; trusted launch requires --confirmed-intent as a second key."
  - "Phase 2 intentionally uses exit code 2 for both escalation and two-key launch refusal because both are stop-for-human conditions."
  - "Escalate outcomes write escalation-marker.json rather than the refusal triple."

patterns-established:
  - "CLI validation that can stop before runFactory should happen in main() after parseArgs and before runFactory."
  - "Admission outcome escalation is represented by a marker artifact plus exit code 2, not a new outcome literal."

requirements-completed: [GOV-04]

duration: 10min
completed: 2026-04-27
---

# Phase 2 Plan 08: Two-Key Launch and Escalate Summary

**Workspace trust is now CLI-driven with two-key launch enforcement and durable escalation markers for stop-for-human outcomes.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-27T16:19:30Z
- **Completed:** 2026-04-27T16:29:55Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Added `parseCliArgs()` with `--trust`, `--trust=...`, `--confirmed-intent`, and `--confirmed-intent=...`; trust defaults to `"untrusted"`.
- Added `validateTwoKeyLaunch()` and wired it before `runFactory`, so `--trust trusted` without `--confirmed-intent` writes `trust-refusal.json`, appends `refusals.jsonl`, and exits 2 before gate artifacts are written.
- Removed the hardcoded `trust: "trusted"` in `main.ts`; workspace trust now flows from validated CLI options.
- Added `writeEscalationMarker()` and wired intent-gate `escalate` outcomes to write `escalation-marker.json` with exit code 2, distinct from refusal artifacts.

## Task Commits

1. **Task 1 RED: CLI parser and validator tests** - `f21471c` (test)
2. **Task 1 GREEN: CLI parser and two-key validator** - `6bed8f8` (feat)
3. **Task 2 RED: escalation wiring tests** - `9e73429` (test)
4. **Task 2 GREEN: two-key main wiring and escalation marker** - `e5ab4ca` (feat)

## Files Created/Modified

- `apps/factory-cli/src/cli-args.ts` - Parses supported CLI flags with structured errors and typed trust defaults.
- `apps/factory-cli/src/two-key-launch.ts` - Validates trusted launches require `--confirmed-intent`.
- `apps/factory-cli/src/escalation-marker.ts` - Writes run-local `escalation-marker.json`.
- `apps/factory-cli/src/main.ts` - Runs two-key validation before `runFactory`, propagates trust, writes trust refusal artifacts, and maps escalate to exit 2.
- `apps/factory-cli/src/refusals-index.ts` - Adds `workspace-trust` as a refusal stage for two-key launch refusal.
- `apps/factory-cli/src/*.test.ts` - Covers parser forms, validator evidence, escalation marker writes, hardcoded trust regression, and exit-code behavior.

## Decisions Made

- Reused the existing `escalate` literal from `@protostar/intent`/`@protostar/authority`; no local outcome list was introduced.
- Kept `confirmedIntent` as a CLI second-key path for Phase 2 validation only; the existing draft promotion path still produces the signed run intent.
- Documented Correction 8 explicitly: two-key launch refusal and escalation both use exit code 2 in Phase 2 because both require operator action before progress can resume.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- Existing policy-overage tests expected exit code 1 for `escalate`; updated them to the Plan 08 exit code 2 contract and asserted the marker artifact.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None. Stub scan found only test fixture labels and existing intentional fixture data.

## Threat Flags

None beyond planned CLI trust-boundary and run-artifact filesystem surfaces in `apps/factory-cli`.

## Verification

- `pnpm --filter @protostar/factory-cli test` - passed; 65 tests, 10 suites, 0 failures.
- `pnpm run verify:full` - passed.
- `pnpm run factory` - passed; emitted signed `schemaVersion: "1.1.0"` intent output.
- `pnpm run verify` - passed.
- Hardcoded trust grep: `grep -c -F 'trust: "trusted"' apps/factory-cli/src/main.ts` output `0`.
- Acceptance greps passed: parser `--trust` = 3, parser `--confirmed-intent` = 2, `validateTwoKeyLaunch` in `main.ts` = 2, `writeEscalationMarker` in `main.ts` = 2, `process.exitCode = 2` = 1, no local `["allow", "block", "escalate"]` literal in Plan 08 modules.

## Next Phase Readiness

Plan 09 can consume default-untrusted workspace trust and the new escalation marker contract when building the stage reader and repo runtime trust checks.

## Self-Check: PASSED

- Summary file exists.
- Key created files exist.
- Task commits exist: `f21471c`, `6bed8f8`, `9e73429`, `e5ab4ca`.
- Required verification passed after the final task commit.
- No tracked file deletions were introduced.

---
*Phase: 02-authority-governance-kernel*
*Completed: 2026-04-27*
