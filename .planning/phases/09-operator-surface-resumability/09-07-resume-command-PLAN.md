---
phase: 09-operator-surface-resumability
plan: 07
type: execute
wave: 4
depends_on: [01, 03, 04]
files_modified:
  - apps/factory-cli/src/commands/resume.ts
  - apps/factory-cli/src/commands/resume.test.ts
  - apps/factory-cli/src/main.ts
autonomous: true
requirements: [OP-03, OP-07]
must_haves:
  truths:
    - "resume <runId> dispatches by manifest.status: running|orphaned → mid-execution replay; repairing → mid-review re-invoke; ready-to-release → exit 6 with hint to use deliver; completed|blocked|cancelled|created|cancelling → exit 6 not-resumable (Q-13)"
    - "Mid-execution path uses Phase 4's replayOrphanedTasks(reduceJournalToSnapshot(events)) — no parallel journal model (Q-14)"
    - "manifest.status === 'cancelled' → exit 4 with stdout JSON {runId, error: 'operator-cancelled-terminal'} (Q-15)"
    - "Sentinel present + manifest.status !== 'cancelled' → calls unlinkSentinelOnResume from existing apps/factory-cli/src/cancel.ts and proceeds (Q-15 transient sentinel auto-unlink)"
    - "Pile-stage resume increments iter-N: finds highest existing iter dir under piles/<kind>/, starts iter-(N+1) (Q-13)"
    - "runId validation via parseRunId (exit 2) + assertRunIdConfined; missing manifest → exit 3"
    - "Per-stage resume helpers live in the existing stage modules (extend runRealExecution with a resume({runId, fromTaskId?}) entrypoint); resume.ts only DISPATCHES"
    - "Stage-aware resume keeps the in-flight run loop semantics — same lifecycle events, same budget/abort wiring"
  artifacts:
    - path: apps/factory-cli/src/commands/resume.ts
      provides: "resume command with stage-aware dispatch (Q-13/Q-14/Q-15)"
      exports: ["buildResumeCommand"]
    - path: apps/factory-cli/src/commands/resume.test.ts
      provides: "Stage-dispatch + sentinel-handling tests"
  key_links:
    - from: apps/factory-cli/src/commands/resume.ts
      to: packages/execution/src/orphan-replay.ts
      via: "imports replayOrphanedTasks from @protostar/execution"
      pattern: "replayOrphanedTasks"
    - from: apps/factory-cli/src/commands/resume.ts
      to: apps/factory-cli/src/cancel.ts
      via: "imports unlinkSentinelOnResume for transient-sentinel branch"
      pattern: "unlinkSentinelOnResume"
    - from: apps/factory-cli/src/main.ts
      to: apps/factory-cli/src/commands/resume.ts
      via: "addCommand(buildResumeCommand())"
      pattern: "addCommand\\(buildResumeCommand"
---

<objective>
Implement `protostar-factory resume <runId>` per Q-13/Q-14/Q-15. Stage-aware dispatch reads manifest.status and routes to: mid-execution replay (running/orphaned) via Phase 4's `replayOrphanedTasks`, mid-review re-invocation (repairing) via existing review-loop entrypoints with iter-(N+1), or refuses with documented exit codes. Sentinel handling distinguishes operator-cancelled (terminal, exit 4) from transient sentinel (auto-unlink, proceed).

Purpose: Operator's "just continue" expectation. Execution-only resume teaches a confusing distinction; pile invocations are idempotent (Phase 6 always-on iter-N), so re-invocation is bounded.
Output: One command module that DISPATCHES; per-stage helpers extend existing modules. Tests cover all dispatch branches and both sentinel cases.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/09-operator-surface-resumability/09-CONTEXT.md
@.planning/phases/09-operator-surface-resumability/09-RESEARCH.md
@AGENTS.md
@apps/factory-cli/src/cancel.ts
@apps/factory-cli/src/io.ts
@apps/factory-cli/src/exit-codes.ts
@apps/factory-cli/src/run-id.ts
@apps/factory-cli/src/run-liveness.ts
@apps/factory-cli/src/main.ts
@packages/artifacts/src/index.ts
@packages/execution/src/snapshot.ts
@packages/execution/src/orphan-replay.ts
@packages/execution/src/index.ts

