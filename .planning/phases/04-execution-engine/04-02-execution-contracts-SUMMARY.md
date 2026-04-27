---
phase: 04-execution-engine
plan: 02
subsystem: execution
tags: [execution, adapter-contract, journal, node-test, types]

requires:
  - phase: 04-execution-engine
    provides: EXEC-01 lifecycle vocabulary from Plan 04-01
provides:
  - "ExecutionAdapter streaming AsyncIterable contract"
  - "AdapterEvent and AdapterResult discriminated unions"
  - "TaskJournalEvent and ExecutionSnapshot type contracts"
affects: [phase-04-wave-1, lmstudio-adapter, phase-05-review, phase-09-inspect]

tech-stack:
  added: []
  patterns:
    - "node:test compiled dist contract tests"
    - "exhaustive never-switch pins for discriminated unions"

key-files:
  created:
    - packages/execution/src/adapter-contract.ts
    - packages/execution/src/adapter-contract.test.ts
    - packages/execution/src/journal-types.ts
    - packages/execution/src/journal-types.test.ts
  modified:
    - packages/execution/src/index.ts

key-decisions:
  - "AdapterContext exposes typed budget/network views before the capability-envelope schema bump lands."
  - "Journal contracts export schema-version constants while keeping persistence I/O out of the execution package."

patterns-established:
  - "Execution adapters stream token/tool/progress events and terminate with exactly one final result event."
  - "Task journal consumers switch exhaustively over the six EXEC-01 event kinds."

requirements-completed: [EXEC-02, EXEC-04, EXEC-08]

duration: 4min
completed: 2026-04-27
---

# Phase 04 Plan 02: Execution Contracts Summary

**Streaming execution adapter contracts and resumable task journal type surfaces are pinned with compiled contract tests.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-27T22:44:43Z
- **Completed:** 2026-04-27T22:48:53Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `ExecutionAdapter`, `AdapterEvent`, `AdapterResult`, `AdapterContext`, `AdapterFailureReason`, `RepoReader`, and `AdapterEvidence`.
- Added `TaskJournalEvent`, `TaskJournalEventKind`, schema-version constants, and `ExecutionSnapshot`.
- Re-exported both contract modules from `@protostar/execution`.
- Added contract tests for mock adapter streaming, failure-reason exhaustiveness, envelope budget/network typing, journal-event exhaustiveness, orphan retry reason, cancellation cause literals, and snapshot records.

## Task Commits

1. **Task 1 RED: adapter contract tests** - `b241fa3` (test)
2. **Task 1 GREEN: adapter contract** - `4389818` (feat)
3. **Task 2 RED: journal contract tests** - `038b7c6` (test)
4. **Task 2 GREEN: journal contract** - `b55a740` (feat)

## Files Created/Modified

- `packages/execution/src/adapter-contract.ts` - Type-only streaming adapter contract and evidence/failure result unions.
- `packages/execution/src/adapter-contract.test.ts` - Mock adapter contract tests and failure-reason exhaustiveness pin.
- `packages/execution/src/journal-types.ts` - Type-only task journal and execution snapshot contracts.
- `packages/execution/src/journal-types.test.ts` - Journal variant, orphan retry, cancellation cause, and snapshot contract tests.
- `packages/execution/src/index.ts` - Barrel re-exports for adapter and journal contracts.

## Mock Adapter Usage

```typescript
const adapter: ExecutionAdapter = {
  id: "test-mock",
  async *execute() {
    yield { kind: "token", text: "thinking" };
    yield { kind: "final", result };
  }
};
```

Wave 1 plans should import from `@protostar/execution` rather than recreating these shapes.

## Decisions Made

- Kept the new modules pure type/contract surfaces: no filesystem, networking, fetch, or implementation logic.
- Exported schema-version constants for journal events and snapshots so later formatter/persistence code can reuse the same literal source.
- Kept `resolvedEnvelope: CapabilityEnvelope` as the current schema type and exposed the planned 1.3.0 `budget`/`network` views separately on `AdapterContext`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Task 2's initial helper used a non-distributive `Omit` over the journal event union, which made per-variant fields appear unavailable after the type module was added. The helper was tightened to distribute over `TaskJournalEventBase`; no contract behavior changed.
- Parallel Phase 4 work landed during execution (`f0f291b`, `985cf0d`) and unrelated untracked Phase 5/6 planning files are present. They were not modified.

## Verification

- `pnpm --filter @protostar/execution test` - PASS, 24 tests, 5 suites.
- `grep -R "AsyncIterable<" -n packages/execution/src` - PASS, only `adapter-contract.ts` exports `AsyncIterable<AdapterEvent>`.
- `grep -E 'node:fs|node:net|fetch\(' packages/execution/src/adapter-contract.ts packages/execution/src/journal-types.ts` - PASS, no matches.
- Barrel checks for `adapter-contract.js` and `journal-types.js` - PASS.
- `pnpm run verify` - PASS.
- `pnpm run factory` - BUILT then stopped at expected workspace-trust gate with exit code 2.

## Known Stubs

None introduced by this plan.

## Threat Flags

None - this plan added type-only contract surfaces and no network endpoints, auth paths, file access, or schema trust-boundary implementations.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Wave 1 adapter and runner plans can import the frozen adapter and journal contracts from `@protostar/execution`. Plan 04-03's temporary structural fixture type can now be replaced with `ExecutionAdapterTaskInput`.

## Self-Check: PASSED

- Found created file: `packages/execution/src/adapter-contract.ts`
- Found created file: `packages/execution/src/adapter-contract.test.ts`
- Found created file: `packages/execution/src/journal-types.ts`
- Found created file: `packages/execution/src/journal-types.test.ts`
- Found summary file: `.planning/phases/04-execution-engine/04-02-execution-contracts-SUMMARY.md`
- Found task commit: `b241fa3`
- Found task commit: `4389818`
- Found task commit: `038b7c6`
- Found task commit: `b55a740`

---
*Phase: 04-execution-engine*
*Completed: 2026-04-27*
