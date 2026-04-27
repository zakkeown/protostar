# Phase 4: Execution Engine — Context

**Gathered:** 2026-04-27
**Source:** `04-QUESTIONS.json` (19/19 answered, --power mode)
**Status:** Ready for research + planning

<domain>
## Phase Boundary

Replace the dry-run executor with a deterministic, resumable task runner. The first real `ExecutionAdapter` is the LM Studio coder (Qwen3-Coder-Next-MLX-4bit, OpenAI-compatible) producing real diffs against a Phase-3 workspace. Phase 5's review→repair loop and Phase 8's evaluation plug into the lifecycle events this phase emits — but they are not in scope here. Delivery (Phase 7) and operator surface (Phase 9) are downstream.

**Blast radius:** First real subprocess + first real network calls (LM Studio loopback). Failures here can corrupt a workspace, leak tokens, or produce non-resumable runs.

**Requirements:** EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-05, EXEC-06, EXEC-07, EXEC-08.

</domain>

<decisions>

## Task State Machine & Journal (EXEC-01, EXEC-08)

### Q-01 — Terminal-state vocabulary
**Decision:** Adopt EXEC-01 vocabulary verbatim. States: `pending → running → succeeded | failed | timeout | cancelled`. Drop `blocked` from the task lifecycle (push it to a separate plan-graph "unreachable" status if needed).
**Rationale:** Match the requirement literally. New phase, clean rebind from dry-run. Heaviest churn but gives downstream agents (Phase 5 review, Phase 9 inspect) an unambiguous vocabulary that will hold for v1+.
**Note for planner:** `packages/execution/src/index.ts:8` and `packages/execution/src/index.ts:25-29` need rewriting — `ExecutionTaskStatus` and `ExecutionLifecycleEventType` both flip to the EXEC-01 set. Existing dry-run tests will fail and must be updated as part of the same plan that lands the new state machine; the dry-run executor (`runDryRunExecution`) maps to the new vocabulary too. "blocked" semantics — when a task can't start because a dependency failed — moves to a plan-graph concept (not a task state); document this transition in the migration plan.
**Status:** Decided.

### Q-02 — Journal storage format
**Decision:** Append-only JSONL **plus** periodic snapshot. `runs/{id}/execution/journal.jsonl` is the source of truth; `runs/{id}/execution/snapshot.json` is written after every N events (suggest N=20) and after each terminal task transition.
**Rationale:** JSONL is symmetric with `admission-decisions.jsonl` and atomic on append. Snapshot keeps resume O(events-since-snapshot) instead of O(events) — premature for cosmetic v0.1 but required by the operator-surface ergonomics in Phase 9 (`status` should not have to scan a multi-MB JSONL on every call). Building it in now means Phase 9 doesn't have to retrofit.
**Note for planner:** Define a `TaskJournalEvent` discriminated union: `{ kind: 'task-pending' | 'task-running' | 'task-succeeded' | 'task-failed' | 'task-timeout' | 'task-cancelled', runId, planTaskId, at, attempt, evidenceArtifact?: StageArtifactRef, reason?, blockedBy? }`. Snapshot schema: `{ runId, generatedAt, lastEventSeq, tasks: Record<planTaskId, { status, attempt, evidenceArtifact?, lastTransitionAt }> }`. Append-and-fsync each event before emitting it; snapshot writes are tmp+rename for atomicity. Planner: include a journal-corruption test (truncated final line) — replay must tolerate it.
**Status:** Decided.

### Q-03 — Resume semantics for tasks `running` at crash
**Decision:** Treat a `running` task with no terminal event as `failed-orphan`, retry from scratch.
**Rationale:** Phase 3 makes the workspace fresh-clone-per-run with hash-checked patches — adapter calls are effectively idempotent w.r.t. workspace state. The cost is at most one wasted model round-trip; the benefit is zero recovery logic. "Inspect-and-decide" (option c) introduces ambiguity at the worst possible moment.
**Note for planner:** On resume, scan the snapshot + tail of journal; for each task whose last event is `task-running` without a terminal follow-up, emit a synthetic `task-failed` event with `reason: 'orphaned-by-crash'`, then re-enqueue the task (it counts against retry budget — Q-14). Add a contract test that kills the run mid-task (SIGKILL, not SIGINT — bypass cancellation) and asserts the orphan→retry path on resume.
**Status:** Decided.

