---
phase: 04-execution-engine
plan: 10
type: execute
wave: 4
depends_on: [1, 2, 4, 6, 7, 8, 9]
files_modified:
  - apps/factory-cli/src/coder-adapter-admission.ts
  - apps/factory-cli/src/coder-adapter-admission.test.ts
  - apps/factory-cli/src/load-factory-config.ts
  - apps/factory-cli/src/load-factory-config.test.ts
  - apps/factory-cli/src/run-real-execution.ts
  - apps/factory-cli/src/run-real-execution.test.ts
  - apps/factory-cli/src/repo-reader-adapter.ts
  - apps/factory-cli/src/main.ts
  - apps/factory-cli/src/main.real-execution.test.ts
  - apps/factory-cli/src/cancel.ts
  - apps/factory-cli/src/cancel.test.ts
  - .env.example
autonomous: true
requirements: [EXEC-01, EXEC-03, EXEC-04, EXEC-05, EXEC-06, EXEC-07, EXEC-08]
must_haves:
  truths:
    - "factory-cli reads `.protostar/factory-config.json` (if present) and merges with env, calling `resolveFactoryConfig` from @protostar/lmstudio-adapter"
    - "factory-cli mints AuthorizedNetworkOp via authorizeNetworkOp for the LM Studio baseUrl and passes the brand to preflightLmstudio"
    - "`coderAdapterReadyAdmission` runs after capability/repo-scope admission and before execution; on block it writes admission-decision.json + refusal artifact + exits 1"
    - "Real-executor branch (`runRealExecution`) replaces `runDryRunExecution` when `options.executor === 'real'` (default 'dry-run' for backward compat with existing tests)"
    - "Each task: emit task-pending → mint per-task AbortController chained to root → emit task-running → adapter.execute → applyChangeSet → emit task-succeeded/failed/timeout/cancelled → write evidence.json + transcript.json → snapshot every 20 events + every terminal"
    - "Apply-failure bails the run with `block` outcome (Q-19); downstream tasks never execute"
    - "SIGINT installs once at run start: `process.on('SIGINT', () => rootAbortController.abort('sigint'))`"
    - "Between tasks, executor stat's `runs/{id}/CANCEL`; if present, calls rootAbortController.abort('sentinel'); resume bootstrap unlinks the sentinel"
    - "On startup-resume: parseJournalLines + reduceJournalToSnapshot + replayOrphanedTasks (orphan tasks re-enqueued, count against retry budget)"
    - ".env.example documents LMSTUDIO_BASE_URL, LMSTUDIO_MODEL, LMSTUDIO_API_KEY"
    - "Lifecycle events emitted by real executor are byte-identical event TYPES to dry-run (assertion test)"
  artifacts:
    - path: apps/factory-cli/src/run-real-execution.ts
      provides: "Real executor loop"
      exports: ["runRealExecution"]
    - path: apps/factory-cli/src/coder-adapter-admission.ts
      provides: "Preflight gate using preflightLmstudio + refusal pipeline"
    - path: apps/factory-cli/src/repo-reader-adapter.ts
      provides: "fs-backed RepoReader implementing the AdapterContext contract"
    - path: apps/factory-cli/src/cancel.ts
      provides: "SIGINT + sentinel poll wiring"
  key_links:
    - from: "apps/factory-cli/src/main.ts"
      to: "@protostar/lmstudio-adapter (createLmstudioCoderAdapter)"
      via: "real-executor branch"
      pattern: "createLmstudioCoderAdapter"
    - from: "apps/factory-cli/src/run-real-execution.ts"
      to: "@protostar/repo (applyChangeSet)"
      via: "per-task apply boundary"
      pattern: "applyChangeSet"
    - from: "apps/factory-cli/src/run-real-execution.ts"
      to: "@protostar/execution (replayOrphanedTasks)"
      via: "resume bootstrap"
      pattern: "replayOrphanedTasks"
---

<objective>
Wire all Wave 0/1/2 components together inside `apps/factory-cli`. Ship the real-executor branch end-to-end: factory-config load → preflight admission → real-execution loop with per-task apply boundary, evidence capture, journal+snapshot writes, SIGINT/sentinel cancellation, and resume-on-startup orphan replay.

This is the load-bearing integration plan. It transitions Phase 4 from "components exist" to "running real LM Studio diffs end-to-end".

