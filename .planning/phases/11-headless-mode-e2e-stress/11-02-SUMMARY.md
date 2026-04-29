---
phase: 11-headless-mode-e2e-stress
plan: 02
subsystem: intent
tags: [archetypes, admission, capability-envelope, repair-loop-caps, stress]

# Dependency graph
requires:
  - phase: 11-headless-mode-e2e-stress
    provides: STRESS-01 traceability and accepted Phase 11 plan graph
provides:
  - Wired feature-add, bugfix, and refactor intent admission archetypes
  - Exact Phase 11 repair-loop caps: feature-add 9, bugfix 5, refactor 5
  - Factory-scaffold remains blocked while its policy row is a stub
  - Phase 11 archetype lift lock revision in PROJECT.md
affects: [phase-11-headless-mode-e2e-stress, intent-admission, admission-e2e, factory-cli, seed-library]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Grant-producing archetype admission functions backed by the shared capability-envelope normalization path
    - Generic known-archetype stub blocker for unwired policy rows

key-files:
  created:
    - .planning/phases/11-headless-mode-e2e-stress/11-02-SUMMARY.md
  modified:
    - examples/intents/feature-add.draft.json
    - examples/intents/bugfix.draft.json
    - examples/intents/refactor.draft.json
    - packages/intent/src/archetypes.ts
    - packages/intent/src/admission-paths.ts
    - packages/intent/src/capability-admission.ts
    - packages/intent/src/promote-intent-draft.ts
    - packages/intent/src/admission-control.test.ts
    - packages/admission-e2e/src/parameterized-admission.test.ts
    - apps/factory-cli/src/main.test.ts
    - .planning/PROJECT.md
    - .planning/STATE.md
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Feature-add, bugfix, and refactor now use the same normalized grant path as cosmetic-tweak instead of unsupported decisions."
  - "Factory-scaffold remains out of scope and is guarded by a generic stub-row blocker."
  - "Phase 10 cosmetic-tweak behavior and fixtures remain unchanged."

patterns-established:
  - "Wired archetypes expose a typed grant function with a stable policy-admission source literal."
  - "Known stub policy rows must hard-block before ConfirmedIntent creation."
  - "Factory CLI archetype coverage uses trusted two-key launch fixtures when asserting successful non-cosmetic runs."

requirements-completed: [STRESS-02]

# Metrics
duration: 25min
completed: 2026-04-29
---

# Phase 11 Plan 02: Archetype Admission Lift Summary

**Feature-add, bugfix, and refactor now produce narrow capability grants with Phase 11 repair-loop caps while factory-scaffold stays blocked.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-04-29T15:58:06Z
- **Completed:** 2026-04-29T16:23:23Z
- **Tasks:** 3
- **Files modified:** 20

## Accomplishments

- Lifted `feature-add`, `bugfix`, and `refactor` from unsupported/stubbed rows to wired admission archetypes.
- Added grant functions with stable `feature-add-policy-admission`, `bugfix-policy-admission`, and `refactor-policy-admission` source literals.
- Pinned exact caps in tests: feature-add `maxRepairLoops <= 9`, bugfix/refactor `<= 5`, and cosmetic-tweak still `<= 1`.
- Updated example intent fixtures and admission-e2e coverage so all three non-cosmetic fixtures admit without `unsupported-goal-archetype`.
- Recorded the dated Phase 11 archetype lift lock in `.planning/PROJECT.md`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pin non-cosmetic admission behavior before implementation** - `9367655` (test)
2. **Task 2: Wire feature-add, bugfix, and refactor admission paths** - `37f9841` (feat)
3. **Task 3: Record the Phase 11 archetype lift lock revision** - `1e5c59f` (docs)
4. **Auto-fix: Keep factory-scaffold blocked as stubbed** - `76ba5f4` (fix)

## Files Created/Modified

- `examples/intents/feature-add.draft.json` - Updates fixture expectations for wired admission and cap 9.
- `examples/intents/bugfix.draft.json` - Updates fixture expectations for wired admission and cap 5.
- `examples/intents/refactor.draft.json` - Updates fixture expectations for wired admission and cap 5.
- `packages/intent/src/archetypes.ts` - Wires the three policy rows and registry entries while leaving `factory-scaffold` stubbed.
- `packages/intent/src/admission-paths.ts` - Converts non-cosmetic admission paths from unconditional unsupported findings to wired/stub-aware behavior.
- `packages/intent/src/capability-admission.ts` - Adds non-cosmetic grant functions and the stub-row blocker.
- `packages/intent/src/promote-intent-draft.ts` - Routes promoted non-cosmetic drafts through their grant functions.
- `packages/intent/src/admission/index.ts` and `packages/intent/src/index.ts` - Expose the new admission functions and result types.
- `packages/intent/src/promotion-contracts.ts` - Adds typed grant result contracts for the wired archetypes.
- `packages/intent/src/admission-control.test.ts` - Pins policy rows, grants, promotions, and `factory-scaffold` blocking.
- `packages/intent/src/archetype-intent-fixtures.test.ts` - Pins example fixture admission outcomes.
- `packages/intent/src/capability-envelope-repair-loop-count.test.ts` - Pins cap acceptance/refusal edges.
- `packages/admission-e2e/src/parameterized-admission.test.ts` - Proves feature-add, bugfix, and refactor no longer emit unsupported findings.
- `apps/factory-cli/src/main.test.ts` - Updates CLI admission coverage for supported non-cosmetic drafts and the remaining factory-scaffold block path.
- `.planning/PROJECT.md` - Records the Phase 11 archetype lift lock revision.
- `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md` - Mark `11-02` and `STRESS-02` complete and update the next Wave 1 action.