<interfaces>
```typescript
// apps/factory-cli/src/commands/resume.ts
import type { Command } from "@commander-js/extra-typings";
export function buildResumeCommand(): Command;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: resume command — stage-aware dispatch + sentinel handling + tests</name>
  <read_first>
    - apps/factory-cli/src/cancel.ts (FULL FILE — unlinkSentinelOnResume, checkSentinelBetweenTasks, installCancelWiring shapes; understand sentinel path layout)
    - apps/factory-cli/src/commands/cancel.ts (Plan 09-06 — out-of-process writer; resume reads what cancel wrote)
    - apps/factory-cli/src/run-liveness.ts (Plan 09-04 — computeRunLiveness for distinguishing orphaned)
    - apps/factory-cli/src/main.ts (existing run-real-execution entrypoint; review-loop entrypoint; how runFactory enters mid-stage paths)
    - packages/execution/src/orphan-replay.ts (replayOrphanedTasks signature + return type)
    - packages/execution/src/snapshot.ts (reduceJournalToSnapshot, serializeSnapshot)
    - packages/execution/src/index.ts (confirm exports — replayOrphanedTasks, reduceJournalToSnapshot, serializeSnapshot)
    - apps/factory-cli/src/journal-writer.ts (Phase 4 journal append; how to read existing events back)
    - .planning/phases/09-operator-surface-resumability/09-CONTEXT.md (Q-13, Q-14, Q-15)
    - .planning/phases/09-operator-surface-resumability/09-RESEARCH.md (Code Examples Example 2 — verbatim resume dispatcher pattern)
  </read_first>
  <files>apps/factory-cli/src/commands/resume.ts, apps/factory-cli/src/commands/resume.test.ts, apps/factory-cli/src/main.ts</files>
  <behavior>
    - resume <validId> with manifest.status='cancelled' → exit 4; stdout = {runId, error: 'operator-cancelled-terminal'}; sentinel left intact.
    - resume <validId> with sentinel present AND manifest.status='running' (transient) → unlinks sentinel (file gone), stderr "clearing transient cancel sentinel before resume", proceeds to mid-execution dispatch.
    - resume <validId> with manifest.status='running' AND no sentinel → mid-execution path: reads journal.jsonl, calls reduceJournalToSnapshot + replayOrphanedTasks; orphan set non-empty → invokes the existing run-real-execution resume entrypoint with that orphan set; exit 0 on success. (Test stubs the executor entrypoint — assert it was called with the right orphan set.)
    - resume <validId> with manifest.status='orphaned' → same as 'running' branch (orphaned is the derived state but if a manifest writer ever sets it, accept it).
    - resume <validId> with manifest.status='repairing' → mid-review re-invoke: finds highest piles/review/iter-N/ → invokes review-loop entrypoint with iter-(N+1). (Test stubs the entrypoint.)
    - resume <validId> with manifest.status='ready-to-release' → exit 6; stderr "run is ready-to-release; use `protostar-factory deliver` instead".
    - resume <validId> with manifest.status='completed' → exit 6; stderr "manifest.status=completed is terminal".
    - resume <validId> with manifest.status='blocked' → exit 6; same shape.
    - resume <validId> with manifest.status='created' → exit 6.
    - resume <validId> with manifest.status='cancelling' → exit 6 (non-resumable in v0.1; CONTEXT explicitly excludes).
    - resume <invalidId> → exit 2.
    - resume <missingId> → exit 3.
  </behavior>
  <action>
    1. Create `apps/factory-cli/src/commands/resume.ts`:
       - Builder via `Command`. Positional `<runId>`. `.exitOverride()`, `.configureOutput`.
       - `executeResume(opts)` implements the verbatim dispatcher from RESEARCH §"Code Examples Example 2", adapted for actual exports:
         a. parseRunId → ExitCode.UsageOrArgError on fail.
         b. assertRunIdConfined.
         c. Read manifest → ExitCode.NotFound on missing/parse-fail.
         d. If manifest.status === 'cancelled' → writeStdoutJson({runId, error: 'operator-cancelled-terminal'}); return ExitCode.Conflict.
         e. computeRunLiveness({runDir, thresholdMs: 60_000}) → if hasSentinel AND manifest.status !== 'cancelled' → writeStderr("clearing transient cancel sentinel before resume"); call existing `unlinkSentinelOnResume(runDir)` from apps/factory-cli/src/cancel.ts.
         f. Switch on manifest.status:
            - 'running' | 'orphaned' → resumeMidExecution(runDir, manifest)
            - 'repairing' → resumeMidReview(runDir, manifest)
            - 'ready-to-release' → writeStderr; ExitCode.NotResumable
            - 'completed' | 'blocked' | 'cancelled' → writeStderr; ExitCode.NotResumable
            - 'created' | 'cancelling' → writeStderr; ExitCode.NotResumable
       - `resumeMidExecution(runDir, manifest)`:
         a. Read `runDir/execution/journal.jsonl` line-by-line → parse each as TaskJournalEvent.
         b. snapshot = reduceJournalToSnapshot(events).
         c. orphans = replayOrphanedTasks(snapshot).
         d. If orphans empty → writeStderr "nothing to replay; run appears to have completed all tasks"; return ExitCode.Success (or NotResumable — pick Success per Q-13 "operator expectation: just continue").
         e. Invoke the existing run-real-execution resume entrypoint with the orphan set + runId. (The entrypoint signature is whatever Phase 4 exposed; this plan extends it if needed — see step 3 below.)
       - `resumeMidReview(runDir, manifest)`:
         a. List `runDir/piles/review/` dirs matching `iter-N`. Find highest N.
         b. Invoke the existing review-loop resume entrypoint with target iter = N+1.
         c. The entrypoint signature is whatever Phase 5 exposed; same caveat re extension below.
    2. Wire into main.ts: `program.addCommand(buildResumeCommand());`.
    3. Per-stage resume entrypoint extension:
       - In main.ts (or a helper module), expose a `resumeRealExecution({runId, runDir, orphanSet}): Promise<ExitCode>` that constructs the same dependencies as a fresh run-loop iteration but feeds the orphan set as the work to do. Internally calls the same executor used in `runFactory`. NO behavior change to fresh-run behavior.
       - Similarly `resumeReviewLoop({runId, runDir, startIter}): Promise<ExitCode>`.
       - These entrypoints are minimal wrappers over the existing run-loop logic; they do NOT introduce a parallel journal model (Q-14).
    4. Write `apps/factory-cli/src/commands/resume.test.ts` covering ALL branches in `<behavior>`. Stub the executor + review-loop entrypoints (export injection points if main.ts doesn't already accept them) to keep tests fast and deterministic.
    5. Run `pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test` and `pnpm run verify`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test -- --test-name-pattern '^resume'</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export function buildResumeCommand' apps/factory-cli/src/commands/resume.ts` is 1
    - `grep -c 'addCommand(buildResumeCommand' apps/factory-cli/src/main.ts` is 1
    - `grep -c 'replayOrphanedTasks' apps/factory-cli/src/commands/resume.ts` is at least 1
    - `grep -c 'reduceJournalToSnapshot' apps/factory-cli/src/commands/resume.ts` is at least 1
    - `grep -c 'unlinkSentinelOnResume' apps/factory-cli/src/commands/resume.ts` is at least 1
    - `grep -cE "'operator-cancelled-terminal'" apps/factory-cli/src/commands/resume.ts` is at least 1
    - `grep -cE "manifest\\.status\\s*===\\s*'cancelled'" apps/factory-cli/src/commands/resume.ts` is at least 1
    - `grep -cE "ready-to-release" apps/factory-cli/src/commands/resume.ts` is at least 1
    - `pnpm --filter @protostar/factory-cli test` exits 0
  </acceptance_criteria>
  <done>resume command live; all branches tested; transient sentinel auto-unlinks; operator-cancelled terminal refuses; mid-execution replay uses Phase 4 helper; mid-review increments iter.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| runId arg → fs path | parseRunId + assertRunIdConfined |
