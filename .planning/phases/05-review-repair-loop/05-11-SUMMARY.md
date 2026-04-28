---
phase: 05-review-repair-loop
plan: 11
subsystem: planning-admission
tags:
  - acceptance-test-refs
  - plan-admission
  - ac-coverage
  - admission-e2e
requires:
  - phase: 05-review-repair-loop
    provides: PlanTask.acceptanceTestRefs from 05-03
provides:
  - Universal planning admission gate for acceptanceTestRefs AC coverage
  - no-plan-admitted reason ac-coverage-incomplete with missingAcIds
  - Passing planning fixture acceptanceTestRefs cascade
  - Bad fixture for incomplete acceptanceTestRefs coverage
affects:
  - 05-07 mechanical AC runtime verification
  - 05-10 review-repair loop
  - 05-12 factory-cli wiring
tech-stack:
  added: []
  patterns:
    - Structural AC coverage by task.acceptanceTestRefs union
    - Rejection artifact detail fields for rule-specific missing ids
key-files:
  created:
    - packages/planning/src/admission-acceptance-test-refs-coverage.test.ts
    - examples/planning-results/bad/bad-ac-coverage-incomplete.json
    - .planning/phases/05-review-repair-loop/deferred-items.md
  modified:
    - packages/planning/src/index.ts
    - packages/planning/src/admitted-plan-handoff.test.ts
    - packages/planning/src/dogpile-candidate-plan-parsing.test.ts
    - examples/planning-results/scaffold.json
key-decisions:
  - "Implemented the AC coverage gate at @protostar/planning, where candidate-plan admission and no-plan-admitted artifacts actually live."
  - "Run acceptanceTestRefs coverage after earlier validators and skip it when prior structural validation already failed, preserving original rejection taxonomy."
  - "Programmatic createPlanGraph callers synthesize acceptanceTestRefs from covers; raw parsed/defined candidate plans still reject when refs are incomplete."
patterns-established:
  - "Admission rule: every confirmed-intent AC id must appear in the union of task.acceptanceTestRefs[].acId."
  - "Rejection artifact: details.failure.reason = ac-coverage-incomplete and details.failure.missingAcIds lists the missing ids."
requirements-completed:
  - LOOP-01
duration: 8m52s
completed: 2026-04-28
---

# Phase 05 Plan 11: Admission Rule AC Coverage Summary

Structural planning admission now rejects candidate plans whose task `acceptanceTestRefs` do not cover every confirmed-intent acceptance criterion.

## Performance

- **Duration:** 8m52s
- **Started:** 2026-04-28T00:58:12Z
- **Completed:** 2026-04-28T01:06:44Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added `ac-coverage-incomplete` as the final planning admission validator for structurally valid candidate plans.
- Serialized `reason: "ac-coverage-incomplete"` plus `missingAcIds` into no-plan-admitted artifacts.
- Added six focused coverage tests for full coverage, one missing AC, no refs, redundant refs, zero declared ACs, and artifact shape.
- Updated the passing scaffold planning fixture and inline Dogpile admission fixture with explicit `acceptanceTestRefs`.
- Added `examples/planning-results/bad/bad-ac-coverage-incomplete.json` to exercise the new rejection path through admission-e2e.

## Task Commits

1. **Task 1: Add ac-coverage-incomplete admission rule** - `c2af944` (feat)
2. **Task 2: Cascade passing fixtures with acceptanceTestRefs** - `9394df0` (test)

## Files Created/Modified

- `packages/planning/src/index.ts` - Added the validator, coverage helper, rejection code, and artifact `missingAcIds` detail.
- `packages/planning/src/admission-acceptance-test-refs-coverage.test.ts` - Covers the six required rule behaviors.
- `packages/planning/src/admitted-plan-handoff.test.ts` - Updated expected handoff artifact to include task acceptance test refs.
- `packages/planning/src/dogpile-candidate-plan-parsing.test.ts` - Added refs to the passing inline Dogpile planning fixture.
- `examples/planning-results/scaffold.json` - Added refs to the passing planning fixture.
- `examples/planning-results/bad/bad-ac-coverage-incomplete.json` - New structurally valid bad fixture with incomplete AC ref coverage.
- `.planning/phases/05-review-repair-loop/deferred-items.md` - Records out-of-scope factory-cli fixture follow-up.