## Decisions Made

- Reused the existing capability-envelope normalization and validation pipeline for all three newly wired archetypes.
- Kept `factory-scaffold` out of scope and explicitly blocked while its policy row remains a stub.
- Preserved the cosmetic-tweak cap and Phase 10 fixture expectations unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added a generic stub-row blocker for factory-scaffold**
- **Found during:** Plan-level verification after Task 2.
- **Issue:** Once feature-add, bugfix, and refactor were wired, the remaining known `factory-scaffold` stub row needed an explicit generic blocker to guarantee it could not produce a ConfirmedIntent before a future wiring plan.
- **Fix:** Added `stubGoalArchetypeAdmissionPathFindings`, threaded it into capability admission, pinned intent admission tests, and updated factory CLI coverage to use `factory-scaffold` for the policy-block case.
- **Files modified:** `packages/intent/src/admission-paths.ts`, `packages/intent/src/capability-admission.ts`, `packages/intent/src/admission-control.test.ts`, `apps/factory-cli/src/main.test.ts`
- **Verification:** `pnpm --filter @protostar/intent test`, `pnpm --filter @protostar/factory-cli test`, `pnpm --filter @protostar/admission-e2e test`, `pnpm run verify`
- **Committed in:** `76ba5f4`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** The auto-fix preserves the plan's stated boundary that `factory-scaffold` remains unsupported/stubbed. No scope expansion.

## Issues Encountered

- `gsd-sdk query` was unavailable in this checkout as expected from the runtime note; execution used local files and deterministic inspection.
- The first full factory CLI run still expected feature-add/refactor/bugfix to be unsupported. Tests were updated to assert wired admission through a trusted two-key launch path.
- `pnpm run factory` builds successfully and then exits `2` at the expected workspace-trust gate for the default untrusted sample run.

## Known Stubs

- `packages/intent/src/archetypes.ts:412` - `factory-scaffold` intentionally remains `status: "stub"` and out of scope for this plan.
- `packages/intent/src/archetypes.ts:465` - `factory-scaffold` still uses placeholder admission limits reserved for a later policy wiring pass.
- `packages/intent/src/admission-paths.ts:242`, `:262`, `:282` - Existing unsupported-decision payload shapes still describe stub rows for custom policy tables and backward-compatible failure evidence.
- `packages/intent/src/promotion-contracts.ts:307`, `:341`, `:375` - Stub union types remain part of the typed unsupported decision contract.
- `apps/factory-cli/src/main.test.ts:3301` and `packages/intent/src/admission-control.test.ts:1317` - Test fixtures assert the intentional `factory-scaffold` stub boundary.
- `.planning/PROJECT.md:85` - Pre-existing semantic/consensus evaluation stub note remains unrelated to this plan.

## Threat Flags

None. This plan changed the draft-intent-to-capability-grant trust boundary already identified in the plan threat model; no new network endpoints, filesystem authority, schema files, or auth paths were introduced.

## Verification

- `pnpm --filter @protostar/intent test`
- `pnpm --filter @protostar/factory-cli test`
- `pnpm --filter @protostar/admission-e2e test`
- `pnpm run verify`
- `pnpm run factory` — build passed; run halted at the expected workspace-trust gate for the untrusted sample command.
- `git diff --check`

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`STRESS-02` is ready for downstream Phase 11 plans. `11-03` can now create the per-archetype seed library and TTT feature seed against a real feature-add admission path; `11-12` can build feature-add package-add authority on top of the wired caps.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/11-headless-mode-e2e-stress/11-02-SUMMARY.md`.
- Task commit `9367655` exists in git history.
- Task commit `37f9841` exists in git history.
- Task commit `1e5c59f` exists in git history.
- Auto-fix commit `76ba5f4` exists in git history.

---
*Phase: 11-headless-mode-e2e-stress*
*Completed: 2026-04-29*