### Q-04 — Lifecycle event identity
**Decision:** New event types matching the new states: `task-pending | task-running | task-succeeded | task-failed | task-timeout | task-cancelled`. Drop `task-blocked`.
**Rationale:** Pairs with Q-01a. Cleanest. Forces every consumer to update at once rather than living with sub-state branching forever.
**Note for planner:** `ExecutionLifecycleEventType` and `ExecutionLifecycleEvent` (`packages/execution/src/index.ts:25-42`) both rewritten in lockstep with Q-01. Dry-run executor emits the new event names. Phase 5 review loop will subscribe to these — that's a Phase 5 concern, but Phase 4 must export the type union cleanly so Phase 5 can switch on it exhaustively.
**Status:** Decided.

## ExecutionAdapter Contract (EXEC-02, EXEC-04)

### Q-05 — Adapter input/output shape
**Decision:** Streaming protocol. `execute(task, ctx)` returns `AsyncIterable<AdapterEvent>` ending with a terminal `final` event carrying the `RepoChangeSet` (or failure).
**Rationale:** Phase 9 `inspect` will want live token output; Phase 3 already settled "stream to file + tail in evidence" for subprocess (Q-09). Same posture for adapter output. Streaming locks in the contract that supports live progress now, even if v0.1 only persists the stream and ignores realtime consumers.
**Note for planner:** Event shape — `{ kind: 'token', text: string } | { kind: 'tool-call', ... } | { kind: 'progress', message: string } | { kind: 'final', result: AdapterResult }`. `AdapterResult = { outcome: 'change-set', changeSet: RepoChangeSet, evidence: AdapterEvidence } | { outcome: 'adapter-failed', reason: AdapterFailureReason, evidence: AdapterEvidence }`. `ctx` carries `signal: AbortSignal` (Q-15/Q-16), `confirmedIntent`, `repoReader`, `budget`, and a `journal` writer for token-stream persistence. Mocks remain trivial — yield one `final` event.
**Status:** Decided.

### Q-06 — Pre-image SHA-256 responsibility
**Decision:** Adapter computes pre-image SHA via a repo-provided reader injected on `ctx`.
**Rationale:** Adapter is the single source of truth for "what file content the model based its diff on". Evidence answer "the model saw bytes hashing to X" is recorded once at the adapter boundary; repo runner re-hashes at apply time (Phase 3 Q-05/Q-10) and refuses on mismatch. The redundant hash is the entire defense against base drift — keeping the read inside the adapter scope makes the responsibility crisp.
**Note for planner:** `ctx.repoReader: { readFile(path: string) → Promise<{ bytes: Uint8Array, sha256: string }>; glob(pattern: string) → Promise<string[]> }` lives in `@protostar/repo`, takes an `AuthorizedWorkspaceOp` under the hood. Adapter never sees raw fs. The reader's `sha256` is the canonical pre-image; the executor passes the resulting `RepoChangeSet` straight to `repo.applyChangeSet`, which re-reads + re-hashes at apply. Document this two-hash dance (compute-time vs apply-time) explicitly so it's not "fixed" later as duplication.
**Status:** Decided.

### Q-07 — Provider abstraction layer location
**Decision:** New package `@protostar/lmstudio-adapter` implementing `ExecutionAdapter`.
**Rationale:** Mirrors `@protostar/dogpile-adapter` structure and AGENTS.md domain-first rule. Keeps Qwen-Coder-specific prompting localized; second provider (e.g. an Ollama or remote OpenAI adapter) becomes a sibling package without touching this one. Avoids growing `apps/factory-cli` past 1190 lines.
**Note for planner:** New workspace `packages/lmstudio-adapter/`. Exports a factory `createLmstudioCoderAdapter(config: LmstudioAdapterConfig): ExecutionAdapter`. The OpenAI-compatible HTTP client lives inside this package, owned by it; no shared "openai-compatible" package yet — extract only when a second adapter needs it. Package depends on `@protostar/execution` (for the contract), `@protostar/intent` (for envelope types), and Node's `fetch`. No fs imports.
**Status:** Decided.

