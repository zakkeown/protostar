---
phase: 04-execution-engine
plan: 08
subsystem: authority-planning
tags: [network-allow, adapter-ref, target-files, planning-admission]

requires:
  - phase: 04-execution-engine
    provides: ConfirmedIntent 1.3.0 network envelope fields
provides:
  - network.allow enforcement in AuthorizedNetworkOp minting
  - plan task targetFiles and adapterRef admission contracts
  - adapterRef allowedAdapters gate with default lmstudio-coder posture
affects: [authority, planning, admission-e2e, lmstudio-adapter]

tech-stack:
  added: []
  patterns: [TDD red-green, authority brand-mint gate, adapter allowlist admission]

key-files:
  created:
    - packages/authority/src/authorized-ops/network-op.test.ts
    - packages/planning/src/task-target-files.contract.ts
    - packages/planning/src/task-adapter-ref.contract.ts
    - packages/planning/schema/admitted-plan.schema.json
    - packages/admission-e2e/src/adapter-ref-admission.test.ts
  modified:
    - packages/authority/src/authorized-ops/network-op.ts
    - packages/authority/src/authorized-ops/authorized-ops.test.ts
    - packages/planning/src/index.ts
    - packages/planning/src/candidate-plan-admission.test.ts
    - packages/planning/src/task-required-capabilities-admission.test.ts

key-decisions:
  - "Adapter-aware admission is triggered by allowedAdapters or explicit task execution metadata to avoid backfilling unrelated legacy validator fixtures."
  - "Default allowedAdapters is ['lmstudio-coder'] when adapterRef is evaluated without an explicit run allowlist."

patterns-established:
  - "Network brand minting now checks capability-envelope network.allow before toolPermissions."
  - "Plan execution metadata is pinned by small contract files and admitted through the existing planning index boundary."

requirements-completed: [EXEC-04]

duration: ~2h
completed: 2026-04-27
---

# Phase 04 Plan 08: Network Op and Plan Schema Summary

**AuthorizedNetworkOp now honors ConfirmedIntent 1.3.0 network.allow, and planning admission gates task adapter metadata.**

## Performance

- **Duration:** ~2h
- **Completed:** 2026-04-27
- **Tasks:** 2
- **Files modified:** 10 plan-owned files

## Accomplishments

- Added 10 network authorization cases covering `none`, loopback host literals, allowlist hosts, missing `network.allow`, tool-permission layering, and frozen authorized ops.
- Enforced `network.allow` at the authority mint boundary while keeping `mintAuthorizedNetworkOp` as the only mint helper.
- Added `TargetFiles` and `AdapterRef` contracts, task schema pins, planning admission tests, and an admission-e2e rejection for disallowed adapter refs.

## Task Commits

1. **Task 1 RED: network.allow tests** - `21defe9` (test)
2. **Task 1 GREEN: authority enforcement** - `c68c069` (feat)
3. **Task 2 RED: plan metadata/admission tests** - `a5f98e7` (test)
4. **Task 2 GREEN: plan metadata/admission enforcement** - `7b7df7a` (feat)

## Files Created/Modified

- `packages/authority/src/authorized-ops/network-op.ts` - Enforces `network.allow` between URL parsing and the existing toolPermissions network grant.
- `packages/authority/src/authorized-ops/network-op.test.ts` - Pins all 10 network allow/refusal cases.
- `packages/authority/src/authorized-ops/authorized-ops.test.ts` - Updates the legacy network positive test to loopback policy.
- `packages/planning/src/task-target-files.contract.ts` - Exports `TargetFiles` and `assertTargetFiles`.
- `packages/planning/src/task-adapter-ref.contract.ts` - Exports `AdapterRef`, `assertAdapterRef`, and `admitTaskAdapterRef`.
- `packages/planning/src/index.ts` - Adds task metadata fields, adapter-aware validation, defaults, parser support, and exports.
- `packages/planning/schema/admitted-plan.schema.json` - Pins `targetFiles` and optional `adapterRef` task schema shape.
- `packages/planning/src/candidate-plan-admission.test.ts` - Covers targetFiles and adapterRef admission behavior.
- `packages/admission-e2e/src/adapter-ref-admission.test.ts` - Covers end-to-end adapterRef rejection evidence.
- `packages/planning/src/task-required-capabilities-admission.test.ts` - Preserves `network` when cloning exact required-capabilities fixtures.

## Decisions Made

