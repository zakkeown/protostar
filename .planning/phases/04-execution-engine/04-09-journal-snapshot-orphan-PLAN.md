---
phase: 04-execution-engine
plan: 09
type: execute
wave: 3
depends_on: [02, 05]
files_modified:
  - packages/execution/src/journal.ts
  - packages/execution/src/journal.test.ts
  - packages/execution/src/snapshot.ts
  - packages/execution/src/snapshot.test.ts
  - packages/execution/src/orphan-replay.ts
  - packages/execution/src/orphan-replay.test.ts
  - packages/execution/src/index.ts
  - apps/factory-cli/src/journal-writer.ts
  - apps/factory-cli/src/journal-writer.test.ts
  - apps/factory-cli/src/snapshot-writer.ts
  - apps/factory-cli/src/snapshot-writer.test.ts
autonomous: true
requirements: [EXEC-01, EXEC-08]
must_haves:
  truths:
    - "`formatTaskJournalLine(event)` returns `JSON.stringify(event) + '\\n'` and is pure (no fs)"
    - "`appendTaskJournalEntry(path, event)` in factory-cli writes the line + fsync's before resolving"
    - "Snapshot writer is tmp+rename atomic: writes `snapshot.json.tmp`, fsyncs, renames to `snapshot.json`, fsyncs the directory"
    - "`replayOrphanedTasks(snapshot, journalLines)` returns synthetic `task-failed` events for any task whose last event is `task-running` without a terminal follow-up; reason: 'orphaned-by-crash'"
    - "`parseJournalLines(raw)` silently drops the LAST line if it fails to parse (truncation tolerance) but errors loud on any earlier malformed line"
  artifacts:
    - path: packages/execution/src/journal.ts
      provides: "Pure formatter + parser for TaskJournalEvent"
      exports: ["formatTaskJournalLine", "parseJournalLines"]
    - path: packages/execution/src/snapshot.ts
      provides: "Pure snapshot serializer + reducer"
      exports: ["serializeSnapshot", "reduceJournalToSnapshot"]
    - path: packages/execution/src/orphan-replay.ts
      provides: "Crash-recovery orphan detector"
      exports: ["replayOrphanedTasks"]
    - path: apps/factory-cli/src/journal-writer.ts
      provides: "fs append + fsync writer"
    - path: apps/factory-cli/src/snapshot-writer.ts
      provides: "fs tmp+rename atomic writer"
  key_links:
    - from: "apps/factory-cli/src/journal-writer.ts"
      to: "node:fs/promises appendFile + fdatasync"
      via: "append-and-fsync"
      pattern: "fdatasync|fsync"
    - from: "apps/factory-cli/src/snapshot-writer.ts"
      to: "node:fs/promises rename"
      via: "tmp+rename atomicity"
      pattern: "rename\\("
---

<objective>
Implement journal + snapshot + orphan-replay following the AGENTS.md authority lock: pure formatters/parsers/reducers in `@protostar/execution`; fs writers in `apps/factory-cli`. Orphan-replay is pure (takes data in, returns synthetic events out — Plan 10 invokes it with disk reads).

Per CONTEXT Q-02 / Q-03 / RESEARCH Pitfall 3 (truncation tolerance) + Pitfall 5 (sentinel-cleanup-on-resume).

Purpose: Crash-resumable journal infrastructure with deterministic replay logic, ready for Plan 10 to compose into the real executor.
Output: Five new modules (3 pure + 2 fs writers) with comprehensive tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/04-execution-engine/04-CONTEXT.md
@.planning/phases/04-execution-engine/04-RESEARCH.md
@.planning/phases/04-execution-engine/04-PATTERNS.md
@packages/execution/src/journal-types.ts
@apps/factory-cli/src/admission-decisions-index.ts
@apps/factory-cli/src/refusals-index.ts