### Q-08 — Single-adapter-per-run vs per-task selection
**Decision:** Single adapter per run with a per-task override mechanism allowed in the plan, gated by admission against a run-level allowed set.
**Rationale:** v0.1 cosmetic-tweak runs use one coder adapter — no override exercised. But the plan-schema field is cheap to add now and forces admission to enforce the allowed set, which is the load-bearing piece for Phase 8 (panel reviews) and post-v0.1 archetypes. Locking it in here means Phase 8 doesn't reopen the contract.
**Note for planner:** Plan-schema addition: `task.adapterRef?: string` (optional). Run-level config carries `allowedAdapters: string[]` (defaults to `['lmstudio-coder']` for v0.1). Admission rejects plans whose `adapterRef` falls outside the allowed set with a typed violation. If `adapterRef` is absent, executor uses the run's default adapter. Cosmetic-tweak fixture leaves `adapterRef` unset — Phase 4 tests both paths (default-resolve and override-allowed) plus the rejection path.
**Status:** Decided.

## LM Studio Coder Adapter (EXEC-03)

### Q-09 — LM Studio connection config source
**Decision:** `.protostar/factory-config.json` with env override. Schema: `{ adapters: { coder: { provider: 'lmstudio', baseUrl, model, apiKeyEnv: 'LMSTUDIO_API_KEY' } } }`. Env vars (`LMSTUDIO_BASE_URL`, `LMSTUDIO_MODEL`, `LMSTUDIO_API_KEY`) override any field.
**Rationale:** File-in-repo is discoverable, version-controllable, and fits the Phase 2 policy-snapshot pattern. Env override keeps developer-machine ergonomics. Capability-envelope option (c) is too heavy for v0.1 — it would force a schema bump on every model swap and Phase 8 will need its own adapter slot anyway.
**Note for planner:** New JSON schema `factory-config.schema.json` (owned by `@protostar/lmstudio-adapter` or a small `@protostar/factory-config` workspace — pick one in the planner). Loader: file is optional; defaults are `baseUrl: 'http://localhost:1234/v1'`, `model: 'qwen3-coder-next-mlx-4bit'`, `apiKeyEnv: 'LMSTUDIO_API_KEY'` (key-not-set ⇒ send literal `'lm-studio'` placeholder, since LM Studio ignores it). Hash the resolved (post-env-override) config and include the hash in the policy snapshot — same pattern as repo-policy-hash. `.env.example` documents the three env vars.
**Status:** Decided.

### Q-10 — Request style
**Decision:** Streaming SSE; persist token log to `runs/{id}/execution/task-{id}/coder.stream.log`; return final assembled message as the adapter result.
**Rationale:** Pairs with Q-05 (streaming adapter). Matches Phase 3 Q-09 "stream to file + tail in evidence" posture for subprocess. Cosmetic v0.1 doesn't strictly need live tokens, but the wiring is the same as Phase 9 will use for `inspect`.
**Note for planner:** POST `/v1/chat/completions` with `stream: true`. Chunks (`data: {...}\n\n`) parsed into deltas; each delta yielded as an adapter `token` event AND appended to `coder.stream.log`. Final assembled `content` parsed by Q-12. Tail size for evidence: same default as Phase 3 (`subprocessTailBytes` / 8192). Use `node:fetch` with `signal` from `ctx.signal` — abort on timeout/cancel mid-stream cleanly closes the SSE.
**Status:** Decided.

### Q-11 — Repo context fed to the coder
**Decision:** Hybrid. Plan task carries `targetFiles: string[]` (primary anchors); adapter may read up to N=3 additional files (e.g. nearest test file, sibling source).
**Rationale:** Predictable token-budget floor (planner picked the must-reads) plus a bounded discovery slot for the "I need to see the test too" case. Pure adapter-driven discovery (option b) is too unbounded for v0.1; pure planner-driven is too rigid for cosmetic-tweaks that span source+test pairs.
**Note for planner:** Plan-schema addition: `task.targetFiles: string[]` (required, ≥1). Adapter receives those plus `ctx.repoReader.glob` capped at N=3 additional reads (hardcoded constant for v0.1; later: from envelope). Each additional read is logged as an `AdapterAuxRead` evidence entry with path + sha256, so review can audit "what did the model also look at?". Out-of-target reads that exceed N=3 throw an adapter error caught by retry policy (Q-14a — non-transient, no retry).
**Status:** Decided.

