---
phase: 04-execution-engine
plan: 09
subsystem: execution
tags: [journal, snapshot, crash-recovery, fsync, node-test]

requires:
  - phase: 04-execution-engine
    provides: [execution-contracts, retry-helpers]
provides:
  - Pure task journal formatter and truncation-tolerant parser
  - Pure execution snapshot reducer and deterministic serializer
  - Pure orphaned running-task replay helper
  - Factory-cli append-and-datasync journal writer
  - Factory-cli tmp-rename atomic snapshot writer
affects: [04-10-factory-cli-real-executor-wiring, phase-09-resume-status-inspect]

tech-stack:
  added: []
  patterns: [node-test-tdd, pure-execution-helpers, append-and-fsync, tmp-rename-atomic-write]

key-files:
  created:
    - packages/execution/src/journal.ts
    - packages/execution/src/journal.test.ts
    - packages/execution/src/snapshot.ts
    - packages/execution/src/snapshot.test.ts
    - packages/execution/src/orphan-replay.ts
    - packages/execution/src/orphan-replay.test.ts
    - apps/factory-cli/src/journal-writer.ts
    - apps/factory-cli/src/journal-writer.test.ts
    - apps/factory-cli/src/snapshot-writer.ts
    - apps/factory-cli/src/snapshot-writer.test.ts
  modified:
    - packages/execution/src/index.ts

key-decisions:
  - "Kept journal/snapshot/orphan logic pure in @protostar/execution; filesystem durability lives in apps/factory-cli."
  - "Serialized snapshot writes per final path so concurrent writers do not race on the required snapshot.json.tmp file."

patterns-established:
  - "Journal parsing tolerates only the final malformed line as crash truncation; earlier malformed lines throw corruption errors."
  - "Snapshot writes use write tmp, datasync tmp, rename to final, then best-effort directory datasync."

requirements-completed: [EXEC-01, EXEC-08]

duration: 7min
completed: 2026-04-27T23:19:08Z
---

# Phase 04 Plan 09: Journal Snapshot Orphan Summary

**Crash-resumable task journal primitives with deterministic snapshot reduction, orphan replay, and durable factory-cli fs writers.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-27T23:12:33Z
- **Completed:** 2026-04-27T23:19:08Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Added pure `formatTaskJournalLine()` and `parseJournalLines()` with final-line truncation tolerance and loud mid-stream corruption errors.
- Added pure `reduceJournalToSnapshot()`, `serializeSnapshot()`, and `replayOrphanedTasks()` for deterministic resume inputs.
- Added factory-cli `createJournalWriter()` and `writeSnapshotAtomic()` with append/datasync and tmp/rename durability.
- Re-exported the new pure helpers from `@protostar/execution`.

## API List

```ts
formatTaskJournalLine(event)
parseJournalLines(raw)
serializeSnapshot(snapshot)
reduceJournalToSnapshot({ runId, generatedAt, events })
replayOrphanedTasks({ runId, events, nowIso, nextSeq })
createJournalWriter({ runDir })
writeSnapshotAtomic({ runDir, snapshot })
```

## Usage Snippet

```ts
const writer = await createJournalWriter({ runDir });
await writer.appendEvent({ kind: "task-running", runId, planTaskId, at, attempt: 1, seq: 4, schemaVersion: "1.0.0" });
await writer.close();

const parsed = parseJournalLines(rawJournal);
const orphanEvents = replayOrphanedTasks({ runId, events: parsed.events, nowIso, nextSeq });
const snapshot = reduceJournalToSnapshot({ runId, generatedAt: nowIso, events: [...parsed.events, ...orphanEvents] });
await writeSnapshotAtomic({ runDir, snapshot });
```

## Task Commits

1. **Task 1 RED: Pure journal/snapshot/orphan tests** - `e38a08f` (test)
2. **Task 1 GREEN: Pure journal/snapshot/orphan helpers** - `d05be69` (feat)
3. **Task 2 RED: Factory-cli writer tests** - `9312e56` (test)
4. **Task 2 GREEN: Durable factory-cli writers** - `5f0ae2e` (feat)

**Plan metadata:** this summary file is committed separately after self-check.

## Files Created/Modified