<interfaces>
```typescript
// packages/execution/src/journal.ts (PURE — no fs)
import type { TaskJournalEvent } from "./journal-types.js";

export const JOURNAL_FILE_NAME = "journal.jsonl" as const;

export function formatTaskJournalLine(event: TaskJournalEvent): string;
// returns `JSON.stringify(event) + "\n"` after asserting required fields present.

export function parseJournalLines(raw: string): {
  readonly events: readonly TaskJournalEvent[];
  readonly droppedTrailingPartial: boolean;       // true iff last line failed to parse
  readonly errors: readonly { readonly lineIndex: number; readonly message: string }[]; // earlier lines that fail
};
// Splits on '\n'; tries to JSON.parse each line; the LAST line if it fails is silently dropped.
// Any non-last failure is recorded in errors[] AND throws on `errors.length > 0`.
```

```typescript
// packages/execution/src/snapshot.ts (PURE)
import type { TaskJournalEvent, ExecutionSnapshot } from "./journal-types.js";

export const SNAPSHOT_FILE_NAME = "snapshot.json" as const;

export function serializeSnapshot(snapshot: ExecutionSnapshot): string;  // JSON.stringify with stable key order

export function reduceJournalToSnapshot(input: {
  readonly runId: string;
  readonly generatedAt: string;
  readonly events: readonly TaskJournalEvent[];
}): ExecutionSnapshot;
// Folds events into a per-task latest-state map; lastEventSeq = max(events[*].seq).
```

```typescript
// packages/execution/src/orphan-replay.ts (PURE)
import type { TaskJournalEvent } from "./journal-types.js";

export interface OrphanReplayInput {
  readonly runId: string;
  readonly events: readonly TaskJournalEvent[];
  readonly nowIso: string;
  readonly nextSeq: number;
}

export function replayOrphanedTasks(input: OrphanReplayInput): readonly TaskJournalEvent[];
// For each planTaskId whose last event in `events` is `task-running`:
//   produce { kind: "task-failed", reason: "orphaned-by-crash", retryReason: "orphaned-by-crash",
//             planTaskId, runId, attempt: <last-running.attempt>, at: nowIso, seq: nextSeq++ }
```

```typescript
// apps/factory-cli/src/journal-writer.ts (fs)
export interface JournalWriter {
  appendEvent(event: TaskJournalEvent): Promise<void>;  // append + fsync the file before resolving
}

export function createJournalWriter(opts: { runDir: string }): Promise<JournalWriter>;
// Opens journal.jsonl for append; each appendEvent does:
//   await appendFile(path, formatTaskJournalLine(event), "utf8");
//   await fsync(<file handle or new open>);
// Use a single open FileHandle for performance; close() at end.
```

```typescript
// apps/factory-cli/src/snapshot-writer.ts (fs)
export function writeSnapshotAtomic(opts: {
  runDir: string;
  snapshot: ExecutionSnapshot;
}): Promise<void>;
// Writes snapshot.json.tmp; fsyncs file; renames to snapshot.json; fsyncs the directory entry.
```