## Decisions Made

- The plan named `packages/policy/src/admission.ts`, but that file only authorizes factory start. The real candidate-plan admission boundary lives in `packages/planning/src/index.ts`, so implementation landed there.
- Existing structural validation failures keep their original reason taxonomy. The new gate runs last and only when earlier validators have not already failed.
- `createPlanGraph` now synthesizes acceptanceTestRefs from task coverage for programmatic plan construction; raw parsed/defined candidate plans still enforce explicit refs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Routed admission rule to planning package**
- **Found during:** Task 1
- **Issue:** The plan targeted `packages/policy/src/admission.ts`, but candidate-plan admission and no-plan-admitted artifacts are owned by `@protostar/planning`.
- **Fix:** Implemented the validator and artifact fields in `packages/planning/src/index.ts`; verified `@protostar/policy` still passes.
- **Files modified:** `packages/planning/src/index.ts`
- **Verification:** `pnpm --filter @protostar/policy test`; `pnpm --filter @protostar/planning test`
- **Committed in:** `c2af944`

**2. [Rule 3 - Blocking] Preserved existing rejection taxonomy**
- **Found during:** Task 1
- **Issue:** Running the new gate on already-invalid plans added extra rejection reasons to older structural tests.
- **Fix:** The acceptanceTestRefs gate is the final validator and skips when earlier validators already found defects.
- **Files modified:** `packages/planning/src/index.ts`
- **Verification:** `pnpm --filter @protostar/planning test`
- **Committed in:** `c2af944`

---

**Total deviations:** 2 auto-fixed (2 blocking).  
**Impact on plan:** Kept the new rule at the correct authority boundary without widening package ownership.

## Issues Encountered

- `pnpm run verify:full` passes typecheck and the scoped planning/admission-e2e work, but fails in `apps/factory-cli` because inline/generated planning fixtures lack `acceptanceTestRefs`. The user explicitly scoped this worker away from factory-cli edits, so the follow-up is logged in `deferred-items.md`.
- A sandbox-only `verify:full` run also hit the known loopback `listen EPERM` failure in lmstudio-adapter tests; rerunning with loopback permission progressed beyond that point.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None found in files created or modified by this plan.

## Threat Flags

None. This plan adds structural admission validation and fixtures only; it introduces no new network endpoints, auth paths, file access paths, or schema trust-boundary storage.

## Verification

- `grep -c 'ac-coverage-incomplete' packages/planning/src/index.ts` → 5
- `grep -c 'acceptanceTestRefs' packages/planning/src/index.ts` → 14
- `grep -c 'missingAcIds' packages/planning/src/index.ts` → 9
- `pnpm --filter @protostar/policy test` passed.
- `pnpm --filter @protostar/planning test` passed.
- `pnpm --filter @protostar/admission-e2e test` passed.
- Top-level passing planning fixtures contain `acceptanceTestRefs`.
- `examples/planning-results/bad/bad-ac-coverage-incomplete.json` exists and is covered by admission-e2e.
- `pnpm run verify:full` failed on out-of-scope factory-cli inline fixture refs; see `deferred-items.md`.

## Next Phase Readiness

Plan 05-07 can verify declared refs at runtime via diff and stdout matching. Plan 05-12 or a factory-cli fixture follow-up must update app-level inline planning fixtures before repo-wide `verify:full` can be green under the universal rule.

## Self-Check: PASSED

- Found summary file: `.planning/phases/05-review-repair-loop/05-11-SUMMARY.md`
- Found task commits: `c2af944`, `9394df0`
- Found created files: `packages/planning/src/admission-acceptance-test-refs-coverage.test.ts`, `examples/planning-results/bad/bad-ac-coverage-incomplete.json`
- Planning state updates are present in `.planning/STATE.md`, `.planning/ROADMAP.md`, and `.planning/REQUIREMENTS.md`

---
*Phase: 05-review-repair-loop*
*Completed: 2026-04-28*