- `packages/execution/src/journal.ts` - Pure JSONL formatter/parser and `JOURNAL_FILE_NAME`.
- `packages/execution/src/snapshot.ts` - Pure snapshot reducer, stable serializer, and `SNAPSHOT_FILE_NAME`.
- `packages/execution/src/orphan-replay.ts` - Pure running-task orphan detector returning synthetic failed events.
- `packages/execution/src/index.ts` - Barrel exports for new pure helpers.
- `apps/factory-cli/src/journal-writer.ts` - Append writer that serializes appends and calls `datasync()` before resolving.
- `apps/factory-cli/src/snapshot-writer.ts` - Atomic snapshot writer using `snapshot.json.tmp`, `datasync()`, `rename()`, and directory sync.
- Test files cover 15 pure helper cases and 9 writer cases.

## Verification

- `node --test packages/execution/dist/journal.test.js packages/execution/dist/snapshot.test.js packages/execution/dist/orphan-replay.test.js` - PASS, 15 tests.
- `node --test apps/factory-cli/dist/journal-writer.test.js apps/factory-cli/dist/snapshot-writer.test.js` - PASS, 9 tests.
- `grep -E 'node:fs|node:fs/' packages/execution/src/journal.ts packages/execution/src/snapshot.ts packages/execution/src/orphan-replay.ts` - PASS, no matches.
- `grep -c 'datasync\|fsync' apps/factory-cli/src/journal-writer.ts apps/factory-cli/src/snapshot-writer.ts` - PASS, counts in both writer files.
- `grep -c 'rename(' apps/factory-cli/src/snapshot-writer.ts` - PASS, count 1.
- `pnpm --filter @protostar/execution test` - BLOCKED outside this plan by parallel `packages/planning/src/index.ts` exact-optional-property compile error.
- `pnpm --filter @protostar/factory-cli test` - BLOCKED outside this plan by the same parallel planning compile error before factory-cli tests run.

## Decisions Made

- Kept `@protostar/execution` free of filesystem imports to preserve the AGENTS.md authority boundary.
- Used a per-final-path promise chain for snapshot writes because the plan requires the shared `snapshot.json.tmp` temp name; serialization prevents concurrent rename races while preserving last-writer-wins behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Serialized concurrent snapshot writes**
- **Found during:** Task 2 (fs writers)
- **Issue:** Concurrent calls using the required shared `snapshot.json.tmp` path can race, causing one rename to consume another writer's temp file.
- **Fix:** Added a per-final-path promise chain around the tmp/write/datasync/rename sequence.
- **Files modified:** `apps/factory-cli/src/snapshot-writer.ts`
- **Verification:** Writer dist tests pass; SW3 concurrent write test passes.
- **Committed in:** `5f0ae2e`

---

**Total deviations:** 1 auto-fixed (1 Rule 2).  
**Impact on plan:** The fix preserves the specified tmp filename and improves crash/resume correctness without broadening scope.

## Issues Encountered

- Parallel executors modified planning and LM Studio files during this run. Unrelated files were not staged or modified by this plan.
- Full package tests are currently blocked by out-of-scope `@protostar/planning` compile errors in parallel work; compiled tests for this plan's modules passed.

## Known Stubs

None. Stub scan hits were legitimate local empty arrays/objects used as parser accumulators and snapshot maps.

## Threat Flags

None beyond the planned journal/snapshot disk durability surface. The plan mitigates it with append+datasync, final-line truncation tolerance, loud mid-stream corruption, tmp+rename snapshot writes, and writer tests.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 10 can compose journal append, snapshot writes, and orphan replay into the real executor resume path without adding filesystem authority to `@protostar/execution`.

## Self-Check: PASSED

- Found created file: `packages/execution/src/journal.ts`
- Found created file: `packages/execution/src/snapshot.ts`
- Found created file: `packages/execution/src/orphan-replay.ts`
- Found created file: `apps/factory-cli/src/journal-writer.ts`
- Found created file: `apps/factory-cli/src/snapshot-writer.ts`
- Found summary file: `.planning/phases/04-execution-engine/04-09-journal-snapshot-orphan-SUMMARY.md`
- Found task commit: `e38a08f`
- Found task commit: `d05be69`
- Found task commit: `9312e56`
- Found task commit: `5f0ae2e`
- Verified no tracked files were deleted by task commits.

---
*Phase: 04-execution-engine*
*Completed: 2026-04-27*