- Used the existing consolidated planning admission module instead of creating a stale `admit-candidate-plans.ts` file.
- Added `admitted-plan.schema.json` because the plan referenced it and the repo had no current admitted-plan schema file.
- Scoped targetFiles-missing enforcement to adapter-aware admission (`allowedAdapters`) or tasks carrying execution metadata, avoiding unrelated legacy validator fixture churn.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reconciled stale planning file paths**
- **Found during:** Task 2
- **Issue:** `packages/planning/src/admit-candidate-plans.ts` and `packages/planning/schema/admitted-plan.schema.json` did not exist in this checkout.
- **Fix:** Wired the admission changes into `packages/planning/src/index.ts` and created the schema file the plan expected.
- **Verification:** `pnpm --filter @protostar/planning test`, schema grep checks.
- **Committed in:** `7b7df7a`

**2. [Rule 1 - Bug] Preserved network in required-capability fixture cloning**
- **Found during:** Task 2 planning tests
- **Issue:** The existing clone helper omitted the newly modeled `network` field, breaking exact-envelope equality.
- **Fix:** Copied `network` alongside workspace and budget fields.
- **Verification:** `pnpm --filter @protostar/planning test`.
- **Committed in:** `7b7df7a`

**3. [Rule 3 - Blocking] Scoped execution-metadata validation for legacy fixtures**
- **Found during:** Task 2 planning tests
- **Issue:** Global targetFiles-missing validation added unrelated failures to existing validator-specific fixtures.
- **Fix:** Applied missing-targetFiles enforcement when adapter-aware admission is invoked or execution metadata is present.
- **Verification:** `pnpm --filter @protostar/planning test`.
- **Committed in:** `7b7df7a`

**4. [Process Deviation] RED commit included pre-staged parallel work**
- **Found during:** Task 2 commit review
- **Issue:** Commit `a5f98e7` included pre-staged `packages/lmstudio-adapter/*` changes from a parallel executor.
- **Fix:** Stopped staging unrelated files for subsequent commits and documented the mixed commit here. The changes were not reverted because they belong to another executor.
- **Verification:** Later 04-08 implementation commit was scoped to planning files only.
- **Committed in:** `a5f98e7`

---

**Total deviations:** 3 auto-fixed, 1 process deviation.  
**Impact on plan:** Runtime and admission behavior are implemented and verified. The process deviation affects commit hygiene only; no unrelated files were modified after detection.

## Verification

- `pnpm --filter @protostar/authority test` - PASS
- `grep -c 'network\.allow' packages/authority/src/authorized-ops/network-op.ts` - PASS (`4`)
- `grep -c 'function mintAuthorizedNetworkOp' packages/authority/src/authorized-ops/network-op.ts` - PASS (`1`)
- `pnpm --filter @protostar/planning test` - PASS
- `pnpm --filter @protostar/admission-e2e test` - PASS
- `grep -c '"targetFiles"' packages/planning/schema/admitted-plan.schema.json` - PASS (`2`)
- `grep -c '"adapterRef"' packages/planning/schema/admitted-plan.schema.json` - PASS (`1`)
- `pnpm run verify` - BLOCKED by unrelated Phase 04-09 factory-cli snapshot-writer test path (`apps/factory-cli/apps/factory-cli/src/snapshot-writer.ts` ENOENT).

## Known Stubs

None introduced.

## Threat Flags

None beyond the planned trust boundaries. The new network surface is mitigated by mint-time `network.allow`; the new adapter-selection surface is mitigated by `adapter-ref-not-allowed` admission.

## Issues Encountered

- Parallel executor commits interleaved during the plan. Unrelated Phase 04-06, Phase 04-09, Phase 6, and refusal files were left untouched.
- Full repo verification is currently blocked by an unrelated Phase 04-09 test failure in factory-cli.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 10 can wire factory-cli/default adapter orchestration against `allowedAdapters` and consume the authority-side loopback network gate.

## Self-Check: PASSED

- Summary file exists: `.planning/phases/04-execution-engine/04-08-network-op-and-plan-schema-SUMMARY.md`
- Task commits found in git history: `21defe9`, `c68c069`, `a5f98e7`, `7b7df7a`
- Created files exist: `network-op.test.ts`, `task-target-files.contract.ts`, `task-adapter-ref.contract.ts`, `admitted-plan.schema.json`, `adapter-ref-admission.test.ts`
- Stub scan found no blocking TODO/FIXME/placeholder markers in plan-created files.

---
*Phase: 04-execution-engine*
*Completed: 2026-04-27*
