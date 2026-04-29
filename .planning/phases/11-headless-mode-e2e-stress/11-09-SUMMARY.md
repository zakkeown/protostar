---
phase: 11-headless-mode-e2e-stress
plan: 09
subsystem: factory-cli
tags: [stress, headless, events-jsonl, prune, seed-materialization]

requires:
  - phase: 11-headless-mode-e2e-stress
    provides: "LLM backend selection, canonical stress artifact schemas, and seed library inputs"
provides:
  - "Shared .protostar/stress/<sessionId> session core"
  - "Hidden __stress-step support command for stress drivers"
  - "Stress seed selection, draft materialization, and confirmed-intent signing helpers"
  - "Stress cap resolver, cap-breach evidence, and wedge evidence writers"
  - "Prune protection and deletion support for terminal stress sessions"
affects: [11-10, 11-11, 11-13, 11-14, factory-cli, admission-e2e]

tech-stack:
  added: []
  patterns:
    - "Stress artifacts are written under .protostar/stress/<sessionId>/ with temp-file atomic writes for reports/evidence and append-mode datasync for events.jsonl."
    - "Stress drivers prepare inputs through materialized intent.draft.json and confirmed-intent.json files before invoking factory run."
    - "Caps resolve CLI > factory.stress.caps config > Q-03 defaults and write one structured phase-11-cap-breach.json artifact."

key-files:
  created:
    - apps/factory-cli/src/stress/stress-session.ts
    - apps/factory-cli/src/stress/stress-session.test.ts
    - apps/factory-cli/src/stress/seed-materialization.ts
    - apps/factory-cli/src/stress/seed-materialization.test.ts
    - apps/factory-cli/src/stress/stress-caps.ts
    - apps/factory-cli/src/stress/stress-caps.test.ts
    - apps/factory-cli/src/stress/wedge-detection.ts
    - apps/factory-cli/src/stress/wedge-detection.test.ts
    - apps/factory-cli/src/commands/__stress-step.ts
    - apps/factory-cli/src/commands/__stress-step.test.ts
  modified:
    - apps/factory-cli/src/main.ts
    - apps/factory-cli/src/commands/prune.ts
    - apps/factory-cli/src/commands/prune.test.ts
    - docs/cli/prune.txt
    - packages/admission-e2e/src/fixtures/help/prune-help.txt

key-decisions:
  - "Kept stress-session filesystem authority inside factory-cli instead of moving it to a pure package."
  - "Reused the existing promoteIntentDraft, buildSignatureEnvelope, and promoteAndSignIntent path so stress signing is not a second algorithm."
  - "Extended prune to stress sessions with active-session protection instead of adding a separate cleanup command."

patterns-established:
  - "Stress drivers should call __stress-step for session begin, seed selection, draft/sign input prep, run recording, cap breach, wedge evidence, and finalization."
  - "Active stress sessions are protected during prune with the active-stress-session reason."

requirements-completed: [STRESS-11]

duration: 42min
completed: 2026-04-29
---

# Phase 11 Plan 09: Stress Session Core Summary

**Shared factory-cli stress session core for durable evidence, seed input preparation, cap enforcement, wedge evidence, and prune safety**

## Performance

- **Duration:** 42 min
- **Completed:** 2026-04-29
- **Tasks:** 3
- **Files modified:** 15 implementation, test, docs, and fixture files

## Accomplishments

- Added a stress session library that confines writes to `.protostar/stress/<sessionId>/`, writes canonical reports atomically, appends durable `events.jsonl` lines, and records cap/wedge evidence.
- Added shared stress seed materialization and signing helpers so later stress drivers can produce `intent.draft.json` and `confirmed-intent.json` through the existing intent/signature path.
- Added `resolveStressCaps`, cap-breach detection, Q-03 defaults for sustained-load/concurrency/fault/TTT shapes, and structured `phase-11-cap-breach.json` output.
- Added the hidden `protostar-factory __stress-step` support command with JSON actions for driver orchestration.
- Extended `prune` to scan, protect, dry-run report, and confirmed-delete terminal stress sessions while preserving active sessions.

## Task Commits

Each implementation task was committed atomically:

1. **Task 1: Pin stress session path confinement and append behavior** - `7f3e61e` (test)
2. **Task 2: Implement stress session library and hidden support command** - `36061a0` (feat)
3. **Task 3: Extend prune scope to stress sessions** - `ca883b2` (feat)

**Plan metadata:** summary, ROADMAP/STATE tracking, and prune help snapshot refresh are recorded in the final docs commit after this summary.

## Files Created/Modified

