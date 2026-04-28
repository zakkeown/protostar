---
phase: 09-operator-surface-resumability
plan: 10
subsystem: cli
tags: [prune-command, commander, run-discovery, dry-run, active-guard, jsonl-preservation]

requires:
  - phase: 09-operator-surface-resumability
    provides: Commander CLI primitives, parseDuration, listRuns, canonical stdout JSON, and widened FactoryRunStatus
provides:
  - protostar-factory prune --older-than with dry-run default and --confirm deletion
  - Active-status guard for non-terminal run manifests
  - Byte-preservation coverage for workspace-level refusals and evolution JSONL files
  - Codebase concern note documenting lineage ENOENT tolerance after pruning
affects: [operator-surface, phase-10-dogfood, run-retention, evolution-readers]

tech-stack:
  added: []
  patterns: [TDD command-module coverage, scoped fs.rm deletion, append-only workspace file preservation]

key-files:
  created:
    - apps/factory-cli/src/commands/prune.ts
    - apps/factory-cli/src/commands/prune.test.ts
  modified:
    - apps/factory-cli/src/main.ts
    - .planning/codebase/CONCERNS.md

key-decisions:
  - "Deletion is scoped to .protostar/runs/<runId>/ only; workspace-level .protostar/refusals.jsonl and .protostar/evolution/*.jsonl are never touched."
  - "The prune command treats orphaned manifests as protected defense-in-depth, matching Q-22's active-run safety posture."

patterns-established:
  - "Prune reports candidates/protected/deleted in canonical stdout JSON before and after confirmed deletion."
  - "Lineage readers must tolerate ENOENT for snapshot paths referenced by append-only evolution JSONL after prune."

requirements-completed: [OP-08, OP-07]

duration: 6min
completed: 2026-04-28
---

# Phase 9 Plan 10: Prune Command Summary

**`protostar-factory prune` now safely reclaims old terminal run directories while preserving active runs and append-only workspace JSONL history.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-28T19:42:52Z
- **Completed:** 2026-04-28T19:49:13Z
- **Tasks:** 1 TDD task
- **Files modified:** 4

## Accomplishments

- Added `protostar-factory prune --older-than <duration> [--dry-run] [--archetype <name>] [--confirm]`.
- Defaulted prune to dry-run; deletion only happens with explicit `--confirm`.
- Protected active/non-terminal statuses with `protected[]` rows and `active-<status>` reasons.
- Confirmed deletion removes only `.protostar/runs/<id>/` directories via `fs.rm({ recursive: true, force: true })`.
- Added tests proving `.protostar/refusals.jsonl` and `.protostar/evolution/{lineageId}.jsonl` survive byte-identical.
- Documented lineage snapshot `ENOENT` tolerance in `.planning/codebase/CONCERNS.md`.

## TDD Gate Compliance

- **RED:** `412bfa9` added prune command coverage; `pnpm --filter @protostar/factory-cli build` failed because `./prune.js` did not exist.
- **GREEN:** `a73ca42` added the command, root registration, scoped deletion, active guard, and CONCERNS.md note; package tests and root verify passed.

## Task Commits

1. **Task 1 RED: prune command tests** - `412bfa9` (test)
2. **Task 1 GREEN: prune command implementation** - `a73ca42` (feat)

## Files Created/Modified

- `apps/factory-cli/src/commands/prune.ts` - Commander prune command, duration parsing, run scanning, active guard, dry-run/default output, and confirmed deletion.
- `apps/factory-cli/src/commands/prune.test.ts` - Coverage for dry-run default, confirm deletion, malformed/missing duration, empty runs, archetype filtering, active statuses, and JSONL preservation.
- `apps/factory-cli/src/main.ts` - Registers `buildPruneCommand()`.
- `.planning/codebase/CONCERNS.md` - Documents prune's lineage JSONL caveat and required `ENOENT` tolerance.

## Verification

- `pnpm --filter @protostar/factory-cli build` - PASS.
- `pnpm --filter @protostar/factory-cli test -- --test-name-pattern '^prune'` - PASS; script ran 312 tests, including 12 prune command tests.
- Acceptance greps - PASS: buildPruneCommand=1, addCommand(buildPruneCommand)=1, parseDuration=2, listRuns=2, fs.rm=1, recursive deletion=1, refusals.jsonl comment=1, active-status reasons=2, Phase 9 Prune Note=1.
- `pnpm --filter @protostar/factory-cli test` - PASS, 312 tests.
- `pnpm run verify` - PASS.
- Manual fixture smoke: `protostar-factory prune --older-than 1h --dry-run` returned exit 0 with one terminal candidate, one `active-running` protected row, `deleted: []`, and empty stderr.

## Decisions Made

- Treated `orphaned` as protected in prune, even though v0.1 mostly derives it at status time, because it is non-terminal from an operator recovery perspective.
- Kept `--dry-run` as a documented no-op flag while using `--confirm` as the only deletion switch.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 09-11 can now lock the full public CLI surface, including `prune`, in admission-e2e/help contracts. Phase 10 dogfood has a real retention command for accumulated run directories.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/09-operator-surface-resumability/09-10-prune-command-SUMMARY.md`.
- Created files exist: `apps/factory-cli/src/commands/prune.ts` and `apps/factory-cli/src/commands/prune.test.ts`.
- Modified files contain required hooks: `buildPruneCommand()` registered in `apps/factory-cli/src/main.ts`; Phase 9 Prune Note present in `.planning/codebase/CONCERNS.md`.
- Task commits found in git history: `412bfa9`, `a73ca42`.

---
*Phase: 09-operator-surface-resumability*
*Completed: 2026-04-28*