Authority lock: pure files in `@protostar/execution` import from `./journal-types.js` only. fs writers in `apps/factory-cli` import from `node:fs/promises` AND from `@protostar/execution`'s pure helpers.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure journal + snapshot + orphan-replay in @protostar/execution</name>
  <files>packages/execution/src/journal.ts, packages/execution/src/journal.test.ts, packages/execution/src/snapshot.ts, packages/execution/src/snapshot.test.ts, packages/execution/src/orphan-replay.ts, packages/execution/src/orphan-replay.test.ts, packages/execution/src/index.ts</files>
  <read_first>
    - packages/execution/src/journal-types.ts (Plan 02)
    - apps/factory-cli/src/admission-decisions-index.ts (formatter pattern lines 19-29)
    - .planning/phases/04-execution-engine/04-CONTEXT.md §Q-02, §Q-03
    - .planning/phases/04-execution-engine/04-RESEARCH.md §"Pitfall 3: Journal-truncation tolerance"
  </read_first>
  <behavior journal>
    - Test J1: `formatTaskJournalLine({kind:"task-pending", runId:"r1", planTaskId:"t1", at:"...", attempt:1, seq:1, schemaVersion:"1.0.0"})` returns valid JSON ending with `\n`; `JSON.parse` round-trips.
    - Test J2: `parseJournalLines("{...}\n{...}\n")` returns 2 events, droppedTrailingPartial=false.
    - Test J3 (Pitfall 3): `parseJournalLines("{...valid...}\n{partial`) returns 1 event, droppedTrailingPartial=true, no errors.
    - Test J4: `parseJournalLines("{...valid...}\n{not-json}\n{...valid...}\n")` throws (middle line corrupt is loud).
    - Test J5: Empty input → `{ events: [], droppedTrailingPartial: false, errors: [] }`.
    - Test J6: Trailing newline only → 0 events, droppedTrailingPartial=false (empty last line is not a partial; just blank).
  </behavior>
  <behavior snapshot>
    - Test S1: `reduceJournalToSnapshot({events: [pending(t1,seq1), running(t1,seq2), succeeded(t1,seq3)], ...})` → `tasks.t1.status === "succeeded"`, `lastEventSeq === 3`.
    - Test S2: Two tasks reduce independently — each carries its own latest state.
    - Test S3: `serializeSnapshot(snap)` produces stable key order (deterministic — same input twice → identical bytes).
    - Test S4: A task with `task-failed` then `task-running` (retry) → status `running`, `attempt: 2`.
  </behavior>
  <behavior orphan-replay>
    - Test O1: Events end with `task-running` for t1 (no terminal) → returns one synthetic `task-failed` event with `reason:"orphaned-by-crash"`, `retryReason:"orphaned-by-crash"`, matching planTaskId, attempt, runId; new seq = nextSeq.
    - Test O2: Events end with `task-succeeded` for t1 → no synthetic event for t1.
    - Test O3: Two tasks both stuck in `running` → two synthetic events, seqs nextSeq and nextSeq+1.
    - Test O4: Task transitioned `running → failed → running` (retry, then crash) → one synthetic event for the second running.
    - Test O5: nowIso passed in is the `at` for synthetic events (deterministic clock).
  </behavior>
  <action>
    1. Create `journal.ts`. Implementation:
       ```ts
       export function formatTaskJournalLine(event) { return JSON.stringify(event) + "\n"; }
       export function parseJournalLines(raw) {
         if (raw.length === 0) return { events: [], droppedTrailingPartial: false, errors: [] };
         const lines = raw.split("\n");
         // Trailing newline → last element is "" → strip
         const hasTrailingNewline = raw.endsWith("\n");
         const candidates = hasTrailingNewline ? lines.slice(0, -1) : lines;
         const events = []; const errors = []; let droppedTrailingPartial = false;
         for (let i = 0; i < candidates.length; i++) {
           if (candidates[i].trim() === "") continue;
           try { events.push(JSON.parse(candidates[i])); }
           catch (e) {
             const isLast = i === candidates.length - 1 && !hasTrailingNewline;
             if (isLast) { droppedTrailingPartial = true; }
             else { errors.push({ lineIndex: i, message: String(e) }); }
           }
         }
         if (errors.length > 0) throw new Error(`journal corruption: ${errors.map(e => `line ${e.lineIndex}: ${e.message}`).join("; ")}`);
         return { events, droppedTrailingPartial, errors: [] };
       }
       ```
    2. Create `snapshot.ts`. `reduceJournalToSnapshot` walks events in order, applying the last event per `planTaskId` as authoritative status. Map kind→status: `task-pending`→`pending`, `task-running`→`running`, `task-succeeded`→`succeeded`, `task-failed`→`failed`, `task-timeout`→`timeout`, `task-cancelled`→`cancelled`. `serializeSnapshot` uses `JSON.stringify` with explicit key ordering (sort keys recursively or use the `@protostar/authority` json-c14n canonicalizer for byte-stable output).
    3. Create `orphan-replay.ts` per behavior. Walk events, group by planTaskId, find last event; if kind === `task-running` produce synthetic `task-failed`.
    4. Add barrel re-exports in `packages/execution/src/index.ts`.
    5. Tests use `node:test` with hand-built event arrays.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/execution test 2>&1 | tail -30 ; ! grep -E 'node:fs|node:fs/' packages/execution/src/journal.ts packages/execution/src/snapshot.ts packages/execution/src/orphan-replay.ts</automated>
  </verify>
  <acceptance_criteria>
    - All three pure files exist; barrel re-exports
    - No `node:fs` or `node:fs/promises` import in any of the three
    - All 15 tests pass (6 journal + 4 snapshot + 5 orphan)
    - Pitfall 3 truncation case (Test J3) passes
    - Pitfall (mid-stream corruption) case (Test J4) throws loud
  </acceptance_criteria>
  <done>Pure logic for journal/snapshot/orphan-replay; Plan 10 wires fs around it.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: fs writers in apps/factory-cli (append+fsync, tmp+rename)</name>
  <files>apps/factory-cli/src/journal-writer.ts, apps/factory-cli/src/journal-writer.test.ts, apps/factory-cli/src/snapshot-writer.ts, apps/factory-cli/src/snapshot-writer.test.ts</files>
  <read_first>
    - packages/execution/src/journal.ts (Task 1 — for formatter)
    - packages/execution/src/snapshot.ts (Task 1 — for serializer)
    - apps/factory-cli/src/admission-decisions-index.ts (existing fs-write pattern)
    - .planning/phases/04-execution-engine/04-CONTEXT.md §Q-02
    - .planning/phases/04-execution-engine/04-RESEARCH.md §"Pattern 3: Append-and-fsync" + §"Pattern 4: Snapshot tmp+rename atomicity"
  </read_first>
  <behavior journal-writer>
    - Test JW1: `createJournalWriter({runDir})` then `.appendEvent(event)` writes one JSON line + newline to `${runDir}/execution/journal.jsonl`.
    - Test JW2: Two appends produce two lines (newline-separated).
    - Test JW3: After `appendEvent` resolves, file contents are flushed (read back from disk via separate `readFile` call returns the line). This is the proxy for fsync — if the implementation is missing fsync, the test on a freshly-mounted tmpfs may still pass; we additionally `grep` source for `fsync`/`fdatasync` to assert it's there.
    - Test JW4: Concurrent appends are serialized (no interleaved partial lines). Use `Promise.all([w.appendEvent(e1), w.appendEvent(e2)])` — assert both lines appear whole.
    - Test JW5: Calling `close()` releases the file handle (subsequent open succeeds).
  </behavior>
  <behavior snapshot-writer>
    - Test SW1: `writeSnapshotAtomic({runDir, snapshot})` produces `${runDir}/execution/snapshot.json` containing `serializeSnapshot(snapshot)` exactly.
    - Test SW2: After write, no `snapshot.json.tmp` file remains (rename succeeded, tmp gone).
    - Test SW3: Concurrent writes — last writer wins; no half-written intermediate state visible at any time (read between writes always parses).
    - Test SW4: Source greps positive for `rename(` and `fsync` / `fdatasync`.
  </behavior>
  <action>
    1. Create `apps/factory-cli/src/journal-writer.ts`:
       ```ts
       import { open, mkdir, type FileHandle } from "node:fs/promises";
       import { dirname, join } from "node:path";
       import { JOURNAL_FILE_NAME, formatTaskJournalLine } from "@protostar/execution";

       export async function createJournalWriter(opts: { runDir: string }): Promise<JournalWriter> {
         const path = join(opts.runDir, "execution", JOURNAL_FILE_NAME);
         await mkdir(dirname(path), { recursive: true });
         const fh: FileHandle = await open(path, "a");
         let chain: Promise<void> = Promise.resolve();
         return {
           async appendEvent(event) {
             // serialize with chain to prevent interleaving
             chain = chain.then(async () => {
               const line = formatTaskJournalLine(event);
               await fh.appendFile(line, "utf8");
               await fh.datasync();
             });
             return chain;
           },
           async close() { await chain; await fh.close(); },
         };
       }
       ```
       Export `JournalWriter` type.
    2. Create `apps/factory-cli/src/snapshot-writer.ts`:
       ```ts
       import { writeFile, rename, open, mkdir } from "node:fs/promises";
       import { dirname, join } from "node:path";
       import { SNAPSHOT_FILE_NAME, serializeSnapshot, type ExecutionSnapshot } from "@protostar/execution";

       export async function writeSnapshotAtomic(opts: { runDir: string; snapshot: ExecutionSnapshot }): Promise<void> {
         const dir = join(opts.runDir, "execution");
         await mkdir(dir, { recursive: true });
         const tmp = join(dir, `${SNAPSHOT_FILE_NAME}.tmp`);
         const final = join(dir, SNAPSHOT_FILE_NAME);
         const bytes = serializeSnapshot(opts.snapshot);
         await writeFile(tmp, bytes, "utf8");
         const fh = await open(tmp, "r"); await fh.datasync(); await fh.close();
         await rename(tmp, final);
         // fsync the directory so the rename hits disk
         const dh = await open(dir, "r"); await dh.datasync().catch(() => {}); await dh.close();
       }
       ```
       Note: `datasync` on a directory may not be supported on all platforms (open dir on macOS works; on Windows it doesn't). Wrap in `.catch(() => {})` for the dir-fsync step (best-effort).
    3. Tests use `node:test` + `node:fs/promises` to read back. Use `os.tmpdir()` + `mkdtemp` for isolated runDir per test; cleanup in `t.after`.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/factory-cli test 2>&1 | tail -25 ; grep -c 'datasync\|fsync' apps/factory-cli/src/journal-writer.ts apps/factory-cli/src/snapshot-writer.ts ; grep -c 'rename(' apps/factory-cli/src/snapshot-writer.ts</automated>
  </verify>
  <acceptance_criteria>
    - Both writer files exist
    - `grep -c 'datasync\|fsync' apps/factory-cli/src/journal-writer.ts apps/factory-cli/src/snapshot-writer.ts` ≥ 2 (each file has at least one fsync call)
    - `grep -c 'rename(' apps/factory-cli/src/snapshot-writer.ts` ≥ 1
    - All tests pass on macOS APFS and Linux ext4
  </acceptance_criteria>
  <done>fs-writer half of journal+snapshot pattern shipped; Plan 10 invokes them.</done>
</task>

</tasks>

<threat_model>
| Boundary | Description |
|----------|-------------|
| journal write ↔ disk | crash mid-write must not corrupt resume |
| snapshot write ↔ disk | half-written snapshot makes run unresumable |

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-04-25 | Repudiation | Journal line lost on crash → consumer never sees terminal state | mitigate | append + datasync before resolve (Pattern 3); JW3 test asserts |
| T-04-26 | Tampering | Snapshot read mid-write returns garbage | mitigate | tmp+rename atomicity (Pattern 4); SW3 test |
| T-04-27 | DoS | Resume refuses to start due to truncated last line | mitigate | parseJournalLines silently drops trailing partial (Pitfall 3); J3 test |
| T-04-28 | Repudiation | Mid-journal corruption silently dropped → state lies | mitigate | parseJournalLines THROWS on non-last bad line; J4 test |
</threat_model>

<verification>
- `pnpm --filter @protostar/execution test` green
- `pnpm --filter @protostar/factory-cli test` green
- Pure files contain no fs imports; writer files contain fsync + rename calls
</verification>

<success_criteria>
- Pure / fs split honors AGENTS.md authority lock
- Truncation tolerance proven (last partial dropped, not earlier)
- Atomic snapshot proven (no half-written file visible)
- Orphan-replay deterministic given inputs
</success_criteria>

<output>
Create `.planning/phases/04-execution-engine/04-09-SUMMARY.md`: API list, the truncation-tolerance rule, the tmp+rename sequence, and a usage snippet for Plan 10.
</output>