### Q-12 — Output parsing strategy
**Decision:** Strict (single fenced ```diff block) with one auto-retry that nudges the model to "reformat your previous answer as a single ```diff fence". The reformat retry counts as one of the EXEC-06 retries.
**Rationale:** Strictness keeps `applyChangeSet` from receiving garbage; the one-shot reformat retry recovers from typical model wandering without consuming the full retry budget. Combines the discipline of (a) with the practicality of empirical recovery.
**Note for planner:** Parser regex: `/^```(?:diff|patch)?\s*\n([\s\S]*?)\n```\s*$/m`. Multiple matches → adapter-failed `parse-multiple-blocks`. Zero matches → adapter-failed `parse-no-block`. The reformat retry sends the same conversation plus a system-style follow-up: "Output ONLY a single fenced ```diff block containing your patch. No prose." The retry is consumed deterministically — count it in the journal as `attempt: 2` with `retryReason: 'parse-reformat'`. After reformat fails, no further parse retries (transport errors continue to consume budget per Q-14).
**Status:** Decided.

### Q-13 — LM Studio preflight / health check
**Decision:** GET `/v1/models` at run-start; refuse the run if unreachable or required model id missing.
**Rationale:** Surfaces config/infra errors at the admission boundary as a hard-failure stop — exactly the dark-factory rule. Conflating "LM Studio not running" with "task failed" (option b) burns retry budget on something the operator can fix in 5 seconds.
**Note for planner:** New admission gate `coderAdapterReadyAdmission` (or extension of an existing gate) running after capability/repo-scope. On unreachable host: refusal artifact with `reason: 'lmstudio-unreachable'`, `evidence: { url, errorClass }`. On unknown model id: `reason: 'lmstudio-model-not-loaded'`, `evidence: { model, available: string[] }` (truncated to first 20). Refusal goes through the standard `.protostar/runs/{id}/...` + `.protostar/refusals.jsonl` pipeline. Test: a stubbed-server returning empty model list → refusal artifact, exit code 1.
**Status:** Decided.

## Reliability — Retries, Timeouts, Cancellation (EXEC-06, EXEC-07)

### Q-14 — Retry policy
**Decision:** Retry on HTTP 408/429/5xx + network/timeout errors **plus** one parse-failure reformat retry (per Q-12). Base 1s, exponential backoff capped at 16s, max 4 attempts. Cap source: `capabilityEnvelope.budget.adapterRetriesPerTask` (new envelope field, default 4).
**Rationale:** Standard transient set covers transport noise; parse-reformat covers Qwen wandering; both consume the same per-task budget so a misconfigured prompt can't run forever. Excludes 4xx (other than 408/429) — those signal config errors that retry won't fix.
**Note for planner:** Capability-envelope schema bump (likely 1.2.0 → 1.3.0): add `budget.adapterRetriesPerTask: number` (default 4, max enforced at admission). Retry classifier: `transient = status ∈ {408, 429, 500, 502, 503, 504} || isNetworkError(err) || isTimeoutError(err)`. Backoff: `min(16000, 1000 * 2^(attempt-1))` plus ±20% jitter. Each retry attempt persisted as a journal event with `retryReason: 'transient' | 'parse-reformat'`. Hitting the cap → terminal `failed` with `reason: 'retries-exhausted'` and evidence containing the final error chain.
**Status:** Decided.

### Q-15 — Timeout source and enforcement
**Decision:** Single `capabilityEnvelope.budget.taskWallClockMs` value for the whole run, signed in ConfirmedIntent. Default 180_000 ms.
**Rationale:** One signed knob is the simplest enforcement story. v0.1 cosmetic tweaks don't need per-task tuning. Adapter-declared default (option c) leaks adapter knowledge into envelope semantics; per-task field (option b) is forward-noise we don't need.
**Note for planner:** Capability-envelope addition (same bump as Q-14): `budget.taskWallClockMs: number` (default 180_000). `AbortController` per task, timer fires `controller.abort()` at the budget. The adapter's streaming fetch closes cleanly on abort (Q-10). Terminal state: `timeout`. Test: stub adapter that yields a token then sleeps past the budget — assert `task-timeout` event + journal entry. Note: the *task* timeout is independent of any *retry* timeout — a single attempt can hit `taskWallClockMs` and either retry (if attempts remain) or terminate.
**Status:** Decided.

### Q-16 — Cancellation source and mid-task semantics
**Decision:** SIGINT for in-process cancel **plus** a cancel-sentinel file (`runs/{id}/CANCEL`) polled between tasks. Cross-process IPC is Phase 9 work, but Phase 4 ships the sentinel-file plumbing so Phase 9 just writes the file.
**Rationale:** SIGINT is the realistic v0.1 operator path (Ctrl-C in the terminal). Sentinel file is cheap to add now, has zero runtime cost (one stat call between tasks), and gives Phase 9 a trivial implementation surface — no IPC protocol needed.
**Note for planner:** Wire `process.on('SIGINT', () => abortController.abort())` once per run, on the run's root abort controller (not per-task). Task controllers chain off the root. Between tasks, executor stat's `runs/{id}/CANCEL`; if present, calls root abort. Mid-task abort → adapter's fetch stream closes → terminal `cancelled` event written → snapshot updated → process exits cleanly with code 130 (SIGINT) or 1 (sentinel). Document in CONCERNS that double-Ctrl-C is SIGKILL and yields orphan tasks (Q-03 covers).
**Status:** Decided.

## Evidence Capture & Network Authority (EXEC-05)

### Q-17 — `evidence.json` schema
**Decision:** Two files per task: `evidence.json` (structural meta only) and `transcript.json` (prompt + response + tokens + per-attempt detail).
**Rationale:** Phase 5 mechanical review reads only `evidence.json` (small, fast, JSONL-friendly); Phase 8 semantic review pulls `transcript.json` when it actually scores. Splitting reduces noise in fast paths and keeps the evidence file diff-friendly across runs.
**Note for planner:** `evidence.json` schema (small): `{ adapter, model, taskId, status, attempts, durationMs, diffArtifact: StageArtifactRef, stdoutArtifact: StageArtifactRef, stderrArtifact: StageArtifactRef, transcriptArtifact: StageArtifactRef, auxReads: Array<{ path, sha256 }>, reason?, retries: Array<{ attempt, retryReason, errorClass?, durationMs }> }`. `transcript.json` schema: `{ taskId, attempts: Array<{ attempt, prompt: { messages: Array<{role, content}> }, response: { content, finishReason }, tokens?: { prompt, completion, total }, latencyMs, error?: { class, message } }> }`. Both written under `runs/{id}/execution/task-{planTaskId}/`. Stdout/stderr artifacts are the streamed token log + adapter error log respectively (per Q-10).
**Status:** Decided.

### Q-18 — LM Studio loopback as AuthorizedNetworkOp
**Decision:** Capability-envelope `network.allow: 'none' | 'loopback' | 'allowlist'` enum. Phase 4 v0.1 default is `'loopback'`; Phase 7 (Octokit/GitHub) flips to `'allowlist'` with explicit hosts.
**Rationale:** Cleanest step-up story — three discrete trust levels with semantics that survive into Phase 7 unchanged. Bare host allowlist (option a) collapses cleanly into the `'allowlist'` variant when GitHub enters; the enum makes the v0.1 default-deny posture explicit.
**Note for planner:** Capability-envelope schema addition (same bump as Q-14/Q-15): `network: { allow: 'none' | 'loopback' | 'allowlist', allowedHosts?: string[] }`. Validation: `allow === 'allowlist'` requires non-empty `allowedHosts`. Extend `authorizeNetworkOp` (`packages/authority/src/authorized-ops/network-op.ts:25`) to enforce: `'none'` → reject; `'loopback'` → host must be `localhost` / `127.0.0.1` / `::1`; `'allowlist'` → host must be in `allowedHosts`. Default envelope for v0.1 cosmetic-tweak runs: `network.allow: 'loopback'`. Test: cloud URL refused under loopback; LM Studio URL accepted; `'allowlist'` test with `api.github.com` queued for Phase 7.
**Status:** Decided.

### Q-19 — Diff application boundary inside the run loop
**Decision:** Apply per-task immediately after the adapter returns, AND bail the run on first apply failure (hash mismatch, schema error, etc.) with a `block` outcome.
**Rationale:** Sequential cosmetic edits compose (Task N+1 sees Task N's changes), which matches Phase 3's fresh-clone tombstone. Strict run-level bail-on-apply-failure aligns with Phase 3's "best-effort at the file level, hash-checked at the run level" posture — a hash mismatch means base drift and downstream tasks can't be trusted.
**Note for planner:** Run loop pseudocode: `for task in topo(tasks): { result = await adapter.execute(task, ctx); if (result.outcome === 'adapter-failed') retry-or-fail(); applyResult = await repo.applyChangeSet(result.changeSet); if (applyResult.anyFailure) { emit task-failed + block run; break; } emit task-succeeded; }`. The `block` outcome at the run level is distinct from a task `failed` — it means "downstream review cannot reason about this run, repair-loop should not engage". Phase 5 will see the block verdict at the run boundary. Test: Task 1 applies fine, Task 2 produces a hash-mismatching patch (concurrent mutation simulation) → run terminates with block, Task 3 never executes.
**Status:** Decided.

### Claude's Discretion
- Specific filenames for journal/snapshot/log files (sketched above; planner can refine).
- Number of additional auxiliary file reads beyond `targetFiles` (Q-11) — N=3 is a starting heuristic, plan can adjust based on cosmetic-tweak fixture experience.
- Exact wording of the parse-reformat retry prompt (Q-12) — pick what works on the Qwen3-Coder fixture.
- Backoff jitter percentage (Q-14) — ±20% suggested, planner free to tune.
- Whether `factory-config.json` lives in its own package or inside `@protostar/lmstudio-adapter` (Q-09).

</decisions>

<specifics>
## Specific Ideas

- **Authority symmetry:** the LM Studio adapter package mirrors `@protostar/dogpile-adapter` — coordination/protocol-only, never touches fs directly. The `repoReader` injected via `ctx` is the only path to file content.
- **Two-hash dance is intentional, not duplication:** adapter hashes pre-image at decision time; `repo.applyChangeSet` re-hashes at apply time. The pair is the entire defense against concurrent base drift in the workspace.
- **JSONL+snapshot pattern:** match the existing `admission-decisions.jsonl` posture from Phase 2; snapshot is forward-investment for Phase 9 `status` performance.
- **Capability-envelope schema bumps cluster:** Q-14 (`adapterRetriesPerTask`), Q-15 (`taskWallClockMs`), Q-18 (`network.allow`) all want one schema bump. One plan, not three.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements
- `.planning/ROADMAP.md` §"Phase 4 — Execution Engine" — goal, requirements list, success criteria, blast-radius statement
- `.planning/REQUIREMENTS.md` §"Phase 4" — EXEC-01 through EXEC-08 verbatim text

### Prior-phase locks (must not break)
- `.planning/phases/01-intent-planning-admission/01-CONTEXT.md` — branded `ConfirmedIntent` and `AdmittedPlan` shapes; admission paths
- `.planning/phases/02-authority-governance-kernel/02-CONTEXT.md` — capability envelope, `AuthorizedSubprocessOp` / `AuthorizedNetworkOp` brands, signed-intent semantics
- `.planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md` — Q-03 fresh-clone-per-run, Q-05/Q-06 fs-adapter + symlink refusal, Q-09 subprocess capture, Q-10 patch shape (`{ path, op, diff, preImageSha256 }`), Q-12 best-effort apply

### Project posture
- `.planning/PROJECT.md` — authority boundary (only `apps/factory-cli` + `packages/repo` touch fs), domain-first packaging, dark-factory locks, judge-panel local-only rule
- `.planning/codebase/CONCERNS.md` §"`packages/execution`" / §"LM Studio and Octokit credentials are not yet present" — the dead-branch this phase fills in
- `.planning/codebase/STACK.md` §"Runtime", §"Testing" — Node 22 ESM `node:test`, no replatform
- `AGENTS.md` — domain-first packaging, no catch-all packages

### Authority surfaces touched
- `packages/authority/src/authorized-ops/network-op.ts` — `authorizeNetworkOp` signature; Q-18 extends this
- `packages/authority/src/authorized-ops/subprocess-op.ts` — relevant only if execution invokes subprocess (currently no Phase-4 use, but the brand is in scope for forward compatibility)
- `packages/intent/schema/capability-admission-decision.schema.json` — capability-envelope fields; Q-14/Q-15/Q-18 bump
- `packages/execution/src/index.ts` — current `ExecutionTaskStatus`, `ExecutionLifecycleEvent*`, `prepareExecutionRun`, dry-run executor (rewriting target)
- `packages/execution/src/admitted-plan-input.contract.ts` — type-level pins on what reaches execution; Phase 4 adds `task.adapterRef` and `task.targetFiles` plan-schema fields, contract must keep the rest of the negative pins intact
- `packages/repo/src/index.ts` — Phase 3 `applyChangeSet` consumer interface (must exist and be wired before Phase 4 can land)

### External libraries
- LM Studio OpenAI-compatible API: `POST /v1/chat/completions` (stream + non-stream), `GET /v1/models` (preflight) — confirm exact request/response shape from LM Studio docs during research

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/execution/src/index.ts` — `ExecutionRunPlan`, `ExecutionTask`, `ExecutionLifecycleEvent`, `prepareExecutionRun`, `runDryRunExecution`. Most types stay; `Status` and `EventType` unions rewrite (Q-01, Q-04). Dry-run executor maps to the new vocabulary in the same plan that lands the new state machine.
- `packages/authority/src/authorized-ops/network-op.ts` — `AuthorizedNetworkOp` brand and `authorizeNetworkOp` exist; Q-18 extends with the `network.allow` enum.
- `packages/dogpile-adapter` — structural template for `@protostar/lmstudio-adapter` (workspace shape, no-fs posture, single-purpose package).
- `apps/factory-cli/src/main.ts` — `runFactory` orchestrator currently terminates at the dry-run stage; Phase 4 wires the real executor and adapter resolution here.

### Established Patterns
- **Append-only JSONL for evidence streams** (`admission-decisions.jsonl`, Phase 3 subprocess logs). Q-02 journal extends the pattern.
- **Schema-versioned capability envelope** (1.1.0 → 1.2.0 in Phase 3). Q-14/Q-15/Q-18 cluster into a single 1.2.0 → 1.3.0 bump in Phase 4.
- **Brand-minting at the authority kernel boundary, brand-consuming at the I/O package** (Phase 2/3). LM Studio adapter consumes `AuthorizedNetworkOp`, never mints.
- **TDD via `node:test` against compiled `dist/*.test.js`** — keep this; no `tsx` shortcut.

### Integration Points
- Plan schema (`packages/planning`) gets `task.targetFiles: string[]` (Q-11) and `task.adapterRef?: string` (Q-08). Admission rule for `adapterRef` against `allowedAdapters` is new.
- Capability-envelope schema (`@protostar/intent`) gets `budget.adapterRetriesPerTask`, `budget.taskWallClockMs`, `network.allow`, `network.allowedHosts?`. Bump and re-sign tests touched.
- `apps/factory-cli/src/main.ts` adds: factory-config loader, `coderAdapterReadyAdmission` invocation, real-executor branch replacing `runDryRunExecution`, SIGINT wiring (Q-16), cancel-sentinel poll between tasks.
- New package wiring: `packages/lmstudio-adapter/` added to `pnpm-workspace.yaml`, `tsconfig.json` references, root `verify`/`verify:full` scripts.
- Phase 5 is the next downstream consumer — it will subscribe to the new lifecycle events. Phase 4 must export `ExecutionLifecycleEventType` cleanly so Phase 5 can `switch` exhaustively.

</code_context>

<deferred>
## Deferred Ideas

- **Per-adapter `defaultTaskTimeoutMs`** (Q-15c) — when a second adapter family lands and timing differs materially, revisit.
- **Cross-process cancellation IPC** (Q-16c) — Phase 9 owns `protostar-factory cancel`. Phase 4 ships only the SIGINT path + sentinel file infra.
- **Tool-call / structured-output mode for Qwen** (Q-10c) — verify reliability and revisit if Qwen3-Coder-Next's tool-calling on MLX is solid; could replace the strict-fence parse path entirely.
- **Snapshot interval tuning** (Q-02) — N=20 is a guess; instrument and tune in Phase 9 once `status` performance is measured.
- **Second OpenAI-compatible adapter** (e.g. Ollama, remote OpenAI) — sibling package post-v0.1; locks for it ship in Phase 4 (single-adapter-per-run + per-task override + admission allowedAdapters).
- **`@protostar/openai-compatible` shared HTTP client package** — extract only when a second adapter actually needs it. Premature abstraction for v0.1.
- **Token-budget unit** — out of scope (PROJECT.md lock); Phase 4 budgets are wall-clock + retry-count, not tokens.
- **Auxiliary-read budget from envelope** (Q-11) — N=3 hardcoded for v0.1; later move to envelope.

</deferred>

---

*Phase: 04-execution-engine*
*Context gathered: 2026-04-27*