Per advisor (constraints #1, #4): touches `apps/factory-cli/src/main.ts` last; takes ownership of the gate orchestration half of `coderAdapterReadyAdmission`; ensures lifecycle events match dry-run.

Purpose: Phase 4 success criteria all become testable: state transitions persisted, kill-mid-run resumes to terminal state, lifecycle events identical to dry-run.
Output: Five new factory-cli modules + main.ts integration + .env.example.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/04-execution-engine/04-CONTEXT.md
@.planning/phases/04-execution-engine/04-RESEARCH.md
@.planning/phases/04-execution-engine/04-PATTERNS.md
@apps/factory-cli/src/main.ts
@apps/factory-cli/src/load-repo-policy.ts
@apps/factory-cli/src/admission-decisions-index.ts
@apps/factory-cli/src/refusals-index.ts
@packages/lmstudio-adapter/src/index.ts
@packages/execution/src/adapter-contract.ts
@packages/execution/src/journal.ts
@packages/execution/src/orphan-replay.ts
@packages/repo/src/index.ts

<interfaces>
```typescript
// load-factory-config.ts
import { resolveFactoryConfig } from "@protostar/lmstudio-adapter";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
export async function loadFactoryConfig(workspaceRoot: string): Promise<ReturnType<typeof resolveFactoryConfig>>;
// Reads `.protostar/factory-config.json` (if present), passes bytes + process.env to resolveFactoryConfig.

// coder-adapter-admission.ts
export interface CoderAdapterAdmissionInput {
  readonly runId: string;
  readonly runDir: string;
  readonly outDir: string;
  readonly resolvedEnvelope: CapabilityEnvelope;       // 1.3.0
  readonly factoryConfig: ResolvedFactoryConfig;
  readonly precedenceDecision: PrecedenceDecision;
  readonly signal: AbortSignal;
}
export type CoderAdapterAdmissionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: CliExitError };

export async function coderAdapterReadyAdmission(input: CoderAdapterAdmissionInput): Promise<CoderAdapterAdmissionResult>;
// 1. mint AuthorizedNetworkOp via authorizeNetworkOp({method:"GET", url: `${baseUrl}/models`, resolvedEnvelope})
//    - if mint fails (e.g. envelope is not loopback) → write block decision + refusal + exit 1
// 2. preflightLmstudio({authorizedOp, model, signal})
// 3. on outcome="ok" → writeAdmissionDecision({gate: "coder-adapter-ready", outcome: "allow", evidence: {url, model, availableModels: result.availableModels}}) and return ok
// 4. on any other outcome → writeAdmissionDecision({outcome: "block"}), writeRefusalArtifacts, appendRefusalIndex, return error with exit 1.

// repo-reader-adapter.ts
import type { RepoReader } from "@protostar/execution";
export function createFsRepoReader(opts: { workspaceRoot: string }): RepoReader;
// readFile(path) → reads workspaceRoot/path, returns { bytes, sha256 }
// glob(pattern) → uses node:fs glob (Node 22+) or readdir recursive

// run-real-execution.ts
export interface RunRealExecutionInput {
  readonly runPlan: ExecutionRunPlan;
  readonly adapter: ExecutionAdapter;
  readonly resolvedEnvelope: CapabilityEnvelope;        // for budget + network
  readonly confirmedIntent: ConfirmedIntent;
  readonly journalWriter: JournalWriter;
  readonly snapshotEveryNEvents?: number;               // default 20
  readonly runDir: string;
  readonly workspaceRoot: string;
  readonly rootSignal: AbortSignal;
  readonly applyChangeSet: typeof import("@protostar/repo").applyChangeSet;  // injectable
  readonly nowIso?: () => string;
}
export interface RunRealExecutionResult {
  readonly outcome: "complete" | "block" | "cancelled";
  readonly events: readonly ExecutionLifecycleEvent[];
  readonly perTaskEvidence: ReadonlyArray<{ taskId: string; evidence: AdapterEvidence }>;
  readonly blockReason?: string;
}
export async function runRealExecution(input: RunRealExecutionInput): Promise<RunRealExecutionResult>;

// cancel.ts
export interface CancelWiring {
  readonly rootController: AbortController;
  readonly checkSentinelBetweenTasks: () => Promise<void>;  // stats CANCEL file; calls abort('sentinel') if present
  readonly unlinkSentinelOnResume: () => Promise<void>;
  dispose(): void;                                          // removes SIGINT listener
}
export function installCancelWiring(opts: { runDir: string }): CancelWiring;
```

main.ts integration outline:
1. After load admission and before execution, in `runFactory`: call `loadFactoryConfig(workspaceRoot)`; on parse error → existing refusal pipeline.
2. Call `coderAdapterReadyAdmission` after the workspace-trust gate and before execution.
3. Branch on `options.executor`:
   - `'dry-run'` (default; existing behavior + test fixtures) → existing path with `runDryRunExecution` (still wired through `runMechanicalReviewExecutionLoop`).
   - `'real'` → instantiate adapter via `createLmstudioCoderAdapter({baseUrl, model, apiKey: process.env[apiKeyEnv] ?? 'lm-studio', ...})`, build `RepoReader` via `createFsRepoReader`, call `runRealExecution`. Flag CLI-driven via `--executor real|dry-run` (default `dry-run` so existing CI stays green).
4. Install cancel wiring at the top of `runFactory`; dispose on exit.
5. On startup, before executing: read `journal.jsonl` if present → `parseJournalLines` → `reduceJournalToSnapshot` → `replayOrphanedTasks` → re-enqueue orphans into the run plan. (For v0.1 this only matters when `--resume <runId>` is used; gate behind that flag — Phase 9 owns full resume CLI surface, but Plan 10 ships the bootstrap so the round-trip works in tests.)
6. Lifecycle-events identity assertion: a contract test asserts the SET of event TYPES emitted by `runRealExecution` is a subset of those emitted by `runDryRunExecution`'s vocab (both use the new EXEC-01 union from Plan 01).

`.env.example` additions: three vars per CONTEXT Q-09.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: factory-config loader + RepoReader fs adapter + cancel wiring</name>
  <files>apps/factory-cli/src/load-factory-config.ts, apps/factory-cli/src/load-factory-config.test.ts, apps/factory-cli/src/repo-reader-adapter.ts, apps/factory-cli/src/cancel.ts, apps/factory-cli/src/cancel.test.ts, .env.example</files>
  <read_first>
    - apps/factory-cli/src/load-repo-policy.ts (file-read pattern with ENOENT default)
    - packages/lmstudio-adapter/src/factory-config.ts (Plan 04 — pure resolver)
    - packages/execution/src/adapter-contract.ts (RepoReader interface)
    - .planning/phases/04-execution-engine/04-CONTEXT.md §Q-09, §Q-16
    - .planning/phases/04-execution-engine/04-RESEARCH.md §"Pitfall 5: Sentinel-file race"
  </read_first>
  <behavior config>
    - Test C1: No factory-config.json present → `resolveFactoryConfig({fileBytes: undefined, env: {}})` defaults applied.
    - Test C2: factory-config.json present and valid → file values surface.
    - Test C3: factory-config.json malformed JSON → throws with helpful path message.
    - Test C4: Env vars override file (verify precedence at the loader boundary).
  </behavior>
  <behavior repo-reader>
    - Test R1: `readFile("src/foo.ts")` returns `{bytes, sha256}` where sha256 matches `crypto.createHash("sha256").update(bytes).digest("hex")`.
    - Test R2: `readFile("../escape")` rejects (path-traversal refusal).
    - Test R3: `glob("**/*.tsx")` returns relative paths under workspaceRoot.
  </behavior>
  <behavior cancel>
    - Test K1: `installCancelWiring({runDir})` registers exactly one SIGINT listener; `dispose()` removes it.
    - Test K2: `checkSentinelBetweenTasks` is a no-op when CANCEL file absent.
    - Test K3: After writing CANCEL file → `checkSentinelBetweenTasks` calls `rootController.abort('sentinel')`.
    - Test K4 (Pitfall 5): `unlinkSentinelOnResume` removes a stale CANCEL file BEFORE the first task runs; subsequent `checkSentinelBetweenTasks` is a no-op.
  </behavior>
  <action>
    1. Create `load-factory-config.ts` modeled on `load-repo-policy.ts`. ENOENT → `fileBytes: undefined`.
    2. Create `repo-reader-adapter.ts`:
       ```ts
       import { readFile, readdir } from "node:fs/promises";
       import { join, resolve, sep } from "node:path";
       import { createHash } from "node:crypto";
       export function createFsRepoReader(opts: { workspaceRoot: string }): RepoReader {
         const root = resolve(opts.workspaceRoot);
         function refusePath(p: string): string {
           const abs = resolve(root, p);
           if (abs !== root && !abs.startsWith(root + sep)) throw new Error(`path escapes workspace: ${p}`);
           return abs;
         }
         return {
           async readFile(p) { const abs = refusePath(p); const bytes = await readFile(abs); return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") }; },
           async glob(pattern) { /* simple glob using readdir({recursive:true,withFileTypes:true}) + minimatch-like; or write a small ** matcher */ return []; }, // glob is best-effort for v0.1; adapter currently only reads targetFiles directly
         };
       }
       ```
    3. Create `cancel.ts`:
       ```ts
       import { stat, unlink } from "node:fs/promises";
       import { join } from "node:path";
       export function installCancelWiring(opts: { runDir: string }): CancelWiring {
         const rootController = new AbortController();
         const sentinelPath = join(opts.runDir, "CANCEL");
         const handler = () => rootController.abort("sigint");
         process.on("SIGINT", handler);
         return {
           rootController,
           async checkSentinelBetweenTasks() { try { await stat(sentinelPath); rootController.abort("sentinel"); } catch (e) { if ((e as any)?.code !== "ENOENT") throw e; } },
           async unlinkSentinelOnResume() { try { await unlink(sentinelPath); } catch (e) { if ((e as any)?.code !== "ENOENT") throw e; } },
           dispose() { process.off("SIGINT", handler); },
         };
       }
       ```
    4. Update `.env.example`:
       ```
       # Phase 4 — LM Studio Coder adapter
       LMSTUDIO_BASE_URL=http://localhost:1234/v1
       LMSTUDIO_MODEL=qwen3-coder-next-mlx-4bit
       LMSTUDIO_API_KEY=lm-studio
       ```
    5. Tests in respective `.test.ts` files. K1: count `process.listeners("SIGINT").length` before/after. K3: write a temp file at runDir/CANCEL using fs/promises, then call check.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/factory-cli test 2>&1 | tail -30 ; grep -c 'LMSTUDIO_BASE_URL' .env.example ; grep -c 'unlinkSentinelOnResume' apps/factory-cli/src/cancel.ts</automated>
  </verify>
  <acceptance_criteria>
    - All three new modules exist + tests
    - `.env.example` contains all three LMSTUDIO_* vars
    - All 11 tests pass
    - SIGINT listener count returns to baseline after `dispose()`
    - Path-traversal in repo-reader is refused (Test R2)
  </acceptance_criteria>
  <done>Plumbing for the real-executor branch ready; Task 2 wires admission gate.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: coderAdapterReadyAdmission gate</name>
  <files>apps/factory-cli/src/coder-adapter-admission.ts, apps/factory-cli/src/coder-adapter-admission.test.ts</files>
  <read_first>
    - apps/factory-cli/src/main.ts lines 872-910 (workspace-trust gate analog)
    - apps/factory-cli/src/refusals-index.ts (refusal pipeline)
    - apps/factory-cli/src/admission-decisions-index.ts (decision writer)
    - packages/lmstudio-adapter/src/preflight.ts (Plan 04)
    - packages/authority/src/authorized-ops/network-op.ts (Plan 08)
    - .planning/phases/04-execution-engine/04-CONTEXT.md §Q-13
    - .planning/phases/04-execution-engine/04-PATTERNS.md §"coder-adapter-admission.ts"
  </read_first>
  <behavior>
    - Test G1 (allow): Stub LM Studio with the configured model loaded → admission ok=true; admission-decision.json written with outcome:"allow", gate:"coder-adapter-ready", evidence carries url, model, availableModels.
    - Test G2 (unreachable): Closed-port baseUrl → admission ok=false; refusal artifact `coder-adapter-ready-admission-decision.json` written; refusals.jsonl appended; CliExitError carries exit code 1.
    - Test G3 (model-not-loaded): Stub with `models:["other"]` → admission block; evidence carries `availableModels:["other"]`.
    - Test G4 (empty-models): Stub with `models:[]` → admission block; evidence `availableModels:[]`.
    - Test G5 (envelope-mint failure): Envelope with `network.allow:"none"` → admission block BEFORE preflight runs (mint refuses); evidence carries the mint error.
    - Test G6 (envelope-mint cloud-host blocked): Envelope `network.allow:"loopback"` + factory-config baseUrl pointing at cloud → mint refuses; admission block.
  </behavior>
  <action>
    Create `coder-adapter-admission.ts` per `<interfaces>`. Use existing `writeAdmissionDecision`, `writeRefusalArtifacts`, `appendRefusalIndexEntry` from `apps/factory-cli/src/`. Pattern verbatim from the workspace-trust gate (main.ts:872-910).
    Sequence:
    1. `const mint = authorizeNetworkOp({method:"GET", url: \`${factoryConfig.config.adapters.coder.baseUrl}/models\`, resolvedEnvelope})`.
    2. If `!mint.ok` → block with `reason:"network-mint-refused"`, evidence: `{ url, errors: mint.errors }`. Exit 1.
    3. Else: `const result = await preflightLmstudio({authorizedOp: mint.authorized, model, signal})`.
    4. Switch on `result.outcome`:
       - `"ok"` → write allow decision, return `{ok:true}`.
       - `"unreachable"` → block with `reason:"lmstudio-unreachable"`, evidence: `{url, errorClass: result.errorClass}`. Exit 1.
       - `"model-not-loaded"` → block with `reason:"lmstudio-model-not-loaded"`, evidence: `{url, model, availableModels}`. Exit 1.
       - `"empty-models"` → block with `reason:"lmstudio-model-not-loaded"`, evidence: `{url, model, availableModels: []}`. Exit 1. (Per Q-13 collapse with non-empty case.)
       - `"http-error"` → block with `reason:"lmstudio-http-error"`, evidence: `{url, status, bodySnippet}`. Exit 1.
    Tests use Plan 03's stub server.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/factory-cli test 2>&1 | tail -25 ; grep -c 'coder-adapter-ready' apps/factory-cli/src/coder-adapter-admission.ts</automated>
  </verify>
  <acceptance_criteria>
    - File exists; gate name is `"coder-adapter-ready"`
    - All 6 tests pass
    - Refusal artifacts use existing pipeline (no parallel write paths)
    - Mint failure short-circuits BEFORE preflight (Test G5)
  </acceptance_criteria>
  <done>Admission gate ready; main.ts wires it in Task 4.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: runRealExecution loop with apply-boundary, evidence, journal, snapshot, orphan-replay</name>
  <files>apps/factory-cli/src/run-real-execution.ts, apps/factory-cli/src/run-real-execution.test.ts</files>
  <read_first>
    - packages/execution/src/adapter-contract.ts (Plan 02)
    - packages/execution/src/journal.ts, snapshot.ts, orphan-replay.ts (Plan 09)
    - apps/factory-cli/src/journal-writer.ts, snapshot-writer.ts (Plan 09)
    - packages/lmstudio-adapter/internal/test-fixtures/* (Plan 03 — for tests)
    - packages/repo/src/index.ts (applyChangeSet signature)
    - .planning/phases/04-execution-engine/04-CONTEXT.md §Q-19 (apply-boundary), §Q-15 (timeout), §Q-17 (evidence split)
  </read_first>
  <behavior>
    - Test E1 (happy path): One-task plan + stub adapter yielding final change-set + applyChangeSet ok → outcome:"complete"; events: pending,running,succeeded; journal.jsonl has 3 lines; snapshot.json shows succeeded; evidence.json + transcript.json written under `runs/{id}/execution/task-{id}/`.
    - Test E2 (apply failure → block, Q-19): Two-task plan; task 1 succeeds; task 2's adapter returns change-set; applyChangeSet returns failure → run terminates with outcome:"block"; events: pending,running,succeeded,pending,running,failed; task 3 (if it existed) never runs.
    - Test E3 (timeout): Adapter promise sleeps past `taskWallClockMs` → AbortController in run-real-execution fires; task ends with `task-timeout` event; journal has matching line.
    - Test E4 (cancellation via sentinel): Between task 1 and task 2, write CANCEL file → checkSentinelBetweenTasks aborts; task 2 emits `task-cancelled`; outcome:"cancelled".
    - Test E5 (orphan replay): Pre-seed journal.jsonl with `task-pending,task-running` (no terminal); on startup, run replays orphan as task-failed (reason:"orphaned-by-crash") and re-enqueues; second attempt succeeds.
    - Test E6 (snapshot interval): With `snapshotEveryNEvents:2`, after 4 events snapshot.json was written at least 2 times (use mtime check or write count via spy).
    - Test E7 (lifecycle event identity with dry-run): Build a one-task plan; run dry-run → capture event types; run real → capture event types; assert real's set ⊆ dry-run's union (both use EXEC-01 vocab from Plan 01).
    - Test E8 (Two-hash verification — Pitfall 4): Adapter returns change-set; mid-flight, the actual workspace file is mutated (simulating concurrent write); applyChangeSet (called by runRealExecution) re-hashes and refuses → block. Pin: removing the adapter's pre-image hash WOULD break this test (asserted via separate test that mutates the adapter to return wrong sha; applyChangeSet refuses).
  </behavior>
  <action>
    Create `run-real-execution.ts`. Loop pseudocode:
    ```ts
    export async function runRealExecution(input): Promise<RunRealExecutionResult> {
      let seq = 0; const events: ExecutionLifecycleEvent[] = []; const evidences = [];
      const eventsSinceSnapshot = { count: 0 };
      // resume bootstrap
      const journalPath = join(input.runDir, "execution", JOURNAL_FILE_NAME);
      const priorEvents = await tryReadJournal(journalPath);  // [] on ENOENT
      const orphans = replayOrphanedTasks({ runId, events: priorEvents, nowIso, nextSeq: priorEvents.length + 1 });
      for (const o of orphans) await input.journalWriter.appendEvent(o);
      seq = priorEvents.length + orphans.length;
      // determine which tasks remain (from snapshot)
      const startSnap = reduceJournalToSnapshot({...priorEvents, ...orphans});
      const remaining = filterTasksNotTerminal(input.runPlan.tasks, startSnap);

      for (const task of topo(remaining)) {
        if (input.rootSignal.aborted) { /* emit cancelled, break */ }
        await checkSentinelBetweenTasks();   // injected from cancel wiring (caller passes it)
        const taskController = new AbortController();
        const onAbort = () => taskController.abort(input.rootSignal.reason);
        input.rootSignal.addEventListener("abort", onAbort, { once: true });
        const timer = setTimeout(() => taskController.abort("timeout"), input.resolvedEnvelope.budget.taskWallClockMs);
        try {
          await emitEvent({ type: "task-pending", ..., seq: ++seq });
          await emitEvent({ type: "task-running", ..., seq: ++seq });
          const stream = input.adapter.execute(taskInput, ctx);
          let final;
          for await (const ev of stream) {
            if (ev.kind === "final") { final = ev.result; break; }
            // tokens already journaled by adapter via ctx.journal.appendToken
          }
          if (!final) throw new Error("adapter ended without final event");
          if (final.outcome === "adapter-failed") {
            const kind = final.reason === "timeout" ? "task-timeout" : final.reason === "aborted" ? "task-cancelled" : "task-failed";
            await emitEvent({ type: kind, ..., reason: final.reason, seq: ++seq });
            await writeEvidenceFiles({ runDir, taskId, evidence: final.evidence, status: kind });
            // policy: continue to next task on failed; on cancelled/timeout, depends on Q-19 (we BAIL on apply failure but NOT on adapter failure — adapter failures continue, run loops mark task failed)
            // Actually Q-19 only bails on apply failure; adapter failures emit task-failed and continue (Phase 5 review will see it).
            continue;
          }
          // outcome === "change-set"
          const apply = await input.applyChangeSet({ workspaceRef: ..., changeSet: final.changeSet });
          if (apply.anyFailure) {
            await emitEvent({ type: "task-failed", reason: "apply-failed", evidence: ..., seq: ++seq });
            await writeEvidenceFiles({ ... });
            return { outcome: "block", events, perTaskEvidence: evidences, blockReason: "apply-failure" };
          }
          await emitEvent({ type: "task-succeeded", evidence: ..., seq: ++seq });
          await writeEvidenceFiles({ ... });
        } finally {
          clearTimeout(timer);
          input.rootSignal.removeEventListener("abort", onAbort);
        }
      }
      return { outcome: input.rootSignal.aborted ? "cancelled" : "complete", events, perTaskEvidence: evidences };
    }
    async function emitEvent(e: TaskJournalEvent + ExecutionLifecycleEvent) {
      await input.journalWriter.appendEvent(e);
      events.push(e);
      eventsSinceSnapshot.count++;
      if (eventsSinceSnapshot.count >= (input.snapshotEveryNEvents ?? 20) || isTerminalKind(e.kind)) {
        const snap = reduceJournalToSnapshot({...});
        await writeSnapshotAtomic({ runDir: input.runDir, snapshot: snap });
        eventsSinceSnapshot.count = 0;
      }
    }
    ```
    Evidence-file writer:
    ```ts
    async function writeEvidenceFiles({runDir, taskId, evidence, transcript, status}) {
      const dir = join(runDir, "execution", `task-${taskId}`);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "evidence.json"), JSON.stringify({schemaVersion:"1.0.0", taskId, status, ...evidence-meta}));
      await writeFile(join(dir, "transcript.json"), JSON.stringify({schemaVersion:"1.0.0", taskId, attempts: transcript.attempts}));
    }
    ```
    Tests use stub server + cosmetic-tweak fixture from Plan 03; `applyChangeSet` is injected as a mock (so we don't need a real workspace; we test the orchestration). For Test E8, mock adapter returns change-set with WRONG `preImageSha256`; mock applyChangeSet checks the hash and returns failure.
    Add SCHEMA files: `evidence.schema.json`, `transcript.schema.json`, `task-journal-event.schema.json` under `apps/factory-cli/schema/` (or `packages/execution/schema/` — pick the latter to keep schemas with their owning package). For v0.1 `additionalProperties: false`, full required[]; tests assert serialized files validate.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/factory-cli test 2>&1 | tail -40 ; grep -c 'replayOrphanedTasks' apps/factory-cli/src/run-real-execution.ts ; grep -c 'applyChangeSet' apps/factory-cli/src/run-real-execution.ts</automated>
  </verify>
  <acceptance_criteria>
    - All 8 tests pass
    - File greps positive for `replayOrphanedTasks`, `applyChangeSet`, `writeSnapshotAtomic`
    - Apply-failure bails the run (E2)
    - Orphan replay round-trips through a pre-seeded journal (E5)
    - Lifecycle event types match dry-run vocab (E7)
  </acceptance_criteria>
  <done>Real executor loop complete; main.ts integration is the last step.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: main.ts integration + end-to-end test</name>
  <files>apps/factory-cli/src/main.ts, apps/factory-cli/src/main.real-execution.test.ts</files>
  <read_first>
    - apps/factory-cli/src/main.ts (full file — particularly imports lines 1-85, executor branch lines 460-488, gate-block pattern lines 872-910)
    - All other Plan 10 modules (Tasks 1-3)
    - .planning/phases/04-execution-engine/04-PATTERNS.md §"main.ts — modify"
  </read_first>
  <behavior>
    - Test M1 (real branch happy path): Launch with `--executor real --confirmed-intent <signed-1.3.0-fixture>` against stub LM Studio + sacrificial fs sandbox; emits real-execution events; produces non-empty `runs/{id}/execution/task-1/evidence.json` referencing a real change-set; exit 0.
    - Test M2 (preflight refusal): Launch with `--executor real` against closed port (no stub) → coder-adapter-ready admission writes refusal; exit 1; refusals.jsonl appended.
    - Test M3 (dry-run unchanged): Launch with default `--executor` (or omitted) → existing dry-run path runs as before; existing fixtures still pass (no regression). Run `pnpm --filter @protostar/factory-cli test` for the existing test suite.
    - Test M4 (SIGINT mid-run): Spawn factory-cli as a subprocess, send SIGINT after stub emits first chunk → child exits with code 130 OR writes journal entry with `task-cancelled`; resume picks up.
  </behavior>
  <action>
    1. Add imports to `apps/factory-cli/src/main.ts`:
       ```ts
       import { createLmstudioCoderAdapter } from "@protostar/lmstudio-adapter";
       import { loadFactoryConfig } from "./load-factory-config.js";
       import { coderAdapterReadyAdmission } from "./coder-adapter-admission.js";
       import { runRealExecution } from "./run-real-execution.js";
       import { createFsRepoReader } from "./repo-reader-adapter.js";
       import { installCancelWiring } from "./cancel.js";
       import { createJournalWriter } from "./journal-writer.js";
       ```
    2. Add CLI option `--executor real|dry-run` (default: `dry-run`) to the existing args parser.
    3. Add `--allowed-adapters` CLI flag (comma-separated, default: `lmstudio-coder`); thread into plan admission.
    4. In `runFactory`, after workspace-trust gate and before execution branch:
       - `const cancel = installCancelWiring({runDir});` (dispose on finally).
       - `await cancel.unlinkSentinelOnResume();`
       - `const factoryConfig = await loadFactoryConfig(workspaceRoot);`
       - `if (options.executor === "real") { const admission = await coderAdapterReadyAdmission({runId, runDir, outDir, resolvedEnvelope, factoryConfig: factoryConfig.resolved, precedenceDecision, signal: cancel.rootController.signal }); if (!admission.ok) return admission.error; }`
    5. Branch executor:
       ```ts
       if (options.executor === "real") {
         const adapter = createLmstudioCoderAdapter({
           baseUrl: factoryConfig.resolved.config.adapters.coder.baseUrl,
           model: factoryConfig.resolved.config.adapters.coder.model,
           apiKey: process.env[factoryConfig.resolved.config.adapters.coder.apiKeyEnv] ?? "lm-studio",
         });
         const journalWriter = await createJournalWriter({ runDir });
         const repoReader = createFsRepoReader({ workspaceRoot });
         const realResult = await runRealExecution({ runPlan, adapter, resolvedEnvelope, confirmedIntent, journalWriter, runDir, workspaceRoot, rootSignal: cancel.rootController.signal, applyChangeSet: dependencies.applyChangeSet, /* and pass repoReader through ctx in the loop */ });
         await journalWriter.close();
         // map realResult to factory-cli's existing review/repair pipeline (Phase 5 owns the integration; v0.1 emits evidence and exits)
       } else {
         // existing dry-run path UNCHANGED
       }
       ```
    6. Add `dependencies.runRealExecution` and `dependencies.applyChangeSet` to `FactoryCompositionDependencies` (existing seam at lines 106-109) for testability.
    7. Add policy-snapshot integration: include `factoryConfig.resolved.configHash` in the policy-snapshot artifact written by the existing pipeline (look for where policy-snapshot.json is written in Phase 2 plan 07 wiring).
    8. New test `main.real-execution.test.ts` covering M1-M4. Reuse existing test harness for spinning up the CLI in-process; stub LM Studio server is the load-bearing fixture.
    9. Update ROADMAP frontmatter for plan 10 if relevant (planner does ROADMAP updates separately).
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm run verify 2>&1 | tail -40 ; grep -c 'createLmstudioCoderAdapter' apps/factory-cli/src/main.ts ; grep -c '"--executor"\|--executor' apps/factory-cli/src/main.ts</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm run verify` exits 0 (full repo)
    - `main.ts` imports the new modules
    - `--executor real` triggers the real branch; default stays dry-run
    - All 4 M-tests pass
    - Existing factory-cli dry-run tests unchanged (no regression)
    - Apply-failure bails (M's E2 analog ends in `block`)
    - configHash recorded in policy snapshot (verify by reading the file in M1)
  </acceptance_criteria>
  <done>Phase 4 success criteria all reachable from test harness: state transitions persisted; SIGKILL+resume reaches same terminal state; LM Studio coder adapter produces non-empty diff for cosmetic-tweak fixture; lifecycle events identical between dry-run and real paths.</done>
</task>

</tasks>

<threat_model>
| Boundary | Description |
|----------|-------------|
| factory-cli ↔ LM Studio HTTP loopback | unauthorized URL or model could exfiltrate prompt content |
| factory-cli ↔ workspace fs | unauthorized path read could leak repo contents |
| factory-cli ↔ disk (journal/snapshot) | crash mid-write must keep run resumable |
| factory-cli ↔ os process (SIGINT, sentinel) | unintended cancel must be deterministic |

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-04-29 | Information Disclosure | factory-config.json points baseUrl at attacker host | mitigate | authorizeNetworkOp (Plan 08) refuses non-loopback URLs at mint time; configHash recorded for audit |
| T-04-30 | Tampering | Plan declares unauthorized adapterRef | mitigate | Plan admission (Plan 08) rejects adapterRef ∉ allowedAdapters |
| T-04-31 | Repudiation | Crash before terminal event → state ambiguous | mitigate | append+fsync per event (Plan 09) + orphan-replay on resume (this plan) |
| T-04-32 | DoS | Stale CANCEL sentinel terminates resume immediately (Pitfall 5) | mitigate | `unlinkSentinelOnResume` runs before first task in resume path |
| T-04-33 | Tampering | Apply-time hash drift undetected | mitigate | applyChangeSet (Phase 3 — Hash 2 of 2) re-hashes; this plan bails the run on first apply failure (Q-19) |
| T-04-34 | Information Disclosure | API key leaked into logs | mitigate | Authorization header set by adapter only; never logged. apiKey defaults to placeholder `'lm-studio'` when env var absent |
| T-04-35 | DoS | Adapter hangs; per-task timeout never fires | mitigate | AbortController + setTimeout(taskWallClockMs); test E3 pins |
</threat_model>

<verification>
- `pnpm run verify` (full repo) exits 0
- `pnpm --filter @protostar/factory-cli test` exits 0
- Real-execution e2e test against stub LM Studio + cosmetic-tweak fixture produces non-empty change-set
- SIGINT integration test produces clean exit + journal entry
- Resume after orphan-replay reaches terminal state for the same plan
</verification>

<success_criteria>
- All Phase 4 success criteria from ROADMAP met:
  1. Task state transitions persisted; killing the process mid-run + resuming reaches the same terminal state (Test E5 + M4)
  2. LM Studio coder adapter produces a non-empty diff for the cosmetic-tweak fixture (Test M1)
  3. Adding a stub second adapter requires zero contract change in `packages/execution` (verified in Plan 02 contract test + Plan 08 allowedAdapters)
  4. Lifecycle events are identical between dry-run and real-execution paths (Test E7 assertion)
- All 8 EXEC requirements covered across plans 1-10
- `pnpm run verify` green
</success_criteria>

<output>
Create `.planning/phases/04-execution-engine/04-10-SUMMARY.md` with:
- main.ts integration diff summary
- New CLI flags (`--executor`, `--allowed-adapters`)
- Real-execution event sequence
- Resume bootstrap order (parseJournalLines → reduceSnapshot → replayOrphans → unlinkSentinel → run)
- The 4 Phase 4 success criteria each mapped to a specific test
</output>