- `apps/factory-cli/src/stress/stress-session.ts` - Resolves stress session paths, begins sessions, appends events, records runs, writes reports, and writes cap/wedge evidence.
- `apps/factory-cli/src/stress/seed-materialization.ts` - Selects stress seeds, materializes draft inputs, signs confirmed intents, and returns prepared run input metadata.
- `apps/factory-cli/src/stress/stress-caps.ts` - Defines Q-03 defaults plus cap resolution and breach detection for sustained-load, concurrency, fault-injection, and TTT delivery shapes.
- `apps/factory-cli/src/stress/wedge-detection.ts` - Detects no-transition wedges using the `> 5 * p95SuccessfulDurationMs` rule and cancel/terminal guards.
- `apps/factory-cli/src/commands/__stress-step.ts` and `apps/factory-cli/src/main.ts` - Add the hidden driver support command.
- `apps/factory-cli/src/commands/prune.ts` - Adds stress-session scan, active protection, dry-run hash evidence, and confirmed deletion.
- `docs/cli/prune.txt` and `packages/admission-e2e/src/fixtures/help/prune-help.txt` - Refresh prune help text for the new stress scope.

## Decisions Made

- Kept `events.jsonl` append-only behavior separate from report/cursor/evidence atomic rewrites so driver evidence can be tailed and preserved under concurrent writes.
- Treated `__stress-step` as a driver integration seam, not an operator-facing command; help/errors stay on stderr and structured output is gated behind `--json`.
- Preserved the existing intent promotion/signing path for stress inputs, reducing the chance that stress and dogfood runs diverge in authority semantics.
- Made prune stress support part of the normal dry-run/confirm safety model so cleanup does not become a separate authority path.

## Deviations from Plan

### Auto-fixed Issues

**1. Refreshed prune help snapshots after stress scope landed**
- **Found during:** Admission-e2e verification after prune extension.
- **Issue:** The committed prune help snapshots still listed only `.protostar/runs/<id>/` and `.protostar/dogfood/<sessionId>/` removal scopes.
- **Fix:** Updated `docs/cli/prune.txt` and the admission-e2e `prune-help.txt` fixture to include `.protostar/stress/<sessionId>/`.
- **Verification:** `pnpm --filter @protostar/admission-e2e test` passed after the fixture refresh.

---

**Total deviations:** 1 auto-fixed
**Impact on plan:** Required to keep CLI snapshot contracts aligned with the planned prune scope; no extra product surface added.

## Issues Encountered

- `gsd-sdk query` is unavailable in this checkout, so execution used deterministic local inspection and manual STATE/ROADMAP/REQUIREMENTS updates.
- A stale workspace link for `@protostar/paths` blocked one full verify run; `pnpm install` refreshed the link with no tracked file changes.
- One full verify attempt saw transient factory-cli real-execution failures from stale build state; the focused factory-cli suite passed after rerun.
- Admission-e2e snapshot drift exposed the missing prune help refresh described above.
- Full verify initially let Knip scan an untracked local `.claude/worktrees/` agent checkout; a separate hygiene commit now ignores local agent worktrees in git status and Knip.

## Known Stubs

None introduced. This plan added the shared core and hidden support command consumed by later stress-driver plans; it did not execute real sustained-load, concurrency, fault, or TTT delivery sessions.

## Threat Flags

No unresolved threat flags. The plan mitigated the registered stress evidence threats with append-mode datasync, structured cap/wedge evidence, and active stress-session prune protection.

## Verification

- `pnpm --filter @protostar/factory-cli test -- --test-name-pattern "stress|prune"` passed.
- `pnpm --filter @protostar/factory-cli test` passed.
- `pnpm --filter @protostar/admission-e2e test` passed after the prune help refresh.
- `rg -n "__stress-step|next-seed|materialize-draft|sign-intent|resolveStressCaps|ttt-delivery|factory\\.stress\\.caps|events\\.jsonl|phase-11-cap-breach\\.json|wedge-evidence\\.json" apps/factory-cli/src` found implementation and tests.
- `rg -n "promoteAndSignIntent|buildSignatureEnvelope" apps/factory-cli/src/stress/seed-materialization.ts apps/factory-cli/src/commands/__stress-step.ts` proved signing is wired through the existing intent/signature path.
- `git diff --check` passed before commit.
- `pnpm run verify` passed after the final docs/snapshot refresh.

## User Setup Required

None for the shared core. Later stress-driver plans still need to invoke the hidden support command and generate real stress evidence.

## Next Phase Readiness

Plan 11-10 can use `__stress-step` and the stress session helpers for sustained-load evidence. Plan 11-11 can use the same core for concurrency/fault stress evidence. Plan 11-14 can consume the TTT delivery cap shape and the same draft/sign/run-input preparation path for final gate evidence.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/11-headless-mode-e2e-stress/11-09-SUMMARY.md`.
- Required created implementation and test files exist.
- Task commits exist: `7f3e61e`, `36061a0`, `ca883b2`.
- Requirement IDs from the plan frontmatter are recorded: `STRESS-11`.

---
*Phase: 11-headless-mode-e2e-stress*
*Completed: 2026-04-29*