| manifest.status → resume decision | Operator-cancelled (terminal) refused; transient sentinel cleared |
| Journal events → orphan replay | Phase 4's replayOrphanedTasks is the single trusted reducer |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-09-07-01 | Tampering | resume past operator cancel | mitigate | manifest.status='cancelled' → exit 4 (Q-15). |
| T-09-07-02 | Tampering / Repudiation | tampered journal.jsonl | accept | Phase 4 already shapes journal as append-only with seq numbers; resume trusts it as Phase 4 does. |
| T-09-07-03 | DoS | resume on a partially-cancelled run with sentinel + non-cancelled status | mitigate | Auto-unlink + proceed; documented in stderr (Q-15 transient case). |
| T-09-07-04 | Information Disclosure | progress on stdout | mitigate | All progress via writeStderr (Q-04). |
</threat_model>

<verification>
- `pnpm --filter @protostar/factory-cli test` clean (new resume.test.ts + regression)
- `pnpm run verify` clean
</verification>

<success_criteria>
- resume dispatches per manifest.status (Q-13)
- mid-execution path uses replayOrphanedTasks (Q-14)
- operator-cancelled returns 4; transient sentinel auto-unlinks (Q-15)
- ready-to-release returns 6 with deliver hint
- All other terminal/non-resumable statuses return 6
</success_criteria>

<output>
Create `.planning/phases/09-operator-surface-resumability/09-07-SUMMARY.md` summarizing the resume dispatcher, the per-stage helpers extended in main.ts, and the sentinel-handling matrix.
</output>
