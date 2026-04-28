---
phase: 07-delivery
plan: 11
subsystem: delivery
tags: [factory-cli, github-pr, ci-capture, tdd, delivery-result]

requires:
  - phase: 07-delivery
    provides: Delivery composers, delivery-runtime executeDelivery, preflight wiring
provides:
  - Factory CLI delivery body assembly with spillover comments
  - CI polling driver with fsynced JSONL events and atomic delivery-result updates
  - Main factory-cli delivery execution wiring after full preflight
affects: [phase-07-delivery, phase-09-operator-surface-resumability, factory-cli]

tech-stack:
  added: []
  patterns: [tmp-rename JSON artifacts, append-fsync JSONL, local TDD module seams]

key-files:
  created:
    - apps/factory-cli/src/assemble-delivery-body.ts
    - apps/factory-cli/src/assemble-delivery-body.test.ts
    - apps/factory-cli/src/poll-ci-driver.ts
    - apps/factory-cli/src/poll-ci-driver.test.ts
    - apps/factory-cli/src/execute-delivery-wiring.ts
    - apps/factory-cli/src/execute-delivery-wiring.test.ts
  modified:
    - apps/factory-cli/src/main.ts

key-decisions:
  - "Kept all filesystem persistence in factory-cli; delivery-runtime remains network-only."
  - "Used dependency injection for executeDelivery/pollCiStatus so wiring tests stay local and deterministic."
  - "Main.ts now delegates delivery execution to a local wireExecuteDelivery seam after 07-10 full preflight."

patterns-established:
  - "Delivery artifacts use delivery-result.json tmp+rename and ci-events.jsonl append+fsync."
  - "Oversized PR body sections are summarized in-body and moved to evidence comments."

requirements-completed: [DELIVER-01, DELIVER-03, DELIVER-04, DELIVER-05, DELIVER-06]

duration: ~2h
completed: 2026-04-28
---

# Phase 7 Plan 11: Factory CLI Execute Delivery Wiring Summary

**Factory CLI now builds the delivery body, executes the GitHub PR delivery path, and persists mutable CI capture artifacts.**

## Performance

- **Duration:** ~2h
- **Completed:** 2026-04-28T15:22:37Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added `assembleDeliveryBody`, ordering the delivery composers and handling oversized body spillover with validated evidence comments.
- Added `drivePollCiStatus`, which persists each CI snapshot to fsynced JSONL and atomically rewrites `delivery-result.json`.
- Added `wireExecuteDelivery` and replaced the 07-11 `main.ts` marker with the post-preflight delivery path.

## Task Commits

1. **Task 1 RED:** `ff5351b` test(07-11): add failing assemble delivery body tests
2. **Task 1 GREEN:** `5dfd783` feat(07-11): implement delivery body assembly
3. **Task 2 RED:** `edc79cd` test(07-11): add failing CI poll driver tests
4. **Task 2 GREEN:** `481198f` feat(07-11): implement CI poll persistence driver
5. **Task 3 RED:** `86840f2` test(07-11): add failing execute delivery wiring tests
6. **Task 3 GREEN:** `8dfee31` feat(07-11): wire factory CLI delivery execution

## Files Created/Modified

- `apps/factory-cli/src/assemble-delivery-body.ts` - PR body assembly, validation, evidence comment generation, and spillover handling.
- `apps/factory-cli/src/poll-ci-driver.ts` - CI polling persistence driver and atomic JSON writer.
- `apps/factory-cli/src/execute-delivery-wiring.ts` - Delivery plan minting, executeDelivery invocation, initial result persistence, event writes, and poll handoff.
- `apps/factory-cli/src/main.ts` - Replaced the Plan 07-11 delivery FIXME with `wireExecuteDelivery`.
- `apps/factory-cli/src/*.test.ts` - TDD tests for all three new modules.

## Decisions Made

- Used local factory-cli modules rather than adding package exports; these are orchestration details, not domain contracts.
- Reused `validatePrBody`, `validateBranchName`, and `validatePrTitle` as the brand-mint boundary before crossing into delivery-runtime.
- Kept CI polling synchronous inside `wireExecuteDelivery` for this plan; Phase 9 can resume or expose capture commands over the same artifact shape.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adjusted spillover behavior to keep overflow comments valid**
- **Found during:** Task 1
- **Issue:** A combined overflow comment can exceed the same 60,000-byte PR body cap even when individual standard comments fit.
- **Fix:** Capped the extra `oversized-body-overflow` comment with a deterministic truncation note after the three standard full-detail comments are emitted.
- **Files modified:** `apps/factory-cli/src/assemble-delivery-body.ts`
- **Verification:** `pnpm --filter @protostar/factory-cli test -- --run assemble-delivery-body`
- **Committed in:** `5dfd783`

**2. [Rule 3 - Blocking] Preserved user ownership constraints for state docs**
- **Found during:** Summary/state step
- **Issue:** The generic execute-plan workflow would update `.planning/STATE.md` and `.planning/ROADMAP.md`, but the user explicitly forbade touching those files.
- **Fix:** Created this SUMMARY only and skipped state/roadmap mutation.
- **Files modified:** `.planning/phases/07-delivery/07-11-factory-cli-execute-delivery-wiring-SUMMARY.md`
- **Verification:** `git status --short` shows no `.planning/STATE.md` or `.planning/ROADMAP.md` changes.
- **Committed in:** metadata commit pending

---

**Total deviations:** 2 auto-handled
**Impact on plan:** Delivery wiring is complete; state bookkeeping intentionally deferred per user ownership.

## Known Stubs

- `apps/factory-cli/src/main.ts` uses `critiques: []` and `iterations: []` when building `bodyInput`. The current `ReviewRepairLoopResult` exposed at this call site contains approval metadata but not the detailed judge transcript or repair-iteration records. The assembler and delivery comments support those details once the review loop exposes them.

## Threat Flags

None - new filesystem writes are confined to `apps/factory-cli`, which is the allowed filesystem authority tier.

## Issues Encountered

- `main.ts` did not expose the detailed review records assumed by the plan. The integration wires the available review gate findings and live artifact list now, with empty-state judge/repair sections rather than reaching into private review-loop internals.
- `pnpm run factory` exits 2 at the workspace-trust gate, as expected for the current project trust model.

## Verification

- `pnpm --filter @protostar/factory-cli test -- --run assemble-delivery-body` - passed
- `pnpm --filter @protostar/factory-cli test -- --run poll-ci-driver` - passed
- `pnpm --filter @protostar/factory-cli test -- --run execute-delivery-wiring` - passed
- `pnpm --filter @protostar/factory-cli test` - passed
- `pnpm --filter @protostar/factory-cli build` - passed
- `pnpm run verify` - passed
- `pnpm run factory` - built, then exited 2 at expected workspace-trust gate

## User Setup Required

None for this plan. Live delivery still requires the existing `PROTOSTAR_GITHUB_TOKEN` preflight path.

## Next Phase Readiness

Phase 7 executable delivery wiring is in place. Phase 9 can build on `delivery-result.json` and `ci-events.jsonl` for resumable inspect/capture flows.

## Self-Check: PASSED

- Found created modules and this SUMMARY on disk.
- Found task commits: `ff5351b`, `5dfd783`, `edc79cd`, `481198f`, `86840f2`, `8dfee31`.
- Confirmed `.planning/STATE.md` and `.planning/ROADMAP.md` were not modified.

---
*Phase: 07-delivery*
*Completed: 2026-04-28*
