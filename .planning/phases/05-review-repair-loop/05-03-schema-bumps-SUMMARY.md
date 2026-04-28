---
phase: 05-review-repair-loop
plan: 03
subsystem: intent-planning-schema
tags:
  - confirmed-intent
  - schema-version
  - capability-envelope
  - planning
  - acceptance-test-refs
dependency_graph:
  requires:
    - Phase 4 confirmed-intent schema 1.3.0 envelope fields
    - Phase 2 signed intent verification helpers
  provides:
    - confirmed-intent schema 1.4.0
    - capabilityEnvelope.budget.maxRepairLoops default/range contract
    - PlanTask.acceptanceTestRefs transport field
  affects:
    - 05-04 review type contracts
    - 05-10 review-repair loop budget enforcement
    - 05-11 AC coverage admission rule
tech_stack:
  added: []
  patterns:
    - TDD red/green schema bump
    - fixture cascade audit
key_files:
  created:
    - packages/planning/src/acceptance-test-refs.test.ts
    - .planning/phases/05-review-repair-loop/05-03-schema-bumps-SUMMARY.md
  modified:
    - packages/intent/schema/confirmed-intent.schema.json
    - packages/intent/src/capability-envelope.ts
    - packages/intent/src/capability-normalization.ts
    - packages/intent/src/confirmed-intent.ts
    - packages/planning/src/index.ts
    - packages/admission-e2e/src/signed-intent-1-4-0.test.ts
    - packages/authority/src/stage-reader/factory.ts
    - packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.ts
decisions:
  - Default missing capabilityEnvelope.budget.maxRepairLoops to 3 at confirmed-intent parse/normalization time.
  - Keep PlanTask.acceptanceTestRefs optional here; plan-level AC coverage enforcement remains in 05-11.
  - Use existing dynamic signing helpers in tests instead of adding a fixture regeneration script because no static signed JSON intent fixtures exist.
metrics:
  duration: 11m55s
  completed: 2026-04-28T00:26:38Z
  tasks: 3
  files_touched: 21
requirements:
  - LOOP-04
  - LOOP-01
---

# Phase 05 Plan 03: Schema Bumps Summary

ConfirmedIntent now speaks schema `1.4.0`: repair-loop budget ownership is explicit in the capability envelope, and planning tasks can carry acceptance-test references for downstream mechanical coverage.

## What Changed

- Bumped `packages/intent/schema/confirmed-intent.schema.json` from `1.3.0` to `1.4.0`.
- Added `capabilityEnvelope.budget.maxRepairLoops` as an integer with default `3`, minimum `1`, and maximum `10`.
- Updated confirmed-intent parse and normalization paths so missing `maxRepairLoops` resolves to `3`, while `0` and `11` reject.
- Added `PlanTask.acceptanceTestRefs?: readonly PlanTaskAcceptanceTestRef[]` with `acId`, `testFile`, and `testName`, plus runtime parsing and handoff preservation.
- Cascaded confirmed-intent fixtures and tests from `1.3.0` to `1.4.0`, including signed-intent admission coverage and adapter fixtures.

## Task Results

| Task | Result | Commit |
| --- | --- | --- |
| 1 | TDD schema bump and maxRepairLoops default/range contract | `89343a3`, `4e66127` |
| 2 | TDD PlanTask acceptanceTestRefs support | `ff44bf7`, `0c00561` |
| 3 | Fixture cascade and signed-intent verification refresh | `b8952ff` |

## Verification

- `pnpm --filter @protostar/intent test` passed.
- `pnpm --filter @protostar/planning test` passed.
- `pnpm --filter @protostar/authority test` passed.
- `pnpm --filter @protostar/admission-e2e test` passed.
- `pnpm --filter @protostar/lmstudio-adapter test` passed with loopback permissions; sandbox-only run failed on `listen EPERM: operation not permitted 127.0.0.1`.
- `pnpm run verify:full` passed with loopback permissions.
- `pnpm run factory` built, then stopped at the expected workspace-trust gate.
- Stale schema audit: no actual `schemaVersion: "1.2.0"` or `schemaVersion: "1.3.0"` fields remain under `packages/`, `examples/`, or `apps/` outside `dist`/`node_modules`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated shared intent examples during Task 1**
- **Found during:** Task 1
- **Issue:** The intent package tests load shared `examples/intents` fixtures, so stale `1.3.0` examples blocked the Task 1 package test before the Task 3 cascade.
- **Fix:** Updated the affected examples to schema `1.4.0` with `maxRepairLoops: 3`.
- **Files modified:** `examples/intents/bad/missing-capability.json`, `examples/intents/scaffold.json`
- **Commit:** `4e66127`

**2. [Rule 3 - Blocking] Removed stale generated admission-e2e dist test**
- **Found during:** Task 3
- **Issue:** After renaming the signed-intent test from `1-3-0` to `1-4-0`, the package test runner still picked up the obsolete generated `dist` test file.
- **Fix:** Removed the generated `packages/admission-e2e/dist/signed-intent-1-3-0.test.js` output and reran admission-e2e verification.
- **Files modified:** generated `dist` only, not committed
- **Commit:** n/a

## Auth Gates

None.

## Known Stubs

None found in files created or modified by this plan.

## Threat Flags

None. This plan changed schema/type contracts and fixtures only; it introduced no new network endpoints, auth paths, file access paths, or trust-boundary storage.

## Follow-On Notes

- Plan 05-04 can read `maxRepairLoops` from the resolved confirmed-intent envelope when defining review-loop contracts.
- Plan 05-11 still owns plan-level AC coverage admission; `acceptanceTestRefs` is only transported here.

## Self-Check: PASSED

- Found summary file: `.planning/phases/05-review-repair-loop/05-03-schema-bumps-SUMMARY.md`
- Found task commits: `89343a3`, `4e66127`, `ff44bf7`, `0c00561`, `b8952ff`
- Planning state updates are present in `.planning/STATE.md`, `.planning/ROADMAP.md`, and `.planning/REQUIREMENTS.md`
